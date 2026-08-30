---
kind: review
status: archived
updated: 2026-08-30
---

# Stickler review — Codex final merge `3cbb9602a..837e73853`

Fresh-context frontier review of the last Codex merge (memory-retrieval teaching #331/#332, coarse
picker widths #371, Select motion calibration #374/#389; 10 commits, 44 files, +3172/−332).
Follow-ups filed as issue #405.

**Verdict: the landing matches the sanctioned shape.** The Select allowance is narrow, Select-only,
and consumed-once by construction; no product motion changed; the #332 fallback is the owner-ruled
Option A with a real once-per-turn episode; the CTs are plant-backed; catalog receipts hash-verify.
Three confirmed findings, all LOW band, none merge-blocking.

## Confirmed findings

1. **F1 (LOW-MEDIUM)** — the merged-turn rerank-warning emit branch (`engine.ts:1273-1276`, the
   DEFAULT solo-chat shape) has no test that reds if the emit is deleted: every emitting test uses
   `cardScope: "scoped"`. Deleting the early-branch `emitMemoryRerankWarningOnce` keeps every suite
   green while making mixC degrade silent for ordinary chats — the property the #332 ruling forbids.
   Remedy: one engine int test (merged/narrator shape + pre-fired `reportRerankUnavailable()` →
   exactly one warning event).
2. **F2 (LOW)** — `search/verbs/digests.ts:88-91` discards the rerank rejection with no server log;
   both sibling degrade seams (`compaction_failed` engine.ts:1003, `memory_build_failed`
   engine.ts:1599) `getLog().warn` the `err` first. An operator diagnosing a rerank outage has zero
   server-side signal. Remedy: log the cause (or widen `onRerankUnavailable` to carry it).
3. **F3 (LOW)** — the catch is unconditional, so observer-less `digests` callers silently keep
   vector order: the two memory-eval bindings (`memory-recall-eval.suite.int.test.ts:133`,
   `memory-recall-eval.live.int.test.ts:135`) lost their loud-failure property — a live mixC eval
   against a dead reranker reports mixB numbers as mixC with no tell. Remedy: eval bindings pass an
   observer that throws.

## Plausible (code-path evidenced, not browser-verified)

- **P1** — close-by-trigger-click can mint a confirmed "entrance": `select-entrance-evidence.ts`
  `beginIntent` fires on the closing pointerdown; the microtask confirm finds the exit-retaining
  positioner still ARIA-related and confirms — exempting close-motion style/dropped frames ≤300ms on
  repeats, against the guide's own "close motion is not an entrance" sentence (§4.1.1). Leniency-
  direction only. Guard: ignore intent when the trigger's `aria-expanded` is already `"true"`.
- **P2** — `motion-audit.ts` `scriptAttribution` classifies vite dep chunks
  (`/node_modules/.vite/deps/chunk-*.js`) as "unrelated" → a shared-prebundle attribution could veto
  the allowance (stricter-direction false RED; not currently biting).
- **P3** — one receipt evidence line (`memory-tuning-section.ct.tsx:54`) lands on a closing `});`;
  the cited test starts at :55. All nine other citations exact; both doc SHAs verify.

## Verified clean (method receipts)

- **Allowance narrowness/once**: slot sweep — `select-trigger`/`select-positioner` produced only by
  `packages/ui/src/primitives/select/select.tsx:236,255`; no other portal component leaks in. "Once"
  is structural twice over: `primaryFirstLoafIndexes` (one primary per entrance, attribution veto
  removes rather than moves the allowance) + the page-lifetime `WeakSet` that survives evidence
  checkpoints. Repeats get zero blocking allowance. Janky-Select regressions still red (plant-backed
  at unit AND real-browser CT tiers; repeat blocking >50ms, first-open blocking >190ms, out-of-window
  style/dropped frames, unconfirmed intents, non-Select portals all red).
- **No product motion changed**: full reads of select/variants/switch/hint-trigger — zero
  transition/animation edits; the three product edits are sanctioned geometry (#331 popup
  reading-measure cap, bound by a CT that cannot pass vacuously; #371 coarse touch-target floors with
  fine-pointer byte-identity).
- **Memory teaching/fallback**: all five MODE_GUIDANCE entries verified against `recall.ts`; the
  fallback catch is scoped to the mixC `applyRerank` call only, `applyRerank` propagation preserved
  for corpus/segments/discover; the warning is turn-scoped, atomic-once, emitted after `turnStarted`;
  layering clean (search contract carries a neutral callback; compose root bridges; client mapper
  case tsc-exhaustive).
- **CT realness**: coarse suite runs the full 430/390/320 range with an arm-active planted
  matchMedia control + elementFromPoint ownership + pairwise non-overlap; motion CTs count forbidden
  work via wrapped platform APIs after a positive plant fires; the CDP rail CT drives a real trace
  over a real breach. Test inventory strictly grew; every pre-existing pin survives.
- **Receipts**: both doc SHA256s recomputed at `837e73853` and match; the motion-guide rewrite
  describes the shipped code including the consumed-once repair; the design doc labels rejected §4 vs
  superseding §5 correctly ("ruling superseded" idiom).
- **Standing law**: no manual memo, no eslint-disable/ts-ignore/`any`; 3 test-tier biome-ignores with
  genuine reasons; `@orb/ui` seal respected; removed exports have zero dangling importers; motion
  observers install at the one dev site; `motion-audit.ts` has a real CLI guard.
- **Collision sweep**: the merge sits directly on `3cbb9602a` (empty mainline window); zero file or
  semantic overlap with #390/#395/#396.

**Not read**: `select.tsx:1-215` (unchanged plumbing), motion-stats' unchanged CLS half, untouched
bodies of the five pre-existing eval/trace suites. No gate battery or suite executed (read-only
review); behavioral claims rest on code reading, the range's committed receipts, and the owner's
posted post-merge verification (16-stage check PASS, node 147/147, CT 56/56).
