---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: security
---

# The session cookie names have one home in the identity contract

## What

The two session cookie names are private constants in `packages/server/src/infra/auth/modes/cookie-session.ts`. `tooling/src/floor/http/session-cookie.ts`, `tests/e2e/support/actors.ts` and `tests/support/node/filmstrip-auth-fixture.ts` spell them again by hand. `@orb/contracts/identity` already holds the request transport tuple the names are keyed by.

## Why

A rename at the server leaves the copies compiling and wrong, and a fake server in the testkit should speak production's names by import.

## Done when

The names are exported from `@orb/contracts/identity` keyed by transport, the server builds its cookie table from them with unchanged behaviour, and the tooling pattern, the e2e support file and the testkit fixture import them. No file outside the contract spells either name.

## Evidence

Filled at landing: what ran and where its output is.
