---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: docs
---

# The transport tier law still calls the wired aiTurn bucket declared-not-wired

## What

docs/law/Tier-4-Transport.md says the $/GPU aiTurn bucket "remains declared-not-wired" with "no limiter consumes them", and its esoteric item 7 repeats "not yet wired". packages/server/src/entry/rate-limit-gate.ts builds the aiTurn limiter off resolveRateLimits().aiTurn and enforce() consumes it strictly-first for every isAiTurnPath verb (send, swipe, continueTurn, impersonateStream, generate, forceCharacterTurn, generateImage). The wiring landed with the D107 knob-wire program in 465e862837 and 7c314099a7; the law sentence was newest-touched only by the docs move e677e6a67d, so it was already stale when moved and nobody re-read it. The gate header cites the law section as its own authority, so the code believes the law says what the law denies. Same paragraph, second staleness: the wired-buckets enumeration lists publicIp and general but omits the restart limiter the same gate builds. Source: reports/codebase-review/units/server-transport.md.

## Why

Law text lagging a ruled change (the subclass opened by the infra-core unit): a cold author reading Tier-4 would believe the stricter turn bucket is still to be built and could wire a duplicate, and a law whose own enforcement code cites it as authority while contradicting it teaches that law text is decoration.

## Done when

The rate-limit paragraph describes the actual bucket set (publicIp, general, aiTurn with its typed verb map, restart, member budget) and esoteric item 7 states the wired posture; the quoted-not-wired sentences go away.

## Evidence

Filled at landing: what ran and where its output is.
