# Amtrak for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for **Amtrak trains in real
time**, and VIA Rail (Canada) and Brightline (Florida) trains too: delay, status, next stop,
expected arrival at your station, and the next trains of a station.

**Data from [Amtraker](https://amtraker.com)** (ODC-By 1.0), a free community API that re-serves
Amtrak's public "Track Your Train" map. No account, no key. **Unofficial: not affiliated with
Amtrak, VIA Rail, Brightline or Amtraker.**

## What it does

- **A device per watched train** (its number, and optionally your station): delay, status, next
  stop with its time and, with a station, the expected arrival there and a countdown. A train
  number runs several days at once (night trains): the device follows the run that reaches your
  station first, else the latest one on the line.
- **A device per watched station**: the next train calling there, in how many minutes, its delay.
- **A dashboard widget**: a train with its next stops, or the board of a station.
- **Scene triggers**: train delayed (5 to 120 minutes), train approaching my station (5 to 60
  minutes away), train arrived.
- **A scene action**: read a train, with a sentence ready to send.
- Texts in English, French, German and Spanish.

The user documentation is in [`docs/en.md`](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md),
[es](docs/es.md)).

## Requirements

- Gladys Assistant 5.3.0 or later, with internet access.
- A train number (`5`, `v15` for VIA Rail, `b5150` for Brightline) or a station code (`CHI`).

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste `https://github.com/guim31/gladys-amtrak` and install.
3. In the integration's **Configuration** tab, use **Watch a train** (or **Find a station** then
   **Watch a station**), and create the device in the **Discover** tab.

## How it works

Every 1 or 2 minutes (2 by default), and only for the devices created in Gladys, the integration
reads `https://api.amtraker.com/v3/trains/<number>` for each watched train number, or
`/v3/trains` once (about 110 kB gzipped) as soon as a station is watched. It never calls Amtrak's
own endpoints. When Amtraker does not answer, the integration status says so and nothing is
published. Only `/data/watch.json` is written: the watched trains and stations.

## Limits

- **Developed without riding these trains: feedback welcome.** Built
  and tested against the real Amtraker API (a night train over three days, a short train, VIA
  Rail, a station board).
- Cancellations are not published by Amtraker: a cancelled train disappears ("Not running").
- Unofficial data: it may lag behind Amtrak's map, or be missing for a while.
- Up to 10 watches; feature names are set when the device is created.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and real Amtraker answers recorded on 2026-11-07 in
`test/fixtures/amtraker`; they never touch the network. See [`CLAUDE.md`](CLAUDE.md) for the
project rules.

## Credits

- Data: [Amtraker](https://amtraker.com) by piemadd
  ([piemadd/amtrak](https://github.com/piemadd/amtrak), API docs at
  [api.amtraker.com/docs](https://api.amtraker.com/docs)), under the
  [Open Data Commons Attribution License (ODC-By) 1.0](https://opendatacommons.org/licenses/by/1-0/),
  from Amtrak's "Track Your Train" map, VIA Rail and Brightline.
- Cover: a train pictogram drawn for this integration (no Amtrak logo: the integration is
  unofficial).

Amtrak, VIA Rail and Brightline are trademarks of their owners. This integration is not affiliated
with them, nor with Amtraker.

## License

Apache-2.0
