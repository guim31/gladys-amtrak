// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the real
// Amtraker answers: configuration actions, discovered devices, states, scene
// triggers, widget, scene action, persistence, failures, logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MAX_WATCHES, TRIGGERS } from '../src/service.js';
import {
  action,
  captureLogs,
  create,
  createWorld,
  discovered,
  lastState,
} from './helpers/world.js';
import { arriveAt, delayRun, hiawatha, stageEverything } from './helpers/scenario.js';

const fr = (message) => message.fr;

test('nothing watched: no request at all, the status says so', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.service.refresh();
  assert.equal(world.network.calls.length, 0);
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.match(fr(await action(world, 'status')), /Rien de suivi pour le moment/);
});

test('find a station: by name, by code, nothing found, Amtraker down', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const byName = await action(world, 'find_station', { query: 'milwaukee' });
  assert.match(fr(byName), /1 gare\(s\) trouvée\(s\)/);
  assert.match(fr(byName), /• Milwaukee \[MKE\]/);
  assert.match(byName.de, /Bahnhof verfolgen/);
  assert.match(fr(await action(world, 'find_station', { query: 'emy' })), /• Emeryville \[EMY\]/);
  assert.equal(
    fr(await action(world, 'find_station', { query: 'Zzyzx' })),
    'Aucune gare ne correspond à « Zzyzx ».',
  );
  assert.match(fr(await action(world, 'find_station', { query: ' ' })), /Saisissez/);
  // The list is read once a day.
  await action(world, 'find_station', { query: 'Denver' });
  assert.equal(world.network.calls.filter((call) => call.path === '/stations').length, 1);
  world.network.fail = 503;
  world.service.stationsCache = null;
  assert.equal(
    fr(await action(world, 'find_station', { query: 'Chicago' })),
    'Amtraker est injoignable (api.amtraker.com: HTTP 503). Réessayez dans un instant.',
  );
});

test('watch a train: number, station on its route, not running, duplicates', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.match(fr(await action(world, 'add_train', { train: 'Zephyr' })), /n'est pas un numéro/);
  assert.match(
    fr(await action(world, 'add_train', { train: '5', station: 'Emeryville CA' })),
    /n'est pas un code de gare/,
  );
  assert.match(
    fr(await action(world, 'add_train', { train: '339', station: 'EMY' })),
    /Le train 339 ne s'arrête pas à EMY\. Ses arrêts : CHI, GLN, SVT, MKA, MKE\./,
  );
  // Not running now: the station is checked against the station list.
  assert.match(
    fr(await action(world, 'add_train', { train: '2151', station: 'XYZ' })),
    /Amtraker ne connaît pas la gare XYZ/,
  );
  assert.deepEqual(world.fake.discoveredDevices, []);

  assert.equal(
    fr(await action(world, 'add_train', { train: '5', station: 'emy' })),
    "Ajouté : Amtrak 5 California Zephyr → Emeryville. Créez son appareil dans l'onglet Découverte.",
  );
  assert.match(
    fr(await action(world, 'add_train', { train: '2151', station: 'NYP' })),
    /Ajouté : Amtrak 2151 → New York Penn\..*ne circule pas en ce moment/,
  );
  assert.match(fr(await action(world, 'add_train', { train: '5', station: 'EMY' })), /déjà suivi/);
  assert.deepEqual(
    world.fake.discoveredDevices.map((device) => device.external_id),
    ['ext:test-integration:train:5-emy', 'ext:test-integration:train:2151-nyp'],
  );
});

test(`at most ${MAX_WATCHES} watches`, async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let number = 1; number <= MAX_WATCHES; number += 1) {
    await action(world, 'add_train', { train: String(9000 + number) });
  }
  assert.match(fr(await action(world, 'add_station', { station: 'CHI' })), /10 suivis au plus/);
});

test('a created train gets its states at once, and the widget a refresh', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  // Not created: Amtraker is not read.
  await world.service.refresh();
  assert.equal(world.network.trainRequests().length, 1);
  const device = await create(world, 'Zephyr');
  assert.equal(lastState(world, device, 'delay'), 62);
  assert.equal(lastState(world, device, 'status'), 'En gare');
  assert.equal(lastState(world, device, 'next_stop'), 'Roseville · 15:16');
  assert.equal(lastState(world, device, 'arrival'), 'Emeryville · 17:29 (+32)');
  assert.equal(lastState(world, device, 'minutes_to_station'), 128);
  assert.deepEqual(world.fake.widgetRefreshes, ['train']);
  // Only the changes afterwards.
  const count = world.fake.states.length;
  await world.service.refresh();
  assert.equal(world.fake.states.length, count);
  world.clock.advance(2 * 60000);
  await world.service.refresh();
  assert.equal(world.fake.states.length, count + 1);
  assert.equal(lastState(world, device, 'minutes_to_station'), 126);
});

test('a station: next train, its delay; one read of every train', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  await action(world, 'add_station', { station: 'CHI' });
  await action(world, 'add_train', { train: '339' });
  const station = await create(world, 'Chicago Union');
  await create(world, 'Hiawatha');
  assert.equal(lastState(world, station, 'next_minutes'), 0);
  assert.equal(
    lastState(world, station, 'next_train'),
    '305 Lincoln Service → St. Louis Gateway · 5:20 PM',
  );
  assert.equal(lastState(world, station, 'next_delay'), 0);
  const before = world.network.trainRequests().length;
  await world.service.refresh();
  assert.deepEqual(
    world.network
      .trainRequests()
      .slice(before)
      .map((call) => call.path),
    ['/trains'],
  );
});

test('train watches alone: one small request per train number', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5' });
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  await action(world, 'add_train', { train: 'v15' });
  for (const name of ['Zephyr', 'Emeryville', 'Ocean']) {
    await create(world, name);
  }
  const before = world.network.trainRequests().length;
  await world.service.refresh();
  assert.deepEqual(
    world.network
      .trainRequests()
      .slice(before)
      .map((call) => call.path),
    ['/trains/5', '/trains/v15'],
  );
  assert.equal(world.network.calls[0].headers['user-agent'].startsWith('gladys-amtrak'), true);
});

test('a train not running: its states say so, its route comes with its first run', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '2151', station: 'NYP' });
  const device = await create(world, 'Amtrak 2151');
  assert.equal(lastState(world, device, 'status'), 'Pas en circulation');
  assert.equal(lastState(world, device, 'next_stop'), 'Aucun trajet en cours');
  assert.equal(lastState(world, device, 'minutes_to_station'), 0);
  world.network.trains['2151'] = structuredClone(world.network.trains['339']).map((run) => ({
    ...run,
    routeName: 'Acela',
    trainNum: '2151',
    trainID: '2151-7',
  }));
  await world.service.refresh();
  assert.equal(discovered(world, '2151').name, 'Amtrak 2151 Acela → New York Penn');
});

test('triggers: silent first read, then once per run and threshold', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { events } = await stageEverything(world);
  const keys = (key) => events.filter((event) => event.key === key);
  assert.deepEqual(
    keys(TRIGGERS.DELAYED).map((event) => event.data.threshold),
    ['5', '10', '15'],
  );
  assert.deepEqual(
    keys(TRIGGERS.APPROACHING).map((event) => event.data.threshold),
    ['60', '45', '30', '20', '15', '10', '5'],
  );
  const [arrived] = keys(TRIGGERS.ARRIVED);
  assert.deepEqual(arrived.data, {
    train: 'ext:test-integration:train:339-mke',
    train_number: '339',
    route_name: 'Hiawatha',
    station_name: 'Milwaukee',
    arrival_time: '18:58',
    delay_minutes: 13,
  });
  assert.equal(keys(TRIGGERS.ARRIVED).length, 1);
  // Nothing new: nothing fired again.
  const count = world.fake.sceneEvents.length;
  await world.service.refresh();
  assert.equal(world.fake.sceneEvents.length, count);
});

test('triggers: a restart announces nothing already there', async (t) => {
  const first = await createWorld();
  await action(first, 'add_train', { train: '339', station: 'MKE' });
  await create(first, 'Hiawatha');
  delayRun(hiawatha(first), 40);
  await first.app.stop();
  const world = await createWorld({ devices: first.fake.devices, network: first.network });
  t.after(() => world.app.stop());
  world.clock.advance(60000);
  await world.service.refresh();
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('an approach crossed while Amtraker was down is not announced late', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '339', station: 'MKE' });
  await create(world, 'Hiawatha');
  world.clock.advance(50 * 60000);
  await world.service.refresh();
  assert.deepEqual(
    world.fake.sceneEvents.map((event) => event.data.threshold),
    [],
    '77 → 27 minutes in one read: 60, 45 and 30 are marked, not fired',
  );
});

test('the arrival of the run kept is seen even when the next run takes over', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  const device = await create(world, 'Zephyr');
  const [oldest] = world.network.trains['5'];
  arriveAt(oldest, 'EMY');
  oldest.trainState = 'Completed';
  await world.service.refresh();
  const arrived = world.fake.sceneEvents.filter((event) => event.key === TRIGGERS.ARRIVED);
  assert.equal(arrived.length, 1);
  assert.equal(arrived[0].data.station_name, 'Emeryville');
  // The device moves on to 5-6, the next one to reach Emeryville.
  assert.match(lastState(world, device, 'next_stop'), /^Glenwood Springs/);
});

test('the container reads Amtraker on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({ timers: true, config: { refresh_interval: '60' } });
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5' });
  await create(world, 'Zephyr');
  const before = world.network.trainRequests().length;
  t.mock.timers.tick(60000);
  await world.service.inflight;
  t.mock.timers.tick(60000);
  await world.service.inflight;
  assert.equal(world.network.trainRequests().length, before + 2);
  // A poll right after a read does not read again.
  await world.fake.poll(discovered(world, 'Zephyr'));
  assert.equal(world.network.trainRequests().length, before + 2);
});

test('Amtraker down: one warning, the connection status, nothing published, then back', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  await create(world, 'Zephyr');
  const logs = captureLogs(t);
  const count = world.fake.states.length;
  world.network.fail = new Error('connect ETIMEDOUT');
  world.clock.advance(10 * 60000);
  await world.service.refresh();
  await world.service.refresh();
  assert.equal(world.fake.states.length, count);
  assert.equal(logs.filter((line) => line.level === 'warn').length, 1);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.deepEqual(Object.keys(world.fake.connectionStatus.message), ['en', 'fr', 'de', 'es']);
  assert.match(world.fake.connectionStatus.message.fr, /Amtraker est injoignable/);
  assert.match(
    fr(await action(world, 'status')),
    /Dernière erreur : api\.amtraker\.com: connect ETIMEDOUT/,
  );
  world.network.fail = null;
  await world.service.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.ok(logs.some((line) => line.level === 'info' && /reachable again/.test(line.text)));
  assert.ok(world.fake.states.length > count);
});

test('a normal read writes nothing at info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  await create(world, 'Zephyr');
  const logs = captureLogs(t);
  world.clock.advance(120000);
  await world.service.refresh();
  assert.deepEqual(logs, []);
});

test('/data lost: the watches come back from the Gladys devices', async (t) => {
  const first = await createWorld();
  await action(first, 'add_train', { train: '5', station: 'EMY' });
  await action(first, 'add_station', { station: 'CHI' });
  await create(first, 'Zephyr');
  await create(first, 'Chicago');
  await first.app.stop();
  const world = await createWorld({ devices: first.fake.devices });
  t.after(() => world.app.stop());
  assert.deepEqual(world.service.watches, [
    {
      kind: 'train',
      number: '5',
      station: 'EMY',
      stationName: 'Emeryville',
      route: 'California Zephyr',
      provider: 'Amtrak',
    },
    {
      kind: 'station',
      number: '',
      station: 'CHI',
      stationName: 'Chicago Union',
      route: '',
      provider: '',
    },
  ]);
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.external_id),
    first.fake.devices.map((d) => d.external_id),
  );
});

test('remove a watch by its name, number or code; it does not come back', async (t) => {
  const first = await createWorld();
  await action(first, 'add_train', { train: '5', station: 'EMY' });
  await action(first, 'add_train', { train: '5', station: 'DEN' });
  await action(first, 'add_station', { station: 'CHI' });
  await create(first, 'Emeryville');
  assert.match(fr(await action(first, 'remove', { name: '5' })), /Plusieurs suivis/);
  assert.match(fr(await action(first, 'remove', { name: 'nope' })), /Rien de suivi/);
  assert.match(
    fr(await action(first, 'remove', { name: 'amtrak 5 california zephyr → emeryville' })),
    /n'est plus suivi/,
  );
  assert.match(fr(await action(first, 'remove', { name: 'chi' })), /Chicago Union \(CHI\)/);
  assert.deepEqual(
    first.service.watches.map((w) => w.station),
    ['DEN'],
  );
  await first.app.stop();
  // Its device is still in Gladys: not restored at the restart.
  const world = await createWorld({ devices: first.fake.devices, dataDir: first.dataDir });
  t.after(() => world.app.stop());
  assert.equal(world.service.watches.length, 1);
});

test('the status lists the watches, the data source and a stale feed', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  await action(world, 'add_station', { station: 'CHI' });
  await create(world, 'Zephyr');
  world.network.stale = true;
  const status = (await action(world, 'status')).en;
  assert.match(status, /• Amtrak 5 California Zephyr → Emeryville — device created — At a station/);
  assert.match(status, /• Chicago Union \(CHI\) — device not created yet/);
  assert.match(status, /its own data is stale/);
  assert.match(status, /Data: Amtraker \(amtraker\.com\), unofficial, not affiliated with Amtrak/);
});

test('the widget: a train with its stops, a station board, the source, its settings', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  await action(world, 'add_station', { station: 'CHI' });
  const train = await create(world, 'Zephyr');
  const station = await create(world, 'Chicago');
  const get = async (settings, language = 'fr') =>
    (await world.fake.widgetGet('train', { settings, language })).data.content;

  const content = await get({ train: train.external_id });
  assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
  const [heading, caption, status, button] = content.components;
  assert.equal(heading.text, 'Amtrak 5 California Zephyr → Emeryville');
  assert.equal(caption.text, 'Données : Amtraker (amtraker.com) · non officiel');
  assert.deepEqual(status.items.slice(0, 3), [
    { label: 'État', value: 'En gare · +62 min', color: 'danger' },
    { label: 'Emeryville', value: '17:29 (+32) · 128 min', icon: 'home', color: 'danger' },
    { label: 'Roseville', value: '15:15 (+61)', icon: 'map-pin', color: 'danger' },
  ]);
  assert.equal(status.items.at(-1).icon, 'flag');
  assert.deepEqual(button.link, { url: 'https://amtraker.com' });

  const short = await get({ train: train.external_id, show_stops: false });
  assert.deepEqual(
    short.components[2].items.map((item) => item.label),
    ['État', 'Emeryville', 'Prochain arrêt'],
  );

  // The name given in Gladys.
  await world.fake.deviceUpdated({ ...world.fake.devices[0], name: 'Zephyr de tante Lou' });
  assert.equal((await get({ train: train.external_id })).components[0].text, 'Zephyr de tante Lou');

  const board = await get({ train: station.external_id }, 'en');
  assert.deepEqual(validateWidgetContent(board).errors ?? [], []);
  assert.equal(board.components[2].items.length, 10);
  assert.deepEqual(board.components[2].items[4], {
    label: '22 ← San Antonio',
    value: '6:17 PM (+268) · 56 min',
    icon: 'log-in',
    color: 'danger',
  });

  assert.equal(
    (await get({}, 'de')).components[0].text,
    'Wähle in den Widget-Einstellungen einen Zug oder Bahnhof.',
  );
  assert.equal(
    (await get({ train: 'ext:x' }, 'es')).components[0].text,
    'La integración ya no sigue este dispositivo.',
  );
  world.network.fail = 500;
  world.clock.advance(10 * 60000);
  assert.equal(
    (await get({ train: train.external_id })).components[1].text,
    'Amtraker est injoignable en ce moment.',
  );
});

test('the scene action: train and station sentences, unknown device', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  await action(world, 'add_train', { train: 'v15' });
  await action(world, 'add_station', { station: 'CHI' });
  const train = await create(world, 'Zephyr');
  const ocean = await create(world, 'Ocean');
  const station = await create(world, 'Chicago');
  const run = async (device) =>
    (await world.fake.sceneAction('get_train_status', { train: device.external_id })).data.outputs;
  const zephyr = await run(train);
  assert.equal(
    zephyr.sentence,
    'Train 5 California Zephyr: 62 min late, next stop Roseville at 3:16 PM. Arrival at Emeryville at 5:29 PM.',
  );
  assert.equal(zephyr.minutes_to_station, 128);
  assert.equal(zephyr.status, 'At a station');
  assert.match((await run(ocean)).sentence, /^Train 15 Ocean arrived at Montréal at /);
  assert.equal(
    (await run(station)).sentence,
    'Chicago Union: 305 Lincoln Service to St. Louis Gateway at 5:20 PM; 354 Wolverine to Pontiac at 5:50 PM; 50 Cardinal to New York Penn at 5:55 PM.',
  );
  const unknown = await world.fake.sceneAction('get_train_status', { train: 'ext:x' });
  assert.equal(unknown.success, false);
});

test('a language change renames nothing but republishes the texts', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_train', { train: '5', station: 'EMY' });
  const device = await create(world, 'Zephyr');
  await world.fake.configUpdated({ language: 'de' });
  assert.equal(lastState(world, device, 'status'), 'Im Bahnhof');
  assert.equal(discovered(world, 'Zephyr').features[0].name, 'Verspätung');
});
