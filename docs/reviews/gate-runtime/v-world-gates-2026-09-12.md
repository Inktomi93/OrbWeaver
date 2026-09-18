---
kind: review
status: active
updated: 2026-09-12
---

# Verifier pass: the world-program (#1351) gates inside #1584 — lane `cb-v-world-gates`

Fresh-context, read-only. Every claim below is a tree read or a run I performed in this session; no claim
is inherited from a document. Where a document disagrees with the tree, the tree wins and the disagreement
is filed as a ledger row.

## 0. Roster, re-derived (the receipts every later section rests on)

```text
$ pnpm -s gate:contract
gate-contract: 421 finding(s) across 297 gate module(s)

$ pnpm -s check:policy-conformance
policy-conformance: 237 final policies · 2640 proof rows · 0 failure(s) · 131 grant rows (whole table)
                  · 0 invalid · 27005ms (corpus: 297 module(s), 60 legacy proven by gate-conformance)
```

**60 legacy modules, 237 final, 297 total.** The `descriptor-wrapper` findings in `gate:contract` name
exactly those 60; a `export const gate: GateDescriptor` grep returns 61 and overcounts by one
(`diagnostic-legibility.ts:140` is a FIXTURE STRING inside a final module — the comment/string hazard,
caught here in its own habitat).

All seven brief-named legacy subjects CONFIRMED legacy; all four brief-named FINAL subjects CONFIRMED
final, including `runner-config-path-liveness` (`gates/runner-config-path-liveness.ts:343` is
`export const gate = defineGate({`).

**World-program citation sweep over the 60 legacy modules** (two methods: issue-number/phrase grep for
`#1351|#1862|#1892-#1897|type-worlds|world program`, then a reader-name grep for `test-kinds|
project-worlds|type-config-intent|program-routing|config-snapshot|tests-*-membership|
policy-program-membership|stryker-config|ct-view|browser-contract-reader|mirror`; 60 modules scanned,
0 skipped): the world-program-touching legacy set is exactly **`test-layout`, `test-presence`,
`test-presence-client`, `tsconfig-entry-liveness`**. No other legacy module cites the world program.
`biome-grant-liveness`, `no-blanket-suppression` and `suppressions` are in scope for other reasons
(config liveness / the suppression grammar), not as world-program carry-forwards.

## A. §12.7 world-program guarantees — per row, against today's tree

Every suite named "GREEN" below was executed by me in this session through `pnpm test:scoped` from this
worktree; per-file pass counts are read out of the run's own `reports/runs/test/<slot>/test-report.json`,
not from scrollback. Five slots: `…-2645987-…`, `…-2652664-…`, `…-2658840-…`, `…-2672011-…`,
`…-2673172-…`, plus `…-b6/b7/b8` runs cited inline.

| # | Guarantee | Owner(s) on the tree | Status | Required proof — exists? green? | Prohibition check |
| -: | - | - | - | - | - |
| 1 | Test-kind registration + source mirroring | `_shared/test-kinds.ts:1`; `gates/test-layout.ts:153` | test-kinds = shared data · **test-layout LEGACY** | **PARTIAL.** `tests/tooling/_shared/test-kinds.test.ts` GREEN (4/4) proves kinds keep distinct meaning. The **"unsupported test-shaped names fail, including in helper trees"** half is proven ONLY by `test-layout`'s own `mustFlag[1]` (`tests/support/shape.ct-d.ts`), which for a LEGACY descriptor executes only inside `gate-conformance.repo.int.test.ts` — orchestrator-only, NOT RUN by me. `check-gates.repo.int.test.ts:221` plants ONE test-layout fixture (mirror-miss) and no helper-tree case. **There is no `tests/tooling/verify/gates/test-layout*` file at all.** | n/a |
| 2 | Presence + mutation/execution population semantics | `gates/test-presence.ts:467`, `gates/test-presence-client.ts:278`, `ops/tests-execution-membership.ts`, `lib/ct-view.ts`, `mutation-probe/lib/mirror.ts` | both gates **LEGACY**; ops/lib final | **GREEN.** `test-presence.repo.int.test.ts` 14/14 · `test-presence-client.int.test.ts` 20/20 · `tests-execution-membership.int.test.ts` 5/5 · `mutation-probe/lib/mirror.test.ts` 5/5 | "native collection stays independent" honoured — execution membership is its own op |
| 3 | Current source ownership + exact grant identities | client moves `1a77f8d83` (session/appearance), `370243fe7` (rendered components), `b849e7add` (forms/editor, #1861); enforced by `lib/sanctioned-home.ts` + per-gate grant tables | mixed | **PARTIAL.** `check:policy-conformance` GREEN reports **131 grant rows (whole table) · 0 invalid** — that is the FINAL-side reviewed-grant liveness. The LEGACY side (the 25 `SANCTIONED_HOMES` tables / 42 rows) is judged only by `pnpm check:structure`, which the brief forbids me. | "no stale old-path permission survives" UNMEASURED by me on the legacy half |
| 4 | Actual compiler roots + post-transform diagnostics | shared compiler reader + codemod (`708e709a1`, `f2d3f1ddc`) | final | **GREEN.** `tests/tooling/codemod/lib/program-diagnostics.int.test.ts` 42/42 | — |
| 5 | Shared file routing + independent native parity | `lib/program-routing.ts`, `ops/tests-type-membership.ts`, the post-edit hook (`dc8ccbd0b` / #1893) | final | **GREEN.** `program-routing.test.ts` 6/6 · `program-routing.int.test.ts` 3/3 · `tests-type-membership.test.ts` 18/18. Live stage: `pnpm -s check:type-ownership --json` **exit 0**, 7 501 rows, 11 programs, `testEscapees=0 libLeaks=0 unknownPrograms=0 closureLeaks=0 routingParityViolations=0` | — |
| 6 | Native executable-config observations | `ops/config-snapshot.ts`, `gates/runner-config-path-liveness.ts:343` | **FINAL** | **GREEN.** `config-snapshot.int.test.ts` 24/24 · `runner-config-path-liveness.int.test.ts` 4/4 (incl. the REAL-repository-root arm) | **HONOURED.** Declares `{kind:"native-config",id:"vitest"}` (`:356`) — the loader observation, not interpreted JS; playwright/ct ride the preserved `static-config` evaluator (`:357-358`). Exact containment `status === "outside"` (`:259`), file-vs-directory `FILE_ONLY_FIELDS` (`:267`), globs a declared, visible skip (`:45`) |
| 7 | Predictive ownership + ambient/library closure enforcement | `ops/tests-type-membership.ts`, `_shared/type-config-intent.ts` (#1896) | final | **GREEN.** `tests-type-membership.test.ts` 18/18 · `verify/ops/gen/type-configs.test.ts` 7/7; live stage exit 0 as row 5 | **HONOURED both ways.** `gates/tsconfig-routing-parity.ts` does NOT exist (not resurrected), and its successor IS present and armed — the stage emits a `routingParityViolations` key (empty today) |
| 8 | Native ESLint scoped grant populations | `ops/config-snapshot.ts`, `gates/eslint-grant-liveness.ts:91` | **FINAL** | **GREEN.** `eslint-grant-liveness.int.test.ts` 2/2 including `"the REAL repository root: this hard policy resolves and runs to a receipted, successful owner"` · family conformance `grant-liveness-family.suite.test.ts` 2/2 (10.63 s) | **HONOURED.** No `config-static-read` import — the former static evaluator is NOT restored; the module reads `EslintSelectorSnapshot` through `readyResourceValue` on `{kind:"native-config",id:"eslint"}` (`:100`). **But see D-3: it still carries a gate-owned `RATIFIED` `ExemptionTable` (`:21`) that SUPPRESSES findings at `:72-74`** |
| 9 | Unified native type execution | `ops/typecheck.ts`, `lib/registry.ts`, `scripts/ts7.cjs` | final | **GREEN.** `typecheck.int.test.ts` 8/8 · `registry.test.ts` 8/8 · `registry.int.test.ts` 2/2. Live: `pnpm typecheck` **exit 0 in 28 s**, "11 discovered, 11 runnable", all 11 PASS | "do not restore removed graph/browser stage flags or aliases" — no such flag observed in `ops/typecheck.ts` |
| 10 | Native mutation config composition | `_shared/stryker-config.ts` (#1897) | final | **GREEN.** `_shared/stryker-config.test.ts` 2/2 (purity: importing cannot mutate the base Vitest config) | "a native dry run NEVER substitutes for mutation-score calibration" — no dry-run-as-calibration on the tree |
| 11 | Native snapshot startup cost | `ops/config-snapshot-entry.ts` (29 lines), `lib/config-snapshot.ts` | final | **PARTIAL.** `config-snapshot.int.test.ts` 24/24 GREEN preserves JSON/error/root semantics and loader controls. The row's **"108-test native regression set"** does not exist as any single suite I could locate; the closest total across every config-snapshot-adjacent suite I ran is 97. **The RSS/latency numbers (1.75 s / 435 MB → 0.55 s / 154 MB) are a dated manual measurement with no committed pin.** | narrow private worker still in place (`config-snapshot-entry.ts` is a 29-line entry, not an eager op import) |
| 12 | Browser contracts require the real DOM world | `gates/test-world-browser-contracts.ts:57`, `lib/browser-contract-reader.ts` | **FINAL** | **GREEN.** `test-world-browser-contracts.repo.int.test.ts` 11/11 | **HONOURED, migration DONE.** Its header records the successor explicitly: the legacy `runPass`/`GateDescriptor` driver is replaced by `runPolicyPass` over the same real `getWorkspace()` project "with no live-tree fixture-writer sentinel". Unreadable-origin refusal preserved (`isNodeTestContractRoot` inside the shared visitor) |
| 13 | Pass-local semantic reader performance | `lib/pass.ts`, `lib/reference-fact.ts` (`763ddf019`) | final | **GREEN.** `pass.test.ts` 2/2 · `reference-fact.test.ts` 23/23 | — |
| 14 | Fresh type verdicts | `scripts/ts7.cjs`, both Vitest type projects (`7d9cd503e` / #1892) | final | **SPLIT.** Half (b) "long and short forced incremental flags cannot bypass the wrapper" is **GREEN and committed**: `tests/tooling/_shared/concurrency-profile.test.ts:309-364` 16/16 covers `--incremental`, `--incremental=…`, `-i`, `-I`, `--tsBuildInfoFile` in both forms, plus malformed refusals. Half (a) **"warm/changed/restored produce green/red/green without deleting caches" has NO committed regression pin** — `git show --stat 7d9cd503e` shows it landed as a dated manual receipt in `docs/…/2026-09-08-typecheck-directive-freshness.md`, and no test on the tree replays it | — |
| 15 | Owned fixture resources | `check-gates.repo.int.test.ts`, `gate-ignore-grammar.repo.int.test.ts`, `tests/server/entry/lifecycle.int.test.ts` | mixed | **PARTIAL.** `lifecycle.int.test.ts` 2/2 GREEN. **The two repo suites are ORCHESTRATOR-ONLY and I did not run them.** §12.7's own closing paragraph concedes the two legacy fixture writers still share paths and are not claimed isolated | — |
| 16 | Honest abnormal-run artifacts | `tests/tooling/verify/ops/structure.int.test.ts` (#1862, `c8ff56723`) | final | **GREEN.** `structure.int.test.ts` 8/8 (incl. "a gate that THROWS AT LOAD leaves the in-flight stub, not a stale verdict") | — |

**Net: 10 rows fully green and verified by me, 5 partial, 1 (row 14) green on one half and unpinned on the
other. No row is REFUTED.** The world program's guarantees are, on the evidence I produced, intact.

## B. The seven legacy gates — what each judges, what it carries, and its conversion route

Every "shipped today" claim below cites the contract, the host door, the policy binding, the validation
arm and the provider — five sites, because a kind wired at four of five is not a route.

### B.1 `test-layout` — `tooling/src/verify/gates/test-layout.ts:153`

- **Judges** (verified against the code, not the header): four arms — unregistered test-kind suffix
  (`:36-42`), `.spec.ts` outside `tests/e2e` (`:48-54`), package mirror miss (`:89-96`), and the §4.7
  tooling mirror (`:101-131`). Suite kinds and `tests/{support,e2e}` are exempt by shape.
- **Authority notation:** none. It appears in NO row of `uncovered-gate-conversion-census.md` (it is in
  the 53-gate resource cohort, `resource-gate-access-patterns.md:79`) and in NO row of
  `exception-authority-census.md`. **It carries no exemption table, no baseline, no marker grammar, no
  private parser.** Its only gate-owned machinery is filesystem: `existsSync` ×4 (`:29` twice, `:113`,
  `:123`) and one `readdirSync(recursive)` (`:140`).
- **Route — the `mirror-index` kind, and it genuinely serves what the gate reads.** I checked the
  candidate against the code rather than the name:

  | What the gate reads | `MirrorIndex` member | Family |
  | - | - | - |
  | `readdirSync(tests, recursive)` (`:140`) | `testFiles` | `package-test` (testRoot `tests`) |
  | `packages/<pkg>/src/<sub>/<base><ext>` (`:27`) | `sourceFiles` | `package-test` |
  | `…/<base>/index<ext>` (`:28`) | `sourceFiles` (an index IS a file member) | `package-test` |
  | `existsSync(tooling/src/<toolDir>)` — a **DIRECTORY** (`:113`) | `sourceDirectories` | `tooling-test` |
  | `tooling/src/<sub>/<base>.ts` + its index (`:121-122`) | `sourceFiles` | `tooling-test` |

  `contract/resource-mirror.ts:44-45` publishes `sourceDirectories` with the comment *"`test-layout`'s
  §4.7 arm asks about a DIRECTORY"* — the kind was designed for this gate.
- **Shipped end to end today:** `contract/resource-mirror.ts:28` (`MIRROR_FAMILY_DEFINITIONS`) ·
  `contract/resource-host.ts:31` (the door) · `lib/resource-policy.ts:126` (the binding) ·
  `lib/policy-validation.ts:246` (the id vocabulary) · `ops/resource-mirror.ts:47` (`loadMirrorIndex`) ·
  proofs `tests/tooling/verify/ops/resource-mirror.test.ts` 4/4 GREEN (ready · missing-vs-missing-tree ·
  the tooling family's own bounds · unknown-family refusal). Both source trees exist as closed ids:
  `AUTHORED_TREE_PATHS.packages`, `.tests`, `."tooling-slot"` (`contract/resource-tree.ts:8,12,13`).
- **Grant-home migration:** none owed.
- **Split:** none. All four arms are one authority. Every finding anchors on `tests/${rel}` — a file that
  EXISTS (the test is present; the SOURCE is what is missing), so §3's absent-subject throw does not
  apply. Findings are file-anchored with a synthetic `column: 0`, which per §3 means **no ordinary door
  exists by construction → `authority: "hard"` is the honest declaration**, and the header owes a
  sentence saying the legacy gate never had a waiver door either (it declares none today).
- **Verdict: fully routable on shipped capability. No build prerequisite.** This is the cheapest of the
  seven and it is the one that WIRES `mirror-index` — see D-6.

### B.2 `test-presence` — `tooling/src/verify/gates/test-presence.ts:467`

- **Judges:** seven arms over `packages/server/src` + `packages/contracts/src` (verb, persistence,
  contract schema, shared contract, infra/foundation, workloads runner, and the #767/#773
  demand-by-default domain + entry/transport arms), plus two blindness tripwires (`:487`, `:491`) and a
  shrink-only baseline with a stale arm (`:445-461`).
- **Authority notation:** `B` (baseline). Carries `test-presence.baseline.json` — **2 debt rows**,
  `exception-authority-census.md:135` ties them to board item **#772**.
- **Gate-owned machinery:** `existsSync` mirror probe (`:82`), `project.getSourceFiles()` (`:385`, a
  §12.3-forbidden direct walk), `readBudgetRows`/`writeBudgetLedger`, and an exported `writeBaseline`
  single writer (`:432`) driven by `cli.ts baseline test-presence`.
- **Route:** `mirror-index` (`package-test`) replaces `hasTest`'s `existsSync`; the `getSourceFiles`
  walk inverts into kind-indexed visitors with cross-file reasoning in `evaluate`; the two blindness
  tripwires survive as `evaluate` guards (`fileLoaded(REAL_TREE_ANCHOR)` becomes population membership).
- **BUILD PREREQUISITE — the baseline's work item is DEAD.** `gh issue view 772` → **CLOSED**
  ("test-presence DEBT burn-down … shrink the baseline to zero"), and I verified both rows are still
  LIVE debt: `packages/server/src/domain/chat/substrate/assembly-access.ts` and `…/turn-access.ts` both
  exist and `tests/server/domain/chat/substrate/` contains no mirror for either. §12.5 retires
  `*.baseline.json` to "a fix, an exact grant, or `workItem` warning debt", and §3 requires `workItem` to
  be a POSITIVE issue number on a `warning`. A closed issue is not one. So the conversion needs either
  the two tests written (two files — cheapest) or a freshly minted work item. **Do not let a lane carry
  \#772 forward.**
- **Split:** not recommended. The stale/shrink arm reports at `GATE_SELF` and exists only to police the
  baseline; it retires WITH the baseline rather than becoming a `-health` sibling.

### B.3 `test-presence-client` — `tooling/src/verify/gates/test-presence-client.ts:278`

- **Judges:** clause A (per-file mirror for `data/`, `forms/`, `forms/editor/`, `state/` direct children),
  clause B (any test in the mirror DIRECTORY, for seven `@orb/ui` logic groups), clause C (every exported
  store action referenced BY NAME in the mirror's TEXT, plus the shared `_ct-stories.tsx`), the clause-C
  unreadable-corpus tripwire (`:207`), and the standing worst-legal-art CT check (`:268`).
- **Authority notation:** no exemption table, no baseline. Its exclusion lists (`CLIENT_EXCLUDE_NESTED`,
  `CLIENT_EXCLUDE_FILES`, `UI_LOGIC_GROUPS`) are population vocabulary, not grants.
- **Gate-owned machinery:** `existsSync`, `readdirSync(mirrorDir)` (`:164`), **`readFileSync` of test
  files** (`:200`) fed through `blankTsCommentsAndStringsInText`, and `project.getSourceFiles()` (`:249`).
- **Route — two kinds, and the pairing is legal:**
  - clause A → `mirror-index.sourceFiles` / `.testFiles`; clause B → `mirror-index.testsByDirectory`
    (`contract/resource-mirror.ts:49`, which exists precisely because "`test-presence-client` needs the
    LISTING of one mirror directory", `:17-18`).
  - clause C → the **`authored-text` DEMAND kind**. I verified the acquisition chain rather than assuming
    it: `ops/resource-mirror.ts:88-89` returns every source+test path in the fact's `paths`;
    `ops/resource-host.ts:54-57` records those into `acquiredPaths`; `ops/resource-host.ts:217` serves a
    demanded path only when it is in that set. The per-policy fence
    (`lib/resource-policy.ts:76-83`, `fencedText`) is satisfied because the SAME policy declared the
    mirror. `contract/resource-text.ts:15-16`'s rule that `authored-text` needs "at least one
    path-bearing sibling" is satisfied: `mirror-index` is NOT in the UNPOPULATED tuple.
  - The comment+string blanking stays where it is (`lib/comment-spans.ts#blankTsCommentsAndStringsInText`)
    — a shared reader, which §12.3 explicitly permits.
  - `tests/client/state/_ct-stories.tsx` is a test-space file, therefore in `testFiles`, therefore
    acquired, therefore demandable. No special case.
- **THE ONE NON-MECHANICAL HAZARD:** the worst-art arm reports at
  `tests/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx` **when that file is
  MISSING**. Under the final contract `ctx.report.file` REFUSES a path outside the effective population,
  so this arm becomes a runtime THROW on conversion (guide §3, the "absence verdict cannot anchor on its
  own subject" class). It must consume `lib/absent-subject-anchor.ts#subjectAnchor` (verified present,
  `:26`) and move the missing filename into the message. Brief this by name or the lane will ship the
  throw.
- **Split:** clause C's tripwire (`MSG_STATE_UNREADABLE`) is a blindness verdict about the INSTRUMENT,
  not about the subject — a candidate `-health` sibling if a lane wants the authorities separated, but
  all arms are hard today and a single hard policy is defensible.
- **Verdict: fully routable on shipped capability. No build prerequisite.**

### B.4 `tsconfig-entry-liveness` — `tooling/src/verify/gates/tsconfig-entry-liveness.ts:373`

**CONFIRMED, not redone** (brief instruction). The module's own header carries the #2013 re-derivation
dated 2026-09-12 (`:31-46`) and I spot-verified its two load-bearing claims:

- the one-consumer measurement holds — `tsconfig-entry-liveness.ts:233` is the corpus's only JSONC parse;
- `tsconfig-routing-parity.ts` does not exist on the tree, and the membership stage carries the successor
  `routingParityViolations` check (row 7 above), so the "superseded" theory that #2021's first comment
  advanced and its second comment retracted IN FULL is correctly retracted: the DEAD-EXCLUDE and
  PATTERN-LIVENESS arms are held by nothing else.

**One refinement to #2021's disposition comment, and a lane will trip on it.** The comment says the gate
"converts against `json`/`authored-path`/`tracked-files` per §12.4". `authored-path` and `tracked-files`
are right. **`json` is NOT** — its closed id set is exactly five (`contract/resource-json.ts:35-47`:
`biome`, `migration-journal`, `tokens`, `doc-catalog`, `baseui-manifest`) and carries no tsconfig member;
adding one is a contract edit with a named consumer, but the RAW `include`/`exclude` entries with line
identity are precisely what §12.4 residual 2 rules must come from the shared compiler reader instead. A
lane reading the comment literally will hunt for a `json:tsconfig` id that cannot exist. **The config read
is the SHARED-READER build, not a `json` declaration.**

- **Grant home:** the 4-row `EXEMPT`/`RATIFIED` pair (`exception-authority-census.md:100` counts
  `:53,80`) migrates to reviewed grants keyed `(policy, subject, operation)`.
- **Split:** the BUDGET arm (`CONFIG_DIR_BUDGET`, `:96`) is a count ratchet, which §12.5 forbids outright.
  It is not an authority split — it is an arm that must be RETIRED or restated as an exact grant set.

### B.5 `biome-grant-liveness` — `tooling/src/verify/gates/biome-grant-liveness.ts:355`

**This is the gate whose conversion is mispriced everywhere it is written down.**

- **Judges SIX arms:** DEAD exact grant · MISSING-CONFIG · UNPARSEABLE-CONFIG · NO-ROWS tripwire ·
  the two-sided EXEMPT arms · **and arm six, RULE LIVENESS (#1158)**.
- **Arms 1-5 route cleanly and today:** `{kind:"json", id:"biome"}` is a shipped closed id
  (`contract/resource-json.ts:37`) and `{kind:"tracked-files"}` serves the pattern half through the
  preserved `lib/grant-liveness.ts` classifiers. Both proven: `resource-json.test.ts` and
  `resource-tracked.test.ts` GREEN in my `b6` run (18/18 across four resource suites).
- **Arm six has NO route, and no document records this.** `lib/biome-rule-liveness.ts` does two things
  the final contract forbids outright and no frozen kind serves:
  1. **`writeFileSync(probeAbs, …)` at `:284`** — it WRITES `__g_biome-rule-liveness.<pid>.json` into
     the REPO ROOT (deliberately, per its own header `:11-15`: with `--config-path` outside the repo,
     biome relocates its project root and answers a different question), then `unlinkSync`s it at `:296`.
     §3's non-negotiables ban a gate-owned filesystem READ; a WRITE into the shared tree at every
     `check:structure` is strictly worse and is not even enumerated as a prohibition because nobody
     expected one.
  2. **`runNicedSync` spawn of `node_modules/.bin/biome`** (`:169` guards the binary, the run follows) —
     an external-process execution. The only shipped subprocess kinds are `native-config` (eslint
     `ConfigArray`, depcruise) and `tracked-files` (`git ls-files`). §12.7's own biome row is explicit
     that **"No loader exists and none is coming"** for biome.
- **Consumer count, measured:** `pnpm ast importers tooling/src/verify/lib/biome-rule-liveness.ts` →
  **2 hits in 2 files** (scanned 7 483, skipped 0): the gate itself and its own test. **ONE production
  consumer.** By §11.5 that is a private reader; by the 2026-09-12 "convert or delete" ruling the outcome
  is BUILD-or-DELETE, and a capability that writes into the repo root is not one this program should
  build. **My recommended default: SPLIT — convert arms 1-5 as a final policy on `json`+`tracked-files`,
  and take a ruling on arm six separately (delete it, or move it out of the gate corpus into a `verify`
  OP that runs on its own tier, where a subprocess and a scratch file are legal).**
- **§12.4's "three residuals, closed" does not name this.** Residual 1 is the staged blob, residual 2 is
  `jsonc`, residual 3 is `authored-text`'s provenance. A repo-root write + a lint-binary spawn is an
  UNRECORDED fourth. See D-1.

### B.6 `no-blanket-suppression` — `tooling/src/verify/gates/no-blanket-suppression.ts:463`

**The fork the brief asked me to state, with a default. I do not rule it.**

- **Judges** three arms over one shared directive reader (`lib/suppression-directive.ts#readDirectiveComment`):
  A the harness TS/TSX fileset · B every other file biome lints, from the tracked corpus · **C the GIT
  INDEX** — `git grep --cached` candidates re-judged from their STAGED blobs via `git show :<path>`
  (`:354`, `:366`), which is the whole #954 defence: a stale staged blob cannot commit while every
  working-tree check reads clean.
- **Authority notation:** `MI` — `markerImmune: true` (`:468`). No allowlist, no baseline. Per §7's
  marker table, `markerImmune` "deletes with `GateDescriptor`" because a hard policy has no parser door by
  construction, so the MI half is free.
- **The refusal is NARROWER than §12.4 residual 1 describes, and the module already says so.** Its own
  re-derived header (`:26-38`, dated 2026-09-12) records that **arms A and B are no longer blocked** —
  `tracked-files` serves arm B's corpus and `authored-text` serves its comment-aware text. **ARM C ALONE
  is the blocker.** I re-derived the one-consumer count independently: the only other `--cached` uses
  under `tooling/` are `snap/ops/stage-source.ts` (`ls-files --cached --others`) and
  `doc-catalog/ops/tree.ts` (`diff --cached --name-only`); neither reads a staged BLOB. §12.4's reopen
  bar (two independent consumers) is unmet.
- **THE FORK.** §12.4 residual 1 rules the whole module stays legacy because its staged-blob read serves
  one gate. That ruling is dated 2026-09-11 and predates the 2026-09-12 "NOTHING GETS TO REFUSE TO
  CONVERT — convert it or delete it; a missing capability is BUILD work" ruling, which read-first §0.1
  says overrides anything below it.
  - **Arm 1 — keep residual 1:** the module stays legacy and armed. Cost: it blocks the Phase F
    legacy-zero cutover forever, which is exactly the "tolerating it forever is the skimp that produced
    this program" failure §3 names.
  - **Arm 2 — mint a `staged-blob` kind:** reopens a frozen set for one consumer, against §12.4's own
    stated bar, and costs the four mandatory policing-surface edits plus two new files, forever.
  - **Arm 3 (MY DEFAULT) — SPLIT THE MODULE.** Convert arms A+B into a final `hard` policy on
    `tracked-files` + `authored-text` (both shipped, both proven — `resource-tracked.test.ts` GREEN in
    my `b6` run), and leave arm C as its own minimal LEGACY descriptor under the same family until Phase
    F forces the ruling. This is the only arm that honours "convert or delete" WITHOUT reopening the
    freeze and WITHOUT the catch regression the module's header warns about ("converting the module
    without it would be a catch REGRESSION dressed as progress"). It also shrinks the legacy corpus by
    the two arms that genuinely can move, which is what the census counts.
  - **Deadline:** this needs a ruling before the module is chunked, not during. It does not block B.1-B.3.

### B.7 `suppressions` — `tooling/src/verify/gates/suppressions.ts:420`

- **Judges:** a two-way per-file ratchet over authored typed source in `packages/*/src`, `tooling/src`,
  `scripts/` and `tests/`, using the SAME foreign-tool directive reader as B.6, against a committed
  baseline; plus per-scope rule ratification.
- **Authority notation:** `B+X` (`uncovered-gate-conversion-census.md:170`). Carries
  `suppressions.baseline.json` **and** two gate-owned classification tables (`RATIFIED_RULES` at `:38`,
  `RATIFIED_TEST_RULES`) — `exception-authority-census.md:157` counts 46 source + 6 test rows.
- **Baseline, re-measured today** (the census is a 2026-09-05 snapshot): **281 file rows / 587
  occurrences** (census: 274 / 572 — it has GROWN by 7 rows / 15 occurrences), of which **20 burnable
  file rows / 27 burnable occurrences** (census: 27 across 20 files — unchanged).
- **Reads:** `project.getSourceFiles()` (direct walk) + one `existsSync` on its own baseline. No fs
  corpus read, no subprocess. **Its AST half converts mechanically into visitors.**
- **The blocker is entirely GRANT-HOME, and it is the hardest one in this set.** Three coupled facts:
  1. §12.5 retires every `*.baseline.json`.
  2. `exception-authority-census.md:177` (final-model mismatch 2): reviewed grants have **no
     cardinality** — one `(policyId, subject, operation)` grant suppresses every finding with that
     identity. A file row saying "3 ratified `noArrayIndexKey` occurrences in this file" cannot be
     translated one-for-one; it needs 545 occurrence-unique identities or a hard cardinality policy.
  3. The 27 burnable occurrences carry **no work-item identity** (`:139`), and §3 forbids `workItem` on
     anything but a `warning` with a positive issue number.
- **Split: YES, and it is forced.** The ratified half is a reviewed-grant policy; the burnable half is
  `severity: "warning"` + `workItem` debt; the per-file exceed arm is `hard`. Three authorities, three
  policies, one family.
- **Verdict: BLOCKED on grant-home design, not on capability.** No new kind is owed. This is the one of
  the seven I would sequence LAST.

## C. The four FINAL world-program gates — is the §12.7 guarantee still intact?

| Gate | §12.7 row | Guarantee intact? | Prohibitions honoured? | Defect |
| - | -: | - | - | - |
| `test-world-browser-contracts` (`:57`) | 12 | **YES** — 11/11 GREEN | YES. Unreadable-origin refusal preserved; the real-corpus proof MIGRATED to `runPolicyPass` over the real workspace with no live-tree sentinel, recorded in the suite header. `resources: []` — smallest complete contract | none |
| `eslint-grant-liveness` (`:91`) | 8 | **YES** — 2/2 GREEN incl. the real-root arm; family conformance 2/2 | Native `ConfigArray` evaluation preserved; **the former static evaluator is NOT restored** (no `config-static-read` import); `authority: "hard"` so the `native-config` carrier-demand hazard cannot bite | **D-3**: gate-owned `RATIFIED` `ExemptionTable` at `:21`, suppressing at `:72-74` |
| `depcruise-grant-liveness` (`:282`) | 12.7's depcruise row | **YES** — 4/4 GREEN incl. the real-root arm | `native-config` shape preserved; `authority: "hard"` | **D-3**: TWO gate-owned tables — an EMPTY `EXEMPT` at `:52` and a live `RATIFIED` at `:74` |
| `runner-config-path-liveness` (`:343`) | 6 | **YES** — 4/4 GREEN incl. the real-root arm | **All four honoured**: consumes the `native-config` vitest OBSERVATION (`:356`), not interpreted JS; exact-selector containment via `authored-path` `status === "outside"` (`:259`); file-vs-directory semantics via `FILE_ONLY_FIELDS` (`:267`); unjudged globs stay a visible declared limit (`:45`) | **D-3**: empty `EXEMPT` `ExemptionTable` at `:106`, carried across its own conversion |

**No FINAL world-program gate has broken its §12.7 guarantee.** The one shared defect is a grant HOME
defect (D-3), not a behavioural one.

**And #1947 is STALE-OPEN — I refute its current premise.** The issue (OPEN, P1) asserts
`eslint-grant-liveness` and `depcruise-grant-liveness` "exit 2 on the real repo while their isolated
proofs pass". On today's tree all THREE `native-config` consumers carry a committed real-root arm
(`eslint-grant-liveness.int.test.ts:54`, `depcruise-grant-liveness.int.test.ts:74`,
`runner-config-path-liveness.int.test.ts:95`) asserting `toolErrors: []`, `owner: {status:"success"}`,
`effectiveResourcePaths.length > 1000` and `waiverCarrierRefusals: []`, **and I ran all three GREEN**.
The tracked symlink the issue names still exists (`.codex/agent-doctrine.md -> ../.claude/agent-doctrine.md`,
`git ls-files -s` mode `120000`), so the arms are exercising the real condition and not passing by its
absence. The fix was making the demand hard-owner-exempt; §12.4's `native-config` row records it.

## D. LEDGER ROWS

| module | wave · path:line | defect | class | state | receipt |
| - | - | - | - | - | - |
| `biome-grant-liveness` | cb-v-world-gates · `lib/biome-rule-liveness.ts:284`, `:169` | arm six (RULE liveness, #1158) WRITES `__g_biome-rule-liveness.<pid>.json` into the REPO ROOT and SPAWNS `node_modules/.bin/biome`. No frozen kind serves either; §3 bans a gate-owned filesystem read and this is a WRITE plus a subprocess. **Guide §12.4's "three residuals, closed" does not name it, so the gate reads as routable on `json`+`tracked-files` when it is not** | §12.4 residual accounting (unrecorded) | **OPEN — new** | `writeFileSync(probeAbs, JSON.stringify(config))` at `:284`, `runNicedSync` biome invocation guarded at `:169`; `pnpm ast importers …/biome-rule-liveness.ts` = 2 hits / 2 files (scanned 7 483, skipped 0) — ONE production consumer |
| `test-presence` | cb-v-world-gates · `test-presence.baseline.json`, `exception-authority-census.md:135` | the baseline's 2 rows are LIVE debt whose cited burn-down work item **#772 is CLOSED**. §12.5 retires baselines to "a fix, an exact grant, or `workItem` warning debt" and §3 requires a POSITIVE issue number — a closed issue is neither, so the conversion has no legal destination for these rows until a fix lands or a new item is minted | grant/debt home | **OPEN — new** | `gh issue view 772` → `state: CLOSED`; both subjects present (`packages/server/src/domain/chat/substrate/{assembly-access,turn-access}.ts`) and `tests/server/domain/chat/substrate/` contains no mirror for either |
| `eslint-grant-liveness` · `depcruise-grant-liveness` · `runner-config-path-liveness` | cb-v-world-gates · `eslint-grant-liveness.ts:21`, `depcruise-grant-liveness.ts:52,74`, `runner-config-path-liveness.ts:106` | three FINAL world-program modules carry gate-owned `ExemptionTable`s that §12.5 ("gate modules receive neither grant tables nor marker parsers") and §3 ("no gate-owned exemption table") forbid. Two are live suppressors, not carry-forward stubs: `eslint-grant-liveness.ts:72-74` does `RATIFIED[key] → continue`, and depcruise hands `ratified: RATIFIED` to the shared reconciler at `:261` | §5b.7 forbidden | **OPEN — subsumed by #1922**; the ledger's row 5 already names all three | verified suppression at `eslint-grant-liveness.ts:72-74`; census rows `exception-authority-census.md:98,99,163` |
| `refutation-ledger-2026-09-12.md` | cb-v-world-gates · `refutation-ledger-2026-09-12.md:364-370` | **the "TEN FINAL modules still carry a legacy `ExemptionTable`" census is wrong by two.** `ownerid-registry` and `persisted-store-registry` DECLARE no table — each only MENTIONS the type in a comment saying it deliberately does not use one. The parenthetical claims the census is "`defineGate` AND `ExemptionTable` in the same file, not a bare grep", but that predicate IS a mention grep and these two are what it costs. **The number is EIGHT** | census/instrument | **OPEN — new; correction to #1922's evidence** | two independent methods agree. `grep`: `ownerid-registry.ts:38` and `persisted-store-registry.ts:76` both read *"Deliberately NOT the legacy `ExemptionTable`"*. `ast-grep --lang ts --pattern 'const $N: ExemptionTable = $V'` + the generic twin over `tooling/src/verify/gates`: **33 declaring modules, 8 FINAL** — `contract-derives-not-respells:59`, `depcruise-grant-liveness:52,74`, `eslint-grant-liveness:21`, `injected-op-caller-param:53`, `lifecycle-portability:114`, `no-raw-spacing-in-features:39`, `no-raw-typography-in-features:39`, `runner-config-path-liveness:106` |
| `#1947` | cb-v-world-gates · board row #1947 | the issue is OPEN at P1 asserting two shipped conversions "exit 2 on the real repo while their isolated proofs pass". **Closed on today's tree** — the #2013 shape applied to a board row rather than a header | stale refusal / stale row | **OPEN row, CLOSED defect — recommend land** | all three `native-config` consumers carry a real-root arm asserting `toolErrors: []` + `owner: success` + `waiverCarrierRefusals: []` and all three ran GREEN this session (`eslint …:54`, `depcruise …:74`, `runner …:95`); the tracked symlink it names is still present (`git ls-files -s` mode `120000` on `.codex/agent-doctrine.md`) |
| `gate-runtime-read-first.md` | cb-v-world-gates · `gate-runtime-read-first.md` §0.3 and §2 | two settled-facts statements are stale, and §2's heading is literally **"What NOT to re-derive, because it is already measured"**, which instructs sessions not to check them. (a) §0.3 and §3's "`runner-config-path-liveness` … the gate is still legacy (#2013)" — it is FINAL. (b) §2's "The corpus is 275 modules (171 final / 104 legacy)" — it is 297 / 237 / 60 | doc staleness | **OPEN — new** | `gates/runner-config-path-liveness.ts:343` is `export const gate = defineGate({`; `pnpm -s check:policy-conformance` prints "237 final policies … corpus: 297 module(s), 60 legacy" |
| `mirror-index` kind | cb-v-world-gates · `contract/resource-mirror.ts`, `ops/resource-mirror.ts` | a SHIPPED frozen kind with **ZERO gate consumers** — `grep -rn 'mirror-index' tooling/src/verify/gates/` returns nothing. Its three named consumers are all still legacy, so the kind has never been exercised through a policy declaration on the real tree; its only proofs are provider-level temp-root fixtures | unwired capability | **OPEN — new (low; closes with B.1)** | 0 declarers in `gates/`; provider proofs `tests/tooling/verify/ops/resource-mirror.test.ts` 4/4 GREEN, all four on `scratch` temp roots |
| `test-layout` | cb-v-world-gates · `tests/tooling/` (absence) | §12.7 row 1's required proof ("unsupported test-shaped names fail, **including in helper trees**") is held by NO suite a lane or the commit bar can run. There is no `tests/tooling/verify/gates/test-layout*` file; `check-gates.repo.int.test.ts:221` plants only the mirror-miss arm; the other five arms live in `mustFlag` rows executed solely by `gate-conformance.repo.int.test.ts`, which is orchestrator-only, `--full`-only, and the ledger records it broken by conversions three times in five days (#1983) | proof reachability | **OPEN — new** | no `test-layout` test file exists (`ls tests/tooling/verify/gates/`); `check-gates.repo.int.test.ts:220-221` is a single `fx("tests/server/__g_nomirror.test.ts", …)` |
| `scripts/ts7.cjs` | cb-v-world-gates · §12.7 row 14 | half (a) of the required proof — "warm/changed/restored produce green/red/green **without deleting caches**" — has no committed regression pin. `7d9cd503e` landed it as a dated manual reproduction in a record doc; only half (b), the incremental-flag stripping, is a test | missing successor proof | **OPEN — new (low)** | `git show --stat 7d9cd503e` = `docs/…/2026-09-08-typecheck-directive-freshness.md` + `scripts/ts7.cjs` + `concurrency-profile.test.ts` (+63) + `testd-lane-program-coverage` + `vitest.config.ts`; the +63 test lines are all flag-stripping controls (`concurrency-profile.test.ts:309-364`) |
| `#2021` disposition comment | cb-v-world-gates · issue #2021 comment 2026-09-12T12:37Z | the comment tells a lane to convert `tsconfig-entry-liveness` "against `json`/`authored-path`/`tracked-files`". `json`'s closed id set has no tsconfig member and cannot gain one for this read — §12.4 residual 2 rules the raw entries must come from the SHARED COMPILER READER. A lane following the comment literally hunts a `json:tsconfig` id that does not exist | brief/route precision | **OPEN — new (low)** | `contract/resource-json.ts:35-47` lists exactly five ids: `biome`, `migration-journal`, `tokens`, `doc-catalog`, `baseui-manifest` |

## E. CHUNK PROPOSAL — three lanes, in dependency order

The organising principle is **shared READER**, per §6's rule that Phase D families route from blockers and
not from a grep. It is NOT "these are all test gates" or "these are all config gates".

### Chunk 1 — `p-mirror-index-convert` (READY TODAY, no prerequisite)

**Members (3):** `test-layout` · `test-presence-client` · `test-presence`.
**Shared reader:** the `mirror-index` kind, both families, plus `authored-text` for one clause.
**Build prerequisite: NONE.** Every door is shipped and proven (contract → host → binding → validation →
provider → 4/4 green provider proofs). This chunk is what finally WIRES `mirror-index`, which today has
zero consumers (D-7).

Why these three and only these three: `contract/resource-mirror.ts:3-8` names exactly this trio as the
kind's reason for existing, and their `existsSync` sites are enumerated there by `file:line`. One cold
read of the mirror rule covers all three.

Sequence inside the chunk: `test-layout` first (no baseline, no grant, four arms, the smallest complete
`{of:"none"}` + two `mirror-index` declarations — it is the exemplar the other two copy), then
`test-presence-client`, then `test-presence`.

**Hazards the brief must carry:**

- `test-presence-client`'s worst-art arm reports at a MISSING path and will THROW on conversion — it
  consumes `lib/absent-subject-anchor.ts#subjectAnchor:26`.
- `test-presence`'s baseline cannot carry #772 forward (D-2). Decide fix-the-two-tests vs mint-an-item
  BEFORE dispatch.
- `mirror-index` refuses (`status: "empty"`) when either bounded space has zero files
  (`ops/resource-mirror.ts:72-79`) — a conformance mini-project has no `tests/` tree, so every proof row
  must either plant both spaces or ride a real-tree anchor. This is the arm most likely to produce a
  false clean.
- Three-of-three are `whole` execution → `execution: "entire-population"`.

Only 3 members rather than 4-8: they are the complete `mirror-index` consumer set, and padding the lane
with an unrelated gate would defeat the one-cold-read economy.

### Chunk 2 — `p-config-liveness-convert` (#2021) — KEEP THE PAIRING, RE-PRICE THE BIOME HALF

**Members (2):** `tsconfig-entry-liveness` · `biome-grant-liveness`.

The pairing is **RIGHT and should keep both members.** They share `lib/grant-liveness.ts` as module AND
function (`globMatcher`, `isFileExact`, `livenessFindings`, `patternLivenessFindings`, `lineFinder`,
`memberSources`), both are exact+pattern grant liveness over an external config against
`tracked-files`, and `resource-gate-access-patterns.md:136` names them together as two of the four
tracked-inventory consumers. One cold read of the grant-liveness family covers both. It should **lose no
members and absorb none** — the other two tracked-inventory consumers (`eslint-`, `depcruise-`) are
already FINAL.

**But the chunk carries TWO build prerequisites, not one, and only the first is currently recorded:**

1. **(recorded, #2021)** Expose per-config RAW `include`/`exclude` entries WITH line identity, plus the
   discovered config roster as declared data, off `lib/policy-program-membership.ts#parseConfig`. This is
   a new public shape on #1351's shared compiler reader — a world-program surface, so the fence must name
   `lib/policy-program-membership.ts` and require its existing tests to re-run unchanged. Note the route
   correction in D-10: this comes from the reader, NOT from a `json` id.
2. **(UNRECORDED — D-1)** `biome-grant-liveness` arm six needs a ruling before the lane starts. It writes
   into the repo root and spawns the biome binary; no kind serves it and one consumer means the freeze
   does not reopen for it. **My recommended default: split arm six out of the gate** — convert arms 1-5
   on `json:biome` + `tracked-files` (both shipped), and re-home the rule-liveness probe as a `verify` OP
   on its own tier, where a subprocess and a scratch file are legal, or delete it. Dispatching this lane
   without that ruling means the lane discovers it cold and stalls.

Sequence: prerequisite 1 lands as its own reader change; then both gates convert in one commit.

### Chunk 3 — `p-suppression-authority-convert` (BLOCKED on a grant-home design decision)

**Members (2):** `no-blanket-suppression` · `suppressions`.
**Shared reader:** `lib/suppression-directive.ts#readDirectiveComment` / `suppressionSites` — the same
foreign-tool directive grammar, read by both for opposite reasons
(`exception-authority-census.md:79`). One cold read of the directive grammar covers both.

**Build prerequisites, both design rulings rather than code:**

1. The B.6 fork (arm C's staged blob) — default: SPLIT arms A+B final, arm C stays legacy.
2. The `suppressions` cardinality problem — 545 ratified OCCURRENCES against a grant identity that has no
   cardinality (`exception-authority-census.md:177`), plus 27 burnable occurrences with no work-item
   identity. Until that is ruled, `suppressions` has no legal destination for its baseline and the
   conversion cannot be specified.

**Sequence LAST.** Neither gate blocks chunks 1 or 2, and both are fully armed as legacy under the mixed
runtime.

## WHAT I DID NOT COVER (load-bearing — read it as the boundary of every CONFIRMED above)

- **I did not run `pnpm check:structure`** (brief forbade it — another verifier holds the serialized
  slot). So **the real-tree FINDING DELTA and the two numbers §5 says are the only instrument that asks
  — `N tool error(s)` and `N withheld` — are UNMEASURED BY ME for every gate in this report.** A policy
  can sit at 0 conformance failures and be fully WITHHELD on the real tree (#1972). My FINAL-gate
  intactness verdicts in section C rest on each module's own committed real-root `runPolicyPass` arm,
  which is narrower: it proves the policy RESOLVES AND RUNS at repo scope, not that its findings are
  right there.
- **I did not run `check-gates.repo.int`, `gate-ignore-grammar.repo.int`, `gate-conformance.repo.int` or
  `gate-spelling-twins.int`** (orchestrator-only). That is exactly where §12.7 row 1's helper-tree half
  and row 15's fixture-ownership guarantee live, so both are reported PARTIAL rather than green. Every
  legacy `mustFlag`/`mustPass` row in this report — all seven legacy gates' — is proven only there.
- **I planted no positive control in the live `check:type-ownership` stage.** Its five empty violation
  arrays are a clean zero from a detector I did not independently prove non-blind on this run; I am
  relying on its committed negative controls (`tests-type-membership.test.ts` 18/18, which I did run).
- **I did not execute `biome-grant-liveness`'s arm six**, so the repo-root write is a CODE receipt
  (`:284`) and not an observed one. I deliberately did not spawn it. My worktree stayed clean throughout
  (`git status --short` empty after every run), which is consistent with its `finally` cleanup at `:295`.
- **I did not attempt any conversion, nor build a prototype declaration.** Every route in section B is
  derived by reading the gate's reads against the shipped kind's contract, host door, binding, validation
  arm and provider — five sites each — not by compiling one.
- **§12.7 row 3 is only half-measured.** The FINAL grant table is green (131 rows / 0 invalid); the 25
  legacy `SANCTIONED_HOMES` tables are judged only by `check:structure`.
- **§12.7 row 11's cost claim is unverified.** I confirmed the private-worker shape and the semantics
  suite, not the 1.75 s → 0.55 s / 435 MB → 154 MB measurement, and I could not find the "108-test native
  regression set" as a nameable suite.
- **I did not read `v-audit-wave*`, `v-exemplar-audit` or `v-gate-batch`** (read-first row: DO NOT READ).
  If one of them already filed a row I have marked "new", it is a duplicate rather than a conflict.
- **`suppressions` growth is reported, not diagnosed.** 274/572 → 281/587 since 2026-09-05 on a
  shrink-only ratchet. I did not determine whether that is a sanctioned regeneration or unratcheted
  growth; that needs the baseline's own git history.

## Proposed lessons (text — the orchestrator owns the memory store)

**1. Index entry:** `[ExemptionTable census = declarations, not mentions](exemption-table-census-counts-declarations.md) — a "N final modules still carry X" count derived by file-mention grep over-counts; two modules' comments SAY they deliberately do not.`

Body: A corpus census of "which modules still carry a forbidden construct" must count DECLARATIONS
(`ast-grep 'const $N: ExemptionTable = $V'` plus the generic twin — two patterns, because the
non-generic spelling is a different node), never file mentions. **Why:** the #1584 refutation ledger's
row 5 recorded TEN final modules carrying a legacy `ExemptionTable`, with a parenthetical insisting the
predicate was "`defineGate` AND `ExemptionTable` in the same file, not a bare grep". That predicate IS a
mention grep: `ownerid-registry.ts:38` and `persisted-store-registry.ts:76` each carry a comment reading
*"Deliberately NOT the legacy `ExemptionTable`"* and declare none. The true count is EIGHT.
**How to apply:** any "N modules still have X" row owes an ast-grep declaration census with the scanned
count, and owes BOTH spellings of a generically-parameterised type — a module that documents its own
compliance is the false positive you will hit.

**2. Index entry:** `[Kind shipped ≠ kind wired](shipped-resource-kind-with-zero-consumers.md) — a frozen resource kind whose consumers are all still legacy has never run through a policy declaration.`

Body: A resource kind can be complete across all five coupled sites (contract, host door, policy
binding, validation vocabulary, provider) with green provider proofs, and still have ZERO gate
consumers — because every gate it was minted for is still legacy. **Why:** `mirror-index` shipped at
`899ec74a7` for `test-presence`, `test-presence-client` and `test-layout`; on 2026-09-12 all three were
still legacy and `grep -rn 'mirror-index' tooling/src/verify/gates/` returned nothing. Its only proofs
were provider-level temp-root fixtures, so nothing had exercised the declaration fence, the population
contribution or the `acquiredPaths` registration on the real tree. **How to apply:** when routing a
conversion onto a shipped kind, check the DECLARER count first; a zero means the first converting lane is
also the kind's first integration test and its brief must say so.

**3. Index entry:** `[A closed-residual list is a claim about every arm](residual-lists-miss-the-sixth-arm.md) — §12.4's three residuals missed a gate that writes into the repo root and spawns a binary.`

Body: When a design doc closes a capability gap with "the N residuals, closed", that list was derived
from the gates' HEADERS, and a header describes the arms its author was thinking about. **Why:**
`biome-grant-liveness`'s header describes five path/pattern-liveness arms that route cleanly on shipped
kinds; its SIXTH arm (`lib/biome-rule-liveness.ts`) writes a probe config into the repo ROOT
(deliberately — biome relocates its project root for an outside `--config-path`) and spawns
`node_modules/.bin/biome`. Neither appears in §12.4's three residuals, so the gate reads as routable when
it is not. **How to apply:** price a conversion by tracing every `node:fs` WRITE and every
subprocess spawn one `lib/` hop deep, not by reading the header's arm list. A WRITE is worth naming
separately from a READ: the contract's non-negotiables ban gate-owned filesystem reads and never thought
to ban writes.

**4. Index entry:** `[A closed work item cannot carry warning debt](closed-work-item-orphans-a-baseline.md) — a baseline whose burn-down issue closed while its rows stayed live has no legal conversion destination.`

Body: Before converting a gate that carries a `*.baseline.json`, check the STATE of the work item its
rows cite, and check whether the rows are still live debt. **Why:** `test-presence.baseline.json`'s two
rows cite board item #772, which is CLOSED — while both subjects still exist with no mirror test. The
final contract retires baselines to "a fix, an exact grant, or `workItem` warning debt", and requires
`workItem` to be a POSITIVE issue number on a `severity: "warning"` policy. A closed issue satisfies
none of the three, so the conversion silently has nowhere to put the rows. **How to apply:** a
baseline-carrying conversion brief states the work item's state and the rows' liveness as measured facts,
and resolves the destination BEFORE dispatch.

## Receipts index (every run I performed, in order)

| Run | Result |
| - | - |
| `pnpm -s gate:contract` | exit 1 (violations, expected) · 421 findings / 297 modules · 60 `descriptor-wrapper` = the legacy roster |
| `pnpm -s check:policy-conformance` | **exit 0** · 237 final · 2 640 rows · 0 failures · 131 grant rows / 0 invalid · 297 modules, 60 legacy |
| `pnpm -s check:type-ownership --json` | **exit 0** · 7 501 rows · 11 programs · all five violation arrays empty |
| `pnpm typecheck` | **exit 0** in 28 s · 11 discovered / 11 runnable / 11 PASS |
| `pnpm test:scoped` b1 (10 files) | **exit 0** · 84/84 |
| `pnpm test:scoped` b2 (10 files) | **exit 0** · 125/125 |
| `pnpm test:scoped` b3 (5 files) | **exit 0** · 43/43 |
| `pnpm test:scoped` b4 (2 files) | **exit 0** · 18/18 |
| `pnpm test:scoped` b5 (mutation mirror) | **exit 0** · 5/5 |
| `pnpm test:scoped` b6 (4 resource kinds) | **exit 0** · 18/18 |
| `pnpm test:scoped` b7 (grant-liveness family) | **exit 0** · 2/2 in 10.63 s |
| `pnpm test:scoped` b8 (codemod program-diagnostics) | **exit 0** · 42/42 |
| `pnpm ast importers …/biome-rule-liveness.ts` | 2 hits / 2 files · scanned 7 483 · skipped 0 |
| `ast-grep` ExemptionTable declaration census | 33 declaring modules · 8 FINAL |

**Total: 337 tests executed, 0 failures, 0 non-verdicts (no OOM, no kill, no timeout, no exit 2).**
