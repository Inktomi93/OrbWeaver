---
kind: plan
status: active
updated: 2026-11-14
rank: 14
---

# Stats and spend stay true after a delete, a regenerate, an import and a rebuild

## Goal

Every stats rollup and every spend figure the owner reads matches what the rooms and the provider calls actually cost, after any delete, regenerate, import or rebuild.

## Shape

The spend ledger keeps what was paid when its message, take or room goes away. Rollup rows hold raw deltas and settle to nothing when emptied. A rebuild pages every scan, yields to live chat, and is the one fold an import uses. The owner's stored rollups are rebuilt once after the fixes land.

## Rejected

Recomputing spend from the surviving messages: a deleted message's cost was still paid.

## Coupled sites

The stats domain under packages/server/src/domain/stats/ and the generation ledger.

## Test plan

Each fix carries a composed-root case that goes red without it; scan paging is proven by row bound, not by wall clock.
