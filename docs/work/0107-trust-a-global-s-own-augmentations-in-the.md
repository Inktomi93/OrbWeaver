---
kind: bug
status: open
updated: 2026-09-23
priority: P2
area: verify
---

# Trust a global's own augmentations in the ambient-identity door

## What

Refuted: `projectCtx`'s ts-morph project has no compiler options but `new Map()` still resolves to `lib.es2015.collection.d.ts` on the real tree AND a bare fixture `Project`, so a missing lib/target was never the bug.

The real defect is the shared ambient-identity door, `reference-fact-global.ts#isAmbientGlobalDeclaration`/`ambientDeclarations`: it required EVERY declaration merged onto a global's symbol to sit under a trusted path (`.../typescript/lib/lib.*` or `.../@types/*`). `platform.d.ts` (repo root) and ts-reset's `map-has.d.ts` — both pulled into every compiler world by `tsconfig.base.json`'s `include` — merge members onto ambient `Map`/`Set`/`WeakMap`/`WeakSet` from OUTSIDE those paths, so on the real tree `Map`'s symbol always mixes trusted and untrusted declarations and the old rule refused it as "shadowed by a non-ambient declaration". `persistence-no-in-memory-state` fell to its module-alias branch, where `uniqueDeclaration`'s 6-declaration "ambiguous" refusal reported UNREADABLE instead of the ordinary ambient-Map finding. A `mode: "types"` fixture never loads those augmentations, so it never hits this branch.

Fixed: `ambientDeclarations` now needs only ONE independently-trusted declaration as an anchor; every declaration still has to be shape-valid (non-module `.d.ts`, or a `declare global {}` member) — a module-alias import never is. The anti-spoofing pins in `reference-fact-origin.suite.test.ts` stay green: an invented global with no trusted anchor is still refused.

A companion bug in the MODULE-identity door: drizzle-orm's `sql` merges a function with a namespace (`sql.raw`), and `resolveExportedDeclaration`'s single-declaration contract refused it `ambiguous`, so `byte-check-cast` never saw a real `sql.raw(...)` call. Fixed with `sameFileMergedExportOrigin` (`reference-fact-same-file-merge.ts`), used only from the member-read path, admitting a same-file merge as one (module, exportedName) origin; `resolveExportedDeclaration` itself is untouched and stays `ambiguous` on a bare identifier, so `reference-fact-module.test.ts`'s pinned rows hold.

## Why

Every canonical-origin/module-identity policy sharing these doors was blind whenever its subject carried a same-file/augmented merge, reporting "identity cannot be established" instead of its real finding — invisible to a fixture proof, which never loads those augmentations.

## Done when

`persistence-no-in-memory-state` and `byte-check-cast` resolve their real subjects on the real tree, augmented or merged or not. Committed pins assert both. Every canonical-origin policy still passes its proofs and liveness pins with no verdict silently reversed. Whether the fixture harness should load the real tree's ambient set is filed separately (0108) rather than attempted here.

## Evidence

Real-tree probe: `new Map()` resolves ambient (6 merged declarations: lib + platform.d.ts + ts-reset); `sql.raw` resolves through drizzle-orm's barrel. `pnpm test:scoped` on 5 reference-fact files + fixture.test.ts: 99/99. `pnpm check:policy-conformance`: 352 policies, 4079 rows, 0 failures. `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json`: PASS. Real-corpus liveness family + manifest: 207/207 (updated persistence-no-in-memory-state pin, new byte-check-cast pin in `_liveness/product-db-server.ts`). `pnpm check:structure` before/after: 36→33 blocking (3 pre-existing unrelated defects fixed: tooling-size, tooling-ops-direct-invocation, test-fixture-imports); no new findings; both target policies held identical waived/violation counts. Wall 493s→374s (load-noisy, not a clean A/B).
