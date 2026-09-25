---
kind: adr
status: active
updated: 2026-09-25
---

# Network and auth modes: refuse only an off-box owner surface, warn on the rest

## Context

A stranger runs every `AUTH_MODE` on loopback, on a LAN over plain http, and on the internet behind a proxy or tunnel, on bare metal and in a container. A proxy or tunnel on the same host reaches the app from a loopback peer, so under `single-user` every relayed visitor was the owner. A cookie mode on bare metal refused to boot without a hand-made `SESSION_SECRET`, and a `Secure`-only session cookie could not keep a LAN login over plain http.

## Decision

Boot refuses only an exposure that hands an unauthenticated or owner-equivalent surface to a peer off the box. Every other exposure gets one boot warning that names its fix. The rules and their homes:

- Bind by mode: `single-user` binds loopback in every build and refuses a non-loopback bind unless `AUTH_FALLBACK_TRUSTED_PEERS` declares the peer set; the other modes keep their bind (`packages/server/src/foundation/env/bind.ts`, `docs/law/Tier-2-Foundation.md` section 7.1). The container sets `BIND_HOST=0.0.0.0` beside its declared bridge ranges, and the host-network overlay empties them.
- A relayed request is never the operator: a forwarding header refuses the owner fallback and the local first-run claim on every peer (`docs/law/Tier-3-Infra.md`, "A relayed request is never the operator").
- The cookie transport is decided per request: `https` only when a trusted hop sends `X-Forwarded-Proto: https` on every value, else `http`. The mint and the read are keyed by it (`__Host-orb_session` over https, `orb_session_insecure` over http), and the OIDC callback scheme reads the same resolver (`packages/server/src/infra/auth/transport.ts`). There is no launch-time cookie knob.
- The boot secrets are generated when unset: an explicit value wins, else the keyfile under the data root's `secrets/` (`packages/server/src/infra/crypto/key.ts`, `docs/adr/0253-data-dir-layout.md`). `entry/lifecycle.ts` refuses a cookie mode with no secret before the listener binds.
- A cookie minted over plain http for a public client is a warning, never a refusal: one `security:true` line per client address per hour, and `/api/auth/config` reports `transport` and `clientScope` so the login screen shows the notice.
- Boot logs one disclaimer block before the listener binds (`packages/server/src/entry/boot/disclaimer.ts`). It has no acknowledge or silence switch; a warning ends when its cause is fixed.
- The Host allowlist refuses a request for an unknown name in every mode (`docs/law/Tier-3-Infra.md`, "The Host allowlist refuses; it never admits").
- The auth mode stays an env var, and `AUTH_FALLBACK` stays. The admin sharing panel is read-only and shows the `.env` line to change.

The checks: `tests/server/foundation/env/bind.test.ts`, `tests/server/infra/auth/forwarded.test.ts`, `tests/server/infra/auth/transport.test.ts`, `tests/server/infra/crypto/key.test.ts`, `tests/server/entry/boot/disclaimer.test.ts`, `tests/server/entry/session-cookie-parity.suite.test.ts` and `tests/tooling/container-security-config.int.test.ts`.

## Consequences

To let another device sign in, the operator sets `AUTH_MODE=local` (`pnpm start --setup` writes it). A proxy in front of a cookie mode must send `X-Forwarded-Proto`; without it the box mints a non-Secure cookie over https, and the login notice that says plain http is the tell. A proxy that sends no forwarding header at all is invisible to the relay rule, so the disclaimer tells `single-user` never to sit behind a proxy or tunnel. A runtime auth-mode switch needs a second reason and a new decision, because the frozen env is the one boot invariant every rule here keys on.

## Alternatives rejected

- A public-deployment or behind-a-proxy flag as a discriminator: `NODE_ENV` already discriminates, and a second flag can disagree with it.
- Gating the owner fallback on `Host`: a proxy that passes `Host` through looks local. The request-wide, deny-only check is the Host allowlist.
- A launch-time `SESSION_COOKIE_SECURE=always` pin: the proxy contract is the control, and a pin is a second knob for a misconfigured proxy.
- Reading one cookie name on both transports: an insecure-name cookie planted by a plain-http sibling origin would authenticate an https session.
- A knob that trusts every private-network peer without a login: `AUTH_FALLBACK_TRUSTED_PEERS` with a LAN range is that knob, already launch-only and warned.
- Refusing boot on the tunnel case: boot cannot see a tunnel; the request can, so the refusal lives there.
- A runtime auth-mode switch in the admin UI: a cross-tier change to the frozen env for a switch the operator flips once.
- Generating the session secret in `foundation/env`: that tier owns no I/O.
- Moving the container's secret generation into the app only: an existing container would rotate its pepper and lose every local password.
- Refusing a cookie mint over plain http from a public client: the operator owns the network choice; the warning and the login notice name the risk.
