// -----------------------------------------------------------------------------
// A scenario staging every trigger on the real Hiawatha 339 (Chicago →
// Milwaukee) watched with Milwaukee as the user's station: the first read is
// silent, then the train falls 20 minutes behind, comes closer to Milwaukee
// minute after minute, and arrives there. The changes are made on the
// recorded run, as Amtraker would send them.
// -----------------------------------------------------------------------------

import { action, create } from './world.js';

/** "2026-11-07T17:28:00-06:00" shifted by `minutes`, same offset. */
export const shift = (iso, minutes) => {
  const offset = iso.slice(-6);
  const sign = offset.startsWith('-') ? -1 : 1;
  const offsetMs = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) * 60000;
  const local = new Date(Date.parse(iso) + minutes * 60000 + offsetMs);
  return `${local.toISOString().slice(0, 19)}${offset}`;
};

/** The recorded run of the Hiawatha 339. */
export const hiawatha = (world) => world.network.trains['339'][0];

/** Delays every stop still to come by `minutes`. */
export function delayRun(run, minutes) {
  for (const stop of run.stations) {
    if (stop.status !== 'Departed') {
      stop.arr = shift(stop.arr, minutes);
      stop.dep = shift(stop.dep, minutes);
    }
  }
}

/** The train reaches the stop `code`: every stop before it departed. */
export function arriveAt(run, code) {
  const index = run.stations.findIndex((stop) => stop.code === code);
  run.stations.forEach((stop, i) => {
    if (i < index) {
      stop.status = 'Departed';
    }
  });
  run.stations[index].status = 'Station';
  run.eventCode = code;
}

/** Resolves with the device and the scene events fired after the first read. */
export async function stageEverything(world) {
  await action(world, 'add_train', { train: '339', station: 'MKE' });
  const device = await create(world, 'Hiawatha');
  const before = world.fake.sceneEvents.length;
  const run = hiawatha(world);
  delayRun(run, 20);
  // Two minutes at a time, as the timer would, until Milwaukee is close.
  for (let step = 0; step < 50; step += 1) {
    world.clock.advance(2 * 60000);
    await world.service.refresh();
  }
  arriveAt(run, 'MKE');
  world.clock.advance(2 * 60000);
  await world.service.refresh();
  return { device, events: world.fake.sceneEvents.slice(before) };
}
