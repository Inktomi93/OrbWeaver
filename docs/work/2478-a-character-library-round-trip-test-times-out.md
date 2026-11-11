---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: testing
---

# A character library round-trip test times out on every batch run of its suite

## What

tests/server/domain/character/persistence/handle-copies-and-restores.int.test.ts has a case that spins two composed boxes with an image provider, a document upload and an export-import round trip. It exceeds the default five-second budget whenever the suite runs as a batch — timed out at just over five seconds on both full-directory runs of the slice — and passes in isolation. The sanctioned door for a proven-slow case is the slow tag with its scaled budget (tooling/floor/testing/test-tags.ts); the file carries no tags anywhere. Second instance of the shape, found in the connection unit: tests/server/domain/connection/verbs/sdk-wire.int.test.ts runs the real SDK subprocess, one diagnostics case alone takes about three seconds on an idle box, and the pair of account-diagnostics cases blew the same budget on a batched full-directory run (intermittent: red once in two batched runs, always green in isolation). Third instance, found in the sessions unit: tests/server/domain/sessions/persistence/owner-row-immutable.int.test.ts timed out at its computed per-test budget on a full-directory batch run of the slice while every other test in the slice passed, and passes in well under two seconds on a quiet tree — a cold-start composed root under parallel pressure, same cure. Source: reports/codebase-review/units/dom-character.md, units/dom-connection.md, and units/dom-sessions.md. Item 2477 is the same shape in a tooling compile test; triage may group them, the doors differ.

## Why

The slice suite is red on a cold run, and a deterministic under-load timeout reads as a product defect to the next lane; the tag exists precisely to give proven runtime a real budget instead of a coin flip on machine load.

## Done when

The heavy cases in all three files (the character round-trip case and its composed-box siblings; the sdk-wire subprocess diagnostics cases; the sessions owner-row-immutable case) carry the slow tag, and two consecutive full-directory runs of tests/server/domain/character, tests/server/domain/connection, and tests/server/domain/sessions pass.

## Evidence

Filled at landing: what ran and where its output is.
