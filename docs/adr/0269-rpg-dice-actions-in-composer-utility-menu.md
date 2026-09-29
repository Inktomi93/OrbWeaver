---
kind: adr
status: active
updated: 2026-09-29
---

# RPG dice actions live in the composer utility menu

## Context

The persistent Dice rolls band competes with the message field and other chat controls.

## Decision

In game rooms, the existing composer utility menu exposes the dice actions derived from `RPG_RULESET_DICE[ruleset]`. Freeform exposes no dice actions. The actions retain keyboard and touch access, names, and request behavior. Other chat controls may remain in the above-composer band. This decision supersedes only the above-composer dice placement in D149 clause (c) and extends the utility menu map in D111; their other rulings remain active. The client chat composer and RPG dice source own the implementation.

## Consequences

The composer has one contextual home for dice actions, and no persistent Dice rolls door. Starting and stopping a game still announces the transition and reveals status as D149 requires.

## Alternatives rejected

Keep a collapsed Dice rolls disclosure above the composer: it still occupies the persistent strip.
