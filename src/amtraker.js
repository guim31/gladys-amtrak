// -----------------------------------------------------------------------------
// Amtraker v3 client (https://github.com/piemadd/amtrak): an unofficial, free,
// keyless API that re-serves the public "Track Your Train" map of Amtrak, plus
// VIA Rail and Brightline. Data under ODC-By 1.0: the user must be told the
// data comes from Amtraker (amtraker.com), see the widget and the docs.
//
// - /v3/trains/<number>  every run of a train number ("5", "v15", "b5150"),
//                         `[]` when none is running or scheduled soon;
// - /v3/trains           every train (about 110 kB gzipped);
// - /v3/stations/<CODE>  one station, `[]` when unknown (codes are upper case);
// - /v3/stations         every station (about 230 kB, read for the search);
// - /v3/stale            whether Amtraker's own feed is stale.
// -----------------------------------------------------------------------------

export const API_URL = 'https://api.amtraker.com/v3';
const HOST = 'api.amtraker.com';
const TIMEOUT_MS = 20000;
const USER_AGENT = 'gladys-amtrak (+https://github.com/guim31/gladys-amtrak)';

const TRAIN_NUMBER = /^([vb]?)(\d{1,5})$/;
const STATION_CODE = /^[A-Z0-9]{2,6}$/;

/** "5", " V15 ", "b5150" → "5", "v15", "b5150"; null when not a train number. */
export function parseTrainNumber(text) {
  // "VIA 15" is the VIA Rail train v15, "Brightline 5150" is b5150.
  const match = TRAIN_NUMBER.exec(
    String(text ?? '')
      .trim()
      .toLowerCase()
      .replace(/^amtrak\s*/, '')
      .replace(/^via(\s*rail)?\s*#?v?(?=\d)/, 'v')
      .replace(/^brightline\s*#?b?(?=\d)/, 'b')
      .replace(/^#/, ''),
  );
  return match ? `${match[1]}${Number(match[2])}` : null;
}

/** " chi " → "CHI"; null when not a station code. */
export function parseStationCode(text) {
  const code = String(text ?? '')
    .trim()
    .toUpperCase();
  return STATION_CODE.test(code) ? code : null;
}

export class Amtraker {
  /** @param {{ fetch?: typeof fetch }} [options] */
  constructor({ fetch: fetchImpl } = {}) {
    this.fetch = fetchImpl ?? globalThis.fetch;
  }

  async get(path) {
    let response;
    try {
      response = await this.fetch(`${API_URL}${path}`, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`${HOST}: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`, {
        cause: err,
      });
    }
    if (!response.ok) {
      throw new Error(`${HOST}: HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`${HOST}: invalid answer`);
    }
  }

  /** The runs of one train number (raw Amtraker trains), [] when none. */
  async trains(number) {
    const data = await this.get(`/trains/${encodeURIComponent(number)}`);
    return Array.isArray(data?.[number]) ? data[number] : [];
  }

  /** Every train, keyed by train number. */
  async allTrains() {
    const data = await this.get('/trains');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  /** One station's metadata, null when unknown. */
  async station(code) {
    const data = await this.get(`/stations/${encodeURIComponent(code)}`);
    return data?.[code] ?? null;
  }

  /** Every station, keyed by code. */
  async stations() {
    const data = await this.get('/stations');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  /** { stale: boolean, activeTrains: number } */
  async stale() {
    const data = await this.get('/stale');
    return { stale: data?.stale === true, activeTrains: Number(data?.activeTrains) || 0 };
  }
}
