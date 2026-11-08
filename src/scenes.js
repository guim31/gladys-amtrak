// -----------------------------------------------------------------------------
// Scene action (manifest `scene_actions`, Gladys 5.1+).
//
// - get_train_status: a watched train as numbers for a "Continue only if"
//   step and as a sentence ready for a message or a speaker ("Train 5
//   California Zephyr: 38 min late, next stop Galesburg at 4:14 PM."). On a
//   watched station: its next train, and the sentence lists the next three.
//
// A scene action does not receive the user's language: the sentence follows
// the `language` of the configuration. Outputs are numbers, never booleans:
// the core's "Continue only if" compares with ===.
// -----------------------------------------------------------------------------

import { STATION_TYPE, stateText } from './devices.js';
import { TEXT, say } from './messages.js';
import { SceneError } from './service.js';
import { clockTime, rawNumber, runState } from './trains.js';

export const SCENE_ACTIONS = {
  async get_train_status(service, { fields }) {
    const language = service.config.language;
    const found = await service.readingOf(fields.train);
    if (!found) {
      throw new SceneError(say(TEXT, language, 'gone'));
    }
    const { watch, reading } = found;
    if (!reading) {
      throw new SceneError(say(TEXT, language, 'unavailable'));
    }
    if (watch.kind === STATION_TYPE) {
      const [next] = reading.board;
      return {
        sentence: service.stationSentence(watch, reading.board, language),
        train_number: next ? rawNumber(next.run.number) : '',
        route_name: next?.run.route ?? '',
        status: next ? stateText({ state: runState(next.run) }, language) : '',
        delay_minutes: next?.delay ?? 0,
        next_stop: watch.stationName || watch.station,
        next_stop_time: next ? clockTime(next.at, next.stop.tz, language) : '',
        station_name: watch.stationName || watch.station,
        minutes_to_station: next?.minutes ?? 0,
        arrival_time: next ? clockTime(next.at, next.stop.tz, language) : '',
      };
    }
    const { status } = reading;
    const mine = status?.mine;
    return {
      sentence: service.trainSentence(watch, status, language),
      train_number: rawNumber(watch.number),
      route_name: status?.run.route || watch.route || '',
      status: stateText(status, language),
      delay_minutes: status?.delay ?? 0,
      next_stop: status?.next?.name ?? '',
      next_stop_time: status?.next ? clockTime(status.next.time, status.next.tz, language) : '',
      station_name: mine?.name ?? watch.stationName ?? '',
      minutes_to_station: mine?.minutes ?? 0,
      arrival_time: mine ? clockTime(mine.eta, mine.tz, language) : '',
    };
  },
};
