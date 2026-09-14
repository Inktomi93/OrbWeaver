---
kind: review
status: active
updated: 2026-09-14
---

# Verification — reference-fact promotion to `tooling/src/_shared/` (#2358, `8965f231e`)

Lane `cb-v-2358`, adversarial fresh-context code verification of commit `8965f231e` (147 files) plus its
follow-up `145c48f55`. Worktree `.claude/worktrees/agent-af01b4320262b3c85`, HEAD `145c48f55`, working tree
clean before and after every probe. Every number below came from a run in this session; the orchestrator's
barrier numbers were treated as claims, not evidence.

**Verdict: CONFIRMED on all eight attack items, with three findings that do not overturn the outcome.** The
move is real, complete, resolves correctly at every tier, and the direction reversal is genuinely closed
(proven with a planted positive control, not with a green). The findings are: one §6.5 fixture-control gap
the commit message overstates as closed, one false receipt sentence in the commit message, and two dangling
markdown links left in an active normative review doc.

## 1. Dead copies / stale resolution — CONFIRMED

`git ls-files 'tooling/src/verify/lib/*reference-fact*' 'tooling/src/verify/contract/*reference-fact*'` → **0
rows**. `find tooling/src/verify -name '*reference-fact*'` → **0 paths** (covers untracked). `git ls-files
'tooling/src/_shared/*reference-fact*'` → **10 files** (the 9 family modules + `reference-fact-contract.ts`);
`git ls-files 'tests/tooling/**reference-fact*'` → **5 files** under `tests/tooling/_shared/`.

`rg -n "verify/(lib|contract)/reference-fact|lib/reference-fact|contract/reference-fact" tooling tests scripts
docs .claude` → 38 hits, exit 0. Classification:

- **37 hits under `docs/reviews/**`** — dated investigation records (refutation ledger rows, wave reports,
  stickler reports, censuses, checkpoints). Preserved verbatim, correct per the instruction-vs-record rule.
- **1 hit outside `docs/reviews/**`**: `scripts/codemods/reference-fact-to-shared.ts:4`, the codemod's own
  `WHY:` comment describing the pre-move state it was written to change. A historical statement inside a
  one-shot codemod, not an instruction pointing at a live path. **Not a defect.**

Zero instruction-class hits in `tooling/`, `tests/`, `.claude/`, or `docs/` outside `docs/reviews/`.

## 2. Direction of the moved modules — CONFIRMED

Every import declaration in the ten `tooling/src/_shared/reference-fact*.ts` modules resolves to `ts-morph`
or to a `_shared` sibling. No `verify/`, no `ast/`, no other tool tier, no `node:*`:

- `reference-fact.ts`, `-call.ts`, `-member.ts`, `-module.ts`, `-global.ts`, `-state.ts`, `-binding-name.ts`,
  `-overload.ts`, `-contract.ts` — `ts-morph` + `./reference-fact-*.ts` only.
- `reference-fact-writes.ts:3` — `ts-morph` + `@orb/tooling/_shared/ts-workspace` (alias spelling of a
  `_shared` sibling; see Minor observations).

**The reversal is closed, proven both ways.** `pnpm depcruise` on this tree → `✔ no dependency violations
found (4959 modules, 28328 dependencies cruised)`, exit 0. Planted positive control: an untracked
`tooling/src/ast/ops/cbv2358-probe.ts` importing `../../verify/lib/absent-subject-anchor.ts` → `error
tooling-internal-direction: tooling/src/ast/ops/cbv2358-probe.ts →
tooling/src/verify/lib/absent-subject-anchor.ts`, `x 1 dependency violations`, exit 1. Probe deleted;
`git status --short` empty. So the green is a measurement, not a blind instrument, and the live
`tooling/src/ast/ops/registry-candidates.ts:6 → ../../_shared/reference-fact.ts` edge is genuinely permitted.

`tooling-front-door` (the ts-morph twin of that rule): **1 → 0**, my run `✓ tooling-front-door · population
1270 source`, against the pre-move report's 1 violation.

## 3. The proof row that moved — CONFIRMED with a finding

**Coordinate arithmetic is correct.** `finalProbeModule` plants at `PROBE_GATE_PATH =
tooling/src/verify/gates/probe.ts` (`tooling/src/verify/gates/_proof/policy-soundness.ts:35`). From that
file's directory, `../../_shared/reference-fact.ts` → `tooling/src/_shared/reference-fact.ts`, which is
exactly the fixture file-map key at `policy-binding-resolution.ts:274`. The pre-move pair
(`../lib/reference-fact.ts` ↔ `tooling/src/verify/lib/reference-fact.ts`) resolved the same way, so the
hand-edit preserved the relation.

**Runs.** `pnpm check:structure --check policy-binding-resolution --check policy-family-readers` → `✓
policy-binding-resolution · final hard/error · population 336 source`, 0 findings, exit 0.
`pnpm check:policy-conformance` (whole, the stage that runs declared rows) → `336 final policies · 3868 proof
rows · 90 refusal rows · 120 identity-proof rows · **0 failure(s)** · 449 grant rows · 0 invalid · 61267ms`,
exit 0.

`pnpm test:scoped tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` → **1 failed | 107
passed (108)**, exit 1. The single failure is the inherited `policy-proof-expectations` `closedAtZero`
assertion at `tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts:1030` (#2351), accusing
**30** gate modules. I verified inheritance independently rather than accepting it: the pre-move barrier
report `reports/runs/structure/main-1553761-2026-09-14T18-05-19-465Z/check-structure.json` carries 65
`policy-proof-expectations` violations over **exactly the same 30 distinct modules**. No other failure.

**FINDING F1 — the "sanctioned route" row does not exercise its planted coordinate (§6.5).** The commit
message says the repoint keeps the row "proving against a coordinate that exists". It does not prove anything
about the coordinate. Probe, run in this worktree on the real file (`cp` backup, `sed`, `mv` restore):
repointed the fixture map key to `tooling/src/_shared/reference-fact-CBV2358-ABSENT.ts` while leaving the
probe module's import at `../../_shared/reference-fact.ts` — i.e. an unresolvable specifier.
`pnpm check:policy-conformance` under the probe → **identical output, `0 failure(s)`, 3868 rows, exit 0**.
The row cannot go red on a dead coordinate because the gate's verdict is name-keyed: `resolutionSiteOf`
(`policy-binding-resolution.ts:98`) accuses only members of `BINDING_RESOLUTION_MEMBER_TABLE`, and
`resolveModuleMemberOrigin` is not one, so the row is green whether the import resolves, dangles, or is
absent. This is **pre-existing** — the old `../lib/reference-fact.ts` pair was equally unexercised — and the
edit is not a regression. But law §6.5 ("every family floor includes a control proving its fixture import
specifiers resolve as intended; fail-closure on an unresolved import must not impersonate a tested identity
branch") is unsatisfied for this family, and the commit message asserts the opposite. File restored;
`git status --short` empty.

## 4. Import spelling per tier — CONFIRMED

Counts of real import specifiers naming a moved module (excluding `tooling/src/_shared/` itself):

| Tier | alias `@orb/tooling/_shared/reference-fact*` | relative `../…/_shared/reference-fact*` |
| - | -: | -: |
| `tooling/src/verify/lib` | 57 | 0 |
| `tests/tooling/_shared` | 9 | 0 |
| `tests/tooling/verify/lib` | 7 | 0 |
| `tooling/src/verify/gates` | 0 | 77 |
| `tooling/src/verify/contract` | 0 | 6 |
| `tooling/src/ast/ops` | 0 | 1 |

Alias total 73, matching the claimed 73 alias-tier re-points. **No tier is mixed**, so the measured-convention
claim is true as stated, not approximately. Spot-checked specifiers resolve by depth:
`tooling/src/ast/ops/registry-candidates.ts:6` and `tooling/src/verify/contract/{schema-fact,registry-fact,sealed-origin,tuple-vocabulary-fact,ambient-determinism,bus-fact}.ts`
all spell `../../_shared/reference-fact…` from `tooling/src/<tool>/<dir>/`, which is
`tooling/src/_shared/…`; `tooling/src/verify/lib/{schema-fact-value,browser-contract-reader}.ts` use the
alias. `pnpm typecheck --config tooling/tsconfig.json` → `11 discovered, 1 runnable` · **`PASS
tooling/tsconfig.json`**, exit 0. The test side is proven by item 6 executing.

## 5. The codemod — CONFIRMED (one-shot, safe, dry-run by default)

`scripts/codemods/reference-fact-to-shared.ts`.

- **Dry-run default:** yes. `runCodemod` (`tooling/src/codemod/lib/run.ts:25`) requires `--apply`; without it
  it prints "This was a DRY RUN. No bytes were written."
- **Re-run behavior: aborts loudly, does not silently no-op and does not corrupt.** `moveFiles`
  (`tooling/src/codemod/lib/files.ts:214-219`) asserts `sf !== undefined` and fails with `moveFiles: source
  not in project: tooling/src/verify/lib/reference-fact.ts` on a second run, before touching the in-memory
  project. It also refuses a pre-existing non-empty destination (`:221-227`). So a re-run is a clean refusal,
  not a harmful replay. The alias-repoint plan would be idempotent anyway (it sets the same specifier).
- The moved-sibling exclusion (`isMovedSibling`) is why the ten `_shared` modules kept relative
  sibling imports rather than being converted to aliases — consistent with what I measured in item 2.
- It is committed under `scripts/codemods/` as a permanent artifact of a one-shot move. Not a defect;
  flagging only so a future reader does not mistake it for a re-runnable maintenance tool.

## 6. Moved tests collect — CONFIRMED

`pnpm test:scoped tests/tooling/_shared/reference-fact.test.ts …-call.test.ts …-module.test.ts
…-origin.suite.test.ts …-writes.test.ts` → **Test Files 5 passed (5) · Tests 101 passed (101)**, duration
5.94s, exit 0. Report:
`reports/runs/test/agent-af01b4320262b3c85-1754346-2026-09-14T19-05-42-771Z/test-report.json`.

Mirror homes are correct: `pnpm check:structure --check test-layout --check test-presence` → `test-presence`
clean; `test-layout` **78 findings, all inherited** (identical 78 in the pre-move barrier report), and **none
of the 78 names a `_shared` or `reference-fact` path** — they are the pre-existing family-test mirror misses
under `tests/tooling/verify/gates/`.

## 7. The §3 law clause — CONFIRMED (every sentence true on the tree)

`docs/design/gate-runtime-standardization.md:119-126`. Claim by claim:

- "`tooling/src/ast/` also reads it" — true: `tooling/src/ast/ops/registry-candidates.ts:6`.
- "`verify` importing `ast` (`ops/orphan-export-ratchet.ts`)" — **true**:
  `tooling/src/verify/ops/orphan-export-ratchet.ts:68-69` import type and value from `@orb/tooling/ast`. (The
  line-23 comment mention is not the import; the import is real and two lines apart from it.)
- "made the reverse import a direction reversal" — true, and I planted the control that proves the rule is
  live (item 2).
- "`policy-family-readers` still requires each family's shared canonical declaration to resolve inside
  `tooling/src/verify/lib/`" — **true**: `policy-family-readers.ts:36` `const LIB_DIR =
  "tooling/src/verify/lib/"`, consumed at `:131` (the `sharedHome` template joining root and `LIB_DIR`), and stated in
  its MESSAGE `:43` and FIX `:47`. The fence was not widened by this commit.
- "a family whose only shared production dependency is a `_shared/` primitive needs a `verify/lib/`-declared
  sibling dependency too, or its own singleton reason" — this is precisely the observed 17 → 19 behavior
  (item 8), so the clause describes the mechanism rather than predicting it.

No false sentence found in the addition.

## 8. Family delta 17 → 19 — CONFIRMED, attribution exact

My run: `✓ policy-family-readers (19 warning(s))`. Diffed against the 17 violations in
`reports/runs/structure/main-1553761-2026-09-14T18-05-19-465Z/check-structure.json`:

- **All 17 pre-move rows are present post-move at byte-identical file:line** (`db-structure-producer-home:27`,
  `db-structure:19`, `no-form-reset-in-autosave-health:57`, `no-inline-domain-interface:58`,
  `no-inline-types:128`, `no-manual-memo-compiler-health:17`, `no-mutating-register-api:82`,
  `no-raw-egress:116`, `no-rejected-cors-proxy:83`, `registry-assembly-at-door-only:75`,
  `scrubber-factory-home:60`, `scrubber-home:89`, `stale-draft-commit:21`, `stale-draft-decision-health:8`,
  `surface-in-a-container-health:79`, `windowed-infinite-query-health:68`, `windowed-infinite-query:187`).
- **Exactly two new rows**: `zod-error-issues-home.ts:130` and `zod-modern-spellings.ts:173`.

No third module appeared, none disappeared. The 17 → 19 attribution is exact. These are warnings (`raw 19 =
waived 0 + granted 0 + effective 19 (0 error, 19 warning)`, `0 blocking`), routed to #2187.

## Additional findings

**FINDING F2 — a false receipt sentence in the commit message.** `8965f231e` states: *"the 1 failure
(policy-proof-expectations closedAtZero, **29** accused gates) is INHERITED (#2351) and unrelated to this move
(grepped: **none of the 29 accused modules import reference-fact**)"*. Both halves are wrong as written: the
accused set is **30** modules, and **two of them do reference `reference-fact`** —
`tooling/src/verify/gates/dangling-refs.ts` (imports `../../_shared/reference-fact.ts` at `:27`, plus its
`BINDING RESOLUTION (#2163)` header note) and `tooling/src/verify/gates/platform-spellings.ts`. The
CONCLUSION survives — I proved inheritance the right way, by set-comparing the accused membership against the
pre-move report (item 3), which is identical — but the stated grep receipt is not reproducible and should not
be cited by a later reader.

**FINDING F3 — two dangling markdown links in an active normative doc.**
`docs/reviews/gate-runtime/shared-semantic-readers.md:132` links
`[reference-fact.ts](../../../tooling/src/verify/lib/reference-fact.ts)` and `[write and invoked-member alias
graph](../../../tooling/src/verify/lib/reference-fact-writes.ts)`; both targets no longer exist (`ls` → "No
such file or directory"). The doc is `disposition: current`, `authority: normative`, `status: active` in
`docs/catalog/catalog.json`, and it is read-list item 5 in `gate-runtime-read-first.md`. The commit's
instruction-vs-dated-record rule classed every `docs/reviews/**` hit as a preserved record; that is right for
prose recording a past measurement, but a markdown **link** is navigation, and these two now lead nowhere.
The `dangling-refs` gate cannot catch it: `pnpm check:structure --check dangling-refs --check
dangling-ref-citations` is **clean** on this tree, because its document corpora are the design (41 members)
and law (57 members) lanes plus 2 law-outside-docs files — the `reviews` lane is not a member. So this is
also a small gate blind spot, not just a stale link. Low severity; no behavior depends on it.

## Minor observations (no ledger row)

- `tooling/src/_shared/reference-fact-writes.ts:3` reaches a `_shared` sibling by ALIAS
  (`@orb/tooling/_shared/ts-workspace`) while all other intra-`_shared` imports in the family are relative
  (173 relative sibling imports across `_shared/`). It is not unique — `_shared/nav.ts:23` does the same —
  and it is a spelling the file carried in from `verify/lib`, where alias was the tier convention. Cosmetic.
- `docs/reviews/gate-runtime/shared-semantic-readers.md:132` also links `static-authored-value.ts` under
  `verify/lib/`, which **still exists** — only the two reference-fact links dangle.

## What I ran (full list, this session, in this worktree)

| Command | Exit | Result |
| - | -: | - |
| `git ls-files` / `find` over `verify/lib`, `verify/contract`, `_shared`, `tests/tooling` | 0 | 0 stale, 10 moved modules, 5 moved tests |
| `rg -n "verify/(lib\|contract)/reference-fact\|lib/reference-fact\|contract/reference-fact" tooling tests scripts docs .claude` | 0 | 38 hits, 37 dated records + 1 codemod WHY comment |
| `pnpm depcruise` (clean tree) | 0 | `✔ no dependency violations (4959 modules, 28328 deps)` |
| `pnpm depcruise` (planted `ast → verify/lib` control) | 1 | `error tooling-internal-direction` ×1 — instrument is live |
| `pnpm check:structure --check policy-binding-resolution --check policy-family-readers` | 0 | binding-resolution 0; family-readers 19 warnings |
| `pnpm check:structure --check tooling-front-door --check test-layout --check test-presence` | 1 | front-door **0**; test-presence 0; test-layout 78 (all inherited, none moved-family) |
| `pnpm check:structure --check dangling-refs --check dangling-ref-citations` | 0 | clean — and blind to F3 |
| `pnpm check:policy-conformance` (baseline) | 0 | 336 policies · 3868 rows · **0 failures** |
| `pnpm check:policy-conformance` (F1 probe: fixture key → absent path) | 0 | **0 failures — row unexercised** |
| `pnpm test:scoped tests/tooling/_shared/reference-fact*{,-call,-module,-origin.suite,-writes}.test.ts` | 0 | **101/101 pass, 5 files** |
| `pnpm test:scoped tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` | 1 | 107/108; only failure = inherited `policy-proof-expectations` closedAtZero (#2351), 30 accused |
| `pnpm typecheck --config tooling/tsconfig.json` | 0 | `PASS tooling/tsconfig.json` |

Not run, by brief: whole-tree `pnpm check` / `pnpm verify` / unscoped `check:structure`. The barrier numbers
for biome/knip/docs:catalog/eslint were not independently reproduced and are not claimed here.

Probes: two, both in this isolated worktree, both restored — `policy-binding-resolution.ts` via
`cp`/`sed`/`mv` (F1), and an untracked `tooling/src/ast/ops/cbv2358-probe.ts` via `rm` (item 2 control).
`git status --short` is EMPTY apart from this report.

## LEDGER ROWS (3 rows)

| Subject | Lane · site | Defect | Class | Status | Evidence |
| - | - | - | - | - | - |
| `gates/policy-binding-resolution.ts` | cb-v-2358 · `tooling/src/verify/gates/policy-binding-resolution.ts:266-281` | The "SANCTIONED ROUTE" `mustPass` row plants `tooling/src/_shared/reference-fact.ts` and a probe importing `../../_shared/reference-fact.ts`, but the row's verdict is name-keyed (`resolutionSiteOf` accuses only `BINDING_RESOLUTION_MEMBER_TABLE` members; `resolveModuleMemberOrigin` is not one), so the row passes identically when the planted coordinate does not exist. §6.5's required control ("fixture import specifiers resolve as intended; fail-closure on an unresolved import must not impersonate a tested identity branch") is absent for this family. Pre-existing — the pre-move `../lib/reference-fact.ts` pair was equally unexercised — but `8965f231e`'s message claims the repoint keeps the row "proving against a coordinate that exists", which it does not | §6.5 fixture substrate (missing resolution control) | **OPEN** | Probe on the real file in worktree `agent-af01b4320262b3c85` at `145c48f55`: fixture map key → `tooling/src/_shared/reference-fact-CBV2358-ABSENT.ts`, probe import left at `../../_shared/reference-fact.ts` (unresolvable). Baseline `pnpm check:policy-conformance` = `3868 proof rows · 0 failure(s)`, exit 0; under the probe = `3868 proof rows · 0 failure(s)`, exit 0 — byte-identical. Restored by `mv`, `git status --short` empty. FIX: add one family control (or a row) that goes red when the specifier does not resolve |
| `8965f231e` commit message | cb-v-2358 · commit body, "Floor run and results" | The receipt sentence "the 1 failure (policy-proof-expectations closedAtZero, 29 accused gates) … (grepped: none of the 29 accused modules import reference-fact)" is false in both numbers: the accused set is **30** modules, and `gates/dangling-refs.ts` (`:27` imports `../../_shared/reference-fact.ts`) and `gates/platform-spellings.ts` both reference the family. The inherited CONCLUSION is correct but rests on a different proof than the one recorded | receipt accuracy (a cited grep that does not reproduce) | **OPEN — informational** | `pnpm test:scoped tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` → 30 accused modules listed at `:1030`; `grep -l reference-fact` over those 30 → `dangling-refs.ts`, `platform-spellings.ts`. Inheritance proven instead by set-identity against `reports/runs/structure/main-1553761-2026-09-14T18-05-19-465Z/check-structure.json` (65 violations over the same 30 distinct modules, pre-move) |
| `docs/reviews/gate-runtime/shared-semantic-readers.md` | cb-v-2358 · `:132` | Two markdown links dangle after the move: `[reference-fact.ts](../../../tooling/src/verify/lib/reference-fact.ts)` and `[write and invoked-member alias graph](../../../tooling/src/verify/lib/reference-fact-writes.ts)`. The doc is catalogued `disposition: current`, `authority: normative`, `status: active` and is read-list item 5 of `gate-runtime-read-first.md`, so this is a live navigation path, not a dated measurement. Secondary: `dangling-refs` cannot see it — its document corpora are the design (41) and law (57) lanes plus 2 law-outside-docs files, and the `reviews` lane is not a member, so an active normative reviews doc's links are unenforced | doc truth-rot + gate blind spot | **OPEN** | `ls tooling/src/verify/lib/reference-fact{,-writes}.ts` → "No such file or directory"; catalog entry read from `docs/catalog/catalog.json`; `pnpm check:structure --check dangling-refs --check dangling-ref-citations` → clean, exit 0, corpora sizes as quoted. The third link on the same line (`static-authored-value.ts`) still resolves |
