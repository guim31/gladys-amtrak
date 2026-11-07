// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+).
//
// - train: one watched train or station.
//   A train: its status and delay, next stop, arrival at the user's station,
//   then its next stops (hidden with `show_stops`), green on time, orange
//   from 5 min late, red from 30 min.
//   A station: the next trains calling there, with their time and delay.
//   The heading is the name given in Gladys; the caption, an alert of the
//   train or the data source; a link button to Amtraker. The source must be
//   shown where the data is (ODC-By licence of Amtraker).
//
// Budget of the core: 8 components, 2 texts, one status of 10 rows at most.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { STATION_TYPE, clip, stopText, stateText } from './devices.js';
import { TEXT, say } from './messages.js';
import { STATES, clockTime, delayAt, etaAt, nextStopIndex, rawNumber } from './trains.js';

export const MAX_ROWS = 10;
export const MAX_STOPS = 6;
const MAX_LABEL = 40;
const AMTRAKER_URL = 'https://amtraker.com';

const t = (language, key, params) => say(TEXT, language, key, params);

export function delayColor(delay) {
  if (delay >= 30) {
    return WIDGET_COLORS.DANGER;
  }
  return delay >= 5 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
}

/** "14:05 (+12)" */
const timeWithDelay = (at, tz, delay, language) =>
  `${clockTime(at, tz, language)}${delay > 0 ? ` (+${delay})` : ''}`;

function trainRows(status, showStops, language) {
  if (!status) {
    return [
      {
        label: t(language, 'rowState'),
        value: stateText(null, language),
        color: WIDGET_COLORS.NEUTRAL,
      },
    ];
  }
  const { run, state } = status;
  const late = status.delay > 0 ? ` · +${status.delay} min` : '';
  const rows = [
    {
      label: t(language, 'rowState'),
      value: clip(`${stateText(status, language)}${state === STATES.ARRIVED ? '' : late}`, 40),
      color:
        state === STATES.SCHEDULED
          ? WIDGET_COLORS.NEUTRAL
          : state === STATES.ARRIVED
            ? WIDGET_COLORS.INFO
            : delayColor(status.delay),
    },
  ];
  if (status.mine) {
    const { mine } = status;
    rows.push({
      label: clip(mine.name, MAX_LABEL),
      value: clip(
        mine.reached
          ? t(language, 'arrivedShort', { time: clockTime(mine.eta, mine.tz, language) })
          : `${timeWithDelay(mine.eta, mine.tz, mine.delay, language)} · ${t(language, 'minutes', { minutes: mine.minutes })}`,
        40,
      ),
      icon: 'home',
      color: mine.reached ? WIDGET_COLORS.INFO : delayColor(mine.delay),
    });
  }
  if (status.next && !showStops) {
    rows.push({
      label: t(language, 'rowNext'),
      value: clip(stopText(status.next, status.next.time, language), 40),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (showStops) {
    const next = nextStopIndex(run);
    const from = next === -1 ? run.stops.length - 1 : next;
    for (let index = from; index < run.stops.length && rows.length < MAX_ROWS; index += 1) {
      const stop = run.stops[index];
      if (index - from >= MAX_STOPS && index !== run.stops.length - 1) {
        continue;
      }
      const delay = delayAt(run, index);
      rows.push({
        label: clip(stop.name, MAX_LABEL),
        value: timeWithDelay(etaAt(run, index), stop.tz, delay, language),
        icon: index === run.stops.length - 1 ? 'flag' : 'map-pin',
        color: stop.code === status.mine?.code ? WIDGET_COLORS.PRIMARY : delayColor(delay),
      });
    }
  }
  return rows;
}

function stationRows(board, language) {
  return board.slice(0, MAX_ROWS).map((entry) => {
    const { run } = entry;
    const other = entry.terminus ? run.stops[0].name : run.stops[run.stops.length - 1].name;
    const when = entry.here
      ? t(language, 'here')
      : `${timeWithDelay(entry.at, entry.stop.tz, entry.delay, language)} · ${t(language, 'minutes', { minutes: entry.minutes })}`;
    return {
      label: clip(`${rawNumber(run.number)} ${entry.terminus ? '←' : '→'} ${other}`, MAX_LABEL),
      value: clip(when, 40),
      icon: entry.terminus ? 'log-in' : 'log-out',
      color: delayColor(entry.delay),
    };
  });
}

async function trainContent(service, { settings, language }) {
  const ttl = Math.max(60, service.config.refreshSeconds);
  if (!settings?.train) {
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, 'pickTrain') }] };
  }
  const found = await service.readingOf(settings.train);
  if (!found) {
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, 'gone') }] };
  }
  const { watch, reading } = found;
  const alert = watch.kind === STATION_TYPE ? null : reading?.status?.run.alerts[0];
  const components = [
    { type: 'text', variant: 'heading', text: clip(service.displayName(watch), 40) },
    {
      type: 'text',
      variant: 'caption',
      text: service.lastError
        ? t(language, 'unavailable')
        : alert
          ? clip(`⚠ ${alert}`, 80)
          : t(language, 'caption'),
    },
  ];
  if (!reading) {
    components[1] = {
      type: 'text',
      variant: 'caption',
      text: t(language, service.lastError ? 'unavailable' : 'loading'),
    };
  } else if (watch.kind === STATION_TYPE) {
    if (reading.board.length === 0) {
      components[1] = { type: 'text', variant: 'caption', text: t(language, 'noTrain') };
    } else {
      components.push({ type: 'status', items: stationRows(reading.board, language) });
    }
  } else {
    components.push({
      type: 'status',
      items: trainRows(
        reading.status,
        settings.show_stops !== false && settings.show_stops !== 'false',
        language,
      ),
    });
  }
  components.push({
    type: 'button',
    label: t(language, 'dataButton'),
    icon: 'external-link',
    style: 'secondary',
    link: { url: AMTRAKER_URL },
  });
  return { ttl_seconds: ttl, components };
}

export const WIDGETS = {
  train: { get: trainContent },
};
