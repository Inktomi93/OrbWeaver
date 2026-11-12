---
kind: work
status: doing
updated: 2026-11-12
priority: P2
lane: wt/agent-a672cae2c753c5fe3
plan: checked-law
---

# Law sentences in the Spine, Core-0 and Constitution docs that the tree contradicts

## What

Correct each sentence to what the tree does. `docs/law/Spine-TypeScript-and-Patterns.md` says `tsconfig.base.json` pulls `reset.d.ts` in through an `include`, while each program lists the file itself and `packages/plugin-sdk` has no program; the same doc quotes a `lib` list that `tsconfig.base.json` no longer carries. `docs/law/Core-0-Architecture-and-Structure.md` says project references are not used while the root `tsconfig.json` lists them, names `tsconfig.json` as a test environment owner, lists the testkit doors without the `node/auth` door, and carries a package table the census reports as stale. `docs/law/Spine-Config-and-Serialization.md` calls `regexScripts` a flat column on `characters`, while `packages/db/src/schema/character.ts` says the scripts are junction rows (D121). `docs/law/Constitution.md` leaves law docs that exist in `docs/law` out of its index.

## Why

A cold author follows the law text first, and a false sentence sends them to a mechanism that does not exist.

## Done when

Each named sentence matches the tree, the Constitution index names every file in `docs/law`, a test in the pre-push repository list fails when a `docs/law` file is missing from that index, and the docs floor passes.

## Evidence

Filled at landing: what ran and where its output is.
