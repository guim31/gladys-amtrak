// -----------------------------------------------------------------------------
// The Amtrak service: the watched trains and stations (configuration actions,
// /data), their devices, the refresh timer, the states and the scene triggers.
//
// One cycle reads Amtraker once per watched train number, or once for every
// train when a station is watched (or many numbers are): a station board needs
// every train calling there. When Amtraker does not answer, the connection
// status says so and nothing is published: the last values stay as they were.
//
// Triggers never fire at the first read of a train: what is already there
// when the integration starts is not news. Their memory (thresholds reached,
// arrivals seen) is per run and in memory only: a run lives a few days at
// most, and /data is often an SD card.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { Amtraker, parseStationCode, parseTrainNumber } from './amtraker.js';
import {
  STATION_TYPE,
  TRAIN_TYPE,
  buildDevice,
  clip,
  deviceIds,
  stationStates,
  stateText,
  trainStates,
  watchKey,
  watchName,
} from './devices.js';
import { TEXT, say, sayAll } from './messages.js';
import {
  STATES,
  allRuns,
  clockTime,
  currentDelay,
  delayAt,
  etaAt,
  fold,
  parseRuns,
  pickRun,
  providerName,
  rawNumber,
  reached,
  stationBoard,
  stopIndex,
  trainStatus,
} from './trains.js';

const logger = createLogger({ name: 'amtrak' });

export const TRIGGERS = {
  DELAYED: 'train_delayed',
  APPROACHING: 'train_approaching',
  ARRIVED: 'train_arrived',
};
// Options of the threshold filters of the triggers (manifest `scene_triggers`):
// the core's filters only compare for equality, so one event per threshold.
export const DELAY_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90, 120];
export const APPROACH_MINUTES = [5, 10, 15, 20, 30, 45, 60];

export const MAX_WATCHES = 10;
// Beyond this many train numbers, one read of every train costs less.
const BULK_FROM = 4;
const SEARCH_RESULTS = 10;
const STATIONS_CACHE_MS = 24 * 3600 * 1000;
// A value that does not change is published again this often, so that Gladys
// does not show it as stale ("no recent value" after 48 h).
const HEARTBEAT_MS = 6 * 3600 * 1000;
const LANGS = ['en', 'fr', 'de', 'es'];
// Trigger memory of a run unseen this long is forgotten.
const RUN_MEMORY_MS = 6 * 3600 * 1000;
// A train missing from one answer while it was there a moment ago keeps its
// last values this long: Amtraker sometimes drops a train for a cycle.
const MISSING_GRACE_MS = 10 * 60 * 1000;

export class SceneError extends Error {}

const perLanguage = (render) => Object.fromEntries(LANGS.map((lang) => [lang, render(lang)]));

export class AmtrakService {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the fake one)
   * @param {object} options.store Store (src/store.js)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] false in the tests: refresh by hand
   */
  constructor({ gladys, store, fetch, now = Date.now, timers = true }) {
    this.gladys = gladys;
    this.store = store;
    this.api = new Amtraker({ fetch });
    this.now = now;
    this.timers = timers;
    this.config = { language: 'fr', refreshSeconds: 120 };
    this.watches = [];
    this.removed = [];
    // watchKey → { status } (train) or { board } (station), and `at`
    this.readings = new Map();
    // watchKey → Map(run id → Set of thresholds handled)
    this.delayDone = new Map();
    this.approachDone = new Map();
    // watchKey → Map(run id → whether the train had reached the station)
    this.arrivals = new Map();
    this.checkedNow = new Set();
    this.stationsCache = null;
    this.refreshedAt = 0;
    this.lastError = null;
    this.inflight = null;
    this.timer = null;
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    this.watches = Array.isArray(saved.watches)
      ? saved.watches.filter((w) => w?.kind === STATION_TYPE || w?.number)
      : [];
    this.removed = Array.isArray(saved.removed) ? saved.removed : [];
    await this.restoreFromDevices();
    await this.publishDiscovered();
    await this.gladys.setConnectionStatus(true).catch(() => {});
    this.startTimer();
    await this.refresh();
  }

  async resync(config) {
    await this.reconfigure(config, { force: true });
  }

  async reconfigure(config, { force = false } = {}) {
    const previous = this.config;
    this.config = config;
    if (previous.refreshSeconds !== config.refreshSeconds) {
      this.startTimer();
    }
    if (force || previous.language !== config.language) {
      await this.publishDiscovered();
      await this.refresh({ republish: true });
    }
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.timers) {
      this.timer = setInterval(() => {
        this.refresh().catch((err) => logger.error('Refresh failed', err));
      }, this.config.refreshSeconds * 1000);
      this.timer.unref?.();
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.inflight?.catch(() => {});
    await this.store.flush();
  }

  save() {
    return this.store.save({ watches: this.watches, removed: this.removed });
  }

  // --- Devices ----------------------------------------------------------------

  deviceId(watch) {
    return deviceIds(this.gladys, watch).device;
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** The name the user gave the device in Gladys, else ours. */
  displayName(watch) {
    const id = this.deviceId(watch);
    return (this.gladys.devices ?? []).find((d) => d.external_id === id)?.name || watchName(watch);
  }

  watchOfDevice(externalId) {
    return this.watches.find((watch) => this.deviceId(watch) === externalId) ?? null;
  }

  createdWatches() {
    return this.watches.filter((watch) => this.isCreated(this.deviceId(watch)));
  }

  /** The watches of the devices created in Gladys but missing from /data. */
  async restoreFromDevices() {
    let devices;
    try {
      devices = await this.gladys.getDevices();
    } catch (err) {
      logger.warn(`Cannot read the devices of the integration: ${err.message}`);
      return;
    }
    const param = (device, name) => device.params?.find((p) => p.name === name)?.value ?? '';
    let changed = false;
    for (const device of devices ?? []) {
      const kind = param(device, 'kind');
      const watch = {
        kind: kind === STATION_TYPE ? STATION_TYPE : TRAIN_TYPE,
        number: parseTrainNumber(param(device, 'number')) ?? '',
        station: parseStationCode(param(device, 'station')) ?? '',
        stationName: param(device, 'station_name'),
        route: param(device, 'route'),
        provider: param(device, 'provider'),
      };
      if (
        ![TRAIN_TYPE, STATION_TYPE].includes(kind) ||
        (watch.kind === TRAIN_TYPE && !watch.number) ||
        (watch.kind === STATION_TYPE && !watch.station)
      ) {
        continue;
      }
      // A watch removed by the user keeps its device until deleted: not restored.
      const key = watchKey(watch);
      if (!this.removed.includes(key) && !this.watches.some((known) => watchKey(known) === key)) {
        this.watches.push(watch);
        changed = true;
      }
    }
    if (changed) {
      logger.info(`${this.watches.length} watch(es) restored from the Gladys devices`);
      await this.save();
    }
  }

  async publishDiscovered() {
    try {
      await this.gladys.publishDiscoveredDevices(
        this.watches.map((watch) => buildDevice(this.gladys, watch, this.config.language)),
      );
    } catch (err) {
      logger.warn(`Cannot publish the discovered devices: ${err.message}`);
    }
  }

  async onDeviceCreated(device) {
    if (!this.watchOfDevice(device?.external_id)) {
      return;
    }
    // A state published before the device existed was dropped by the core:
    // everything again, then the widgets showing it.
    await this.refresh({ republish: true });
    this.gladys.requestWidgetRefresh?.('train');
  }

  // --- Refresh ----------------------------------------------------------------

  /** Polling fallback: Gladys does not poll these devices, but if it did. */
  async poll() {
    if (this.now() - this.refreshedAt >= (this.config.refreshSeconds * 1000) / 2) {
      await this.refresh();
    }
  }

  refresh(options = {}) {
    if (this.inflight) {
      // A read in progress may predate a device just created: read again after it.
      return this.inflight.then(() => this.refresh(options));
    }
    this.inflight = this.doRefresh(options).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** The raw trains the watches need: { byNumber, all (or null) }. */
  async read(watches) {
    const numbers = [...new Set(watches.filter((w) => w.kind === TRAIN_TYPE).map((w) => w.number))];
    if (watches.some((w) => w.kind === STATION_TYPE) || numbers.length > BULK_FROM) {
      const data = await this.api.allTrains();
      return { byNumber: (number) => data[number] ?? [], all: allRuns(data) };
    }
    const data = {};
    // One after the other: a handful of small requests, gentle on Amtraker.
    for (const number of numbers) {
      data[number] = await this.api.trains(number);
    }
    return { byNumber: (number) => data[number] ?? [], all: null };
  }

  async doRefresh({ republish = false } = {}) {
    const watches = this.createdWatches();
    if (watches.length === 0) {
      return;
    }
    let trains;
    try {
      trains = await this.read(watches);
    } catch (err) {
      if (!this.lastError) {
        logger.warn(`Cannot read Amtraker: ${err.message}`);
        await this.gladys
          .setConnectionStatus(false, sayAll(TEXT, 'serviceDown', { error: err.message }))
          .catch(() => {});
      } else {
        logger.debug(`Cannot read Amtraker: ${err.message}`);
      }
      this.lastError = err.message;
      this.failedAt = this.now();
      return;
    }
    if (this.lastError) {
      logger.info('Amtraker reachable again');
      this.lastError = null;
      await this.gladys.setConnectionStatus(true).catch(() => {});
    }
    const now = this.now();
    this.refreshedAt = now;
    const events = [];
    let learned = false;
    for (const watch of watches) {
      const key = watchKey(watch);
      if (watch.kind === STATION_TYPE) {
        this.readings.set(key, { board: stationBoard(trains.all, watch.station, now), at: now });
        continue;
      }
      const runs = parseRuns(trains.byNumber(watch.number));
      const run = pickRun(runs, watch.station);
      const previous = this.readings.get(key);
      if (!run && previous?.status && now - (previous.seenAt ?? 0) < MISSING_GRACE_MS) {
        logger.debug(`Train ${watch.number} missing from Amtraker, last values kept`);
        continue;
      }
      const status = trainStatus(run, watch.station, now);
      this.readings.set(key, { status, at: now, seenAt: run ? now : previous?.seenAt });
      // A train added while it was not running gets its route name now.
      if (run && !watch.route && run.route) {
        watch.route = run.route;
        watch.provider = run.provider;
        learned = true;
      }
      events.push(...this.detect(watch, runs, status));
    }
    if (learned) {
      await this.save();
      await this.publishDiscovered();
    }
    await this.publishAll({ force: republish });
    for (const { key, data } of events) {
      await this.fire(key, data);
    }
  }

  async publishAll({ force = false } = {}) {
    const states = [];
    for (const watch of this.createdWatches()) {
      const reading = this.readings.get(watchKey(watch));
      if (!reading) {
        continue;
      }
      states.push(
        ...(watch.kind === STATION_TYPE
          ? stationStates(this.gladys, watch, reading.board, this.config.language)
          : trainStates(this.gladys, watch, reading.status, this.config.language)),
      );
    }
    if (states.length === 0) {
      return;
    }
    if (force) {
      this.gladys.forgetPublishedStates?.();
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (this.publishFailed) {
        this.publishFailed = false;
        logger.info('States published again');
      }
    } catch (err) {
      // Gladys restarting: said once, the next refresh sends them again.
      if (!this.publishFailed) {
        logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
      }
      this.publishFailed = true;
    }
  }

  // --- Scene triggers ----------------------------------------------------------

  /**
   * The scene events of a fresh read of a train watch.
   * @param {object} watch
   * @param {object[]} runs every run of the number
   * @param {object | null} status of the run kept
   */
  detect(watch, runs, status) {
    const key = watchKey(watch);
    const language = this.config.language;
    const events = [];
    const firstNow = !this.checkedNow.has(key);
    this.checkedNow.add(key);
    const now = this.now();
    const base = (run) => ({
      train: this.deviceId(watch),
      train_number: rawNumber(run.number),
      route_name: run.route,
    });

    const delays = this.delayDone.get(key) ?? new Map();
    const approaches = this.approachDone.get(key) ?? new Map();
    const arrivals = this.arrivals.get(key) ?? new Map();
    this.delayDone.set(key, delays);
    this.approachDone.set(key, approaches);
    this.arrivals.set(key, arrivals);
    // A run missing from one answer (Amtraker hiccup) keeps its memory: it
    // is forgotten only once unseen for a while.
    this.seenRuns ??= new Map();
    const seen = this.seenRuns.get(key) ?? new Map();
    this.seenRuns.set(key, seen);
    for (const run of runs) {
      seen.set(run.id, now);
    }
    for (const [runId, at] of seen) {
      if (now - at > RUN_MEMORY_MS) {
        seen.delete(runId);
        for (const map of [delays, approaches, arrivals]) {
          map.delete(runId);
        }
      }
    }

    // Delay: each threshold once per run, fired for the run kept only. Every
    // run's thresholds are followed silently, so a run becoming the kept one
    // (the previous one has reached the station) brings no burst of old news.
    for (const run of runs) {
      if (run === status?.run) {
        continue;
      }
      const handled = delays.get(run.id) ?? new Set();
      const delay = currentDelay(run);
      DELAY_MINUTES.filter((threshold) => delay >= threshold).forEach((t) => handled.add(t));
      delays.set(run.id, handled);
    }
    if (status && status.state !== STATES.ARRIVED) {
      const { run } = status;
      const known = delays.has(run.id);
      const handled = delays.get(run.id) ?? new Set();
      for (const threshold of DELAY_MINUTES) {
        if (status.delay >= threshold && !handled.has(threshold)) {
          handled.add(threshold);
          if (!firstNow && known) {
            events.push({
              key: TRIGGERS.DELAYED,
              data: {
                ...base(run),
                threshold: String(threshold),
                delay_minutes: status.delay,
                next_stop: status.next?.name ?? '',
                next_stop_time: status.next
                  ? clockTime(status.next.time, status.next.tz, language)
                  : '',
              },
            });
          }
        }
      }
      delays.set(run.id, handled);

      // Approaching the user's station: each threshold once per run, when the
      // countdown reaches it. A run first seen inside a threshold does not
      // fire it; one crossed long before this read (Amtraker down) neither.
      const mine = status.mine;
      if (mine && !mine.reached) {
        const done = approaches.get(run.id);
        if (!done) {
          approaches.set(run.id, new Set(APPROACH_MINUTES.filter((m) => mine.minutes <= m)));
        } else {
          const slack = Math.ceil(this.config.refreshSeconds / 60);
          for (const threshold of APPROACH_MINUTES) {
            if (mine.minutes <= threshold && !done.has(threshold)) {
              done.add(threshold);
              if (mine.minutes >= threshold - slack) {
                events.push({
                  key: TRIGGERS.APPROACHING,
                  data: {
                    ...base(run),
                    threshold: String(threshold),
                    station_name: mine.name,
                    minutes: mine.minutes,
                    expected_time: clockTime(mine.eta, mine.tz, language),
                    delay_minutes: mine.delay,
                  },
                });
              }
            }
          }
        }
      }
    }

    // Arrival at the user's station (at the terminus without one), on every
    // run of the number: the run kept moves on to the next one once its train
    // has called there. The origin is where the train leaves from: no arrival.
    for (const run of runs) {
      const index = watch.station ? stopIndex(run, watch.station) : run.stops.length - 1;
      if (index <= 0) {
        continue;
      }
      const there = reached(run, index);
      const before = arrivals.get(run.id);
      arrivals.set(run.id, there);
      if (there && before === false) {
        const stop = run.stops[index];
        events.push({
          key: TRIGGERS.ARRIVED,
          data: {
            ...base(run),
            station_name: stop.name,
            arrival_time: clockTime(etaAt(run, index), stop.tz, language),
            delay_minutes: delayAt(run, index),
          },
        });
      }
    }
    return events;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.fireFailed = false;
    } catch (err) {
      // A 429 or Gladys restarting: said once per streak.
      if (!this.fireFailed) {
        logger.warn(`Cannot fire the ${key} trigger: ${err.message}`);
      }
      this.fireFailed = true;
    }
  }

  // --- Readings for the widget and the scene action ----------------------------

  /**
   * The watch and reading of a device; read again when older than two
   * refresh intervals (a scene action right after the start).
   */
  async readingOf(externalId) {
    const watch = this.watchOfDevice(externalId);
    if (!watch) {
      return null;
    }
    const key = watchKey(watch);
    let reading = this.readings.get(key);
    const interval = this.config.refreshSeconds * 1000;
    if (
      this.isCreated(externalId) &&
      (!reading || this.now() - reading.at > 2 * interval) &&
      // Amtraker down: one attempt per interval, not one per widget view.
      !(this.lastError && this.now() - this.failedAt < interval)
    ) {
      await this.refresh();
      reading = this.readings.get(key);
    }
    return { watch, reading: reading ?? null };
  }

  /** "Train 5 California Zephyr: 38 min late, next stop Galesburg at 16:14." */
  trainSentence(watch, status, language) {
    const t = (key, params) => say(TEXT, language, key, params);
    const train = [rawNumber(watch.number), status?.run.route || watch.route]
      .filter(Boolean)
      .join(' ');
    if (!status) {
      return t('sentenceNoRun', { train });
    }
    const late = status.delay > 0 ? t('lateNote', { delay: status.delay }) : '';
    if (status.state === STATES.ARRIVED) {
      return t('sentenceArrived', {
        train,
        stop: status.terminus.name,
        time: clockTime(status.terminusTime, status.terminus.tz, language),
        late,
      });
    }
    if (status.state === STATES.SCHEDULED) {
      return t('sentenceScheduled', {
        train,
        stop: status.next.name,
        time: clockTime(status.next.time, status.next.tz, language),
        late,
      });
    }
    let sentence = t('sentenceMoving', {
      train,
      delay: status.delay > 0 ? t('minutesLate', { delay: status.delay }) : t('onTime'),
      stop: status.next.name,
      time: clockTime(status.next.time, status.next.tz, language),
    });
    if (status.mine && !status.mine.reached) {
      sentence += ` ${t('sentenceMine', {
        stop: status.mine.name,
        time: clockTime(status.mine.eta, status.mine.tz, language),
      })}`;
    }
    return sentence;
  }

  /** "Chicago Union: 5 California Zephyr to Emeryville at 14:00; …" */
  stationSentence(watch, board, language) {
    const name = watch.stationName || watch.station;
    if (board.length === 0) {
      return say(TEXT, language, 'sentenceNoTrain', { stop: name });
    }
    const entries = board.slice(0, 3).map((entry) =>
      say(TEXT, language, entry.terminus ? 'boardArrival' : 'boardDeparture', {
        train: `${rawNumber(entry.run.number)} ${entry.run.route}`.trim(),
        stop: entry.terminus ? entry.run.stops[0].name : entry.run.stops.at(-1).name,
        time: clockTime(entry.at, entry.stop.tz, language),
        late: entry.delay > 0 ? say(TEXT, language, 'lateNote', { delay: entry.delay }) : '',
      }),
    );
    return say(TEXT, language, 'sentenceStation', { stop: name, entries: entries.join('; ') });
  }

  // --- Configuration actions -------------------------------------------------

  /** Answers an expected failure with a message in every language. */
  fail(key, params) {
    const err = new Error(key);
    err.messages = sayAll(TEXT, key, params);
    return err;
  }

  async call(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.messages) {
        throw err;
      }
      throw this.fail('serviceDown', { error: err.message });
    }
  }

  async addWatch(watch) {
    const key = watchKey(watch);
    if (this.watches.some((known) => watchKey(known) === key)) {
      return perLanguage((lang) => say(TEXT, lang, 'alreadyWatched', { name: watchName(watch) }));
    }
    if (this.watches.length >= MAX_WATCHES) {
      throw this.fail('tooMany', { max: MAX_WATCHES });
    }
    this.watches.push(watch);
    this.removed = this.removed.filter((removed) => removed !== key);
    await this.save();
    await this.publishDiscovered();
    logger.info(`Watch added: ${watchName(watch)}`);
    return null;
  }

  async addTrain({ train, station } = {}) {
    const number = parseTrainNumber(train);
    if (!number) {
      throw this.fail('badNumber', { query: clip(String(train ?? '').trim(), 20) });
    }
    const stationText = String(station ?? '').trim();
    const code = stationText ? parseStationCode(stationText) : '';
    if (stationText && !code) {
      throw this.fail('badStation', { query: clip(stationText, 40) });
    }
    const runs = parseRuns(await this.call(() => this.api.trains(number)));
    let stationName = '';
    if (code) {
      const stop = runs.flatMap((run) => run.stops).find((s) => s.code === code);
      if (runs.length > 0 && !stop) {
        const stops = [...new Set(runs.flatMap((run) => run.stops.map((s) => s.code)))];
        throw this.fail('notCalling', {
          train: rawNumber(number),
          station: code,
          stops: clip(stops.join(', '), 120),
        });
      }
      if (stop) {
        stationName = stop.name;
      } else {
        const meta = await this.call(() => this.api.station(code));
        if (!meta) {
          throw this.fail('unknownStation', { station: code });
        }
        stationName = String(meta.name ?? code);
      }
    }
    const watch = {
      kind: TRAIN_TYPE,
      number,
      station: code,
      stationName,
      route: runs[0]?.route ?? '',
      provider: runs[0]?.provider ?? providerName('', number),
    };
    const known = await this.addWatch(watch);
    if (known) {
      return known;
    }
    return perLanguage((lang) =>
      [
        say(TEXT, lang, 'added', { name: watchName(watch) }),
        ...(runs.length === 0 ? [say(TEXT, lang, 'notRunning')] : []),
      ].join(' '),
    );
  }

  async addStation({ station } = {}) {
    const text = String(station ?? '').trim();
    const code = parseStationCode(text);
    if (!code) {
      throw this.fail('badStation', { query: clip(text, 40) });
    }
    const meta = await this.call(() => this.api.station(code));
    if (!meta) {
      throw this.fail('unknownStation', { station: code });
    }
    const watch = { kind: STATION_TYPE, station: code, stationName: String(meta.name ?? code) };
    const known = await this.addWatch(watch);
    if (known) {
      return known;
    }
    return perLanguage((lang) => say(TEXT, lang, 'added', { name: watchName(watch) }));
  }

  async findStation({ query } = {}) {
    const text = String(query ?? '').trim();
    if (!text) {
      return sayAll(TEXT, 'searchNeedText');
    }
    if (!this.stationsCache || this.now() - this.stationsCache.at > STATIONS_CACHE_MS) {
      const stations = await this.call(() => this.api.stations());
      this.stationsCache = { stations: Object.values(stations), at: this.now() };
    }
    const wanted = fold(text);
    const code = text.toUpperCase();
    const found = this.stationsCache.stations
      .filter(
        (s) =>
          s.code === code ||
          fold(s.name).includes(wanted) ||
          (s.city && fold(`${s.city} ${s.state ?? ''}`).includes(wanted)),
      )
      .sort((a, b) => (a.code === code ? -1 : b.code === code ? 1 : a.name.localeCompare(b.name)))
      .slice(0, SEARCH_RESULTS);
    if (found.length === 0) {
      return sayAll(TEXT, 'searchNone', { query: clip(text, 40) });
    }
    const list = found
      .map((s) => {
        const city = s.city ? ` — ${s.city}${s.state ? `, ${s.state}` : ''}` : '';
        return `• ${s.name} [${s.code}]${city}`;
      })
      .join('\n');
    return perLanguage(
      (lang) =>
        `${say(TEXT, lang, 'searchFound', { count: found.length })}\n${list}\n${say(TEXT, lang, 'searchHint')}`,
    );
  }

  async remove({ name } = {}) {
    const text = fold(name);
    const code = String(name ?? '')
      .trim()
      .toUpperCase();
    const number = parseTrainNumber(name);
    let matches = this.watches.filter(
      (watch) =>
        fold(watchName(watch)) === text ||
        fold(this.displayName(watch)) === text ||
        watchKey(watch) === text,
    );
    if (matches.length === 0) {
      matches = this.watches.filter(
        (watch) =>
          (number && watch.kind === TRAIN_TYPE && watch.number === number) ||
          (watch.kind === STATION_TYPE && watch.station === code),
      );
    }
    if (matches.length === 0) {
      throw this.fail('removeUnknown', { query: clip(String(name ?? '').trim(), 40) });
    }
    if (matches.length > 1) {
      throw this.fail('removeAmbiguous');
    }
    const [watch] = matches;
    const key = watchKey(watch);
    this.watches = this.watches.filter((known) => known !== watch);
    // Added again later, the watch starts afresh: nothing it held is news.
    for (const map of [
      this.readings,
      this.delayDone,
      this.approachDone,
      this.arrivals,
      this.seenRuns ?? new Map(),
    ]) {
      map.delete(key);
    }
    this.checkedNow.delete(key);
    if (!this.removed.includes(key)) {
      this.removed.push(key);
    }
    await this.save();
    await this.publishDiscovered();
    logger.info(`Watch removed: ${watchName(watch)}`);
    return perLanguage((lang) => say(TEXT, lang, 'removed', { name: watchName(watch) }));
  }

  async status() {
    let stale = null;
    if (this.watches.length > 0) {
      stale = await this.api.stale().catch(() => null);
    }
    return perLanguage((lang) => {
      if (this.watches.length === 0) {
        return say(TEXT, lang, 'statusNone');
      }
      const lines = [say(TEXT, lang, 'statusHeader', { count: this.watches.length })];
      for (const watch of this.watches) {
        const created = this.isCreated(this.deviceId(watch));
        const reading = this.readings.get(watchKey(watch));
        const now =
          created && reading?.status !== undefined ? ` — ${stateText(reading.status, lang)}` : '';
        lines.push(
          `• ${watchName(watch)} — ${say(TEXT, lang, created ? 'statusCreated' : 'statusNotCreated')}${now}`,
        );
      }
      lines.push(
        this.refreshedAt
          ? say(TEXT, lang, 'statusRefreshed', {
              age: Math.round((this.now() - this.refreshedAt) / 1000),
            })
          : say(TEXT, lang, 'statusNeverRefreshed'),
      );
      if (this.lastError) {
        lines.push(say(TEXT, lang, 'statusError', { error: this.lastError }));
      }
      if (stale?.stale) {
        lines.push(say(TEXT, lang, 'statusStale'));
      }
      lines.push(say(TEXT, lang, 'attribution'));
      return lines.join('\n');
    });
  }
}
