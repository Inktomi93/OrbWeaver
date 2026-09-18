---
kind: review
status: active
updated: 2026-09-13
---

# Lane `cb-x-test-population` — #2270 · #2267 · #2299 (2026-09-13)

Three commits on `wt/agent-a188faff776f49baa`, branched from `68334c74c`. All three rows LANDED; none
blocked. Two brief premises and one row premise were REFUTED and are recorded below with receipts.

## #2270 — the parked `test-layout` population is a CLASS, not a 57-path roster

**Commit `1dcfc057c`** · `tests/tooling/verify/gates/mirror-index-family.suite.test.ts` (+124 / −80).

Re-derived first: `runPolicyPass(test-layout, empty Project, repoRoot)` = **57 effective findings, 0 tool
errors**, member-for-member the committed `PARKED_TEST_LAYOUT_MISSES`. `cb-v-wave-12b`'s refutation stands
— exact set equality over a population the program grows ~6/day is a false red by construction.

**What replaced it.** The class, derived from what all 57 share (both conjuncts measured, not asserted):

- `message` starts `mirror miss — no source for tooling/src/` — the §4.7 TOOLING arm, never the package
  arm and never `unregistered test kind` / `wrong test home` / `test outside a package mirror`;
- path under `tests/tooling/verify/gates/` — the conversion program's family/wave tests, which drive
  several policy modules and so have no single source module to prefix-swap to. That is the class #2142
  froze.

Everything else is a **named exception earned per member**, and there are two, not one: `catalog-scope.suite.test.ts`
(already named at `183e49714`) and **`tests/tooling/verify/lib/bus-fact-relay.suite.test.ts`** — a concept-named
fact-level control spanning `lib/bus-definition-fact.ts` and `lib/bus-fact.ts`. The verifier's fix spec
proposed absorbing the latter into the class as `tests/tooling/verify/lib/**`; I took the tighter cut
instead, because a `lib/` widening admits any future unmirrored `verify/lib` test with no author deciding
anything — the same silence #2270 was filed about. `git log --all --diff-filter=A` confirms no source has
ever existed at either mirror name.

**The two-sided half.** The EXCEPTION rows, asserted live one by one — an exception is a claim about ONE
path, so a fixed or renamed member reds. A whole-population **floor count was considered and REFUSED**: it
re-introduces the refuted defect in the opposite direction (one legitimate rename inside the class reds it
and the number must be hand-bumped), and a shrinking family class is the revamp arriving, not a defect.
A separate arm asserts the class is non-empty, so when the park empties it says so once and retires.

**Receipts** (`pnpm test:scoped tests/tooling/verify/gates/mirror-index-family.suite.test.ts`, 23/23 EXIT 0):

| control | result |
| - | - |
| tip | 23 passed |
| planted `tests/tooling/verify/gates/cbxtp-probe-family.test.ts` (`export {};`) — the daily-addition case | **23 passed** (the old roster pin went 57 → 58 and redded) |
| planted `tests/tooling/snap/cbxtp-ghost.test.ts` — tooling arm, wrong subtree | **RED**, diff names the path |
| planted `tests/client/features/cbxtp-ghost.test.ts` — package arm, wrong ownership | **RED**, diff names the path |
| bogus exception row (`cbxtp-vanished.test.ts`) | **2 arms RED** — the two-sided half bites |

Four discriminating arms are committed permanently, each driving the gate over an overlay and asking
`inParkedClass` about the finding the gate actually produced (never a hand-written finding record): a new
gates family test is IN; a tooling miss outside the gates subtree is OUT; a package-side miss is OUT; a
`wrong test home` defect AT a gates path is OUT (which is what earns the message conjunct).

**BRIEF PREMISE REFUTED.** The brief's floor said *"`pnpm check:structure --check test-layout` — 0 effective
findings expected on the real tree = the park holds"*. It reports **57 effective, exit 1**
(`reports/runs/structure/agent-a188faff776f49baa-3683658-…`). The #2142 park is a DISPOSITION, not a waiver
mechanism inside the gate; the module's own header and the verifier both say 57. Nothing was fixed to make
it 0 and nothing should be.

## #2267 — `POPULATION_ROOTS` held against the native pnpm workspace

**Commit `26315e791`** · new `tests/tooling/verify/contract/population.test.ts` (+164), header pointer in
`tooling/src/verify/contract/population.ts` (+9).

Re-derived: seven `packages/*` dirs, all with a `package.json`; ten roots. Every workspace member's
`<dir>/src/` IS named by a root today (including `tooling`), so the tree is clean and the defect is purely
the missing enforcer — as the row said.

**No second hand-written package list.** The member set comes from `readPolicyWorkspacePackages`
(`tooling/src/verify/lib/policy-repo-inventory.ts:207`), which shells `pnpm list -r --depth -1 --json` —
pnpm's own resolution of the `packages:` globs, cross-checked against the authored manifest inventory. It
is already the authority `tests/tooling/package-roster.test.ts` trusts for exactly this class of question.

**Why rung 4 and not tsc.** tsc cannot read `pnpm-workspace.yaml`; a gate would need a nineteenth resource
kind and the vocabulary is CLOSED (#1930). The `AUTHORED_MEMBERSHIP` pattern (#1980) covers the OTHER half
— which roots `@authored` MEANS — and is untouched.

**Exclusions are data with a `why`, two-sided.** `MEMBERS_WITHOUT_A_ROOT` = the repo root (`.`, no `src/`);
`ROOTS_WITHOUT_A_MEMBER` = `@tests` and `@scripts` (§12.4's "top-level authored trees"). A row whose subject
no longer exists reds.

**Receipts** (`pnpm test:scoped` over the new test + `population-resolver.test.ts` +
`mirror-index-family.suite.test.ts` = 78/78 EXIT 0; `package-roster.test.ts` green):

- real-tree arm: 0 violations, with a positive control that the member set actually contains `packages/*`
  (an empty enumeration would make the forward direction vacuously green);
- four fixture arms: a member with no root; a root naming a nonexistent package; a root whose path is not
  the member's `src/` (reports BOTH directions); a stale exclusion row on each table.
- **LIVE control, run once and removed:** a real `packages/cbxtp-probe-pkg/package.json` made the real-tree
  arm red with the exact message. `pnpm list` picks an untracked new member up immediately — no install
  needed. **It also mutated `pnpm-lock.yaml`** (`+  packages/cbxtp-probe-pkg: {}`), restored from HEAD;
  `git status --short` clean. That side effect is why the committed arms are fixtures, not live probes.

## #2299 — biome's `scripts/probes` fence: explicit, and the three instruments now agree

**Commit `54b98560d`** · `biome.json`, both nested `.gitignore`s, §12.7 of the standardization doc, the
regenerated read-first SIZE cell, and new `tests/tooling/biome-scripts-probe-scope.int.test.ts` (+147).

**ROW PREMISE REFUTED — and it inverts which instrument is lying.** `pnpm exec biome check
scripts/probes/openrouter/_kit.ts` exits **1**, not 0, printing *"These paths were provided but ignored"*
(biome 2.5.1; `--diagnostic-level=error` also 1; only `--no-errors-on-unmatched` gives 0). Biome REFUSES
LOUDLY on an ignored path. There is no `ESLint.isPathIgnored` false-clean here, so #2290's shape does not
transfer. The lane-standing-facts line *"biome check on a probe … exits as if nothing was wrong"* is stale
for this version and is a proposed memory correction below. **Exit 0 is the EDIT HOOK's spelling**, which is
where the real defect lived.

**CENSUS — the row's "`scripts/probes/**` is ignored by biome" was over-broad by 19 files.** 32 tracked
`.ts` under `scripts/probes`: **19 CHECKED AND CLEAN** (the flat `sdk-*` set, `impersonate/`, all of
`st-goldens/` — so its `biome.json:694` override is live — and `transcript-census.ts`) and **13 invisible**:
the nine under `openrouter/` and the four under `rpg-extraction/`.

**MECHANISM, isolated (the brief's hypothesis was close but not the operative half).** Neither directory is
gitignored at the repo root and both are tracked; the exclusion comes from each one's OWN directory-local
`.gitignore` starting `*/`, which biome honours through `vcs.useIgnoreFile: true` while **not honouring its
negations** — `rpg-extraction`'s `!*.ts` was inert. The edit hook disagreed because
`tooling/biome.edit.jsonc`'s `files.experimentalScannerIgnores: [… "scripts" …]` **suppresses nested
ignore-file discovery**. Isolated by driving an otherwise byte-identical extends-root config with the
scanner ignores removed: `Checked 0 files`, exit 0 — so the scanner ignore is the whole delta.

**DECISION: deliberately uncovered, with the mechanism made honest.** These are hand-driven one-shot wire
probes whose `RESULTS.md` is the deliverable; the constitution excepts throwaway scripts and dev tooling
(§0.1 tripwire 2). What was wrong was not the exemption but that it rode another tool's ignore semantics
where no instrument could see it and a third instrument disagreed. So the fence moved into `biome.json`
`files.includes` as `!scripts/probes/openrouter` and `!scripts/probes/rpg-extraction`, which
`biome.edit.jsonc` inherits by `extends`. **No rule was disabled and nothing is labelled checked-clean.**
The two `.gitignore` headers now say the biome half is NOT theirs and point at the new home.

**Where the reason and END CONDITION live so an instrument sees them.** Neither `biome-grant-liveness`
(override `includes`) nor `config:biome-rule-liveness` (rule-off grants) has `files.includes` in its
population, so nothing in the gate corpus holds the two new rows live. The new test is their keeper: each
row must be declared in `biome.json`, each fenced directory must still hold tracked TypeScript, each row
must carry a non-empty `why` and `endsWhen`, and both configs must agree. §12.7's fence table and the
paragraph after it now carry the census and the corrections.

**Receipts:**

| instrument | before | after |
| - | -: | -: |
| `pnpm check:biome-rule-liveness` | 18 live · 0 dead · 23 probed · exit 0 | **identical** |
| `pnpm check:structure --check biome-grant-liveness` | raw 1 = granted 1 + effective 0 · exit 0 | **identical** |
| root config on `_kit.ts` | Checked 0 files | Checked 0 files |
| edit-hook config on `_kit.ts` | **Checked 1 file, 15 errors** | **Checked 0 files** |
| both configs on `impersonate/run.ts` (control) | Checked 1 file | Checked 1 file |

**Red-first, against the pre-fix `biome.json`** (`cp`-backed, restored): the declaration arm reds naming both
rows, and the agreement arm reds with **`expected 13 to be +0`** — the exact 13-file disagreement the row
names. Suites: the new test plus `biome-grant-liveness.int`, `grant-liveness-family`,
`ops/biome-rule-liveness`, `biome-check-hook.int`, `biome-browser-globals.int`,
`no-blanket-suppression.repo.int`, `suppressions-family` = 60/61. The one red is
`biome-check-hook.int > planner failure and admission contention` timing out at 5091 ms under 8-file
parallel load; **11/11 alone, EXIT 0**, it uses a stubbed `pnpm` and a fixture checkout and cannot see
`biome.json`. Not my change.

**Second brief premise refuted:** `pnpm check:structure --check config:biome-rule-liveness` exits **3**
(misuse) — it is a verify STAGE, not a structure policy. Its door is `pnpm check:biome-rule-liveness`.

## Deviations, with receipts

1. **Edited outside my declared fence:** `docs/design/gate-runtime-standardization.md` §12.7 only — the
   biome row's `fenced by` cell (line ~2045) and one new paragraph after *"the gate corpus is NOT inflated
   by worktrees."*. That is #2299's "record it where the §12.7 fence table can see it" half. Announced by
   SendMessage with the hunk regions before commit. I did **not** run `pnpm format:docs` on it; the doc was
   formatted at HEAD, my paragraph broke one line (a line-initial `#2299`), and I fixed **that line only**,
   verified with a scratch-copy format diff showing exactly one differing line.
2. **`docs/design/gate-runtime-read-first.md` SIZE cell regenerated** —
   `baseline read-first-costs` went `223 KB → 225 KB` for row 1 only, because my §12.7 paragraph changed the
   priced document. The generator derives from the 8 named docs; on the merged tree the barrier still owes a
   re-derive if a sibling also edited one of them.
3. **`pnpm check:docs` (whole-tree) is RED at baseline** — 161 unformatted files and 2 REFUSED
   (`refutation-ledger-2026-09-12.md`, `v-fix-wave-4-2026-09-12.md`, bare-backtick #2235). Pre-existing;
   my two docs pass `format --check` scoped and I did not touch the others.
4. **Banned commands honoured:** no bare `check:structure`, no `pnpm check`, no whole-tree
   `lint:eslint`/`biome check .`. The only structure runs were bounded `--check <one policy>`.

## LEDGER ROWS (5 rows)

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `biome.edit.jsonc` / the edit hook | cb-x-test-population · `tooling/biome.edit.jsonc:13` · `.claude/hooks/biome-check.sh:154-157` | `files.experimentalScannerIgnores` SUPPRESSES nested `.gitignore` discovery, so the edit hook linted 13 files the shipping `lint:biome` stage never visits and reported 15 errors on `_kit.ts` — a hook accusing a path the gate does not judge | instrument disagreement / false positive | **FIXED — #2299** (`54b98560d`) | isolated by driving an extends-root config with the scanner ignores removed → `Checked 0 files` exit 0; red-first against the pre-fix `biome.json` → `expected 13 to be +0`; after → both configs `Checked 0 files`, control `Checked 1 file` |
| biome scope (`vcs.useIgnoreFile`) | cb-x-test-population · `scripts/probes/openrouter/.gitignore:7` · `scripts/probes/rpg-extraction/.gitignore:4` | biome reads NESTED ignore files but drops their NEGATIONS, so `rpg-extraction`'s `!*.ts` was inert and a deliberate lint exemption rode another tool's semantics where no instrument could see it. §12.7's fence table named only `useIgnoreFile` + `"!.claude"` | undeclared fence / doc incompleteness | **FIXED — #2299** (`54b98560d`) | census 32 tracked `.ts` = 19 checked-and-clean + 13 invisible, per-file drive; fence now two explicit `files.includes` negations kept live by `tests/tooling/biome-scripts-probe-scope.int.test.ts`; §12.7 row + paragraph corrected |
| `biome` CLI contract | cb-x-test-population · row text of #2299 · `.claude/rules/lane-standing-facts.md` §Tool hazards | the recorded claim "biome exits 0 on an ignored path / exits as if nothing was wrong" is FALSE on biome 2.5.1 — a bare scoped `biome check <ignored>` exits **1** with "These paths were provided but ignored". Exit 0 requires `--no-errors-on-unmatched`. A lane trusting the recorded claim mis-diagnoses which instrument is lying | stale recorded fact | **OPEN — none** (rules-file edit is not a lane's) | three measured spellings: bare → 1, `--diagnostic-level=error` → 1, `--no-errors-on-unmatched` → 0; `pnpm exec biome --version` = 2.5.1 |
| `POPULATION_ROOTS` | cb-x-test-population · `tooling/src/verify/contract/population.ts:4-21` | the hand-typed root table had no enforcer against the workspace: a new `packages/foo` joins no root, is admitted by no population, is judged by no policy, and no instrument reports it | missing enforcer | **FIXED — #2267** (`26315e791`) | live control `packages/cbxtp-probe-pkg/package.json` → real-tree arm red with the exact message (and pnpm re-resolved `pnpm-lock.yaml`, restored from HEAD); four committed fixture arms cover both directions plus stale-exclusion liveness |
| `mirror-index-family` / `verifyPolicyProofs` | cb-x-test-population · `tests/tooling/verify/gates/mirror-index-family.suite.test.ts:46-48` | the file's first assertion drives `verifyPolicyProofs` over THREE policies against vitest's 5 s default with no explicit timeout: 2.8 s alone, **8.5 s under a 3-file scoped run and 5.9 s cold**, so it times out whenever it shares a runner. Pre-existing (reproduced before any edit of mine) and it reds where nobody looks — `tests/tooling/**` is `--full`-only (#1842) | load-sensitive instrument / false red | **OPEN — none** | 3-file run `× the mirror-index family keeps its two-sided proofs 8505ms` exit 1, alone `✓ 2769ms` 23/23 exit 0; same shape on the very first pre-edit run (5920 ms vs a 5077 ms timeout). Same class as `biome-check-hook.int > planner failure and admission contention` (5091 ms under 8-file load, 11/11 alone) |

ledger rows OWED: 5

## Proposed lessons (report text only — the orchestrator owns the memory write)

1. Index entry — `- [biome refuses an ignored path](biome-ignored-path-refuses-not-clean.md) — biome check
   on an ignored path EXITS 1, not 0; only --no-errors-on-unmatched gives 0, and that is the edit hook's
   spelling.` Corrects the standing `lane-standing-facts` hazard line, which was
   written from the `features/__probe` case and generalized wrongly. Body: biome 2.5.1, three spellings
   measured; the false-clean risk in this repo belongs to the HOOK's flag, not to biome's default. Also:
   biome honours NESTED `.gitignore` files and ignores their NEGATIONS, and
   `files.experimentalScannerIgnores` suppresses nested ignore-file discovery entirely — which is how two
   configs that `extends` each other can disagree about whether a file exists.

2. Index entry — `- [live workspace probe rewrites the lockfile](workspace-package-probe-mutates-lockfile.md)
   — planting a real packages/<x>/package.json to control a workspace instrument makes the next pnpm run
   write that member into pnpm-lock.yaml.` Body: `pnpm list -r` sees an untracked new member
   immediately (no install), so the probe works — but any `pnpm` invocation in the same worktree re-resolves
   the workspace and mutates the tracked lockfile. Restore with `git show HEAD:pnpm-lock.yaml >
   pnpm-lock.yaml` (never `git checkout`), and prefer FIXTURE arms over a live member for the committed pin.

3. Index entry — `- [set pin over a growing population](exact-set-pin-over-growing-population.md) — an
   enumerated real-tree roster reds on every legitimate addition; pin CLASS + named exceptions instead.` Seconded from
   `cb-v-wave-12b`, with the shape that worked: a predicate function driven over BOTH the real tree and
   overlay fixtures, exceptions as `{file, why}` rows asserted LIVE, and an explicit refusal of a floor count
   (it re-introduces the same brittleness inverted).

4. Index entry — `- [a fence needs a keeper nothing else owns](files-includes-negation-has-no-liveness-gate.md)
   — a biome.json files.includes negation is in NO gate's population.` `biome-grant-liveness` reads OVERRIDE
   `includes`; `config:biome-rule-liveness` reads rule-off grants. Adding a top-level fence therefore owes its
   own committed two-sided test or it is a permanent unwatched amnesty.

## Primary integration receipt

Integrated at `94830a655`: `1dcfc057c` became `6049dcded`, `26315e791` became `007f8732a`, and `54b98560d` became `94830a655`. All seven final source/config/test blobs match the reviewed branch byte-for-byte. The mirror conflict removed the later CSS family entry with the superseded roster; the class predicate covers it without another named row. The obsolete branch-local read-first size cell was omitted; aggregate regeneration remains a coordinator barrier task. The §12.7 correction is preserved.

Independent source review accepted the implementation and its committed controls. Current-main focused behavioral execution remains owed while the coordinated browser slot is active. The two open report findings remain open; no builder-only result is an integrated verification claim.
