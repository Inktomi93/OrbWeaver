---
kind: tooling
status: doing
updated: 2026-10-12
priority: P2
area: tooling
lane: wt/agent-a718808369cb361a5
plan: test-mirror
---

# Drizzle write-chain readers share one floor home and follow hoisted builders

## What

Three readers answer which table a drizzle write chain names: tooling/src/floor/code-facts/drizzle-columns.ts drizzleWriteOf (shared by pnpm ast columns and json-column-read-parsed since item 900), tooling/src/verify/lib/drizzle-write-target.ts (resolves bindings, follows hoisted builders and factories), and tooling/src/verify/lib/open-json-vocabulary.ts lines 219-233. drizzleWriteOf matches builder method names plus a schema table identity, so a write through a hoisted builder (const q = db.update(t); q.set({...})) is not seen as a write, and a non-drizzle store.update(plugins).set(...) is. Merge them into the floor home, decide write-ness by the drizzle builder declaration, follow hoisted builders, and repoint every consumer.

## Why

One home per concept; three spellings of one question disagree on hoisted builders and non-drizzle receivers, which is a gate false negative and a false positive.

## Done when

One write-chain reader in tooling/src/floor/code-facts, every gate and ast verb imports it, a hoisted-builder write and a non-drizzle receiver each have a planted control, and pnpm ast columns output is unchanged or the change is explained.

## Evidence

Filled at landing: what ran and where its output is.
