---
kind: review
status: active
updated: 2026-08-28
---

# Stranded-branch integration manifest — 11 branches vs main `b281929cd`

Charge: for 11 stranded branches, decide per branch whether the unique work is ALREADY ON MAIN
(superseded) or GENUINELY MISSING (must be integrated). Read-only investigation; every verdict below
carries the receipt it was climbed to. Main tip at investigation time: `b281929cd` (clean,
`verify --push` green per dispatch premise).

## Headline

**One branch carries genuinely missing work: `wt/agent-af609b98eb3c64643` (the #751
caught-failure-ownership GATE build). Every other branch — all 8 of Cluster B, both codex #751
branches, and 7 uninvestigated siblings checked as a bonus — is 100% superseded, most of it
patch-id-IDENTICAL to commits already on main.** The owner-flagged CT retry-retirement work is NOT
stranded: it landed on main byte-for-byte and is enforced by the active
`ct-no-oneshot-live-read-assert` gate.

## Verdict table

| # | Branch | Verdict | Evidence (this session) |
| - | - | - | - |
| 1 | `wt/agent-af609b98eb3c64643` | **INTEGRATE** | Gate absent on main (`ls` = ENOENT for `tooling/src/verify/gates/caught-failure-ownership.ts`, `contract/caught-failure.ts`, `ops/gen/caught-failure-population.ts`). Its #775 fix (`GITIGNORED_ABSENT` arm in `dangling-refs.ts`) absent on main (`git grep GITIGNORED_ABSENT main -- …dangling-refs.ts` = 0). Its #783 hardening (`literalMember` bracket-access reader in `detached-work-traced.ts`) absent on main (diff adds it; main-side log for that file shows nothing since the fork `46c356b62`). |
| 2 | `codex/issue-751-pre-decomposition` | **SUPERSEDED** | Predecessor snapshot of #3 — same 8-commit stack authored 2 minutes earlier (tip 14:27:42 vs 14:29:40 on 2026-08-26) on an older base (`a69c1be5d`); `git cherry` shows the stacks are rebased copies. Nothing unique beyond #3. |
| 3 | `codex/issue-751-caught-failure-ownership` | **SUPERSEDED** | Two halves, both covered. (a) The six runtime fail-closed commits were rebuilt/repaired and LANDED as `320e4d7a9..62461134d` (7 commits, subject-for-subject: durable session recovery `539de8a27`, transition/motion probes `74b03a946`, storage+fleet faults `ff581148a`, operational probes `f9280b4bd`, motion-audit evidence `455f8ce87`, baseline evidence `42fa6b02a`, + wake-state `62461134d`); `62461134d` verified ancestor of main; the rebuild was formally approved by the recorded review `e3177c9b3` (`docs/history/reviews/stickler/2026-08-26-issue-751-caught-failure-ownership.md`). (b) The marker-census commit (`ff888b1a2`) and WIP gate commit (`2c3d460e8`) were explicitly REFUSED by that same recorded review ("Do **not** integrate…") and are superseded by the #1 successor build. Residual non-marker hunks were classified programmatically: 237 files, and every behavioral file is inside the landed 53-file rebuild set; the remainder is marker-comment restructuring only (verified by reading the hunks for engine.ts, character-actions-menu, shiki-plugin, perf-marks, main.tsx, error-boundary, regex-script-picker — all pure `@orb-gate-ignore` comment insertion/`.catch(() => undefined)` respelling). |
| 4 | `wt/codex-gate-ui-round2` | **SUPERSEDED** | Both commits patch-id-identical on main: `4a3341bc6` ≡ main `2b95e9adb` (patch-id `75c40a36…`), `0fdd92fa6` ≡ main `7eca10853` (patch-id `439e7a7c…`). |
| 5 | `wt/codex-gate-ct-c` | **SUPERSEDED** | `4a3341bc6` ≡ `2b95e9adb`; `7114492ed` ≡ main `eefd913c5` (patch-id `eb24fb20…`). |
| 6 | `wt/codex-gate-ct-b` | **SUPERSEDED** | `4a3341bc6` ≡ `2b95e9adb`; `054a7d529` ≡ main `ecff3f6f8` (patch-id `cad2582b…`). |
| 7 | `wt/codex-oneshot-other-client` | **SUPERSEDED** | `736822fae` ≡ main `ed25105de "fix one-shot client CT assertions"` (patch-id `be27f92a…`, located by exhaustive patch-id sweep over main-side test commits). |
| 8 | `wt/codex-oneshot-chat-appshell` | **SUPERSEDED** | `92509a75d` ≡ main `a59699606 "test: retry live CT reads"` (patch-id `4de18f32…`). |
| 9 | `wt/codex-gate-owner-security` | **SUPERSEDED** | `95a0544ef` ≡ main `2cea08677` (patch-id `ea4bcc7d…`), `569d3a9dc` ≡ main `6a7f39d3f` (patch-id `2b215324…`). Main then evolved those gates FURTHER (`0d416836d`, `92011ffcf`) — main is ahead of the branch. |
| 10 | `wt/codex-gate-relations-round2` | **SUPERSEDED** | `03bf90671` ≡ main `33e3d6449` (patch-id `17be616e…`). |
| 11 | `wt/codex-gate-call-identity` | **SUPERSEDED** | `7de03ad19` ≡ main `ed8b96aef` (patch-id `e127c9b0…`). |

## Cluster A — the #751 family relationship

The three branches are **three sequential generations of ONE program, not competitors**:

1. `codex/issue-751-pre-decomposition` — gen 1, the pre-rebase snapshot ("pre-decomposition" = the
   state before the stack was decomposed for review).
2. `codex/issue-751-caught-failure-ownership` — gen 2, the same stack rebased to `dbec59a1a`. This
   is EXACTLY the WIP range the 2026-08-26 stickler review examined
   (`dbec59a1a…2c3d460e8` — verdict REFUTED/NOT READY for the gate+marker half; runtime half
   extracted, rebuilt, approved, and landed).
3. `wt/agent-af609b98eb3c64643` — gen 3, the post-review gate rebuild. Forked at `46c356b62`
   (post-runtime-landing), its commits directly answer the review's P1 blockers:
   - Census bijection by FULL identity `(siteId, path, line, column, grammar, position, ordinal,
     verdict, reason, markerLine)` as a MULTISET, replacing the WIP's lossy `(path,line,grammar)` Set
     (its int test `tests/tooling/verify/gates/caught-failure-ownership.int.test.ts` names the WIP
     defect explicitly and pins the repair).
   - Conformance runs the WHOLE loaded gate corpus so `gate-ignore-inventory` participates in the
     same pass (review blocker 5).
   - The census is DERIVED (`deriveCaughtFailurePopulation`), never declared; committed at
     `docs/reviews/caught-failure-ownership/population.json`.
   - It does NOT carry the WIP's `loader.ts` regression (the review's reserved-fixture P1) — the
     branch never touches `tooling/src/verify/lib/loader.ts`.
   - Marker approach replaced: instead of the refused 311-marker carpet, verdicts live in the census
     (378 sites: 46 deliberate-absorb, 3 detached-owned, 329 unproven at branch tip) and only 15 new
     owner-named markers were added across 11 security/entry/plugin-host files, with 12 tooling
     markers RETIRED (credited by the new discriminated-rethrow/never-return/securityEvent
     provenance arms). Marker census reconciles exactly: fork tree 44 markers + 37 `@swallowed-ok`
     \== main today (main-side frozen); branch tree 52 + 50.

**Which fail-closed fixes are NOT yet on main: NONE from the codex branches.** Beyond the six landed
runtime commits, all four review-drafted P1 runtime defects also landed independently:
asset-GC fail-closed (`asset-refs.ts` now throws on present-but-unreadable library JSON — verified
on main's current source), malformed-SSE reject (`57a702ced`), preset fallback narrowed + persona
seed narrowed to their NotFoundError (`196669c26`, #759/#760).

### What integrating #1 actually brings (the genuinely-missing set)

- `tooling/src/verify/gates/caught-failure-ownership.ts` (2376 lines — the detector: promise/empty/
  default arms, provenance-checked ownership, discriminated-rethrow credit, bracket-spelling reads)
- `tooling/src/verify/contract/caught-failure.ts` + `tooling/src/verify/ops/gen/caught-failure-population.ts`
  - `docs/reviews/caught-failure-ownership/population.json` (4935-line census)
- `tests/tooling/verify/gates/caught-failure-ownership.int.test.ts` (bijection + inventory-hygiene pin)
  - `tests/tooling/verify/gates/dangling-refs.int.test.ts`
- `tooling/src/verify/gates/dangling-refs.ts` — the #775 `GITIGNORED_ABSENT` three-sided exemption
  (kills the green-on-main/red-in-every-worktree environment dependence for
  `scripts/probes/st-goldens/sillytavern-runtime`)
- `tooling/src/verify/gates/detached-work-traced.ts` — #783 `literalMember` (bracket-access
  laundering, `p["catch"]`), opener-vocab scoped to the PASS (`3f7666c37`)
- `tooling/src/verify/gates/gate-ignore-inventory.ts` wiring, `verify/cli.ts` + `verify/index.ts`
  registration, `vitest.config.ts` SERIAL_INT row, 15 owner-named markers, 12 marker retires,
  `Core-Enforcement-Active-Gates.md` row + catalog re-attest, `tests/tooling/check-gates.int.test.ts` (+2)

### Conflict risk for #1 (81 behind; main absorbed the plugin train since its fork)

| Surface | Risk | Note |
| - | - | - |
| `vitest.config.ts` | LOW, certain textual conflict | Both sides append to the same SERIAL_INT block (`358ec9bfa` added test-presence.int + motion-audit/cli.int; branch adds caught-failure-ownership.int). Resolution = union. |
| `docs/catalog/catalog.json` + `receipts/architecture-core.json` | LOW, certain conflict | 8/4 main-side commits since fork (plugin-train attestations). Mechanical: re-attest on the merged tree; receipts are the authored source. |
| `packages/server/src/infra/plugin-host/{membrane,port,sandbox}.ts` | MODERATE | Main churned these 17/7/11 commits (plugin train). Branch hunks are 1–2-line marker comments anchored to specific catch sites — expect conflicts or mis-anchoring; re-anchor by hand against main's current catch sites. |
| **Census staleness** | CERTAIN post-merge work | `population.json` was derived on the fork-era tree. The plugin train's ~81 commits added catch sites (the plugin-host files alone churned 35 commits), so the committed census will FAIL its own bijection test on the merged tree until re-derived via the branch's generator — on the QUIESCED merged tree only (whole-tree regenerator hazard, `lane-standing-facts`). New sites land as `unproven` census rows, which the design tolerates mid-classification. |
| Everything else | CLEAN | Zero main-side commits since fork on: `dangling-refs.ts`, `detached-work-traced.ts`, `gate-ignore-inventory.ts`, `verify/cli.ts`, `verify/index.ts`, `Core-Enforcement-Active-Gates.md`, `check-gates.int.test.ts`, and 8 of the 11 marker-target server files. |

**Status caveat on #1:** the classification program is IN FLIGHT — 329 of 378 census rows are still
`unproven` at branch tip, and the int test's own header says the zero-unproven assertion arrives
with "the final program commit". Integrating it lands the machinery + ratchet, not a finished
classification; #751 stays Running after the merge. I did NOT re-run the branch's gate battery this
session (see coverage gaps) — the integration lane owes a branch-side green receipt before the ff.

## Cluster B — all superseded, byte-for-byte

Every commit on all 8 branches has a patch-id-identical twin already in main's history (receipts in
the table above; `git cherry main <branch>` = all `-`). The mechanism: the overnight campaign
re-landed these exact patches via the `wt/codex-gate-ui-test` merge lineage — note
`wt/codex-oneshot-*`'s merge-base is `417d9c525 "Merge branch 'main' into wt/codex-gate-ui-test"`,
and `wt/codex-gate-ui-test` itself is now 0 ahead of main.

### The owner's CT retry-retirement concern — resolved, nothing stranded

- Main carries all five migration patches: `7eca10853` (UI component live reads), `eefd913c5`
  (client CT live-read retry-safe), `ecff3f6f8` (client features retry), `ed25105de` (one-shot
  client CT), `a59699606` (chat/appshell retry).
- Spot-check of current tree state: `tests/client/features/chat/surfaces/chat-list-surface.ct.tsx`
  on main uses web-first `await expect(locator)…` / `expect.poll` throughout the migrated regions.
- The enforcement is ACTIVE: `ct-no-oneshot-live-read-assert` has a law row
  (`Core-Enforcement-Active-Gates.md:261` — "a component test never reads mutable async state with a
  non-retrying expect()… ONESHOT-OK marker" ) and main is `verify --push` green, so the whole current
  CT corpus passes the one-shot ban. Branch-vs-main file diffs on the migrated CTs are main-side
  FORWARD evolution (`92011ffcf`, plugin-train edits), not lost migration.

## Bonus coverage — sibling strays (not in the charge, checked for "nothing is missing")

`wt/codex-gate-fail-loud`, `wt/codex-gate-family-712`, `wt/codex-gate-final-union`,
`wt/codex-gate-literals`, `wt/codex-gate-relations`, `wt/codex-gate-ui-test`, and
`codex/issue-751-runtime-integration` are ALL `0 ahead` of main (`git rev-list --count`) — fully
merged, safe to delete.

## Recommended integration order

1. **Nothing to integrate from 10 of the 11.** Branches #2–#11 (and the 7 bonus strays) can be
   deleted whenever convenient; every unique patch either sits on main patch-id-identical or was
   formally refused by the recorded 2026-08-26 review in favor of the successor.
2. **`wt/agent-af609b98eb3c64643`, alone, as one lane:** merge main into the branch (or rebase),
   resolve the four named conflict surfaces (vitest union → catalog re-attest → plugin-host marker
   re-anchor), **re-derive `population.json` on the quiesced merged tree**, run the branch's two int
   tests + the scoped gate battery + `pnpm check`, THEN ff. Do not regenerate the census while any
   sibling lane is live.
3. Post-merge, #751 remains Running: 329 unproven census rows are the remaining classification
   campaign.

## Verified clean / how

- Unique-commit enumeration: `git log --no-merges --oneline main..<branch>` for all 11 + 7 bonus.
- Supersession: `git patch-id --stable` pairwise for all 10 Cluster-B/gate commits (5 pairs listed),
  `git cherry main <branch>` for all CT branches, exhaustive patch-id sweep over main-side test
  commits to locate the two unlabeled twins (`ed25105de`, `a59699606`).
- Cluster A runtime coverage: ancestor check on `62461134d`; the 53-file landed-range file list
  compared against a programmatic marker-vs-behavioral classification of the codex branch's full
  237-file diff; hunk-level reads of every residual behavioral candidate.
- Main-side evolution per touched file: `git log <fork>..main -- <file>` for every file the af609
  branch touches (all clean except the four named surfaces).
- Current-tree probes on main: `GITIGNORED_ABSENT` absent, gate files absent, asset-refs throws,
  CT files web-first, active-gates law row present, marker counts (44/37) equal at fork and tip.

## Coverage gaps (honest)

- I did NOT run the af609 branch's own test battery or gate suite this session (read-only lane;
  no worktree). Its merge-readiness (biome/eslint/types on the 2376-line gate, catalog receipt
  integrity at branch tip) is asserted by its commit trail, not re-verified — the integration lane
  owes those receipts.
- The landed runtime rebuild (`320e4d7a9..62461134d`) was matched to the codex branch's six commits
  by subject + the recorded review's approval + file-set containment, not by byte-diff (the review
  itself documents that the rebuild deliberately DIFFERS — it repaired 46 scoped-Biome errors and a
  tri-state wake-probe seam).
- Census staleness is characterized qualitatively (35 plugin-host commits since fork), not counted —
  the exact new-site count only falls out of running `deriveCaughtFailurePopulation` on the merged
  tree.
- `git cherry` patch-equivalence can in principle miss a later partial revert; closed for the CT
  family by current-file spot-checks + the active gate + main's `verify --push` green, and for the
  gate files by main-side log showing main strictly AHEAD (follow-up hardening commits).

## Issue summary (paste-ready)

Stranded-branch triage complete: 11 charged branches + 7 sibling strays investigated against main
`b281929cd`. 17 of 18 are fully superseded — every Cluster-B gate/CT commit is patch-id-identical
to a landed main commit (the CT retry-retirement work the owner flagged is ON main and enforced by
the active `ct-no-oneshot-live-read-assert` gate), and the codex #751 branches' runtime half landed
via the review-approved rebuild `320e4d7a9..62461134d` while their gate/marker half was formally
refused by the 2026-08-26 review. ONE branch must be integrated: `wt/agent-af609b98eb3c64643` — the
caught-failure-ownership gate build (detector + census + #775 dangling-refs fix + #783
detached-work-traced hardening), absent from main. Conflict surfaces: vitest.config SERIAL_INT
(trivial), doc catalog (re-attest), plugin-host marker anchors (moderate), and a REQUIRED census
re-derivation on the merged tree. #751 remains Running post-merge (329/378 census rows unproven).
Full manifest: `docs/reviews/stickler/2026-08-28-stranded-branch-integration-manifest.md`.
