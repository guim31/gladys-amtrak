// -----------------------------------------------------------------------------
// Amtraker trains → what the integration shows: the run of a train number that
// matters, its state, delay, next stop and arrival at the user's station, and
// the next trains calling at a station.
//
// A train number runs several days at once (a California Zephyr takes two
// days and a half: 5-5, 5-6 and 5-7 are on the line together). The run kept is
// the one that will reach the user's station first; without a station, the
// most recent one on the line, else the next one to leave, else the last one
// arrived.
//
// Amtraker gives, per stop, the scheduled times (schArr, schDep), the
// estimated or actual ones (arr, dep) and a status: "Departed", "Station"
// (the train is there), "Enroute" (still to come). A run is "Predeparture"
// before it leaves its origin, "Active" on the line, sometimes "Completed"
// once arrived (its last stop may still say "Enroute" then).
// -----------------------------------------------------------------------------

export const STATES = {
  SCHEDULED: 'scheduled',
  ENROUTE: 'enroute',
  STATION: 'station',
  ARRIVED: 'arrived',
};

const PROVIDERS = { Amtrak: 'Amtrak', Via: 'VIA Rail', Brightline: 'Brightline' };

const time = (text) => {
  const ms = Date.parse(text ?? '');
  return Number.isFinite(ms) ? ms : null;
};

/** Lower case, no accents: for the searches. */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** The provider shown in the names: "Amtrak", "VIA Rail", "Brightline". */
export function providerName(provider, number = '') {
  if (PROVIDERS[provider]) {
    return PROVIDERS[provider];
  }
  if (number.startsWith('v')) {
    return 'VIA Rail';
  }
  return number.startsWith('b') ? 'Brightline' : 'Amtrak';
}

/** "v15" → "15": the number as written on the timetables. */
export const rawNumber = (number) => String(number).replace(/^[vb]/, '');

/** One raw Amtraker train → a run. */
export function parseRun(raw) {
  const stops = (Array.isArray(raw?.stations) ? raw.stations : []).map((stop) => ({
    code: String(stop.code ?? ''),
    name: String(stop.name ?? stop.code ?? ''),
    tz: stop.tz || undefined,
    schArr: time(stop.schArr) ?? time(stop.schDep),
    schDep: time(stop.schDep) ?? time(stop.schArr),
    arr: time(stop.arr) ?? time(stop.dep),
    dep: time(stop.dep) ?? time(stop.arr),
    status: String(stop.status ?? ''),
    platform: String(stop.platform ?? '').trim(),
  }));
  const number = String(raw?.trainNum ?? '');
  return {
    id: String(raw?.trainID ?? ''),
    number,
    route: String(raw?.routeName ?? '').trim(),
    provider: providerName(raw?.provider, number),
    trainState: String(raw?.trainState ?? ''),
    start: stops[0]?.schDep ?? null,
    stops,
    lat: Number.isFinite(raw?.lat) ? raw.lat : null,
    lon: Number.isFinite(raw?.lon) ? raw.lon : null,
    alerts: (Array.isArray(raw?.alerts) ? raw.alerts : [])
      .map((alert) => String(alert?.message ?? '').trim())
      .filter(Boolean),
    updatedAt: time(raw?.lastValTS) ?? time(raw?.updatedAt),
  };
}

export function parseRuns(raws) {
  return (Array.isArray(raws) ? raws : []).map(parseRun).filter((run) => run.stops.length > 0);
}

const last = (list) => list[list.length - 1];

/** The state of a run. */
export function runState(run) {
  if (run.trainState === 'Completed') {
    return STATES.ARRIVED;
  }
  if (run.trainState === 'Predeparture') {
    return STATES.SCHEDULED;
  }
  const terminus = last(run.stops);
  if (run.stops.every((stop) => stop.status === 'Departed') || terminus.status === 'Station') {
    return STATES.ARRIVED;
  }
  return run.stops.some((stop) => stop.status === 'Station') ? STATES.STATION : STATES.ENROUTE;
}

/** Index of a stop code in a run, -1 when the train does not call there. */
export const stopIndex = (run, code) => run.stops.findIndex((stop) => stop.code === code);

/** Whether the train has reached (or left) the stop of index `index`. */
export function reached(run, index) {
  const state = runState(run);
  if (state === STATES.ARRIVED) {
    return true;
  }
  if (state === STATES.SCHEDULED) {
    return false;
  }
  return ['Departed', 'Station'].includes(run.stops[index].status);
}

/** Whether the train has left the stop of index `index` (or ended its run). */
export function left(run, index) {
  const state = runState(run);
  if (state === STATES.ARRIVED) {
    return true;
  }
  return state !== STATES.SCHEDULED && run.stops[index].status === 'Departed';
}

/** Minutes late at a stop (arrival; departure at the origin); never negative. */
export function delayAt(run, index, { departure = false } = {}) {
  const stop = run.stops[index];
  const useDeparture = departure || index === 0;
  const expected = useDeparture ? stop.dep : stop.arr;
  const scheduled = useDeparture ? stop.schDep : stop.schArr;
  if (expected === null || scheduled === null) {
    return 0;
  }
  return Math.max(0, Math.round((expected - scheduled) / 60000));
}

/** Expected (or actual) arrival at a stop; departure at the origin. */
export const etaAt = (run, index) =>
  index === 0 ? run.stops[0].dep : (run.stops[index].arr ?? run.stops[index].dep);

/** Scheduled arrival at a stop; departure at the origin. */
export const scheduledAt = (run, index) =>
  index === 0 ? run.stops[0].schDep : (run.stops[index].schArr ?? run.stops[index].schDep);

/**
 * The index of the next stop: where the train is, else the first still to
 * come; the origin before departure; -1 once arrived.
 */
export function nextStopIndex(run) {
  const state = runState(run);
  if (state === STATES.ARRIVED) {
    return -1;
  }
  if (state === STATES.SCHEDULED) {
    return 0;
  }
  return run.stops.findIndex((stop) => stop.status !== 'Departed');
}

/** The delay of a run now: at its next stop, else at its terminus. */
export function currentDelay(run) {
  const index = nextStopIndex(run);
  if (index === -1) {
    return delayAt(run, run.stops.length - 1);
  }
  // At a station, what matters is when it leaves.
  return delayAt(run, index, { departure: run.stops[index].status === 'Station' });
}

/**
 * The run of a train number that matters to the user.
 * @param {object[]} runs parsed runs of one number
 * @param {string} [station] the user's station code
 * @returns {object | null}
 */
export function pickRun(runs, station) {
  if (runs.length === 0) {
    return null;
  }
  if (station) {
    const calling = runs.filter((run) => stopIndex(run, station) !== -1);
    const eta = (run) => etaAt(run, stopIndex(run, station)) ?? Infinity;
    const ahead = calling
      // A train standing at the station is still the one to show.
      .filter((run) => !left(run, stopIndex(run, station)))
      .sort((a, b) => eta(a) - eta(b));
    if (ahead.length > 0) {
      return ahead[0];
    }
    const lastSeen = (run) => etaAt(run, stopIndex(run, station)) ?? 0;
    const passed = [...calling].sort((a, b) => lastSeen(b) - lastSeen(a));
    if (passed.length > 0) {
      return passed[0];
    }
  }
  const by = (state) => runs.filter((run) => runState(run) === state);
  const moving = [...by(STATES.ENROUTE), ...by(STATES.STATION)].sort((a, b) => b.start - a.start);
  if (moving.length > 0) {
    return moving[0];
  }
  const scheduled = by(STATES.SCHEDULED).sort((a, b) => a.start - b.start);
  if (scheduled.length > 0) {
    return scheduled[0];
  }
  return by(STATES.ARRIVED).sort((a, b) => b.start - a.start)[0] ?? null;
}

/**
 * What a train watch shows.
 * @param {object | null} run from pickRun
 * @param {string} [station] the user's station code
 * @param {number} now
 */
export function trainStatus(run, station, now) {
  if (!run) {
    return null;
  }
  const state = runState(run);
  const nextIndex = nextStopIndex(run);
  const next = nextIndex === -1 ? null : run.stops[nextIndex];
  const status = {
    run,
    state,
    delay: currentDelay(run),
    next: next
      ? {
          ...next,
          // Where the train is, or will be first: its departure when it is there.
          time:
            next.status === 'Station' && state !== STATES.SCHEDULED
              ? next.dep
              : etaAt(run, nextIndex),
        }
      : null,
    terminus: last(run.stops),
    terminusTime: etaAt(run, run.stops.length - 1),
    mine: null,
  };
  const index = station ? stopIndex(run, station) : -1;
  if (index !== -1) {
    const eta = etaAt(run, index);
    const done = reached(run, index);
    status.mine = {
      ...run.stops[index],
      index,
      eta,
      scheduled: scheduledAt(run, index),
      delay: delayAt(run, index),
      reached: done,
      minutes: done || eta === null ? 0 : Math.max(0, Math.ceil((eta - now) / 60000)),
    };
  }
  return status;
}

/**
 * The next trains calling at a station, soonest first: the runs that have not
 * left it yet (a train at its terminus has arrived).
 * @param {object[]} runs every parsed run
 * @param {string} station code
 * @param {number} now
 */
export function stationBoard(runs, station, now) {
  const board = [];
  for (const run of runs) {
    const index = stopIndex(run, station);
    if (index === -1) {
      continue;
    }
    const stop = run.stops[index];
    const isTerminus = index === run.stops.length - 1;
    const state = runState(run);
    if (state === STATES.ARRIVED || stop.status === 'Departed') {
      continue;
    }
    if (isTerminus && stop.status === 'Station' && state !== STATES.SCHEDULED) {
      continue;
    }
    // Departure where the train leaves from, arrival at its terminus.
    const at = isTerminus ? stop.arr : stop.dep;
    const scheduled = isTerminus ? stop.schArr : stop.schDep;
    if (at === null) {
      continue;
    }
    board.push({
      run,
      stop,
      index,
      terminus: isTerminus,
      at,
      scheduled,
      delay: scheduled === null ? 0 : Math.max(0, Math.round((at - scheduled) / 60000)),
      minutes: Math.max(0, Math.ceil((at - now) / 60000)),
      here: stop.status === 'Station' && state !== STATES.SCHEDULED,
    });
  }
  return board.sort((a, b) => a.at - b.at);
}

/** Every run of an /v3/trains answer. */
export function allRuns(data) {
  return Object.values(data ?? {}).flatMap((raws) => parseRuns(raws));
}

/**
 * "14:05" (or "2:05 PM" in English), in the time zone of the station, which
 * is the one of the timetables.
 */
export function clockTime(ms, timeZone, language = 'fr') {
  if (ms === null || ms === undefined) {
    return '';
  }
  const options =
    language === 'en'
      ? { hour: 'numeric', minute: '2-digit', hour12: true }
      : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  try {
    return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'en-GB', {
      ...options,
      timeZone,
    }).format(ms);
  } catch {
    return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'en-GB', options).format(ms);
  }
}
