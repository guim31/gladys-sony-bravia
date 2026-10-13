# Sony Bravia TV for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that controls **Sony Bravia TVs** (Android TV and Google TV, 2015 and later)
over the local **IP control** API: power, volume, inputs, apps, channels and
every key of the remote, from the dashboard and from scenes.

> **Developed without the hardware: feedback welcome.** The integration was
> built and tested against the answers documented by Sony and those of the
> pybravia library, with a simulated TV, not against a real Bravia. Please
> report what works and what does not on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-sony-bravia/issues).

## Features

- **Up to three TVs**, authenticated by pre-shared key (recommended) or by PIN
  (the _Show a PIN on the TV_ action makes the TV display it).
- **One device per TV**: power (Wake-on-LAN through the Gladys core when the
  TV network sleeps in standby), volume slider, volume up and down, mute,
  channel number, channel up and down, **input** and **app** lists read from
  the TV (with the names set on the TV), and what is on screen as a text.
- **Dashboard widgets** (the core allows four buttons per widget, hence
  three of them):
  - _Bravia remote_: state, what is on screen, volume; Power, Volume −,
    Volume +, Mute;
  - _Bravia keys_: four remote keys chosen in the widget settings (arrows,
    OK, Back, Home, Input, playback…);
  - _Bravia shortcuts_: four favorite inputs or apps typed by name, one tap
    each, the TV turned on first.
- **Scene trigger** _TV: input, channel or app changed_ (turning on included),
  with filters on the TV, the kind of screen, its exact name and who changed
  it (Gladys or the TV and its remote, a console over HDMI-CEC).
- **Scene actions** _Open an app on the TV_ and _Choose a TV input_ (by name,
  the TV turned on first), _Send a remote control key_ (one to ten presses).
- Everything local: no cloud, no Sony account. Texts in English, French,
  German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- A Bravia TV on the local network, with a fixed IP address, and on the TV:
  **IP control** on (Authentication _Normal and Pre-Shared Key_, a key of your
  choice) and **Remote start** on, so that it can be turned on over the
  network.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-sony-bravia`
   (or install **Sony Bravia TV** from the catalog once it is listed).
2. In **Configuration**, enter the address of the TV and its pre-shared key (or
   follow the PIN steps of the documentation); up to two more TVs below. Save,
   then click **Test the connection**.
3. Open the **Discover** tab and add the devices (a TV shows up once it has
   answered once: turn it on).

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Bravia **REST API**: JSON-RPC over `POST /sony/<service>` (`system`, `audio`,
  `avContent`, `appControl`, `accessControl`), and the **IRCC** SOAP endpoint
  for the remote keys (codes read from `getRemoteControllerInfo`, the codes of
  the Sony documentation as a fallback). Errors come as `{ "error": [code,
text] }` with an HTTP 200: 7 (an app in front), 40005 (screen off), 40800
  (audio output not controllable: the volume buttons then send the remote
  keys)…
- **Pre-shared key** in the `X-Auth-PSK` header; **PIN** pairing through
  `actRegister` and its `auth` cookie, registered again with the same PIN when
  the TV refuses it.
- The TVs are read on a timer of the container (10 s by default, 5 s to 60 s):
  `getPowerStatus` only in standby (no authentication needed), plus volume and
  what is on screen when on; inputs every 30 minutes, apps every 6 hours. The
  devices are published with `should_poll: false`. Only changes are sent to
  Gladys, and everything again when a device is added or Gladys reconnects.
- A TV whose network sleeps in standby does not answer at all: it is shown
  off, its badge _unreachable_, and turning it on sends a Wake-on-LAN packet
  through the core (`network_wake`) to the MAC address the TV gave.
- The identity of a TV is its serial number (its MAC address when it has none),
  never its IP address. `/data/bravia-state.json` keeps the identity, MAC,
  inputs and apps of each TV, so the device and its lists exist at startup even
  when the TV sleeps; no key nor PIN is ever stored there or logged.
- The API never says which app is in front: the app list shows the app Gladys
  opened, until the screen changes, and the scene trigger cannot see one app
  replacing another.

## Checked, and what was not

The tests (`npm test`) run the integration against the SDK's fake Gladys and
an in-memory TV built from the answers of the Sony documentation, pybravia and
Home Assistant (`test/fixtures/bravia/`): conformity of every device with the
Gladys core, the four languages, the PIN pairing, standby, a sleeping network,
Wake-on-LAN, every command, widget and scene action.

The Docker image was also run with the Gladys sandbox constraints (read-only
root, all capabilities dropped, 256 MB, bridge network) against the same fake
TV served over HTTP in another container (`test/helpers/braviaServer.js`).

**Not checked**: a real Bravia TV. The menu names of the TV, the behaviour of
Remote start and Wake-on-LAN, the IRCC codes of each model and the channel list
of a real tuner come from the documentation, not from a test on the hardware.

## Limitations

- Android TV / Google TV Bravia models with IP control; not the older models
  nor the professional displays without it.
- The app in front and the program of an HDMI source are unknown to the API.
- Wake-on-LAN does not cross routers or VLANs, and must be allowed on the TV.
- Channels are those of the TV tuner, matched by their number.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

`node test/helpers/braviaServer.js` serves the fake TV on port 80 (or `PORT`),
pre-shared key `0000-secret` (`BRAVIA_AUTH=pin`: PIN `4821`).

## Credits

- Protocol details from the Sony documentation (BRAVIA Professional Displays
  Knowledge Center, REST API and IRCC-IP) and from
  [pybravia](https://github.com/Drafteed/pybravia) (MIT) and the Home Assistant
  [`braviatv`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/braviatv)
  integration (Apache-2.0), whose test data inspired the fixtures.
- Cover: the Sony and Sony Bravia logos from Wikimedia Commons
  ([Sony_logo.svg](https://commons.wikimedia.org/wiki/File:Sony_logo.svg),
  [Sony_Bravia_logo.svg](https://commons.wikimedia.org/wiki/File:Sony_Bravia_logo.svg)),
  public domain (simple text logos), trademarks of Sony.
- Structure, tests and conventions from the other integrations of guim31, and
  the official [JavaScript template](https://github.com/GladysAssistant/integration-template-js).

## Disclaimer

Not affiliated with, endorsed by or sponsored by Sony. Sony and BRAVIA are
trademarks of Sony Group Corporation.

## License

[Apache-2.0](LICENSE)
