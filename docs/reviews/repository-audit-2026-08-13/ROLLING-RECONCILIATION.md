---
kind: review
status: complete
updated: 2026-08-14
---

# Rolling-snapshot reconciliation

This is an admission aid, not a replacement synthesis. It reconciles only post-assignment movement against individual lane claims. A finding not re-examined below remains a fact about its lane's recorded receipt, **not** a claim about one homogeneous closing commit.

## Boundaries and cold-reader instructions

| Boundary | Value |
| --- | --- |
| Audit origin | `e777c47e5860a105c114e061dcf98bcab1baa952` |
| Frozen partition manifest | `c93253a3f907fb7fd93d411c511a98ed378505db` |
| Late selected-lane assignment basis | `41e18afe74afa570b67a3e670a1a38863c486a00` |
| Reconciliation start HEAD | `330aef4abef2a88f96e19611f464b1b84c494e85` |
| Reconciliation close HEAD | `5783331a8a4403b056be8babc692436e33c4d4d6` |
| Start → close movement | bus wave, databank lenses, then staleness W5/W7a; 126 tracked paths changed across 9 commits |
| Origin → close movement | 72 commits; 325 tracked paths changed |
| Late assignment → close movement | 282 tracked paths changed |

The checkout was dirty at start through pre-existing untracked audit/tooling artifacts: `.agents/skills/agent-authoring/`, `.claude/apisurface-*`, this audit directory, and `scripts/audit/`. The temporary `databank.bankHealth` deferment was reconciled by commit `572306b0bfe139bbcb89087ab557710bd8fc7ce5`; `scripts/check/gates/query-freshness-coverage.ts` is not currently dirty. At this handoff the tracked tree is clean and the same 15 untracked audit/tooling entries remain; no conclusion below treats those bytes as committed source. The targeted source and test proofs name their current `HEAD` paths explicitly.

The frozen manifest has **78 lanes / 5,700 paths / 936,529 text lines / 76,311,612 bytes**. Current selected assignments have **78 lanes / 5,704 OWNED paths / 937,932 lines / 76,427,616 bytes** (5,621 text and 83 binary paths). The four legitimate newer selected-assignment additions are:

- `docs/design/event-bus-coverage-survey.md` (`docs-design-a-f`)
- `docs/design/rpg-rewind-stuck-state.md` and `docs/design/staleness-and-session-freshness.md` (`docs-design-n-s`)
- `docs/reviews/stickler/2026-08-14-staleness-diagnosis.md` (`docs-reviews-n-z`)

Cold Sol must read the controls, portfolio QA, security validation, and every lane artifact first. It must use `MANIFEST-ALL.json` for the 5,700-path partition denominator and each lane receipt for what that lane actually read. Do not silently replace the frozen denominator with 5,704 or upgrade a snapshot-only row to a current-HEAD statement.

## Resolutions proved against closing HEAD

| Finding ID | Classification | Post-receipt change and current evidence |
| --- | --- | --- |
| `DEVRT-01` | **RESOLVED AT HEAD** | `6abe255bb01497824d876c577df6f83355751650` replaces the hand-rolled boot-lock parser with `acquireSpawnLock` at `scripts/dev/engines.ts:188-210`. The shared parser rejects non-positive/non-integer holders before `kill` (`scripts/dev/_kit/spawn-lock.ts:63-89`); its real-filesystem empty/whitespace recovery behavior is asserted by `tests/tooling/spawn-lock.int.test.ts:74-122`. The exact engines launcher has no direct regression test, so this is source R3 plus the shared behavior's R4—not a GPU/live-fleet receipt. |
| `DEVRT-02` | **RESOLVED AT HEAD** | `f18314e1db10bc9a6c0aeb91a117032dbb0913b4` adds the missing terminal newline. Current `scripts/dev/qwen3_gen_thinking_serve.jinja` is 331 `wc -l` lines, matching the frozen assignment. The lane's prior 330-line receipt remains historical evidence and must be read as pre-fix, not silently rewritten. |
| `GA-H-02` | **RESOLVED AT HEAD** | `2b729cd261a43b65af47b91890dadcaa84260592` adds per-gate candidate/scanned/skipped accounting (`scripts/check/pass.ts:20-41`, `:583-600`), makes zero effective scans a tool error (`scripts/check/report.ts:87-92`), and renders the denominator per gate (`scripts/check/render.ts:38-57`). `tests/tooling/ast-observability.int.test.ts` and `tests/tooling/check-gates.int.test.ts` are the new behavioral proof owners; locally attempted serial runs did not terminate in this shared checkout, so their committed historical green receipt must be re-run by the cold reader before R5 is repeated. |
| `SID-01` | **RESOLVED AT HEAD** | `0fd1279cb2c5d4ab3515261c907a571e9be36fe7` creates the `custom_openai` endpoint probe at `packages/server/src/domain/credentials/verbs/test-health.ts:85-106`; unsupported providers now return `unchecked` before throttling at `:118-136`. The authed/CSRF mutation remains wired at `packages/server/src/transport/trpc/routers/credentials.ts:59-64`. Current targeted run: `tests/server/domain/credentials/verbs/test-health.int.test.ts`, **10/10 passed**. |
| `DEPLOCK-01` | **PARTIALLY RESOLVED** | The finding’s old P1/"12 highs" framing is invalidated by the current security reconciliation. `SECURITY-VALIDATION.md` establishes 32 records collapsing to seven families/ten GHSAs and two bounded P2 upgrade candidates: authenticated untrusted images reach `sharp`, and untrusted PDFs reach server-side `pdfjs-dist` extraction. The corrected lane row is P2; no package upgrade occurred, so the two upgrade candidates remain current. |
| `server-discovery-automation` candidate | **INVALIDATED BY DRIFT** | It is not a P1 finding. The corrected report establishes only provider-minus-client evidence for ten procedures, while server composition is live. No browser-product requirement was proven; cold synthesis must retain it as a candidate observation only. |

## Material later changes: reconciled but not invented into new audit findings

`a870f860385da0414c435fefedd96516a910d4d2`/`7605c5ee516fcc8a8e31d10444cbcaea9839b6a5` move character library lenses server-side and remove the head-page eviction cap. Current source has no `maxPages` in the library query (`packages/client/src/features/character/surfaces/character-library-surface.tsx:104`), and the six-page no-eviction behavior is asserted at `tests/client/features/character/surfaces/character-library-surface.ct.tsx:350`. These changes do not resolve an existing character-lane finding ID; do not create one retroactively.

`db011083874beb1c56935a5b629b8a3742dcc3b6` adds the user-bus member at `packages/contracts/src/user-bus/index.ts:59-85`, injects it in refinery composition (`packages/server/src/entry/compose/refinery.ts:45-77`), and maps it client-side (`packages/client/src/data/invalidation.ts:297`). The focused refinery hook CT now includes a bus-refetch case (`tests/client/features/refinery/hooks/use-refinery-mutations.ct.tsx:46`), but it does **not** mount the primary content surface. Thus `client-preset-refinery-01` remains **CURRENT** and `client-preset-refinery-02` remains **CURRENT**: the stale “no production surface” story header is still at `tests/client/features/refinery/_ct-stories.tsx:3` despite the live mount at `packages/client/src/features/refinery/lib/refinery-section.tsx:83`.

`839c1dc096d780afaaee4c9a9bed2209430eb19d` adds session freshness/recovery. Current dedicated tests exist (`tests/client/data/session-freshness.test.ts:1`, `tests/client/data/session-resume.test.ts:1`, `tests/client/data/use-session-recovery.ct.tsx:1`). These are new post-receipt behavior, not a resolution of a lane finding, and must be synthesized as such rather than used to backdate unrelated scorecards.

The close movement `7ba64dd95afb5cc594cd6c9911a5f2660bcd2453`/`ddb68eb3048c8a593c4c9efc9365457dbed67595` adds `rulesChanged`, `databankChanged`, and `corpusRecomputed` user-bus members (`packages/contracts/src/user-bus/index.ts:79-105`), client invalidation (`packages/client/src/data/invalidation.ts:299-317`), server automation emits (`packages/server/src/domain/automation/verbs/create-rule.ts:50-55`), and terminal ingest fan-out (`packages/server/src/domain/databank/ingest/index.ts:143-155`). Mirrored assertions exist for create-rule (`tests/server/domain/automation/verbs/create-rule.int.test.ts:22-25`) and the ingest terminal fan (`tests/server/domain/databank/ingest/index.int.test.ts:42-57`). This resolves no named lane finding: it materially narrows the automation candidate's *server freshness* uncertainty, but does not establish a browser automation surface.

The final drift `36c137740c399aaf5e179d41b642df51fa608cc0`/`7501d2eb602dca0a5e7d1a4caa00ddcc4f54b720` changes 39 databank/client/test paths and adds server-side library lenses, bank census, and a no-eviction CT. The only retained-finding-adjacent file is `scripts/check/gates/query-freshness-coverage.ts`; its current diff adds a cited, explicitly temporary `databank.bankHealth` DEFERRED freshness debt at `:120-123`, not a change to the per-gate accounting/zero-scan implementation that resolved `GA-H-02`. No retained/resolved finding status changes.

`572306b0bfe139bbcb89087ab557710bd8fc7ce5` commits the deferred row's planned self-cleanup after `databankChanged` gained the router-root invalidation. It changes no accounting, zero-scan, ratchet baseline, or finding status; `GA-H-02` remains resolved and `GA-H-01` remains the independent 276-site declared baseline debt reported by the latest verification receipt.

`2426514c5111408a2a4829259be24ea579f848ad`/`4348f41ff5381cbb475aff1408d2be82e7ef1870`/`5783331a8a4403b056be8babc692436e33c4d4d6` close two staleness design arms. W5 makes deleted persisted character tag ids inert at the request boundary (`packages/client/src/features/character/lib/character-library-lens.ts:48-70`) while retaining their clearable UI state; its unit and CT regression cases live at `tests/client/features/character/lib/character-library-lens.test.ts` and `tests/client/features/character/surfaces/character-library-surface.ct.tsx`. W7a adds per-session/per-user live-socket eviction, with focused registry cases at `tests/server/transport/trpc/stream/socket-registry.test.ts`. Neither maps to a pre-existing lane finding ID, so neither changes a retained/resolved status or becomes a retrospective audit finding.

The same commit replaces the lint-failing dependency-less effect in `tests/client/data/_ct-stories.tsx:785-797` with a mounted interval/cleanup. A fresh canonical `pnpm verify` at this closing HEAD is now recorded in `FINAL-VERIFICATION.md`: its captured `reports/verify.json` SHA-256 is `2fe09cec708b8e08a7f6780640864bd1c84434d693999a1eff980f823e8bc043`, and all **14/14 static stages are green**. This supersedes the historical ESLint RED at `572306b`, but it is a static-tier receipt only: it makes no behavioral, browser, external-provider, push, full, or e2e claim.

## Still-current versus snapshot-only ledger

**CURRENT at closing HEAD** (the cited surface was either unchanged after its receipt or inspected again): `AGENT-TOOLING-01` (P1/R5; `SECURITY-VALIDATION.md` is authoritative), `DEPLOCK-02`, `DEPLOCK-03`, `GA-H-01` (now visibly declared ratchet debt, not resolved), `GA-H-03`, `client-forms-01`, `client-preset-refinery-01`, `client-preset-refinery-02`, `UI-RENDERING-01`, `PROBES-RUNTIME-01`, `PROBES-RUNTIME-02`, `RC-01`, `RC-02`, `PPR-01`, `PPR-02`, and `SERVER-SEARCH-REFINERY-01` (**candidate only**).

**STILL UNKNOWN / snapshot-only**: all remaining exact lane finding IDs—`AM-01`–`AM-03`, `DARCHH-NZ-01`–`DARCHH-NZ-04`, `DAHM-01`–`DAHM-03`, `DHA-01`–`DHA-02`, `DHNZ-01`–`DHNZ-03`, `DCL-01`–`DCL-04`, `DDAF-01`–`DDAF-04`, `DDESNS-01`–`DDESNS-02`, `DOC-CUR-01`–`DOC-CUR-03`, `DOCREV-NZ-01`, `DOCS-CORE-SPINES-01`–`DOCS-CORE-SPINES-02`, `DOCS-CORE-UI-01`–`DOCS-CORE-UI-03`, `DOCS-DESIGN-G-M-01`–`DOCS-DESIGN-G-M-04`, `DOCS-DESIGN-T-Z-01`–`DOCS-DESIGN-T-Z-02`, `DOCS-PROPOSED-AM-01`–`DOCS-PROPOSED-AM-03`, `DOCS-PROPOSED-N-Z-01`–`DOCS-PROPOSED-N-Z-02`, `LOWER-DB-01`–`LOWER-DB-02`, `LOWER-KIT-01`, `LC-01`, `CC-01`, `client-lib-01`, `CLIENT-SHELL-02`, `GQZ-01`, `UI-AI-01`, `UI-SZ-01`, `SCD-01`, `SAPB-01`, `SCA-02`, `SF-01`, `STK-01`, `CMD-01`, `scripts-misc-01`, `platform-tooling-01`, `docs-vendor-vite-guide-01`–`docs-vendor-vite-guide-02`, `docs-vendor-vite-rest-01`–`docs-vendor-vite-rest-02`, `docs-vendor-baseui-a-m-01`–`docs-vendor-baseui-a-m-02`, `docs-vendor-baseui-n-z-01`, `docs-vendor-baseui-rest-01`–`docs-vendor-baseui-rest-02`, `DOCS-DESIGN-MOCKS-OTHER-01`–`DOCS-DESIGN-MOCKS-OTHER-02`, `docs-design-mocks-panel-01`–`docs-design-mocks-panel-04`, and `SPR-01`/`SPR-02` (**candidate/audit-state**, not confirmed defects). “Unknown” means no closing-HEAD re-read was performed for that lane claim; it does not mean false, fixed, or current.

## Current command receipts and limitations

- `pnpm ast callers testHealth --files` completed with **15 hits in 2 files; scanned 5,006, skipped 0**, including the tRPC router and target integration test. Its mandatory epilogue is present.
- `pnpm ast callers refineryChanged --files` completed **0 hits; scanned 5,006, skipped 0**. This is not an absence claim: `refineryChanged` is a discriminant/object property rather than the called function name; the literal/current composition receipts above establish its path.
- `pnpm ast callers parseLockHolder --files` completed **8 test hits in 1 file; scanned 5,006, skipped 0**. The engine's live reach is an entry-point invocation, not a TS caller edge; source was read for that link.
- Focused current Vitest completed credentials (**10/10**), refinery score sweep (**9/9**), and role clients (**19/19**) before the combined process stalled in the shared runner. Do not count the unfinished combined command as a suite pass. A `pnpm check:structure` attempt likewise did not reach final exit here; its partial `reports/check-structure.json` is not a clean gate receipt.

Before declaring this reconciliation final in synthesis, recheck `git rev-parse HEAD` and `git status --short`. If HEAD changed, inventory `5783331..NEW_HEAD`, reread every changed file that touches any row above, and append a new reconciliation boundary; do not silently retarget the conclusions.
