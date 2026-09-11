---
kind: design
status: active
updated: 2026-09-11
---

# One ts-morph runtime for every Orb gate — the program guide (#1584)

The single operating document for the gate-runtime standardization program: the transition model, the state of the tree, the proof rules, the order of work, the per-conversion procedure, the dispatch mechanics, and the contract itself. It supersedes [gate-config-system.md](gate-config-system.md) and every earlier resume or atomic-cutover order. Receipts for what is done live under [`docs/reviews/gate-runtime/`](../reviews/gate-runtime/) (family records, the checkpoint, the censuses); those are evidence, never a task roster — the loader and `pnpm gate:contract` are the roster. Native Biome/ESLint/community rules continue to own generic ecosystem lint; every Orb-specific policy uses one ts-morph runtime and one capability contract. The exemplar gates to copy are in [exemplars-2026-09-11.md](../reviews/gate-runtime/exemplars-2026-09-11.md); `tooling/src/verify/gates/GATE-AUTHORING.md` is the LEGACY descriptor guide and is not an input to a conversion.

## 1. The decision that changed everything: mixed runtime, not atomic cutover

The integration branch was fast-forwarded onto `main` on 2026-09-11. The tree now carries both descriptor shapes in
production, so the atomic-cutover invariant ("no production state supports old and new descriptors together") is moot
and no longer an acceptance requirement. Purity guarantees such as zero legacy descriptors, zero legacy fields, or one
runtime shape are NOT gates on progress. The transition has three phases:

1. **Legacy-only production path** (where we are today): `check:structure` loads only `GateDescriptor`s and throws on
   a `defineGate` module; converted policies run only where a committed family test imports them.
2. **Mixed execution** (the next thing to build, before any further conversion): one front door loads BOTH contracts,
   runs each through its own dispatcher in one invocation, and reports them together. Every converted policy becomes
   a live gate the moment it lands. Conversion proceeds under this phase until the legacy set is empty.
3. **Legacy retirement** (future cleanup, not a prerequisite): delete the legacy loader, pass, markers, baselines,
   `__g_` fixture suites, the census command and `GATE-AUTHORING.md`'s descriptor law once the final corpus and
   acceptance evidence justify it.

Consequences: the mixed loader is a compatibility boundary at the loader/dispatcher/report layer ONLY. No compatibility
code enters a final policy module; no adapter makes a `defineGate` policy behave like a descriptor; classification is
by exact contract identity (a branded `defineGate` result vs a validated `GateDescriptor`), never by filename, property
name, or "try the old loader and catch". An unbranded or malformed lookalike is a tool error; every module is accounted
for exactly once; nothing vanishes from the roster.

## 2. Where the tree is (re-derive before dispatching; these are 2026-09-11 receipts)

| Fact | Value | Source |
| - | - | - |
| gate modules / final / legacy | 271 / 163 / 108 | `pnpm gate:contract` at `1925d3086`: 815 findings across 271 modules; 108 modules carry a descriptor-wrapper finding |
| converted modules with NO committed test importing them | 21 of 163 | orchestrator sweep 2026-09-11 (incl. `baseui-render-prop-composition`, whose missing `name` throws in the legacy loader) |
| ordinary policies with no positive `@orb-waive` identity arm | 52 of 86 | verified by two Opus verifiers reading gate + family tests + fixtures, 2026-09-11 (#1952); 8 landed at `efc8ace50`. A grep floor reports 50: it also counts `no-off-token-radius-shadow` and `no-form-state-in-useeffect`, whose only marker text is header prose and a sibling's negative arm |
| `mustFlag` rows carrying no `expect` | 0 — closed at `cf38cd6df` | all 39 pinned across 14 modules, with planted count/token/line breaks proving each dimension bites |
| last composed baseline (all final policies, full roster, central grants) | 119 policies: 304 raw = 182 waived + 105 granted + 17 effective; 2:03 wall / 6.55 GB on a loaded box | checkpoint-2026-09-05.md, wave 5 |
| central reviewed-grant table | 105 rows at wave 5 (+1 coarse-pointer row after the main merge) | `lib/reviewed-grants.ts` |
| shipped runtime | `defineGate` contract + validator, policy loader, `runPolicyPass`, six-kind scope resolver, planner/executor (`planPolicyArgv`/`executePolicyPlan`), ResourceHost with 7 closed kinds, `defineFact` providers (bus-producers, bus-definitions, drizzle-schema, registry-definitions, tuple-vocabularies), central ordinary-waiver engine, central reviewed-grant reconciler, hermetic conformance runner (`verifyPolicyProofs`) | checkpoint + planner-cli-integration.md + resource-host-foundation.md |
| NOT shipped | the mixed production front door; a whole-corpus conformance stage; `check:show` mapping of final owner/authority/tool-error data; ResourceHost kinds beyond the seven (document/ledger facts, Base UI surface, token contract, devtools closure, tsconfig programs, path-identity door, derived mirror index); the overload-aware barrel-re-export fix; `QualifiedName` normalization | #1930, #1941, checkpoint "runtime follow-ups" |
| known red by construction | `check:structure` (loader throw at `loader.ts:25`), `check-gates.repo.int.test.ts`, `gate-ignore-grammar.int.test.ts` (LEAKS `__g_gi` fixtures — never run on a shared tree), `enforcement-registry-parity` (blind to `defineGate`), 12 `types:graph` errors in five legacy-loader test files, `schema-fact-health` mustFlag rows (#1948) | checkpoint "Known red state" + today |

Prerequisite and defect rows: #1947 (native-config waiver carriers — landed `d18ee07f6`, at Verify), #1930 (missing
resource kinds and the path-identity door), #1941 (whole-corpus conformance runner — becomes §4 item 2), #1948, #1946
(guard residuals), #1922 (sanctioned-home tables → grants, incl. `ALLOWLIST`/`CALLER_FREE_OPS`), decisions #1939,
\#1921, #1950 (forge for the mixed-hook splits). Conversions themselves get no rows; they land as comments on #1584.

## 3. The contract, and how much of it a given gate needs

Every final policy MUST have (enforced by `tooling/src/verify/lib/policy-validation.ts`): `id` (= filename), `family`,
`authority`, `severity`, `population`, `analysis`, `execution`, `facts` (providers or `[]`), `resources` (requests or
`[]`), `message`, `create`, at least one `mustFlag` and one `mustPass` with explicit `mode`, `files` and `why`. The
export is a direct `defineGate({...})` object literal; one policy per module.

Gates do NOT all need every capability. Use the smallest complete contract for the gate's evidence plane:

| Capability | Required when |
| - | - |
| `visitors` | the gate judges delivered AST node kinds (kind-indexed; the only walk) |
| `visitFile` | one file-level callback is genuinely the shape (e.g. line counts, comment posture) |
| `evaluate` | post-walk or cross-file reasoning, resource judgment, fact consumption, grant candidates |
| `facts: [provider]` | it consumes a shared `defineFact` provider; read only via `ctx.fact()` in `evaluate` |
| `resources: [{kind,id}]` | `analysis: "resource"` (or a declared hybrid); read via `ctx.resources.*` |
| `ctx.checker()` | type identity or compiler-resolved semantics (`analysis: "types"`) |
| `workItem` | `severity: "warning"` only (positive issue number; forbidden on `error`) |
| `fix` naming the waiver spelling | `authority: "ordinary"` — the author needs the exact `@orb-waive <id>(<position>)` to type, and a policy whose reported token is a whole member chain (`no-form-state-in-useeffect` reports `node.getText()`, so `form.state.values` and `form["state"]["values"]` are different positions) is unusable without it |
| `execution: "entire-population"` | the verdict cannot compose over a subset (liveness, completeness, grants, tripwires) |
| `-health` sibling | an arm that differs in authority or severity from the rest of the module (identical `family`) |

Shape by plane, from the exemplars: pure syntax → `no-array-literal-querykey.ts`; entire-population tripwire →
`spacing-tier-home-health.ts`; closed resource → `server-layout.ts`; fact consumer → `schema-branding.ts`;
reviewed-grant identity → `no-raw-matchmedia.ts`; warning debt → `user-bus-deferred-member.ts`; split family →
`no-raw-spacing-in-features.ts` + its `-health`.

Non-negotiables inside a module: no `Project#getSourceFiles`, `getDescendants*`, `forEachDescendant`, `new Project`,
private cache, private marker parser, gate-owned exemption table, scope predicate or filesystem read; state in `create`;
`report.node` token is an exact slice of the node text, and when a policy passes NO token the sink DERIVES one
(`policy-pass-context.ts:109`): the first identifier, literal or keyword token in the reported node's own text that
contains no paren or newline. The derived token is what an author must type in `@orb-waive <id>(<position>)`, so a
policy reporting the type argument `Registry<string, number> | null` is waived at `Registry` and one reporting a cast
operand is waived at the operand's own text — unguessable from the message, which is why an ordinary policy's `fix`
owes the spelling; every anchor inside the policy's own resolved population;
population `under: ["x/**"]` (a `"x/"` matches nothing). A read the seven shipped resource kinds cannot serve, or a
shared reader that does not exist in `lib/`, STOPS that module (it stays legacy and armed) and returns the exact read to
\#1930. That refusal is a success; keeping a private reader behind `defineGate` lowers the census while leaving the
forbidden machinery in place.

Family = a shared `lib/` computation or subject reader (module + function), named in the header. Siblings that are two
spellings of one concept MERGE (the stronger identity reader wins; the retired arm gets a successor proof). A policy
with no proven sibling is a singleton family under its own id. A theme, a filename prefix or a shared topic is not a
family.

## 4. Proof rules

1. **Carry the legacy rows.** The legacy `mustFlag`/`mustPass` examples are the founding, near-miss, alias/identity and
   declared-limit cases. They translate one-to-one into `GatePolicyProof` rows (`mode`, `files` map, `why`), and they ARE
   the bite proof once `verifyPolicyProofs` runs them through the production dispatcher. Do not replace them with a
   few new happy paths; add rows only for behavior the conversion changed or the legacy suite lacked (an identity
   variant the stronger reader now catches, an empty/unresolved-subject control where the verdict depends on a derived
   population). **Every `mustFlag` row carries an `expect`.** `expectationFailure` returns early once one
   finding exists, so a row without `expect` asserts only that the fixture produced at least one effective finding, and
   passes when the gate flags the WRONG node or flags several where one was meant. Name `count` always, and `token`
   (or `line`/`messageIncludes`) whenever the row's `why` claims WHICH node flags. `token` is available on EVERY
   node-reporting policy because the position is derived when not supplied (§3). The expectation shape has no
   `column`, so `count + line + token` is the ceiling: add `line` when the derived token repeats inside the fixture
   (a statement's first identifier is weak identity). Before reaching for `messageIncludes`, check that the module
   emits more than one message — most converted modules pass a bare `report.*` and carry exactly one policy-level
   message, which makes any row `why` promising a "distinct message" a defect rather than a pinnable claim.
2. **Identity, once.** Each ORDINARY policy proves that its own report supplies the correct policy id and position:
   one POSITIVE arm, the correct `// @orb-waive <id>(<position>): <reason>` at the reported position, yielding 0
   effective findings, 1 waived, 0 alarms. Two shapes are valid — a `mustPass` row in the module
   (`schema-branding.ts:137`) or a `runPolicyPass` pin in a family test (`ordinary-visitors-family.test.ts:187-205`).
   The negatives are the CENTRAL engine's proof, run once
   (`tests/tooling/verify/lib/ordinary-waiver.test.ts`): wrong-policy, stale/dead position, malformed, missing reason,
   over-broad, duplicate consumption, unknown policy, hard/reviewed refusal, incomplete-owner withholding and
   consumption order. Never copy a negative arm into a gate; under `knownPolicies: [policy]` it rides the
   unknown-policy short-circuit and proves nothing.

   **The arm is self-checking, so write it without fear of the token.** `proofFailure` runs `toolFailure` before the
   arm verdict and fails on any `authorityAlarms`. `reconcileMatch` (`ordinary-waiver.ts:608-620`) alarms
   unconditionally on `malformed`, `unknown-policy` and `wrong-authority`, and alarms on `stale`, `dead-position`,
   `unbound-trivia`, `ambiguous-trivia`, `over-broad` and `duplicate-target` once the policy has entered
   `completedOrdinary` — which every ordinary policy does when it runs without a wrong-grant-authority condition
   (`gate-authority.ts:286-291`). A proof row's owner must succeed or `toolFailure` fails first, so inside a proof row
   every alarm is live: a wrong position, a foreign id, an over-broad match and a fixture that no longer flags each
   FAIL the row. No separate test and no planted break are owed. A `mustPass` arm need not assert
   `waivedFindings === 1`; naming the twin `mustFlag` row in its `why` is legibility, not correctness.
   **Build the arm on a fixture that produces exactly ONE finding.** One marker consumes one occurrence, so a founding
   row that fires twice (an import door plus its call site, as in `no-forward-ref` and `no-use-context`) leaves the
   second finding effective and fails the row; use the member or namespace arm instead, and state that cardinality in
   the `why`. **Prove discrimination once per family with a two-command control:** flip the marker's position in a
   `cp`-backed copy, run the family test, expect `AUTHORITY ALARM … names a dead position`, then `mv` the backup back.
   That converts "my arm is green" into "my arm discriminates".

   **Where the protection stops.** Completion-bound alarms are suppressed for a WITHHELD or wrong-grant-authority
   owner, which never completes, so a real-tree run can hold a dead marker silently where the proof corpus cannot. And
   `runPass` pins `knownPolicies: [policy]` with `reviewedGrants: []`, so a reviewed-grant policy cannot prove grant
   consumption in a module row at all; that belongs in a family test with a real grant table (§4.3).

   **Counting arms is a reading task.** A grep for `@orb-waive <id>(` overcounts: it matches sibling policies'
   negative arms, live product-tree waivers, and a module's own header prose promising a spelling. A marker naming
   your policy inside another policy's negative arm is not your arm.
3. **Reviewed-grant policies** prove exact `(subject, operation)` identity beside the family: the intended row is
   consumed exactly once; a wrong operation stays effective; a renamed/missing subject stales the row or withholds
   (`home-client-family.test.ts`). Generic grant-table validation is `tests/tooling/verify/lib/reviewed-grants.test.ts`.
4. **Hard policies** have no waiver arm. **Warning policies** keep their warning + `workItem` in proof and real run;
   debt is never converted into a grant to make a run clean.
5. **Refusal and receipt controls** wherever correctness depends on a home, provider, resource or derived population,
   and a proof row cannot express the failure: renamed/removed home, vanished subject, missing/empty/malformed/unresolved
   resource, incomplete or inconsistent fact, entire-population under a narrowed request, absent or forged receipt.
   These are `runPolicyPass` pins in the family test (`bus-pair.test.ts`, `bus-fact-health.test.ts`). A clean zero
   from a detector that might be blind is not evidence.
6. **Conversion differential.** For a converted policy, load the legacy descriptor from the pre-conversion SHA, replay
   every original example through the legacy dispatcher and the same bytes through the final policy, compare findings,
   populations and tool errors, and CLASSIFY each intended difference (split, retired arm, marker vocabulary, stronger
   reader). A retired or merged arm needs a successor proof (`simple-visitors-wave-2.test.ts`, `-wave-4.test.ts`).
   This is conversion evidence for the landing commit, not standing law.
7. **Invented rows owe a planted-break receipt.** Only when a lane adds a NEW row for a NEW property (a per-file index,
   an absent-subject arm) must it break that property in a scratch copy, show the row went red, and restore. A header that says "this row proves X" for a row never shown to
   catch X is a defect; a cross-file row whose fixture offsets never overlap is the worked example.
8. **Fixtures.** Source/type proofs are virtual files; resource proofs are auto-cleaned temp roots; real-corpus controls
   are virtual overlays on the loaded Project. No `__g_`/`__dc_` planting in the working tree for a final policy. A
   fixture's relative import that resolves to nothing makes every identity row pass by fail-closure while conformance
   stays green, so a specifier-resolution control is part of every family floor.
9. **One family test may cover several siblings**; a file per gate is unnecessary. Until the conformance stage in §5
   exists, every final policy must still be imported by a committed family test (the 21 uncovered modules are the debt).

## 5. The mixed-runtime work, first and alone (runtime lane; forge-class; nothing else runs beside it)

Until this lands, every "converted" gate is a file, not a gate. Build in this order, one lane, isolated worktree:

1. **Mixed loader.** Classify each `tooling/src/verify/gates/*.ts` module by exact contract identity; load legacy
   descriptors through `lib/loader.ts` and final policies through `lib/policy-loader.ts`; refuse unbranded lookalikes,
   duplicate ids and duplicate module identities; account for every module exactly once. Fix the `baseui-render-prop-
   composition` missing-`name` throw at the source of its shape, not by skipping it.
2. **One front door, one report.** `check:structure` (and the scoped path) runs the legacy pass and `runPolicyPass` in
   one invocation with the FULL final roster as `knownPolicies` and the central grant table; findings, owner status,
   authority, severity, population and timing land in the existing run manifest / `reports/check-structure.json` schema
   and `check:show` (the seam planner-cli-integration.md left open). Exit classes stay: 0 clean, 1 violations, 2 tool
   error, 3 misuse. Legacy markers route only to legacy owners; `@orb-waive` only to final ordinary policies; grants
   only to final reviewed-grant policies.
3. **Whole-corpus conformance stage** (#1941): a static `verify` stage that loads every final policy and runs
   `verifyPolicyProofs` over all of them. This retires "family test per module" as the bite receipt and closes the 21
   uncovered modules by construction. Family tests remain for §4 items 2 (runPolicyPass shape), 3, 5 and 6.
4. **Mixed-corpus test** (required, using one REAL legacy descriptor and one REAL final policy, not two synthetic
   objects): both load and execute in one invocation; both contribute to one report; id/authority/severity/owner
   status/population/timing distinguishable; marker and grant routing as above; unbranded lookalike rejected; duplicate
   id rejected; a missing/malformed module cannot vanish; one failed or incomplete owner withholds only its own
   authority reconciliation with explicit failure state; deterministic exit and JSON.
5. **`enforcement-registry-parity`** rewritten to read both contracts (today it reads `name`/`status` off the legacy
   literal and is blind to every final policy). `check-gates.repo.int.test.ts` and its `UNFIXTURABLE_GATES` list come
   back to life under the mixed loader, or are explicitly retired with successor proofs per the carry-forward table.
6. **Baseline read.** Run the mixed `check:structure` once on quiet `main`. What is red is now REAL: untranslated legacy
   markers (315 `ONESHOT-OK` + 55 `@owner-scope*` + the 633 `@orb-gate-ignore` sites once their owners convert),
   product violations, missing kinds. Classify once, file the defects, record the baseline in this section.

Then re-enable the lefthook pre-commit when `check:structure` is green on `main`; until then every commit and merge runs
with `git -c core.hooksPath=/dev/null` and names its scoped floor.

## 6. What is done and what remains

**Done (see the family records for receipts):** the 14 mechanical singletons; id-brand flow (`schema-branding`,
`brand-in-name-position`, 73 markers translated); schema-fact consumers (`db-enum-from-tuple`, `nullable-column-
inequality`, `ownerid-registry`, `schema-banned-shapes` + `contract-banned-shapes`; `asset-refs-fk-coverage` retired
into `check:asset-refs`); registry family (9 → 11, two reviewed-grant splits); canonical-origin client (12) and
server/test (14) families with seven shared readers; sanctioned-home server (10 → 11, 40 grant rows) and client (14, 30
rows) families; the bus pair (`user-bus-coverage` + `bus-definition-belts` → 6 hard policies, generic
`bus-producer-coverage`, the overload-aware origin reader); ordinary visitors (10 → 15); resource layout/size (6:
`feature-owns-definition`, `package-layout`, `ui-exports-map-complete`, `server-layout`, both `component-size`);
2026-09-10/11 waves: `tooling-size`, `commented-code`, `types-in-contract`, `verb-naming`, `test-determinism`,
`member-card-clamped`, raw-CSS-literal family (spacing/typography + `-health` siblings), ui-token-surface (3), contract
shape (6 incl. `injected-op-caller-param` split), tenancy family (`table-scoping-class` + 3 owner-scoped), CT/story
harness (4 incl. `ct-poll-schedule-and-paint` split), `verify-registry-parity`, `depcruise/eslint-grant-liveness`,
`external-id-single-writer` pair, and the four simple visitors of 2026-09-11 (`no-default-props`, `test-no-stubs`,
`no-form-state-in-useeffect`, `persist-partialize-and-total-migrate` with its ARM A retired into
`no-raw-zustand-persist`).

**Remaining, 108 modules, by what blocks them** (from `pnpm gate:contract` at `1925d3086` plus the census docs):

| Bucket | Approx. count | Blocker / prerequisite | Lane class |
| - | -: | - | - |
| resource-backed (`fsBacked`) run/visit/file gates: CSS family (14), config/compiler liveness (`biome-`, `tsconfig-entry-`, `runner-config-path-liveness`), Base UI + installed/generated (7), documents/registries/ledgers (9), `db-structure`, test-presence pair, `tooling-instrument-proof` | \~40 | ResourceHost kinds not shipped (#1930): document/ledger facts, Base UI surface, token contract, devtools closure, tsconfig programs, derived mirror index, path-identity door; CSS census/static-class parity adjudication (design resume step 2) | runtime lane per kind, then executor per family |
| run-only pure-AST gates (whole-population evaluators) | \~21 | shared facts for registries/coverage/static values; several need `evaluate` on an existing provider | executor (Opus) |
| direct-walking visitors and file hooks | \~35 | inversion into visitors + ancestor checks, or a shared reader; state into `create`; marker vocabulary translation | executor (Sonnet where the reader exists; Opus where a reader must be added) |
| the 13 ruled mixed-hook modules (`tooling-argv-front-door`, `tooling-shared-plumbing`, `no-inline-union-redecl`, …) | 13 | multi-way splits touching `lib/reviewed-grants.ts` and exported coupled sites | forge (#1950) |
| self-policing gates that read the gate corpus (`enforcement-registry-parity`, `gate-ignore-inventory`, `finding-overload-provenance`, `gate-modernization`, `dangling-refs`) | 5 | §5 items 1–5; two retire at legacy deletion | runtime lane |

Exact rosters: `pnpm gate:contract` (descriptor-wrapper findings = the legacy set), the per-gate blocker tables in
`uncovered-gate-conversion-census.md`, and the 53-row resource manifest in `resource-gate-access-patterns.md`. None of
those documents is a progress board; the loader and the census are.

## 7. Order of work

1. §5 runtime lane, alone. Forge. Land, verify (Opus verifier), baseline.
2. Runtime prerequisites that unblock the largest families, one lane each in dependency order: #1930 path-identity door
   and document/ledger facts; CSS census/static-class parity adjudication; Base UI surface; token contract + devtools;
   tsconfig programs. Each ships as a provider with ready/missing/empty/unresolved receipts and its own controls; no
   gate converts on a kind before the kind lands.
3. Conversions, cap 3, one family per lane, in this order: remaining direct-walk visitors and file hooks (readers
   exist) → run-only evaluators on existing providers → resource families as their kinds land → the 13 mixed-hook
   splits (forge, #1950). Each conversion lane ALSO translates its own legacy markers in the same commit (comment-only
   edits under `packages/**` / `tests/**` are in that lane's fence) so the converted gate is green on the live tree at
   landing; marker translation is conversion work, never a separate final-launch lane. Marker grammar and
   binding rules: `ordinary-waiver-source-migration.md` §"Exact central grammar".
4. Authority reconciliation: #1922 (sanctioned-home tables and the remaining gate-owned typed tables → central grants),
   the 9 baseline JSON ledgers → fixes, exact grants or `workItem` warnings (`exception-authority-census.md` has the
   per-row disposition), decisions #1939 and #1921.
5. Legacy retirement when the census is zero: the atomic cutover checklist in `ordinary-waiver-source-migration.md`
   §"Atomic cutover checklist" is the deletion list (legacy parser/pass accounting, `markerImmune`, the two retired
   auditors, `__g_` suites, baselines, census command); `GATE-AUTHORING.md`, `gate:new` and `gate-modernization`
   rewritten against `defineGate`; idle composed-pass remeasurement; catalog re-attest.

## 8. Per-conversion procedure (the decision rule every lane follows)

1. Re-derive: is the module legacy or final (`gate:contract` row, not the filename)? Read it in full, plus §12's
   contract sections, the exemplar for its plane, and any world-program carry-forward row naming it (re-read the CURRENT
   implementation on `main`, never an older branch copy).
2. Trace every read, one `lib/` hop included. A read outside the seven resource kinds, or a needed reader not in
   `lib/`, stops the module with the exact `file:line` and continues with the others.
3. Check already-converted siblings for the same rule (`pnpm ast` on the module's core literal): a stronger detector
   elsewhere means MERGE with a successor proof, not a second gate.
4. Name the family and its `lib/` reader, or declare a singleton. Split arms that differ in authority or severity into
   `-health` siblings with the identical `family`.
5. Port the population losslessly (named roots + `under`/`notUnder`); prove the admitted set byte-identical or record
   the intentional correction in the header. Resource gates declare `{ of: "none", why }` plus their resource requests.
6. Move state into `create`; invert walks into kind-indexed visitors plus ancestor checks judged in `evaluate`;
   replace a private marker grammar with `@orb-waive` and TRANSLATE the live markers in the same commit (count them:
   markers / files / trailing-position sites; a trailing marker moves to the line above; a marker with no finding is
   dead text you list, never invent a waiver for an unmarked finding).
7. Proofs per §4: carry every legacy row; add the positive identity arm if ordinary; add refusal/receipt pins where the
   verdict depends on a derived population; conversion differential; planted-break receipt only for invented rows.
8. Floors (scoped, never whole-tree): the family test(s) you touched; `pnpm gate:contract` before/after (per-module zero,
   total not rising); `pnpm exec biome check <files> --diagnostic-level=error`; `pnpm exec eslint <files>`;
   `pnpm typecheck --config tsconfig.json`; behavioral mirror suites for any product file whose comments you touched
   (comment-only edits still owe the compile). After §5 lands: the mixed `check:structure` before/after on the real
   tree with the finding delta explained.
9. One commit, `git -c core.hooksPath=/dev/null commit` (owner-authorized until `check:structure` is green), the floor
   named in the message, `git status --short` empty, `git show --stat` in the report.
10. Report: per-module population port, authority/severity, family + reader, proof rows added, differential result,
    marker census, refusals with `file:line`, deviations with tree evidence, proposed lessons as text. The orchestrator
    posts it on #1584, merges by fast-forward from an isolated worktree, and dispatches one Opus verifier per wave;
    nothing is Done before CONFIRMED.

## 9. Dispatch mechanics (orchestrator)

- Lanes run in isolated worktrees off `main` (`isolation: "worktree"`; the hook installs deps and links memory) and
  land by orchestrator fast-forward with the hook path nulled; a lane rebases in its worktree if `main` moved.
- Roles and models: runtime/architecture lanes and the 13 splits → forge (owner ruling #1950 pending); families where a
  reader must be added → Opus executor; fully-specified conversions on existing readers and marker translation →
  Sonnet executor / mech-executor (owner test 2026-09-11: mechanical work and header honesty consistently good;
  self-checking of an INVENTED proof's discriminating power consistently absent, so §4.7 is briefed explicitly); every
  verifier → Opus, one per wave, read-only, probes announced by SendMessage and prefixed with the lane name.
- Cap 3 concurrent lanes; the §5 runtime lane runs alone; whole-tree runs never alongside lanes; engines stopped and
  prod down for the program's duration.
- A brief carries: this document and the exemplars by path; the exact module list with legacy SHAs for
  the differential; the family hypothesis (a hypothesis until the lane names the reader); the fence (files it owns,
  sibling lanes' files it must not touch); the floors above; the hazards (`vitest list --json=`, rg `-r`, never
  `git stash`/`checkout`/`restore`, no whole-tree runs, runs over ten minutes report and stop, `GATE-AUTHORING.md` is
  the LEGACY guide); the report shape. Nothing else.
- Board: conversions are #1584 landing comments; only defects, prerequisites and decisions get rows; `--evidence`
  under \~700 characters (#1920); `done` only after the Opus verifier CONFIRMED.

## 10. What is no longer required

Zero legacy descriptors or legacy fields before the final cleanup; deleting the legacy loader, pass or marker parsers
now; proving old and new can never coexist; a green `check:structure` before the mixed front door exists; a test file per
gate; copying the central negative marker cases into every gate; treating every whole-tree red as a conversion defect;
deferring marker translation to a separate final-launch lane; a board row per converted gate; a SELF bridge map at
every dispatch. The mixed runtime still requires honest reporting and explicit failure ownership: no silent skipping,
no name-based dispatch, no false-clean receipt, no undocumented behavior difference.

## 11. Rulings ledger (owner, dated)

- 2026-09-05: final AST source populations are `.ts`/`.tsx` only; `.mts/.cts/.mjs/.cjs` are cleanup.
- 2026-09-06: sanctioned homes convert as exact reviewed grants with liveness, never population subtraction; the
  `chatsChanged` conditional publisher is modeled, not parked; a compact map is written only when a sentinel fires.
- 2026-09-10: `--dod` is optional; red instruments are expected mid-migration and are baselined, never laundered.
- 2026-09-11 (night): #1939 — `duplicate-action-doors` converts as a HARD cardinality policy (the algorithm owns
  "one door per action per surface"); its six ratified surfaces become exact `(surface, action)` reviewed grants and
  the ratchet JSON is deleted. #1921 — no third receipt kind; a counter is a field on a ready fact/resource receipt.
  The lefthook hooks come back on when the mixed `check:structure` is green on `main`, not before and not later.
  \#1948 (`schema-fact-health` proof red) is fixed inside the phase A runtime lane.
- 2026-09-11 (evening): forge runs the mixed-runtime lane alone, and forge runs the 13 mixed-hook splits (#1950 ruled);
  conversion lanes translate their own markers in-commit and the pre-existing 370-marker backlog is one resumed
  mech-executor lane; the #1947 lane's two real-tree zero-findings arms stay until the mixed front door lands, then are
  deleted; executors run Opus by definition (Sonnet only where the owner names it). The orchestrator's step list is
  [gate-runtime-orchestrator-playbook.md](gate-runtime-orchestrator-playbook.md).
- 2026-09-11: main is the integration tree (ff of `codex/world-gate-integration`); mixed runtime replaces atomic cutover;
  lanes in isolated worktrees, orchestrator merges, hooks bypassed until `check:structure` is green; cap 3; Sonnet
  executors for fully-specified gate work, Opus on judgment-heavy work and every verifier; conversions are #1584
  comments; `GATE-AUTHORING.md` is the legacy guide; proofs carry the legacy rows, prove identity once with the positive
  arm, and owe a planted-break receipt only for invented rows; conversion lanes translate their own markers in-commit.

## 12. The contract

### 12.1 Final descriptor

```ts
defineGate({
  id,
  family,
  authority: "hard" | "ordinary" | "reviewed-grant",
  severity: "error" | "warning",
  workItem: 1584, // required positive issue number for warning; forbidden for error
  population,
  analysis: "syntax" | "types" | "resource",
  execution: "selected-files" | "entire-population",
  facts: [sharedFactProvider], // explicit [] when none
  resources: [{ kind, id }], // explicit [] when none
  message,
  fix,
  create(context) {
    return { visitors, visitFile, evaluate };
  },
  mustFlag,
  mustPass,
});
```

- `population` replaces `scopeSafety` plus `scanRoot`. It is declared data resolved once into a manifest; file, folder,
  package, project, changed, whole, check and family selection all use the same manifest algebra.
- `execution` states whether a verdict composes over an arbitrary selected subset or requires the gate's entire declared
  population. A narrowed request defers an `entire-population` gate, or refuses under strict scope.
- `create` runs once per invocation and closes over mutable state; `begin`, module-global accumulators and re-entry
  cleanup disappear. `create` receives only the resolved files/resources, the lazy checker, shared query services,
  report/receipt sinks and invocation metadata — never a `Project`. Its `visitors`, optional `visitFile` and optional
  `evaluate` run in that order; `evaluate` is the post-walk phase for cross-file judgments and stale-grant
  reconciliation, and runs BEFORE central waiver/grant liveness reconciliation.
- `visitors` are the one kind-indexed walk. A gate module cannot call descendant/project traversal APIs.
- Central post-processing owns inline waiver lookup, typed-grant consumption/liveness, severity, sorting, completeness
  and reporting. Gate order cannot change suppression/grant reconciliation.
- One authority and one severity per descriptor; an old multi-arm module whose arms differ on either axis splits into
  separate policy ids under one `family`. `id` equals the filename; the live family set is derived from loaded
  descriptors (no family registry); `docRow` and the hand-counted enforcement-roster row disappear.
- Every self-proof row declares its fixture mode and paths explicitly; no default path inferred from population and no
  fake real-tree anchor decides the substrate.

### 12.2 Standard capabilities every gate gets without implementing them

One sanctioned `pnpm` command with tier plus file/folder/package/project/changed/whole scope; explicit `--check`,
`--family`, strict-scope refusal, list/explain, JSON report, stable exit codes; requested and effective population
manifests including deleted/renamed semantic paths; compiler-derived program membership and one lazy checker per
workspace; error/warning severity with opt-in warning promotion; hard unsuppressible policy, exact ordinary occurrence
waivers, exact reviewed subject/operation grants; missing/empty/unresolved population refusal and failed-owner
reconciliation withholding; per-gate files/members/resources/timing receipts; one pass-local shared-fact registry (one
collector over an exact population, read-only sibling consumers); one fixture runtime for `mustFlag`/`mustPass`.

### 12.3 Shared query boundary

Gate modules may inspect the node delivered to a visitor, iterate their resolved `ctx.files`, request a canonical source
file, request the shared checker, and call shared readers. They may not call `Project#getSourceFiles`,
`SourceFile#getDescendants*`, `forEachDescendant`, `new Project`, or maintain their own workspace cache.

Shared whole-population work is a branded `defineFact` provider with its own id, population, analysis, resources,
collector, finish hook, receipts, timing and errors. Policies declare provider tokens in `facts` and read them only via
`ctx.fact(provider)` during `evaluate`. The dispatcher instantiates each unique provider once, feeds it in the same
physical walk, finishes it before policy evaluation, and withholds every dependent policy on failure. **A provider's
RECEIPT granularity must match its consumers' DEPENDENCY granularity.** A provider covering N subjects that files one
summed receipt withholds all N subjects' consumers when any one subject fails, including consumers that read only a
healthy subject. `registry-fact.ts:300-304` sums `members` and `unresolved` across six kinds while every consumer reads
one kind through `forKind`, which is why a fixture proving one kind is refused for the other five (#1953). Do not
"fix" such a case by treating an unresolved subject as absent: §12.3's own rule is that unsupported syntax returns an
unresolved fact or a tool error and NEVER returns absence, and collapsing the two silently blinds the consumer. Early/undeclared
reads, duplicate provider ids, selected-file consumers, unused dependencies, missing receipts and unconsumed resources
refuse. The registry is invocation-local.

The shared reader layer owns: stable local binding resolution until write/cycle/dynamic ambiguity (no hop cap);
import/export/namespace/destructuring/computed-literal symbol origin; static string/number/object/tuple/Zod value
resolution; class/JSX/DOM writer provenance; schema, finite-shape, bus, section, Base UI, tenancy, CSS and resource facts;
sanctioned-home and exact grant liveness. A unique policy algorithm may live in `verify/lib`, but repository walking,
binding identity, static-value unwrapping and resource loading are shared primitives. Unsupported syntax returns an
unresolved fact or tool error; it never returns absence. API guidance: `tooling/src/verify/gates/TS-MORPH-CAPABILITIES.md`
and `NODE-26-FILESYSTEM-CAPABILITIES.md`.

### 12.4 Population vocabulary

Named roots exist only for independently selectable workspace packages and top-level authored trees (`@client`, `@ui`,
`@server`, `@db`, `@contracts`, `@kit`, `@tooling`, `@tests`, `@scripts`). Nested directories use `under`/`notUnder`
(end-anchored globs; `"x/**"`, never `"x/"`); they do not get another hand-maintained root alias. Sanctioned homes are
exact reviewed grants with rename/deletion liveness, never population subtraction. Resource gates declare
`{ of: "none", why }` for TS dispatch plus their explicit resource population. A predicate that cannot be represented
without loss blocks that conversion until the algebra gains one reviewed, tested operator or the change is classified;
there is no custom-resolver escape hatch. Generic Orb policies apply to `tooling/src` and `tests/tooling` too. The
source universe is authored `.ts`/`.tsx` only; JSON/JSONC, CSS, Markdown, SQL enter only through closed ResourceHost
declarations (seven shipped kinds: authored-tree, authored-css, product-css, package-metadata, static-config,
native-config, tracked-files); a hybrid's dual role is explicit and receipted.

### 12.5 Exceptions and authority

No gate-specific exemption grammar and no count ratchet. `hard` findings have no suppression door. `ordinary` findings
may consume the one central inline marker `// @orb-waive <policy-id>(<position>): <reason>` (also `/* … */` and
`{/* … */}` carriers), bound to the exact policy and position with a mandatory reason; a node finding binds to leading
trivia on the node or its ancestors up to the enclosing statement; a file/resource finding binds only to the line
immediately above; one marker consumes exactly one occurrence; unused, malformed and over-broad markers are central
reconciliation findings. `reviewed-grant` findings may consume only a typed central grant keyed by policy id, subject and
operation, with `why` and `endsWhen`; after a complete owner run zero consumption is stale and more than one match is
over-broad and suppresses none. `error` blocks; `warning` is visible and blocks only under warning promotion; unresolved
debt is a warning tied to a positive `workItem`. Reconciliation runs only after every selected owner completed its
population; a thrown, incomplete, empty or unresolved owner withholds liveness rather than falsely staling grants. Gate
modules receive neither grant tables nor marker parsers. Current-population declaration counts, every-file manifests and
`*.baseline.json` debt retire (dispositions per row: `exception-authority-census.md`).

### 12.6 The 13 mixed-hook modules, ruled before conversion

| Current module | Final mapping |
| - | - |
| `agent-bridge-lock` | visitors plus exact-file `visitFile`; all cross-file reconciliation in `evaluate`; one hard policy |
| `design-audit-rule-proof` | registry/proof visitors plus `evaluate`; one hard policy |
| `no-inline-union-redecl` | ordinary union/respell policy, reviewed SDK-mirror grant policy, and hard grant-health policy under one family |
| `query-boundary-reservation` | ordinary unreserved-boundary policy plus hard duplicate/seam-health policies |
| `session-channel-boundary` | ordinary construction policy plus hard home-health policy |
| `sub-floor-disclosure` | ordinary occurrence policy plus hard vocabulary-health policy |
| `testid-liveness` | ordinary dead-consumer/row policy plus hard registry-health policy |
| `tooling-argv-front-door` | ordinary illegal-reader, reviewed entry-grant, and hard population-health policies |
| `tooling-front-door` | ordinary import-boundary policy plus reviewed root-config grant policy |
| `tooling-instrument-proof` | syntax/resource visitors plus `evaluate`; one hard policy |
| `tooling-ops-direct-invocation` | canonical exported-function/module-call facts plus `evaluate`; one hard policy |
| `tooling-shared-plumbing` | separate family ids for Project home, browser doors, artifact/run-slot, exit/CLI, child-process priority, ports, and clock budgets; each id has one authority |
| `ui-variant-axes-stamped` | hard recipe/duplicate/blindness policies plus work-item-linked warning debt; baseline deleted |

### 12.7 World-program guarantees that must survive (re-read the current implementation before converting a named policy)

The completed world/test program (#1351, phase 4 #1862) repaired the production legacy path while this program
remained incomplete. Its changes are INPUTS to conversion, not disposable transitional behavior. Before converting a
touched policy, re-read its current implementation and proofs on `main`; never restore an older gate-branch copy. The
comparison anchor is tinker commit `6c8424806704ac9322cc2ff5fe0334801b3d1801`, an ancestor of the integrated tree:
re-derive the complete delta with `git diff 6c8424806 HEAD -- <the policy and its readers>`, including shared readers,
native configs, hooks, moved source owners and tests. The per-row SHAs below are the evidence to read, not a roster.

| Guarantee | Current owners / evidence | Required proof |
| - | - | - |
| Test-kind registration and source mirroring | `_shared/test-kinds.ts`; `gates/test-layout.ts`; a8c4461db, #1862 follow-ups | registered DOM/runtime/type/suite kinds keep distinct meaning; unsupported test-shaped names fail, including in helper trees |
| Presence and mutation/execution population semantics | `gates/test-presence*.ts`, `verify/ops/tests-execution-membership.ts`, `verify/lib/ct-view.ts`, `mutation-probe/lib/mirror.ts`; aefec8d9a | persistence requires integration coverage, schema contracts require contract tests, type-only files cannot satisfy runtime presence, native collection stays independent |
| Current source ownership and exact grant identities | forms/editor, rendered components, appearance/session and scroll ownership; 1a77f8d83, 370243fe7, b849e7add | updated subjects and grants resolve at current homes; no stale old-path permission survives |
| Actual compiler roots and post-transform diagnostics | shared compiler reader and codemod; 708e709a1, f2d3f1ddc | native post-transform roots and full affected-program diagnostics detect wrong/missing owners AND broken unchanged consumers |
| Shared file routing and independent native parity | `verify/lib/program-routing.ts`, `verify/ops/tests-type-membership.ts`, the post-edit hook; dc8ccbd0b / #1893 | primary roots and affected closures keep separate meaning; native TS7 independently checks the shared parser; main-registered hooks check the EDITED worktree with its own dependencies, and malformed/skipped/failed checks stay explicit non-verdicts |
| Native executable-config observations | `verify/ops/config-snapshot.ts`, `gates/runner-config-path-liveness.ts`; dc8ccbd0b | Vitest selectors from its public loader incl. imported/called/spread config; exact selector containment and file/directory semantics survive the resource-host conversion; unjudged globs stay visible |
| Predictive ownership and ambient/library closure enforcement | `verify/ops/tests-type-membership.ts`, `_shared/type-config-intent.ts`; phase 6 #1896 | required/exclusive roots, exact ambient roots and closure sets, unknown intent, ISO/Node library leaks keep independent negative controls; native/shared root parity runs in THIS stage, so do not resurrect the retired `tsconfig-routing-parity` gate and do not drop its successor check |
| Native ESLint scoped grant populations | `verify/ops/config-snapshot.ts`, `gates/eslint-grant-liveness.ts`; 084991033 / #1895 | preserve default selection, local ignores/basePath, ordering and per-entry identities; local-ignore counterfactual measurements must not widen unrelated selector populations; keep native comparison controls and do not restore the former static evaluator |
| Unified native type execution | `verify/ops/typecheck.ts`, `verify/lib/registry.ts`, `scripts/ts7.cjs`; cfb9cea2f | every selected affected program executes; empty/refused selections and abnormal exits explicit; do not restore removed graph/browser stage flags or aliases |
| Native mutation config composition | `_shared/stryker-config.ts`, both Stryker configs; a24feaadb / #1897 | preserve profile options, mutable branches, worker eligibility, calibrated thresholds; native dry runs prove loading and test execution and NEVER substitute for mutation-score calibration |
| Native snapshot startup cost | `verify/ops/config-snapshot-entry.ts`, `verify/lib/config-snapshot.ts`; native-loader diagnosis 2026-09-10 | synchronous gates stay behind the narrow private worker instead of eagerly loading every verify operation (measured 1.75 s / 435,320 KiB RSS down to 0.55 s / 154,412 KiB with equivalent snapshots; the 108-test native regression set passes at ordinary timeouts); preserve JSON/error/root semantics and independent loader controls |
| Browser contracts require the real DOM world | `gates/test-world-browser-contracts.ts`, `verify/lib/browser-contract-reader.ts`, their gate tests and the real InputProps fixture | canonical browser components, aliases and React DOM contracts reject in Node-intent tests, while pure data, ReactNode and genuine Node globals stay LEGAL; preserve unreadable-origin refusal and migrate the real-corpus proof to the final overlay fixture runtime |
| Pass-local semantic reader performance | `verify/lib/pass.ts`, `reference-fact.ts`; 763ddf019 | the shared reference cache lasts exactly one dispatcher invocation; repeated queries reuse it and later invocations cannot reuse stale answers; compare identical findings AND populations as well as timing |
| Fresh type verdicts | `scripts/ts7.cjs`, both Vitest type projects; 7d9cd503e / #1892 | warm/changed/restored produce green/red/green without deleting caches; long and short forced incremental flags cannot bypass the wrapper |
| Owned fixture resources | `check-gates.repo.int.test.ts`, `gate-ignore-grammar.repo.int.test.ts`, `tests/server/entry/lifecycle.int.test.ts`; #1862, 27126f77e | concurrent proof instances cannot delete or observe each other's fixtures; per-instance db/assets roots; lifecycle uses an OS-assigned port and independently proves its security and concurrency properties |
| Honest abnormal-run artifacts | `tests/tooling/verify/ops/structure.int.test.ts`; #1862, c8ff56723 | kill/OOM controls reach the intended execution state BEFORE failure and verify the incomplete-run artifact and exit class; a startup failure is not equivalent evidence |

A final mechanism may replace an implementation (virtual overlays for live-tree sentinels) but must retain the behavior
and its independent regression proof; record the successor proof when retiring an old harness test. **Inherited from the
world program:** the owner deferred live-tree gate-fixture redesign/retirement INTO this program, and the two legacy
fixture writers still share paths, so this table does not claim they are isolated or safe to parallelize.

### 12.8 Acceptance for the program (unchanged from the design)

Every current policy has one live owner or explicit retirement; zero `scanRoot`, `scopeSafety`, `begin`, `finalize`,
free-form `run`, direct walk, gate-owned Project or mutable module state in gate modules; zero gate-owned glob, path
regex, comment parser, binding resolver, static-value parser, resource loader or workspace cache; every registered policy
supports all declared command/scope/severity/report/authority capabilities; all source/helper/tests/exemptions read in
full and every world-program delta re-attested with successor proofs; alias/namespace/re-export/destructure/computed/
wrapper/shadow/write/cycle/dynamic variants planted wherever identity matters; no baseline JSON or parallel registry;
full structure, focused behavior, differential, failure/re-entry, broad CPD and performance/RSS artifacts read before
owner review.
