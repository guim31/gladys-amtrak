// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake `fetch` answering like
// Amtraker from the real responses of test/fixtures/amtraker (captured on
// 2026-11-07 around 23:21 UTC), a manual clock, a temporary /data, and the
// integration wired on top through registerHandlers. Nothing touches the
// network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { API_URL } from '../../src/amtraker.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'America/Chicago';

export const fixtureJson = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/amtraker/${name}`, import.meta.url), 'utf8'));

// 2026-11-07 17:21 in Chicago: when the fixtures were captured.
export const FIXTURE_TIME = Date.parse('2026-11-07T23:21:00Z');

/** The recorded runs of each train number, a deep copy the test may change. */
export function recordedTrains() {
  return {
    ...fixtureJson('trains-chi.json'),
    ...fixtureJson('train-5.json'),
    ...fixtureJson('train-339.json'),
    ...fixtureJson('train-v15.json'),
  };
}

/**
 * A fake `fetch` answering like Amtraker. `trains` holds the runs served
 * (change their stops to stage a delay or an arrival); `fail` makes every
 * request fail with an Error or an HTTP status. Every call is recorded in
 * `calls` (the path after /v3).
 */
export function createFetch() {
  const network = { trains: recordedTrains(), calls: [], fail: null, stale: false };
  const stations = fixtureJson('stations.json');
  const json = (body) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  network.fetch = async (url, init = {}) => {
    const path = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
    network.calls.push({ path, headers: init.headers ?? {} });
    if (network.fail instanceof Error) {
      throw network.fail;
    }
    if (typeof network.fail === 'number') {
      return new Response('error', { status: network.fail });
    }
    let match;
    if (path === '/trains') {
      return json(structuredClone(network.trains));
    }
    if ((match = /^\/trains\/([^/]+)$/.exec(path))) {
      const number = decodeURIComponent(match[1]);
      return json(
        network.trains[number] ? { [number]: structuredClone(network.trains[number]) } : [],
      );
    }
    if (path === '/stations') {
      return json(stations);
    }
    if ((match = /^\/stations\/([^/]+)$/.exec(path))) {
      const code = decodeURIComponent(match[1]);
      return json(stations[code] ? { [code]: stations[code] } : []);
    }
    if (path === '/stale') {
      return json({ ...fixtureJson('stale.json'), stale: network.stale });
    }
    return new Response('not found', { status: 404 });
  };
  network.trainRequests = () => network.calls.filter((call) => call.path.startsWith('/trains'));
  return network;
}

/** A manual clock. */
export function createClock(start = FIXTURE_TIME) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {object} [options.network] from createFetch
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {object} [options.saved] content of /data/watch.json before the start
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  config = {},
  network = createFetch(),
  devices = [],
  saved,
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-amtrak-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  if (saved) {
    await store.save(saved);
    await store.flush();
  }
  const app = registerHandlers(gladys, {
    store,
    fetch: network.fetch,
    timers,
    now: clock.now,
    dataDir,
  });
  const world = {
    gladys,
    fake: gladys.fake,
    app,
    service: app.service,
    network,
    clock,
    store,
    dataDir,
  };
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return world;
}

/** Run a configuration action; resolves with its message (multi-language). */
export async function action(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (!ack.success) {
    throw new Error(`action ${key} failed: ${ack.error}`);
  }
  return ack.data.message;
}

/** The discovered device whose name contains `name`. */
export function discovered(world, name) {
  const device = world.fake.discoveredDevices.find((d) => d.name.includes(name));
  if (!device) {
    throw new Error(`no discovered device named ${name}`);
  }
  return device;
}

/** "Add to Gladys" on the discovered device named `name`; resolves with it. */
export async function create(world, name) {
  const device = discovered(world, name);
  await world.fake.deviceCreated(device);
  return device;
}

/** The last state published on a feature of a device. */
export const lastState = (world, device, key) =>
  world.fake.lastState(`${device.external_id}:${key}`);

/** Captures the log lines of the integration at `level` and above. */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
