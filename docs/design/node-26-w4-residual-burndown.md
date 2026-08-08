---
kind: design
status: proposed
updated: 2026-08-07
---

# Node-26 program — W4 residual burn-down (W4.5 withResolvers + W4.2 toSorted)

> Brief for a dedicated burn-down lane. Two W4 sub-waves of `docs/design/node-26-adoption-program.md`
> NEVER LANDED (discovered 2026-08-07 while authoring the §8 `platform-spellings` gate — the gate found
> the live sites the original sweeps missed). Each is blocked from the §8 gate: the gate cannot enforce an
> arm green while its production violations are live, so the arms `DEFERRED→withResolvers` and `SPREAD-SORT`
> are documented pending-not-dropped in `platform-spellings.ts` and are ADDED to that gate once this lane
> lands. Re-sweep every pattern before executing — these site lists are 2026-08-07 snapshots.

## W4.5 — deferred-promise captures → `Promise.withResolvers()` (§4.5)

7 live production `new Promise` resolver-captures. §4.5's original text named only two ("model-cache.ts,
engine.ts") and even those were never converted. Each ASSIGNS its executor's resolve/reject param out to an
outer binding — the exact `withResolvers` shape. NONE are the QuickJS bridge (`ctx.newPromise()`), which
§4.5 correctly excludes. All are async control-flow barriers, so each conversion needs its domain's
behavioral tests re-run (chat engine, turn streaming, transport, provider belt) — this is why it is a wave,
not gate-lane churn.

| Site | Shape | Convert to |
| - | - | - |
| `packages/client/src/lib/agent-bridge.ts:22` | `let markReady; const ready = new Promise((resolve) => { markReady = resolve; })` | `const { promise: ready, resolve: markReady } = Promise.withResolvers<void>()` |
| `packages/server/src/domain/chat/engine/engine.ts:1484` | `let rejectLockLost!; const lockLostBarrier = new Promise<never>((_resolve, reject) => { rejectLockLost = reject; })` | `const { promise: lockLostBarrier, reject: rejectLockLost } = Promise.withResolvers<never>()` |
| `packages/server/src/domain/chat/verbs/turn.ts:1858` and `:1865` | single-slot ARRIVAL promise, re-armed in a loop (`arrival = new Promise((resolve) => { wake = resolve; })` twice) | two `withResolvers` sites; keep the `wake` re-arm semantics — verify disposal/re-arm order |
| `packages/server/src/transport/trpc/stream/frame-queue.ts:188` | `nextTick()` returns `new Promise((resolve) => { wake = resolve; })` | `const { promise, resolve } = Promise.withResolvers<void>(); wake = resolve; return promise;` |
| `packages/server/src/infra/providers/backends/local-light/model-cache.ts:148` | `let rejectOrphan; const orphanGuard = new Promise<never>((_, reject) => { rejectOrphan = reject; })` | `const { promise: orphanGuard, reject: rejectOrphan } = Promise.withResolvers<never>()` |
| `packages/server/src/entry/compose/chat.ts:558` | inline `await new Promise((resolve) => { notify = resolve; })` in a drain loop (carries two biome-ignores) | `withResolvers` — the biome-ignores may drop with the loop-fn |

Detection is proven sound: `platform-spellings`'s (deferred) DEFERRED arm found exactly these 7, zero false
positives. When this lands, re-enable that arm in `platform-spellings.ts` (the helper `isDeferredCapture`
was written and removed; the header records its shape) and add its `mustFlag`/`mustPass` + `__g_` fixture.

## W4.2 — `[...x].sort(fn)` → `x.toSorted(fn)` (§4.2), the TYPE-AWARE split

~40 live production sites in `packages/*/src` (plus ~60 in `tests/**`, out of the gate's `packages/**`
scope). This is NOT a blind swap — §8 itself records "the gate cannot type." The rubric (§4.2):

- **CONVERT** when the spread exists only to avoid mutating an ARRAY: `[...arr].sort(cmp)` → `arr.toSorted(cmp)`.
- **KEEP** when the spread MATERIALIZES an iterator/Set/Map into a fresh array: `[...m.entries()].sort()`,
  `[...set].sort()`, `[...map.values()].sort()` — the spread is mandatory and in-place `.sort` on the fresh
  array is correct. `toSorted` there is a wasted second copy.

The AST alone cannot tell an array identifier from a Set/Map identifier — this needs the type checker
(`node.getType()` on the spread source; convert iff it is an `Array`/`ReadonlyArray`). Several CONVERT sites
are in FENCED domains (rpg/chat features), so this lane needs the fences the §8-gate lane could not cross.

**CONVERT candidates (array defensive-copy) — 2026-08-07 snapshot, re-verify each source's TYPE:**
`packages/client/src/lib/tag-sort.ts:45` (`[...tags]`), `contracts/src/rpg/tracker.ts:184` (`[...defs]`),
`contracts/src/rpg/extraction.ts:477` (`[...offending]`), `server/src/domain/import/loader/collect.ts:55`
(`[...capped]`), `client/src/features/preset/components/prompt-assembly/preview-model.ts:156` (`[...splices]`),
`server/src/domain/chat/substrate/runtime-variables.ts:28` (`[...entries]`),
`server/src/infra/providers/backends/openrouter/runners/{embed,image}/runner.ts` (`[...response.data]`),
`server/src/infra/providers/resolve-chat.ts:74` (`[...pool]`),
`server/src/domain/chat/engine/smart-arbitrate.ts:160` (`[...eligible]`),
`server/src/domain/chat/engine/select-speakers.ts:150` (`[...characters]`),
`server/src/domain/stats/substrate/percentiles.ts:20` (`[...arr]`),
`server/src/domain/chat/memory/build/digests.ts:284` (`[...env.groups]`, `:289` `[...group]` — verify Map vs array),
`server/src/domain/search/verbs/{corpus,documents}.ts` (`[...candidates]`),
`server/src/domain/chat/assembly/context.ts:91` (`[...candidates]`),
`client/src/features/character/components/character-history-tab.tsx:37` (`[...(snapshotsQuery.data ?? [])]`),
`client/src/features/discovery/components/corpus-similarity-tab.tsx:162` (`[...edges]`),
`client/src/features/world-info/hooks/use-world-info-mutations.ts:104` (`[...old]`),
`packages/ui/src/primitives/table/table.tsx:145` (`[...entries]`),
`client/src/features/rpg/components/rpg-journal-tab.tsx:187` (`[...cards]`), `:205` (`[...marks]`) — FENCED (rpg feature).

**KEEP (iterator/Set materialization) — do NOT convert:** every `[...m.entries()].sort()` /
`[...counts.entries()].sort()` / `[...byTag.values()].sort()` / `[...new Set(...)].sort()` /
`[...acc.entries()].sort()` / `[...degree.entries()].sort()` / `[...repByHash.values()].sort()` site
(discovery themes/archetypes/similarity-graph/image-analytics, kit/openai-compat/stream, speaker-label).

When this lands, add the SPREAD-SORT arm to `platform-spellings.ts` — type-aware (checker-backed) so it
flags only the CONVERT class — with its `mustFlag`/`mustPass` (an array-copy flagged, an iterator
materialization passing) + `__g_` fixture.
