// -----------------------------------------------------------------------------
// The Gladys devices of the integration, read-only and refreshed by the
// service's own timer (`should_poll: false`):
//
// - a watched train (a number, and optionally the user's station): delay,
//   state, next stop with its time; with a station, the expected arrival
//   there and the minutes left;
// - a watched station: the next train calling there, in how many minutes,
//   and its delay.
//
// Texts and countdowns keep no history: re-read every minute or two, their
// past means nothing. The delays do (a train's delay over its journey).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { NAMES, STATE_NAMES, TEXT, say } from './messages.js';
import { clockTime, providerName, rawNumber } from './trains.js';

export const TRAIN_TYPE = 'train';
export const STATION_TYPE = 'station';
// Long-distance trains run more than two days: a countdown to the user's
// station reaches 3 days; a delay is shown up to 2 days.
export const MAX_MINUTES = 4320;
export const MAX_DELAY = 2880;
// Published by a station when no train is announced (the countdown's max).
export const NO_TRAIN_MINUTES = 1440;
export const MAX_TEXT_STATE = 200;

/** Shortens a text to `max` characters, with an ellipsis. */
export function clip(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** The platform id of a watch: "5", "5-emy", "v15", "station-chi". */
export function watchKey(watch) {
  if (watch.kind === STATION_TYPE) {
    return `station-${watch.station.toLowerCase()}`;
  }
  return watch.station ? `${watch.number}-${watch.station.toLowerCase()}` : watch.number;
}

/** "Amtrak 5 California Zephyr → Emeryville", "Chicago Union (CHI)". */
export function watchName(watch) {
  if (watch.kind === STATION_TYPE) {
    return `${watch.stationName || watch.station} (${watch.station})`;
  }
  const train = [providerName(watch.provider, watch.number), rawNumber(watch.number), watch.route]
    .filter(Boolean)
    .join(' ');
  return watch.station ? `${train} → ${watch.stationName || watch.station}` : train;
}

const duration = (name, externalId, max, keepHistory) => ({
  name,
  external_id: externalId,
  category: DEVICE_FEATURE_CATEGORIES.DURATION,
  type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
  unit: DEVICE_FEATURE_UNITS.MINUTES,
  min: 0,
  max,
  read_only: true,
  has_feedback: false,
  keep_history: keepHistory,
});

const text = (name, externalId) => ({
  name,
  external_id: externalId,
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  // NOT NULL in the core, even for a text (422 on "Add to Gladys" without).
  min: 0,
  max: 0,
  read_only: true,
  has_feedback: false,
  keep_history: false,
});

export const deviceIds = (gladys, watch) =>
  gladys.externalIds(watch.kind === STATION_TYPE ? STATION_TYPE : TRAIN_TYPE, watchKey(watch));

/**
 * The device of a watch.
 * @param {object} gladys
 * @param {object} watch { kind, number, station, stationName, route, provider }
 * @param {string} language
 */
export function buildDevice(gladys, watch, language) {
  const ids = deviceIds(gladys, watch);
  const names = NAMES[language] ?? NAMES.en;
  const device = {
    name: clip(watchName(watch), 80),
    external_id: ids.device,
    should_poll: false,
    // What is needed to watch it again when /data is lost.
    params: [
      { name: 'kind', value: watch.kind },
      { name: 'number', value: watch.number ?? '' },
      { name: 'station', value: watch.station ?? '' },
      { name: 'station_name', value: watch.stationName ?? '' },
      { name: 'route', value: watch.route ?? '' },
      { name: 'provider', value: watch.provider ?? '' },
    ],
  };
  if (watch.kind === STATION_TYPE) {
    device.features = [
      duration(names.nextTrainMinutes, ids.feature('next_minutes'), NO_TRAIN_MINUTES, false),
      text(names.nextTrain, ids.feature('next_train')),
      duration(names.nextTrainDelay, ids.feature('next_delay'), MAX_DELAY, false),
    ];
    return device;
  }
  device.features = [
    duration(names.delay, ids.feature('delay'), MAX_DELAY, true),
    text(names.status, ids.feature('status')),
    text(names.nextStop, ids.feature('next_stop')),
  ];
  if (watch.station) {
    device.features.push(
      text(names.arrival, ids.feature('arrival')),
      duration(names.minutesToStation, ids.feature('minutes_to_station'), MAX_MINUTES, false),
    );
  }
  return device;
}

/** "Galesburg · 16:14" */
export function stopText(stop, at, language) {
  const when = clockTime(at, stop.tz, language);
  return when ? `${stop.name} · ${when}` : stop.name;
}

/** "En route · 38 min de retard", "Arrivé à Emeryville". */
export function stateText(status, language) {
  if (!status) {
    return STATE_NAMES[language].none;
  }
  return STATE_NAMES[language][status.state];
}

/** "Emeryville · 08:10 (+38)", "Emeryville · arrivé 08:10". */
export function arrivalText(mine, language) {
  const when = clockTime(mine.eta, mine.tz, language);
  if (mine.reached) {
    // The origin is where the train leaves from.
    const key = mine.index === 0 ? 'departedAt' : 'arrivedAt';
    return clip(say(TEXT, language, key, { stop: mine.name, time: when }), MAX_TEXT_STATE);
  }
  const late = mine.delay > 0 ? ` (+${mine.delay})` : '';
  return clip(`${mine.name} · ${when}${late}`, MAX_TEXT_STATE);
}

/** "5 California Zephyr → Emeryville · 14:00 (+5)" */
export function boardEntryText(entry, language) {
  const { run } = entry;
  const where = entry.terminus ? entry.stop.name : run.stops[run.stops.length - 1].name;
  const late = entry.delay > 0 ? ` (+${entry.delay})` : '';
  const when = clockTime(entry.at, entry.stop.tz, language);
  const label = entry.terminus
    ? say(TEXT, language, 'arrivingFrom', { origin: run.stops[0].name })
    : `→ ${where}`;
  return clip(`${rawNumber(run.number)} ${run.route} ${label} · ${when}${late}`, MAX_TEXT_STATE);
}

/**
 * The states of a train watch.
 * @param {object} gladys
 * @param {object} watch
 * @param {object | null} status from trainStatus (null: no run)
 * @param {string} language
 */
export function trainStates(gladys, watch, status, language) {
  const ids = deviceIds(gladys, watch);
  const states = [
    { device_feature_external_id: ids.feature('status'), text: stateText(status, language) },
    {
      device_feature_external_id: ids.feature('next_stop'),
      text: !status
        ? say(TEXT, language, 'noRun')
        : status.next
          ? clip(stopText(status.next, status.next.time, language), MAX_TEXT_STATE)
          : clip(
              say(TEXT, language, 'arrivedAt', {
                stop: status.terminus.name,
                time: clockTime(status.terminusTime, status.terminus.tz, language),
              }),
              MAX_TEXT_STATE,
            ),
    },
  ];
  // No run: no delay to record (the delay keeps a history).
  if (status) {
    states.unshift({
      device_feature_external_id: ids.feature('delay'),
      state: Math.min(status.delay, MAX_DELAY),
    });
  }
  if (watch.station) {
    const mine = status?.mine;
    states.push(
      {
        device_feature_external_id: ids.feature('arrival'),
        text: mine ? arrivalText(mine, language) : say(TEXT, language, 'noRun'),
      },
      {
        device_feature_external_id: ids.feature('minutes_to_station'),
        // No run, or the run kept has passed the station: 0, nothing to wait for.
        state: mine ? Math.min(mine.minutes, MAX_MINUTES) : 0,
      },
    );
  }
  return states;
}

/**
 * The states of a station watch.
 * @param {object} gladys
 * @param {object} watch
 * @param {object[]} board from stationBoard
 * @param {string} language
 */
export function stationStates(gladys, watch, board, language) {
  const ids = deviceIds(gladys, watch);
  const [next] = board;
  return [
    {
      device_feature_external_id: ids.feature('next_minutes'),
      state: next ? Math.min(next.minutes, NO_TRAIN_MINUTES) : NO_TRAIN_MINUTES,
    },
    {
      device_feature_external_id: ids.feature('next_train'),
      text: next ? boardEntryText(next, language) : say(TEXT, language, 'noTrain'),
    },
    {
      device_feature_external_id: ids.feature('next_delay'),
      state: next ? Math.min(next.delay, MAX_DELAY) : 0,
    },
  ];
}
