---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
plan: import-robustness
---

# Run the server regex passes in a worker thread

## What

Move each server leg pass out of the event loop: one long-lived `node:worker_threads` worker, one message per pass carrying the text or all rows, the script rows and the macro context as plain data, the same kit executor inside, and a terminate-and-respawn at a wall deadline. The open questions to settle first: which of the call sites are synchronous today (`applyReceiveTransforms` and the world-info and history legs are) and what awaits change; which macro context fields cannot cross as plain data (the macro registry's handlers, the turn PRNG's state, the clock, `{{setvar}}` writes) and how dice rolls and times give the same results as today; the message-copy cost for a long history; whether the per-text vm deadline stays inside the worker to name one bad script; what happens to another request's in-flight pass when the worker is killed (a queue or a small pool); and how the worker file loads, which today is source under `packages/server` on every build, as `packages/server/src/infra/plugin-host/broker-entry.ts` shows.

## Why

In process, a hostile preset still costs up to one pass budget plus one compile per pass of blocked event loop for every user on the server, and a long chat's history pass scales with its rows. A worker turns that cost into one busy core.

## Done when

A turn whose regex passes take seconds leaves the server answering other requests at normal latency, measured with a hostile preset against a second user's request, and every leg's composed-root watchdog case still passes.

## Evidence

Filled at landing: what ran and where its output is.
