---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: tests
---

# Verb-backed harness actor

## What

`harness.actor(...)` in `tests/support/node/server.ts` is the root-bound twin of `seedUser` and still inserts the user row; `seedUser` itself now lives on the rows door for persistence suites only. Composed tests reach a user only through `actor`, so it is the last row-level user write a composed test reaches. The fixed fixture identities (`OWNER_USER_ID`, `ADMIN_USER_ID`) exist because the harness owner precedes every Principal.

## Why

The seed-through-verbs rule (`orb/no-direct-row-writes`) is enforced for test files but the harness is in the exempt tier; a user minted by a verb is what the product does.

## Done when

`actor` mints through `sessions.ensureUser` plus `admin.setRole`, `setEnabled`, `resetPassword` and `linkSsoIdentity`, never a row insert; the fixtures read ids back from the root instead of fixed constants, or the ruling records why a fixed owner id must stay; `seedUser` has only persistence-tier callers; the composed suites are green. Do it after the 1243 seams branch and the cake leg 1 branch both land, since all three rewrite `server.ts` and `fixtures.ts`.

## Evidence

Filled at landing: what ran and where its output is.
