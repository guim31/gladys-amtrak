# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Amtrak trains in real time, and VIA Rail and Brightline trains, from the
  unofficial Amtraker API (no account, no key).
- A device per watched train: delay, status, next stop with its time and,
  with your station, the expected arrival there and a countdown. For a train
  running several days at once, the run that reaches your station first.
- A device per watched station: the next train, in how many minutes, and its
  delay.
- Configuration actions: watch a train, watch a station, find a station by
  name, city or code, stop watching, show what is watched.
- A dashboard widget: a train with its next stops, or the board of a station.
- Scene triggers: train delayed, train approaching my station, train arrived.
- A scene action reading a train, with a sentence ready to send.
- Texts and documentation in English, French, German and Spanish.
