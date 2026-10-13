# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Sony Bravia TVs (Android TV and Google TV, 2015 and later), up to three, over
  the local IP control API: authentication by pre-shared key, or by PIN with
  the _Show a PIN on the TV_ action.
- One device per TV: power (Wake-on-LAN when its network sleeps), volume
  slider, volume up and down, mute, channel number, channel up and down, input
  and app lists read from the TV, and what is on screen as a text.
- Dashboard widgets: _Bravia remote_ (state, screen, volume, power, volume and
  mute buttons), _Bravia keys_ (four remote keys of your choice) and _Bravia
  shortcuts_ (four favorite inputs or apps, one tap each).
- Scene trigger _TV: input, channel or app changed_, turning on included, with
  filters on the TV, the kind of screen, its name and who changed it.
- Scene actions _Open an app on the TV_, _Choose a TV input_ (by name, the TV
  turned on first) and _Send a remote control key_.
- _Test the connection_ action, connection status per TV, documentation in
  English, French, German and Spanish.
