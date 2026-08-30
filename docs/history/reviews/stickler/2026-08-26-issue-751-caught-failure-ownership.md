---
kind: review
status: archived
updated: 2026-08-30
---

# Issue #751 — bounded independent technical review

Date: 2026-08-26  
Reviewed WIP range: `dbec59a1a8f340749e29697e3b846a54286b4488..2c3d460e881dd47926f61074ad762df77fb14467`  
Review role: independent, read/run only; no production edits  
Verdict: **REFUTED / NOT READY. Keep #751 Running.**

## Executive verdict

The detector has real bite and its descriptor controls cover the evasions found during review, including dot, optional, literal/bracket, concatenated-bracket, direct call/apply, bound rejection handlers, `Promise.prototype.catch.call`, hoisted writes, logical assignments, `for..of`/`for..in` writes, reassigned owner aliases, outcome-object laundering, duplicate same-line positions, and exact `@swallowed-ok` coupling. The runtime repairs also have meaningful planted tests.

The claimed gate cannot land, however. Its own cold real-tree conformance is red, the durable classification covers 109 rows rather than the owner-ruled 377-row semantic population, 141 current findings remain unowned, current marker identity is not bijective with the artifact, the law still says “high-confidence”/“census-only,” the doc catalog is stale, the gate files fail Biome/ESLint/tooling types, and the reconstructed WIP drops the current-main reserved gate-fixture exclusion and its proof.

The original six runtime/tooling commits were not merge-ready: their focused behavior passed, while scoped Biome found 46 errors and the server commit introduced an unhandled tri-state wake-probe seam. That separable stack was rebuilt and repaired at `320e4d7a9e95431eccf406534b159901cda64fe2..62461134d10f0d68ee5a221914ceabe34f4d3079`. The bounded re-review **approves that runtime-only range for integration**. It contains no #751 marker census or gate activation.

## Confirmed blockers in the WIP gate stack

### P1 — the shipped artifact proves 109 historical/refinement rows, not the owner-ruled 377-row population

Receipts:

- `docs/reviews/caught-failure-ownership-2026-08-26.json:149-159` claims zero post-refinement findings and class totals of 5 confirmed / 76 deliberate / 12 proven.
- The artifact pins 93 original rows and 16 refinement rows at `:1464-1473`.
- The live stable tree contains 311 exact `@orb-gate-ignore caught-failure-ownership(...)` markers plus 3 exact `@swallowed-ok(...)` markers in governed source, while the artifact claims only 88 + 3.
- A cold direct detector run over the stable SHA scanned 3,630 files and returned **141 unresolved findings: 72 default, 57 empty, 12 promise**.
- `tests/tooling/verify/gates/caught-failure-ownership.test.ts:73-78` says “every high-confidence row” and asserts zero findings, but is red on those 141 sites.
- The conformance key at `tests/tooling/verify/gates/caught-failure-ownership.test.ts:24-38,91-97` reduces a marker to `(path,line,grammar)`. It drops position and reason and stores keys in a `Set`, so duplicate same-line markers can collapse. It also runs only `caughtFailureGate`, not the shared inventory gate that owns malformed/stale/wrong-gate behavior.
- The detector header still says defaults are census-only at `tooling/src/verify/gates/caught-failure-ownership.ts:1-5`, while its descriptor now enforces default returns. The active law repeats the stale “two high-confidence shapes” and “defaults ... not merge failures” contract at `docs/architecture/core/Core-Enforcement-Active-Gates.md:172`.

Cold conformance receipt:

```text
pnpm exec vitest run tests/tooling/verify/gates/caught-failure-ownership.test.ts
1 file failed; 2 passed / 2 failed; type errors: none
```

Minimal repair:

1. Rebuild the durable artifact from the exact frozen 377-row source population and pin its population count/digest outside fields the same JSON can self-assert.
2. Preserve a current line/snippet for every surviving row; use null only for an actually removed/fixed site.
3. Make marker identity `(path,line,grammar,position,reason)`, reject duplicate identities, and compare the complete classified marker multiset to source—not two lossy `Set`s.
4. Recompute and assert classification enum/count totals and exact detector/population/artifact bijection.
5. Run the real-tree conformance through the loaded gate set needed for shared marker inventory, not the caught gate alone.
6. Update the gate header and active-gates row to the owner-ruled full semantic scope.
7. Keep the issue Running until every unproven row is classified/fixed/ratified and the conformance is cold-green.

### P1 — reconstruction regresses current-main reserved fixture handling

`tooling/src/verify/lib/loader.ts:76-89` in the stable WIP loads every non-declaration `.ts` under the gate directory and records descriptorless files as unregistered. But `tests/tooling/check-gates.int.test.ts:463-465,1059` intentionally writes descriptorless `tooling/src/verify/gates/__g_*.ts` fixtures. The test itself still excludes those names from `GATE_FILES` at `:67-74`; the loader no longer does. The WIP deleted current main’s `PROBE_GATE_FILE_RE` exclusion and deleted the focused proof that reserved proof files stay project inputs but never enter descriptor reconciliation. This is an unrelated cross-lane regression, not #751 machinery.

Minimal repair: restore the current-main reserved `__(g|dc)_` loader exclusion and its test verbatim, then rebase the caught gate without overwriting it.

### P1 — static and catalog gates are red

Stable-SHA receipts:

```text
pnpm exec biome check tooling/src/verify/gates/caught-failure-ownership.ts --max-diagnostics=200
65 errors, 1 warning

pnpm exec biome check tooling/src/verify/gates/detached-work-traced.ts --max-diagnostics=200
13 errors

pnpm exec eslint tooling/src/verify/gates/caught-failure-ownership.ts tooling/src/verify/gates/detached-work-traced.ts tooling/src/verify/lib/loader.ts tests/tooling/verify/gates/caught-failure-ownership.test.ts tests/tooling/check-gates.int.test.ts --max-warnings 0 --no-cache
2 errors in caught-failure-ownership.ts (strict boolean expressions at 348 and 798)

node scripts/ts7.cjs --checkers 8 --noEmit --pretty false -p tooling/tsconfig.json
7 WIP-gate TypeScript errors, plus the runtime wake-gate coupling error described below

pnpm check:docs
green, 104 documents

pnpm check:doc-catalog
red, 2 violations: Active-Gates verifiedSha256 mismatch; docs/catalog/catalog.json stale
```

Minimal repair: format/refactor the two gate modules to the active Biome policy, resolve every ESLint/type error without suppressing semantics, restore the catalog receipt, and rerun these focused commands at one stable SHA.

## Runtime defect drafts that remain outside the stable SHA

These are board-ready because they are confirmed runtime defects, deliberately not folded into the frozen #751 WIP.

### P1 — Fail asset GC closed when `appearance.backgroundLibrary` is malformed

Problem: `packages/server/src/domain/assets/persistence/asset-refs.ts:65-72` correctly states that under-inclusion is silent-reap data loss, but `libraryAssetIds` at `:93-116` turns invalid JSON, a non-array, or malformed entries into an empty/partial live set. `selectSettingsReferencedAssetIds` at `:73-90` feeds that set to destructive GC.

Red receipt against the old/current behavior: a valid outer settings config with a corrupt library and an old asset referenced only by that library completed GC with `scanned: 1, reclaimed: 1`; both the row and blob were actually removed.

Acceptance:

- Any present invalid JSON, non-array library, or malformed entry aborts the sweep before deletion.
- Missing/null library remains valid empty input.
- Integration test plants corrupt config plus an old library-only asset and asserts rejection plus row/blob preservation.

### P1 — Reject malformed OpenAI-compatible SSE `data:` instead of returning partial success

Problem: `packages/server/src/infra/providers/backends/kit/openai-compat/stream.ts:210-223` maps malformed JSON after a `data:` prefix to `skip`. The existing test at `tests/server/infra/providers/backends/kit/openai-compat/stream.test.ts:242-251` explicitly ratifies bad-JSON skipping. A malformed data frame can carry content, error, finish, or usage; skipping it lets the reducer return a successful but partial model result.

Red receipt: valid content followed by malformed `data:` was skipped and the stream reduced to partial success.

Acceptance:

- Comments, blank lines, and non-data SSE fields remain skippable.
- Malformed JSON after `data:` throws a contextual protocol error.
- Plant valid chunk + malformed data + terminal and assert parser/reducer rejection; the pre-fix source must return partial success.

### P1 — Narrow preset fallbacks to `PresetNotFoundError`

Problem: four generation/config seams catch every failure and silently substitute defaults:

- `packages/server/src/entry/compose/chat.ts:698-735`
- `packages/server/src/entry/compose/side-gen-params.ts:36-48`
- `packages/server/src/entry/compose/assets-character.ts:291-308`

The repository already has the correct precedent at `packages/server/src/entry/compose/services.ts:762-776`: only `PresetNotFoundError` means missing/unowned and may fall back; other errors rethrow. A DB/I/O fault can currently generate a main turn, GM voice, side-generation, or greeting with the wrong prompt/prose/sampling configuration.

Acceptance:

- Catch only `PresetNotFoundError` at all four families.
- Stale/unowned/missing ids preserve the documented fallback.
- Injected generic/DB failures reject at each public operation/resolver.

### P1 — Narrow persona seed fallbacks to `PersonaNotFoundError`

Problem: `packages/server/src/entry/compose/chat.ts:1084-1114` and `packages/server/src/entry/compose/services.ts:990-1005` catch every `PersonaService.get` failure and return null. Generic persistence/infra faults can therefore let chat start, invite, or demo seeding persist with no/wrong founding identity rather than fail.

Acceptance:

- Only `PersonaNotFoundError` maps to null.
- Generic/DB failures reject.
- Tests cover stale-id fallback and planted generic failure at the start-chat, invite, and demo-seed public seams.

## Runtime/tool fix assessment

Behavioral checks on the frozen WIP SHA:

```text
5 client/server unit files: 48 passed, 0 failed, type errors none
14 tooling unit/integration files: 69 passed, 0 failed, type errors none
session-recovery CT: 6 passed, 0 failed/flaky/skipped
caught descriptor focused: 1 passed, 3 skipped, type errors none
```

The CT printed one `sessions.me` UNFED warning; inspection confirmed it belongs to the explicitly unfed in-flight identity test, while the bind-failure Retry test supplies `sessions.me` and asserts the production `AppRootSessionBoundary` error→Retry→ready path.

The underlying repair intentions are sound:

- durable-local adoption writes its pending owner before any move, survives partial/reload/identity-switch attempts, and exposes bind rejection through a Retry boundary;
- view-transition only absorbs platform `AbortError`; motion CSSOM only skips cross-origin `SecurityError`;
- CAS, process identity, lock, port-health, source-freshness, production control, motion instrumentation, and baseline generators stop converting unreadable evidence into success;
- appearance fallback propagation and missing motion evidence have planted behavioral controls.

The finite runtime-only rebuild is independently clean and safe to integrate:

```text
range: 320e4d7a9e95431eccf406534b159901cda64fe2..62461134d10f0d68ee5a221914ceabe34f4d3079
merge-base: 320e4d7a9e95431eccf406534b159901cda64fe2
status/diff-check: clean
client/server/tooling ts7 programs: 3 green
scoped Biome: 53 files clean
scoped ESLint: clean (`--no-warn-ignored` for explicitly listed non-configured unit files)
client/server units including wake gate: 6 files, 65 passed, type errors none
tooling focused bundle: 14 files, 69 passed, type errors none
session-recovery CT: builder rerun 6 passed, 0 failed/flaky/skipped; reviewer had independently reproduced the same 6/6 before formatting-only cleanup
doc catalog: 694 documents, 0 pending fact-checks
```

The cleanup carries `boolean | null` through `WakeGateDeps`, rejects null with a retryable `ProviderError`, and proves two consecutive null observations both probe and reject rather than hitting an awake cache. The new planted control compiles against the old boolean-only contract via an intentional test cast; old source accepted/cached the first null and failed the expected-ProviderError assertion. Current `wake-gate.test.ts` is 17/17 within the 65-test bundle.

Approve the seven-commit runtime-only range through `62461134d`. Do **not** integrate the banked `ff888b1a2` marker commit or `2c3d460e8` WIP gate/artifact/law commit.

## Detector conclusion

No additional bounded detector evasion survived the final cold probes beyond the already-repaired families. In particular, exact-position marker tests rejected fixture strings, one-statement-early markers, wrong positions, wrong gates, and duplicate same-line laundering; object failure outcomes require an explicit failure discriminator or preserved failure value; reassigned logger/notice/state aliases do not launder ownership; dot/optional/bracket/concatenated bracket/direct call/apply/bound/prototype rejection shapes are detected.

This is evidence that the detector core is worth keeping. It is not evidence that the unclassified 141 current findings, the 311 marker reasons, or the 377-row historical semantic population have been fully proven. The durable artifact/conformance must carry that burden before activation.

## Cleanliness

The reviewed stable WIP commit itself was clean when its receipts were captured. The separately reviewed runtime-only branch is also clean at `62461134d`. The reviewer made no production edits; this report is the durable output, and the reviewer-owned cold probe was removed.
