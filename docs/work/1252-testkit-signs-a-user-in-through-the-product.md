---
kind: work
status: open
updated: 2026-10-23
priority: P1
area: tests
---

# Testkit signs a user in through the product in every auth mode

## What

`createServerHarness` takes `authConfig.mode` (`AUTH_MODES` in `@orb/contracts/identity`: single-user, local, oidc) and `fallback`, but offers no door that produces an authenticated HTTP session for a user through the product's own login path per mode. The one OIDC login lives as private helpers inside `tests/server/entry/compose/oidc-native.int.test.ts` (`begin`, `callback`, `cookieJar` against the harness's configured issuer); local mode has `POST /api/auth/login` driven by hand in a few suites; single-user relies on the loopback owner fallback implicitly. Lanes writing OIDC-mode tests report they cannot log in. There is also no fixture axis that runs a case across the modes, nor one that states the multi-user capability per mode (single-user is one operator; local and oidc admit members) and the refused combination (single-user on a non-loopback peer without `AUTH_FALLBACK_TRUSTED_PEERS`, D255).

## Why

Tests run the product; a test that cannot sign in through the real door for its mode either fakes a session or does not get written.

## Done when

One testkit door, `@orb/testkit/node/auth` (or a named export on the composed door), gives `signIn(root, user)` returning the session cookie and the Principal through the real login path for the root's mode: owner fallback on single-user from a loopback peer, `POST /api/auth/login` with the actor's password on local, the full authorization-code flow against the harness issuer on oidc; `forEachAuthMode(fn)` runs a case under all three with the mode's multi-user capability stated (`members: boolean`) so a test can assert or skip by capability instead of by mode name; one case per mode proves the door end to end through `sessions.me`, and one case proves the refused combination (single-user, non-loopback peer, no trusted peers) is refused by the product, not by the harness; the private helpers in `oidc-native` are deleted in favour of the door; README documents the door and the capability table.

## Evidence

Filled at landing: what ran and where its output is.
