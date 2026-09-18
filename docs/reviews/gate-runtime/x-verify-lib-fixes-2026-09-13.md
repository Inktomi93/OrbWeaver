---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-verify-lib-fixes — six verified defects in the verify runtime's shared surfaces

Lane `cb-x-verify-lib-fixes`, worktree `agent-a118c73f79d3c833a`, based on `badc14944`. Every receipt below
is run output produced in this session. The three scratch probes (`tests/tooling/xvl-gm-*.test.ts`) were
deleted before the commit; `git status --short` is EMPTY apart from this report.

## Verdicts

| row | outcome |
| - | - |
| #2249 | FIXED — five undeclared ARM E escapes closed, 8 new proof rows, and THREE true real-tree violations reported (board #2256), not carved |
| #2250 | FIXED — the fact-widening remedy names the door that threw; red-first on both doors |
| #2232 | FIXED — the scoped node door is runtime-only unless the runner attributes a `types-*` project; the brief's MECHANISM was narrower than stated and is corrected below |
| #2233 | FIXED — the comment names the `mustPass` row that actually pins the acquittal, and states the suite's retirement |
| #2234 | FIXED — a gate whose phase threw is no longer `ok: true`; the production front door is byte-unchanged |
| #2268 | FIXED — the module's SPELLING, not arm B; cut both ways, and the arm side kills two of the arm's own founding rows |
| #2195 | BUILT as a BARRIER VERB, not a registry stage (fork raised and ruled); it caught its own false clean at its founding case |

## #2249 — `gate-modernization` ARM E was blind to five spellings

`gates/gate-modernization.ts`. The arm matched a type read only as a `CallExpression` whose callee is a
`PropertyAccessExpression`, recursed over the policy module's own SourceFile.

**RED-FIRST**, the module's own `run` driven through `verifyGateProofs` (the LEGACY runner —
`gate-modernization` is a `GateDescriptor`, not `defineGate`) with a scratch `mustFlag`/`mustPass` pair per
spelling over `mode`-less fsBacked temp roots. `true` = flags:

| spelling | before | after |
| - | -: | -: |
| `ctx.node.getType()` (control) | true | true |
| `ctx.node.getText()` (negative control) | false | false |
| `ctx.node?.getType()` | true | true |
| `ctx.node["getType"]()` | **false** | true |
| `ctx.node?.["getType"]()` | **false** | true |
| `const { getType } = ctx.node; getType()` | **false** | true |
| `const { getType: gt } = ctx.node; gt()` | **false** | true |
| `ctx.node.getType.bind(ctx.node)` | **false** | true |
| a `lib/` helper one import hop away | **false** | true |
| the byte-identical helper INLINE (control) | true | true |
| an UNUSED `lib/` import (control) | false | false |
| an in-file chain inside the hopped module | — | true |
| two import hops (declared limit) | — | false |
| a namespace import (declared limit) | — | false |
| a computed subscript (declared limit) | — | false |

**THE FIX.** `memberName(node)` is the one place the arm decides what a member position is — a property
access, a static-string element access (optional-chained or not), or a destructuring binding element (the
PROPERTY name, never the local). `readsTypes` matches the POSITION rather than the invocation, which is what
makes `.bind` and any other handoff nameable without the gate resolving what the receiver is — a resolution
that would be a type read inside the gate that polices type reads. `importHopReadsTypes` follows ONE hop for
a named import from a relative specifier whose local name the module actually REFERENCES, chasing
bare-identifier calls to other module-scope declarations of that same file.

**PROOF ROWS: 28 `mustFlag` + 20 `mustPass`, 0 failures** (`verifyGateProofs([gate])`). Six new `mustFlag`
(one per spelling plus the in-file chain), four new `mustPass` (the reference narrowing plus three declared
limits, each written as a RUN row rather than prose).

**THE PLANTED BREAKS** (`cp`-backed copies, anchor asserted to occur exactly once, restored):

- cutting the in-file recursion → exactly ONE row died, the invented in-file-chain `mustFlag`. §4.7 satisfied.
- cutting the reference narrowing (`used.has(local) &&`) → **CLEAN on the first draft**. Classified per §4.1:
  an unenforced FIXTURE, not an unenforced fence. The draft imported a `SAFE` sibling from the type-reading
  module, and the hop resolves the IMPORTED NAME, so it never reached `typeOf` in either direction. Repaired
  to import `typeOf` and leave it uncalled; the cut then killed the row. Both the failure and the repair are
  recorded in the row's own `why`.

**REAL-TREE DIFFERENTIAL** — the module's own `run` over `projectCtx(root)` (the whole workspace), before
control via `git show HEAD:` restored in place:

- BEFORE: 2 findings, both ARM B and pre-existing (`list-row-adoption.ts:22` `ALLOWED_ROOTS`,
  `vector-scope-derived.ts:42` `IMPORT_SANCTIONED`). The gate was ALREADY red on the tree.
- AFTER: those 2 plus THREE new ARM E findings, token `analysis`: `contract-banned-shapes.ts:158`,
  `detached-work-traced-health.ts:58`, `windowed-infinite-query.ts:175`. `toolErrors: []` in both runs.

**ALL THREE ARE TRUE POSITIVES**, chain READ per module rather than counted:

- `detached-work-traced-health` imports `deriveRootSpanOpeners` from `lib/detached-work.ts`;
  `deriveRootSpanOpeners:130` → `calleeName:98` / `opensDetachedRoot:109` → `literalMember:53` →
  `staticStringValue:69`, which is `node.getType().getLiteralValue()` at `:70` and `value.getSymbol()` at `:90`.
- `windowed-infinite-query` and `contract-banned-shapes` import `resolveStableExpression:270` /
  `readMemberReference:339` from `lib/reference-fact.ts`; both reach `resolveStableExpressionInternal:247` →
  `importedTarget:200` → `lexicalReferenceSymbol(current)?.getAliasedSymbol()` at `:208` (the member reader
  via `readStaticString:274` → `computedName:317`). That module's own header says "checker-proven".

So three FINAL policies declare `analysis: "syntax"` while resting their verdict on the checker one import
hop out. **NOT FIXED HERE and NOT CARVED** — the repair is flipping `analysis` in three modules outside this
lane's fence, each a real contract change. Forked to the orchestrator, ruled the same day: leave them, no
allowlist, gate-modernization reads 5 on the tree instead of 2 (no verdict class changes — it was already
red), class filed as **board #2256**.

## #2250 — the fact-widening remedy named a door the author never called

`lib/policy-pass-context.ts`. The #1976 diagnosis closed with a hard-coded *"never with `ctx.relativePath`"*
and `factWidening(...)` appended it verbatim to the `sourceFile` and `report.file` twins.

**THE FIX.** `POPULATION_DOOR` (a local frozen record, three members) is passed into
`factWideningDiagnosis`, so each door names itself. The `relativePath` arm's text is byte-unchanged by
construction, which keeps the measured before/after pair quoted at `warning-code-coverage.ts:167-170` intact.

**RED-FIRST** — `tests/tooling/verify/lib/policy-pass-context.test.ts` (new, 4 rows) run against the
unmodified source (`git show HEAD:` in place, `cp` back):
`pnpm test:scoped tests/tooling/verify/lib/policy-pass-context.test.ts` → **exit 1, 2 failed | 2 passed**,
both failures reading
`Expected: "never with ctx.sourceFile." / Received: "… never with ctx.relativePath."` (and the
`report.file` twin). After: **exit 0, 4 passed**.

The two passing rows are the CONTROLS and they are why the fix is not "delete the clause": the
`relativePath` arm's full wording is asserted verbatim, and a path NO declared fact admits must refuse BARE
on all three doors (no fact id, no `declarationHome`).

## #2232 — the scoped node door ran both typecheck projects

`ops/scoped-test.ts` (+ its own `contract/scoped-test.ts`: the collection now carries `projects`).

**THE BRIEF'S MECHANISM WAS NARROWER THAN STATED — corrected, with the measurement.** The brief said *"a
parse error anywhere in tsconfig.json's program exits every scoped run 1 with green tests, and every run
pays a cold ts7 pass."* Driven at HEAD with a planted parse error at `tests/tooling/_xvl_broken.ts` (which
`tsconfig.json`'s `tests/**/*.ts` include DOES carry):

- `pnpm test:scoped tests/tooling/smoke.test.ts` → **exit 0**, `Type Errors no errors`,
  `Duration 187ms … typecheck absent`. With zero matched type files vitest never runs ts7, so a bare runtime
  operand pays ~nothing and cannot be reddened. **That half of the mechanism is REFUTED.**
- `pnpm test:scoped tests/tooling/client-pure-doors.test-d.ts` (a type claim) → **exit 1**,
  `Test Files 1 passed (1)`, `Tests 1 passed (1)`, `Type Errors no errors`, the sole failure
  `tests/tooling/_xvl_broken.ts:2:1`. **That half is CONFIRMED**, in the shape where a typecheck project has
  a matched file.

**THE DEFECT AS MEASURED, and the planted control in both directions.** Plant moved to
`tests/support/browser/_xvl_broken_dom.ts` — in `tsconfig.tests-dom.json`'s program and in NO program the
subject file belongs to. Same node `.test-d.ts` operand:

- HEAD: **exit 1**, `Tests 1 passed`, `Type Errors no errors`, `typecheck 6.70s` — a node type claim
  reddened by a parse error in the BROWSER program.
- after: **exit 0**, same fixture, same plant. Both runs show `✓ |types-node| TS …` as the only executed
  test file; the difference is that HEAD also instantiated `types-browser`.
- plant removed: exit 0 either way (the negative control).

**THE FIX.** `nodeConfigModeArgs(collectedProjects, mode)` chooses the config mode from what the runner said
it would SELECT — vitest's `--filesOnly --json` emits `projectName` per file, so a DIRECTORY operand holding
a `.test-d.ts` is classified by the same authority that would run it, and no filename is guessed at. No
`types-*` → `--runtime-only`; entirely `types-*` → those project names and no `--runtime-only` (mutually
exclusive by construction); MIXED → neither, because the caller named both halves. `--related` is
runtime-only unconditionally (source operands; the type-assertion door is `pnpm test:types`) — the
orchestrator ruled this arm explicitly.

Pins: `tests/tooling/verify/ops/scoped-test.test.ts` (new, 6 rows, both directions including the
never-both-flags row). The pre-existing `scoped-test.int.test.ts` (10 rows over the real CLI) stays green.
Doc: one sentence in `UNIFIED-VERIFICATION-DESIGN.md` §"tests".

`check:docs` on that doc is **RED AT HEAD TOO** — control run with `git show HEAD:` restored in place:
`pnpm check:docs docs/architecture/core/UNIFIED-VERIFICATION-DESIGN.md` → exit 1, same message. Pre-existing,
not this lane's. I deliberately REVERTED the formatter's five `\~`→`~` conversions in untouched context
rather than ship them: they are a sibling-lane rebase hazard and none is mine.

## #2233 — a shrink receipt naming a proof that cannot exist

`tests/tooling/gate-spelling-twins.int.test.ts:40`. Comment only. It now names
`tooling/src/verify/gates/owner-scoped-writes.ts:320-329` — the `mustPass` row whose own `why` says
*"cut it and no mustFlag row moves, while this row reds"* — and records WHY the old text was false (a
`mustFlag` can only make a gate louder, so it structurally cannot pin an ACQUITTAL) and that `eb51d4313`
never touched this file. The added paragraph states the suite is **LEGACY BY REQUIREMENT and retires at the
\#1584 cutover**: it calls `loadGates()`, so every conversion shrinks its subject.

Collection proof (the suite is orchestrator-only to RUN — one of the four planters — so it was collected,
never executed): `vitest list` → **3 cases**.

## #2234 — a gate whose phase threw came back `ok: true`

`lib/pass.ts`. `gateOk(name, findingCount, errors)` is the one spelling of the two-term verdict, used by
`runWithReferenceCache` and by `stripProbeFindings` (recomputing `findings.length === 0` there would have
laundered a broken gate green the moment a probe finding was stripped).

**RED-FIRST** — four rows appended to `tests/tooling/verify/lib/pass.test.ts`, run against the unmodified
`lib/pass.ts`: **exit 1, 2 failed | 4 passed**, `AssertionError: a consumer reading 'ok' must not see a clean
gate: expected true to be false`. After: **exit 0, 6 passed**.

Two of the four were ALREADY green pre-fix and are labelled in the file as FENCES, not defect proofs
("reports AND throws", and the healthy-silent-gate control that stops a blanket `false`).

**PRODUCTION READERS, checked rather than assumed.** `ops/structure.ts:83` recomputes its own legacy row as
`violations.length === 0` and reads brokenness from `pass.toolErrors` at `:344`, so the run verdict and exit
code are unchanged — I did not touch that file. What changes is `lib/render.ts:106` (a broken gate prints
`✗`, not `✓`) and `lib/population.ts:33` (the unresolved alarm is raised only BEHIND a green verdict, which
is that arm's own stated rule, so it correctly stops firing for a gate that is no longer green).
**FLAGGED:** `ops/structure.ts:83`'s artifact row still reports `ok: true` for a broken gate. Same class, one
file over, and it is another lane's file — worth a board row.

## #2195 — the ledger-claim barrier check

**FORK, RAISED AND RULED.** The brief fenced a registry stage. A stage runs with FIXED argv and needs a
DEFAULT base, and both constructible defaults were measured and refused:

- `origin/main..HEAD` — the range carries a commit whose `ledger rows OWED: #2201 #2203` names ids that
  appear in ZERO ledger rows (`grep -c '^|.*#2201\b'` → 0; positive control `#2214` → 1). Arm (b) reds
  forever on immutable history: a stage with no green door, banned by constitution §4.
- `merge-base(main,HEAD)..HEAD` — empty on main's checkout, and on a lane it is that lane's EARLIER commits,
  which under one-commit-per-lane is zero. A stage that measures nothing.

Orchestrator ruling: **barrier verb, required range, no registry row.** Built as
`tooling/src/verify/ops/ledger-claims.ts` + `pnpm check:ledger-claims --since <rev> [--until <rev>]`, wired
through `contract/verbs.ts`, `lib/verb-tail.ts` (`"own"`), `cli.ts` (dispatch + `VERB_HELP` + the header
map) and `package.json`. The #2201/#2203 finding is the orchestrator's to fix in the ledger, not mine.

**A COUPLED SITE THE FORK MISSED, AND IT REFINES THE RULING RATHER THAN REVERSING IT.** Adding a
verification-shaped `package.json` script makes `verify-registry-parity` arm 1 RED unless the script is a
registry stage or an allowlisted non-stage. Driven on the real tree through the #1964 scoped door, both
directions:

- WITHOUT the row (`git show HEAD:` restore of `lib/registry-manual.ts`):
  `pnpm check:structure --check verify-registry-parity` → **exit 1**, `✗ verify-registry-parity (1)`,
  `package.json script "check:ledger-claims" is verification-shaped but is not a 'pnpm verify' stage —
  place it in a tier … (even 'manual' with a reason)`.
- WITH the row: **exit 0**, `✓ verify-registry-parity … effective 0 · 0 alarm(s) · 0 tool error(s)`.

The gate's own remedy names the answer, and it is the one shape that satisfies BOTH halves of the fork: a
**`tiers: ["manual"]` row**. A manual row is never auto-included by any tier, so it needs no default base
and cannot red on history; it makes the verb discoverable in `verify --list` and reachable by parity. The
precedent is `tests:scoped` — another manual row whose door takes required arguments. It lives in
`lib/registry-manual.ts` (the manual rows' actual home) rather than in `lib/registry.ts`, which is where
the fence named it; nothing else in either file was touched. `verify --list` prints it, and
`tests/tooling/verify/ops/run.int.test.ts` (69 rows, the tier-composition pin) stays green.

**IT CAUGHT ITS OWN FALSE CLEAN, which is the receipt worth the most here.** The first draft split body from
`--name-only` paths by a heuristic (*a line containing a slash is a path*) and argued in a comment that the
failure direction was safe. Driven at its founding case:

- `pnpm check:ledger-claims --since b5490a02a~1 --until b5490a02a` → **exit 0, zero findings.**
  `b5490a02a` NAMES the ledger path in its own PROSE, so the heuristic read that sentence as a ledger hunk
  and acquitted the false `flipped` claim — on the one commit the whole ruling was minted from.
- After a SECOND fence (`--format=<REC>%n%H%n%B%n<PATHS>`, everything past the fence and only that is a
  path): **exit 1**, naming `b5490a02a8527583283eece0e03e9705a6e4050a` and quoting its `flipped` line.
- ACQUITTING control: `--since ac9be2e8a~1 --until ac9be2e8a` (a real ledger-touching commit) → **exit 0**.
- MISUSE: `pnpm check:ledger-claims` with no `--since` → **exit 3**, printing the usage.
- A range with real commits and no claims: `--since badc14944~5` → exit 0,
  `ledger-claims  5 commit(s) in badc14944~5..HEAD · 174 ledger row id(s)` — the subject is printed on every
  run, so a zero is never bare.

Pins: `tests/tooling/verify/ops/ledger-claims.test.ts`, **14 rows, all passing**, every arm in both
directions — including the prose-names-the-ledger false clean above as a permanent regression pin, and a
`toThrow` row proving a record with no path fence REFUSES rather than silently skipping. A ledger parsing to
ZERO rows is exit 2 (blindness), mirroring `ledgers-fresh`'s own refusal.

## Floors (every exit real)

| floor | exit |
| - | - |
| `pnpm test:scoped` × 6 touched/coupled specs (`cli.int`, `pass`, `policy-pass-context`, `ledger-claims`, `scoped-test`, `scoped-test.int`) | **0** — 6 files, 82 tests |
| `verifyGateProofs([gate-modernization])` — 28 mustFlag + 20 mustPass | **0 failures** |
| `pnpm check:policy-conformance` (WHOLE) | **0** — 250 final · 2972 proof rows · 9 refusal rows · 0 failures · 32,991 ms |
| `pnpm gate:contract` before / after | **1 / 1**, corpus total UNCHANGED at 383 rows; `gate-modernization`'s own 9 rows identical (all pre-existing legacy-descriptor rows) |
| `pnpm exec biome check <15 touched files> --diagnostic-level=error` | **0** |
| `pnpm exec eslint <15 touched files>` | **0** |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | **0** — PASS both |
| `pnpm check:docs <the one doc>` | **1, and RED AT HEAD TOO** (control run on the `git show HEAD:` copy) |
| `pnpm test:scoped tests/tooling/verify/ops/run.int.test.ts` (tier composition) | **0** — 69 tests |
| `pnpm test:scoped tests/tooling/verify/gates/resource-layout-wave-3.suite.test.ts` (the parity gate's family) | **0** |
| `pnpm check:structure --check verify-registry-parity` (the #1964 SCOPED door) before / after the manual row | **1 / 0** |
| `vitest list tests/tooling/gate-spelling-twins.int.test.ts` | 3 cases COLLECT (never executed — orchestrator-only planter) |

Not run, deliberately: `pnpm verify` / `check:structure` / any `.repo.int` planter (brief fence).

## What I did NOT do

- Did not touch `ops/structure.ts`, `ops/show.ts`, the rest of `lib/registry.ts`, `attest.ts`, the CSS or
  test-layout gates, `eslint.config.js`, `lib/artifacts.ts`.
- Did not fix the three real-tree ARM E violations (board #2256) and added no allowlist for them.
- Did not add a RUNNABLE-tier registry row for `ledger-claims` (ruled). The row it does carry is `manual`,
  in `lib/registry-manual.ts`, and exists only because `verify-registry-parity` reds without it (proven
  both directions above) — no tier auto-includes it.
- Did not measure whether `ops/structure.ts:83`'s artifact row should inherit #2234's two-term verdict.

## Deviations, with tree evidence

1. **`contract/scoped-test.ts` was edited** though the fence named only `ops/scoped-test.ts`. It is that
   op's OWN contract and no sibling lane owns it; the `projects` field is what makes the #2232 door read
   membership from the runner instead of guessing at a filename.
2. **`scripts/vitest-supervised.mjs` was NOT edited** — its `--runtime-only` handling already does
   everything needed (`parseArgs` consumes the flag, `runtimeConfigArgs` swaps the config, and it refuses a
   custom `--config` beside it).
3. **The brief's #2232 mechanism is half refuted** (see above): a bare runtime operand pays no ts7 pass and
   cannot be reddened, because vitest does not run the checker with zero matched type files. The defect is
   real in the shape where a typecheck project HAS a matched file, and the planted control proves it there.
4. **A NUL byte in a TypeScript string literal survives every editing path and turns the module BINARY** to
   grep and every other text tool, while rendering as a plain space. It cost two probe cycles here; the
   record fence is a plain ASCII token on its own line instead.

## Receipt corrections (cb-v-verify-lib-4, 2026-09-13)

Three counts in the text above were wrong when written and are corrected in place; the fourth is a
deviation this report CLAIMED it had avoided and had not.

1. `scoped-test.int.test.ts` is **10** rows, not 11.
2. `gate-modernization.test.ts` is **3** tests, not "4 passed" — the 4 came from a run that also carried a
   scratch probe file, and the probe's row was counted as the suite's.
3. **THE FORMATTER CHURN DID SHIP.** The #2232 section says the five untouched-context `\~`→`~`
   conversions were reverted. Two were; **three landed in `509d1d56a`** against that statement. The claim
   was written from the intent, not from the diff — which is the same failure the report's own §2249
   corrects in a proof row's `why`, one file over. The honest form: a formatter run on a shared doc converts
   untouched context into owned diff, this lane caught most of it and shipped some of it, and the receipt
   for "I reverted it" is `git diff`, never the memory of having done it.

## #2268 — a VOCABULARY set wearing an exemption name (appended leg)

`b5490a02a` correctly deleted `list-row-adoption`'s genuinely empty `ALLOWLIST` and its vacuous stale arm.
With `hasStaleArm` false, arm B — whose identity test is the const NAME — accused `ALLOWED_ROOTS`, which is
not a table: it is the gate's own SUBJECT VOCABULARY (the composite root names a LIST-surface row may
legally return), sibling to `LIST_SURFACE_IMPORTS` and `RENDER_PROP_NAMES`, with no per-file rows and
nothing that can go stale. **Renamed to `ROW_ROOT_NAMES`.**

**CUT BOTH WAYS** with the gate's own exported predicates (`hasStaleArm`, `exemptionCollections`) over the
loader's own corpus, 303 modules each time:

| tree | accused |
| - | - |
| tip | `list-row-adoption::ALLOWED_ROOTS`, `vector-scope-derived::IMPORT_SANCTIONED` |
| MODULE side (this fix) | `vector-scope-derived::IMPORT_SANCTIONED` |
| ARM side (`ALLOW` cut from the name vocabulary, the name reverted) | `vector-scope-derived::IMPORT_SANCTIONED` |

The corpus does NOT discriminate — both cuts land 2 → 1 with nothing else moving. **The discriminator is
what each costs elsewhere, and the arm side fails it:** with `ALLOW` cut,
`verifyGateProofs([gate-modernization])` goes **0 → 2 failures**, both
`expected a finding (token="ALLOWLIST") but got 0` — the arm's FOUNDING shape (a populated allowlist with no
stale arm, the ~57-gate one-sided census) and the #2219 inverted-carve tripwire. Arm B's own header already
rules it: *"Deliberately NARROW … The name is the signal: if a collection is scope, name it scope"*, and its
`fix` string names this remedy verbatim. **The ruling survives; its INPUT changed.** Arm B is untouched.

**PREMISE CORRECTION for the brief.** The second live accusation is
`vector-scope-derived::IMPORT_SANCTIONED`, not `own-tables-only::FILE_ALLOWLIST`. `own-tables-only` DOES
carry a `FILE_ALLOWLIST` (`:155`) and is NOT accused, because it carries a stale-arm string. Left alone;
not this row's subject.

Coupled sites swept for the literal: `tests/tooling/verify/gates/gate-modernization.test.ts:120` named the
old const in a MEASURED comment ("it shows TWO") — repaired to ONE with the date and the reason; its
ASSERTION is about the split-family shape and is unaffected. `gate-spelling-twins.baseline.json` and
`ledger-claims.test.ts` name the MODULE, not the const. The ledger and `v-wave-8a` rows are past-tense
RECORDS and were deliberately not rewritten.

Floors: corpus drive 303 modules 2 → 1 · `verifyGateProofs(list-row-adoption)` 2+4 rows, 0 failures ·
`verifyGateProofs(gate-modernization)` 48 rows, 0 failures · `gate-modernization.test.ts` 3 tests passed ·
`gate:contract` corpus total unchanged at 383 · biome + eslint exit 0 (the first eslint pass caught two
`tsdoc-escape-greater-than` errors in my new JSDoc; fixed with the unicode arrow) · typecheck PASS both
programs. **OWED at the barrier, not run here:** `gate-spelling-twins.int` — an orchestrator-only planter;
its baseline row keys the MODULE name, which did not change.

## Post-rebase re-verification

The lane rebased TWICE onto a moving main (`badc14944` → `e417baa5b` → `f211c4060`). A rebase is an
unreviewed 3-way, so the floor was re-run on each merged tree rather than inherited. Final state:
`pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` PASS both ·
`pnpm test:scoped` over 8 touched/coupled specs **160 tests, exit 0** ·
`pnpm check:policy-conformance` WHOLE **exit 0** (250 policies · 2985 proof rows · 9 refusal rows ·
0 failures). `git status --short` carries only this untracked report.
