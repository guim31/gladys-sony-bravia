# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the pre-shared key or the PIN of each TV, typed in the Gladys
  configuration (secret fields). They are sent only to the TV they belong to,
  in the `X-Auth-PSK` header or the PIN registration, and never written to the
  logs nor to `/data`. The `auth` cookie a TV gives after a PIN registration is
  kept in memory only.
- **`/data`**: `bravia-state.json` holds the registration id of this Gladys
  (a random identifier, sent to the TVs at PIN registration) and, for each TV,
  what it told about itself: model, serial number, MAC address, inputs and
  applications. No key, no PIN.
- **Network**: plain HTTP (or HTTPS when the address says so, certificate not
  checked: TVs only have self-signed ones) to the addresses typed in the
  configuration, on the local network; the Wake-on-LAN packets are sent by the
  Gladys core on request (`network_wake`). No cloud service, no other
  destination.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the TVs themselves: the Bravia IP control API is a plain HTTP protocol of
Sony, readable by anyone on the local network.
