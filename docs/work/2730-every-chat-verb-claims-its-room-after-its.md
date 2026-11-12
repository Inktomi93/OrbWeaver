---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# Every chat verb claims its room after its last refusal

## What

`commitUserTurn` in `packages/server/src/domain/chat/verbs/turn.ts` claims after its last refusal. Other verbs still claim first: `generate` claims before its speaker check; the host config, roster, invite, lifecycle and rpg verbs claim before their own input and ownership refusals, such as a background on a foreign asset or a foreign character added to the room; the edit wrapper in `packages/server/src/domain/chat/verbs/edit.ts` claims before each verb's stricter check, with a comment that calls it deliberate and no decision behind it. D166 rules a room unclaimed until the first user message, generated turn or explicit host write, and a refused request is none of those. Each move widens the reap window, so it lands after the server reap refuses a room with a send in flight, or takes a hold.

## Why

A refused request that claims the room leaves a claimed room nothing was written to. Reach is the host's own devices.

## Done when

Each verb claims after its last refusal with a refusal test per family, D166 says a refused request never claims, and the older claim cites in `turn.ts` cite D166.

## Evidence

Filled at landing: what ran and where its output is.
