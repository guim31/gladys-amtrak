// -----------------------------------------------------------------------------
// From Amtraker trains to what the integration shows, on the real answers of
// 2026-11-07: the California Zephyr 5 (three runs on the line at once), the
// Hiawatha 339 (a short train), the VIA Rail Ocean (arrived) and the trains
// calling at Chicago Union.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStationCode, parseTrainNumber } from '../src/amtraker.js';
import {
  STATES,
  allRuns,
  clockTime,
  parseRuns,
  pickRun,
  runState,
  stationBoard,
  trainStatus,
} from '../src/trains.js';
import { FIXTURE_TIME, fixtureJson } from './helpers/world.js';

const zephyr = () => parseRuns(fixtureJson('train-5.json')['5']);

test('train numbers and station codes are read leniently, and checked', () => {
  assert.equal(parseTrainNumber(' 5 '), '5');
  assert.equal(parseTrainNumber('V15'), 'v15');
  assert.equal(parseTrainNumber('Amtrak 0339'), '339');
  assert.equal(parseTrainNumber('#b5150'), 'b5150');
  assert.equal(parseTrainNumber('VIA 15'), 'v15');
  assert.equal(parseTrainNumber('via rail #15'), 'v15');
  assert.equal(parseTrainNumber('VIA v15'), 'v15');
  assert.equal(parseTrainNumber('Brightline 5150'), 'b5150');
  assert.equal(parseTrainNumber('5-7'), null);
  assert.equal(parseTrainNumber('../stations'), null);
  assert.equal(parseStationCode(' emy '), 'EMY');
  assert.equal(parseStationCode('BEKW'), 'BEKW');
  assert.equal(parseStationCode('Chicago Union'), null);
});

test('a night train: the run that reaches my station first, else the latest on the line', () => {
  const runs = zephyr();
  assert.deepEqual(
    runs.map((run) => [run.id, runState(run)]),
    [
      ['5-5', STATES.STATION],
      ['5-6', STATES.STATION],
      ['5-7', STATES.ENROUTE],
    ],
  );
  // No station: the most recent run on the line, which left Chicago today.
  assert.equal(pickRun(runs).id, '5-7');
  // Emeryville, the terminus: the run of two days ago arrives first.
  assert.equal(pickRun(runs, 'EMY').id, '5-5');
  // Denver: 5-5 and 5-6 have passed it, 5-7 is the next one.
  assert.equal(pickRun(runs, 'DEN').id, '5-7');
  // Glenwood Springs: 5-6 is standing there, still the one to show.
  assert.equal(pickRun(runs, 'GSC').id, '5-6');
  // Chicago, where every run left from: the latest one.
  assert.equal(pickRun(runs, 'CHI').id, '5-7');
  assert.equal(pickRun([], 'CHI'), null);
});

test('status of a run: delay at the next stop, arrival and countdown at my station', () => {
  const status = trainStatus(pickRun(zephyr(), 'EMY'), 'EMY', FIXTURE_TIME);
  assert.equal(status.state, STATES.STATION);
  // At Roseville (scheduled 14:14), leaving at 15:16: 62 minutes late.
  assert.equal(status.delay, 62);
  assert.equal(status.next.name, 'Roseville');
  assert.equal(clockTime(status.next.time, status.next.tz, 'fr'), '15:16');
  assert.equal(status.mine.name, 'Emeryville');
  assert.equal(status.mine.delay, 32);
  assert.equal(status.mine.minutes, 128);
  assert.equal(status.mine.reached, false);
  assert.equal(clockTime(status.mine.eta, status.mine.tz, 'en'), '5:29 PM');

  const passed = trainStatus(pickRun(zephyr(), 'CHI'), 'CHI', FIXTURE_TIME);
  assert.equal(passed.mine.reached, true);
  assert.equal(passed.mine.minutes, 0);
});

test('a short train early at its next stop shows no negative delay', () => {
  const [run] = parseRuns(fixtureJson('train-339.json')['339']);
  const status = trainStatus(run, 'MKE', FIXTURE_TIME);
  assert.equal(status.state, STATES.ENROUTE);
  assert.equal(status.next.name, 'Glenview');
  // Expected 17:28 for 17:31: early, shown on time.
  assert.equal(status.delay, 0);
  assert.equal(status.mine.minutes, 77);
});

test('arrived and scheduled runs', () => {
  const [ocean] = parseRuns(fixtureJson('train-v15.json').v15);
  assert.equal(ocean.provider, 'VIA Rail');
  assert.equal(runState(ocean), STATES.ARRIVED);
  const arrived = trainStatus(ocean, undefined, FIXTURE_TIME);
  assert.equal(arrived.next, null);
  assert.equal(arrived.terminus.name, 'Montréal');

  const [completed] = zephyr();
  completed.trainState = 'Completed';
  assert.equal(runState(completed), STATES.ARRIVED);

  const all = allRuns(fixtureJson('trains-chi.json'));
  const cardinal = all.find((run) => run.id === '50-7');
  assert.equal(runState(cardinal), STATES.SCHEDULED);
  const scheduled = trainStatus(cardinal, undefined, FIXTURE_TIME);
  assert.equal(scheduled.next.name, 'Chicago Union');
  assert.equal(clockTime(scheduled.next.time, scheduled.next.tz, 'en'), '5:55 PM');
});

test('a station board: departures and terminus arrivals, soonest first, gone ones out', () => {
  const board = stationBoard(allRuns(fixtureJson('trains-chi.json')), 'CHI', FIXTURE_TIME);
  assert.equal(board.length, 19);
  assert.deepEqual(
    board.slice(0, 5).map((entry) => [entry.run.id, entry.terminus, entry.minutes, entry.delay]),
    [
      ['305-7', false, 0, 0],
      ['354-7', false, 29, 0],
      ['50-7', false, 34, 0],
      ['383-7', false, 34, 0],
      ['22-6', true, 56, 268],
    ],
  );
  // The Zephyrs and the Hiawatha have left Chicago.
  assert.ok(!board.some((entry) => ['5-7', '339-7'].includes(entry.run.id)));
  assert.ok(board.every((entry, i) => i === 0 || board[i - 1].at <= entry.at));
});

test('clock times follow the station time zone, 12-hour in English', () => {
  const at = Date.parse('2026-11-07T23:05:00Z');
  assert.equal(clockTime(at, 'America/Chicago', 'en'), '5:05 PM');
  assert.equal(clockTime(at, 'America/Los_Angeles', 'de'), '15:05');
  assert.equal(clockTime(null, 'America/Chicago', 'fr'), '');
  assert.match(clockTime(at, 'Not/AZone', 'fr'), /^\d\d:\d\d$/);
});
