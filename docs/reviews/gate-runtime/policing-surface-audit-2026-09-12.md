---
kind: review
status: active
updated: 2026-09-12
---

# The policing-surface audit — every rule the final contract states × the enforcer that holds it (#2111, #1584)

Lane `cb-forge-policing-audit` (forge, owner-authorized 2026-09-12). The owner's question, verbatim: *"make sure that
one, we have something that is ENFORCING our modern gates to not do anything not in contract, and if it does have
something that needs added then it gets added; and then our policers that police are set to enforce the various arms
and fields etc."* Nobody had built the MATRIX of contract-rule → enforcer; gaps were found one verifier at a time.
This document is the matrix (§5), the design of what was built to close the expressible gaps (§2), the alternatives
rejected (§2.3), the coupled-site inventory (§3), the test plan (§4), the receipts (§7), the law deltas the three gate
docs owe (§8), the ledger rows (§9) and what this lane did not cover (§10).

**Law read, in this order (the owner's amendment fixed the reading list to the new program only):**
`gate-runtime-read-first.md` §0/§4 → `gate-runtime-standardization.md` §3, §4 (whole), §5, §5b, §7, §8.8, §11, §12
(whole) → every `tooling/src/verify/contract/*.ts` header (78 files) → `docs/design/resource-policy-contract.md` →
the scope files whole. `GATE-AUTHORING.md`, `contract/gate.ts`'s descriptor law, `exemplars-2026-09-11.md`, the audit
waves and the stale lines of `.claude/rules/gates-and-tooling.md` (#2076) were NOT inputs for what a final policy
must be; where the matrix cites them it is to name the legacy shape a row excludes.

**Memory consulted (shared store, read-only):** `gate-authoring-hub.md`, `gate-authoring-lessons-hub.md`,
`gate-migration-1584-lessons-hub.md` (the `mustRefuse` gap, the fact-subset backwards prescription, the "roster row
names mechanisms" rule, the workItem-openness note), `gate-and-lint-blind-spots-hub.md`,
`instruments-lie-verify-the-verifier.md`, `new-doc-catalog-two-commit-stack.md`.

## 1. Premises re-derived on the tree (every number is from an AST run over the 246 final modules at `0c5bedfd7`)

The brief carried a ~50% stale-row rate warning, so every premise was re-measured before the design was written. The
census script parsed every `tooling/src/verify/gates/*.ts` with ts-morph, classified a module as FINAL by the loader's
shape (`gate = defineGate(…)`), and asked each question by node kind, never by text.

| Premise (brief / owner) | Measured | Consequence for the design |
| - | - | - |
| "only 1 of 246 modules carries a refusal row" | TRUE — `policy-soundness` alone carries `mustRefuse:` | the discriminator rule has one live consumer today; it is built at LOAD so it binds the next 245 the moment they add a row |
| "no arm polices a `mustRefuse` row's `messageIncludes` against the runner's generic prefixes" | TRUE — `assertRefusalExpectation` requires only a non-blank string; the runner's envelope (`PASS TOOL ERROR`, `OWNER <status>/<population>`, …) lives as template literals in `ops/policy-conformance.ts` with no other reader | the envelope becomes DATA in the contract (§2.1), consumed by the runner AND the validator |
| "9 `ExemptionTable` declarations across 8 FINAL modules" (owner) | **10 declarations across 9 FINAL modules** import `contract/gate.ts` (`ExemptionTable` ×8, `ExemptionRow` ×2, `Finding` ×2): `contract-derives-not-respells`, `depcruise-grant-liveness`, `domain-freshness-plane`, `eslint-grant-liveness`, `injected-op-caller-param`, `lifecycle-portability`, `no-raw-spacing-in-features`, `no-raw-typography-in-features`, `runner-config-path-liveness` | NONE today (`gate-modernization` ARM B demands only a STALE arm and is a legacy meta-gate); built as the import-ORIGIN arm `policy-legacy-imports` (§2.2), which REDS those nine — they are ledger rows (§9), never edits by this lane |
| `defineGate(<non-literal>)` | 0 live — and a BLIND SPOT: `finalDescriptorOf` returns `undefined` for a non-literal argument, so every arm of the soundness family skips such a module while the loader accepts it | built as policy-soundness E7 (§2.4), hold-at-zero |
| `analysis: "types"` with no compiler read (the converse of ARM E) | **113** types policies make zero direct type-read calls; all but one read types through `lib/` readers (`scrubber-factory-home` imports no reader and reads exports through the symbol table) | NOT expressible at depth 0 — a depth-N arm across `lib/` hops is a future reader; recorded as judgment (§5 A18) |
| `execution: "entire-population"` whose verdict composes per file | 0 final modules declare `entire-population` without an `evaluate` hook | built as a `create`-phase refusal in the dispatcher (§2.5), hold-at-zero |
| a retired marker grammar parsed in a FINAL module (§7 kinds 1 and 3, 16 spellings) | 0 regex literals, 0 `includes/startsWith/test/exec` arguments | built as policy-soundness E6 (§2.4), hold-at-zero, one row per spelling |
| `ctx.fact()` outside `evaluate` | 0 sites; and the runtime already throws `declared fact is not finished` for a visitor-phase read on every conformance row | ENFORCED (runtime, blocking); verified by plant |
| `getDefinitionNodes` / hand-rolled `getSymbol().getDeclarations()` in a FINAL module | 2 sites / 23 sites in 21 modules | #2097 AWAITING RULING — recorded, not built |
| shared families with NO common `lib/` import (the `-health` twin importing its sibling gate) | **14 of 47** families | #2096 AWAITING RULING — recorded, not built |
| `node:child_process` in a FINAL module | 0 (the five text hits are fixture strings inside `tooling-child-process-door`, whose population is `@tooling` and therefore already polices the gate corpus) | ENFORCED by another final policy; no E3 widening |
| the `mustRefuse` validator rules (non-empty; `messageIncludes` required; `count`/`line`/`token` forbidden) | UNPINNED — no test under `tests/tooling/**` asserts them (`policy-loader.test.ts` pins every other validator rule) | pins added (§4) |
| the `countFrom` runtime check (`countFromFailure`) | UNPINNED — `countFrom` appears in no file under `tests/tooling/**` | pin added (§4) |

## 2. The design

### 2.1 The refusal envelope becomes contract DATA, and the validator refuses a `mustRefuse` needle inside it

**Chosen.** `contract/policy-conformance.ts` gains `POLICY_REFUSAL_PREFIXES` — the runner's wrapper vocabulary
(`FACT TOOL ERROR`, `PASS TOOL ERROR`, `AUTHORITY TOOL ERROR`, `AUTHORITY ALARM`, `OWNER RESULT missing`, `OWNER
complete result was withheld by authority coordination`, `OWNER`, `FINDING OUTSIDE EXAMPLE`) — and
`contract/policy-pass.ts` gains `POLICY_PASS_REFUSALS`, the dispatcher's FIXED refusal sentences (the receipt
refusals, the fact-door refusals, the population-escape throws, the resource-declaration and resource-fence refusals,
the population-resolver refusals). `contract/gate-authority.ts` gains `GATE_AUTHORITY_ALARM_KINDS` (the alarm union
was type-only). The emitters (`ops/policy-conformance.ts`, `lib/policy-pass.ts`, `lib/policy-pass-context.ts`,
`lib/resource-declaration.ts`, `lib/resource-policy.ts`, `lib/population-resolver.ts`) compose from those constants,
so the vocabulary the validator polices cannot drift from what the runtime emits — `tsc` finds every reader.

`lib/policy-refusal-envelope.ts` DERIVES the closed envelope: every prefix, every `[<phase>]` token over
`POLICY_PHASES ∪ GATE_FACT_PHASES`, every `[<kind>]` token over the authority tool-error and alarm kinds, every
`OWNER <status>/<population>` spelling over the non-success completions (a mapped `Record` over the union, so a fifth
status fails `tsc`), every composed skeleton the runner and dispatcher build from those pieces (`PASS TOOL ERROR
[evaluate] `, `OWNER incomplete/incomplete: receipt: `, `policy receipt refused: population "`, `resource declaration …
is malformed: `, …), and every fixed sentence. `genericRefusalTextContaining(needle)` answers with the envelope
member that CONTAINS the needle, or `undefined`.

`lib/policy-validation.ts#assertRefusalExpectation` refuses a `messageIncludes` the envelope contains: *"names only
the runner's generic refusal text …, which every refusal of that shape carries; name the text this policy's OWN
refusal emits"*. Load-time is the strongest tier the rule can hold: a tool error on every run that loads the corpus
(`structure:full`, `structure:policy-conformance`, every scoped door), not a warning finding that blocks nothing.

### 2.2 `policy-legacy-imports` — a FINAL module may not import the legacy contract or the central authority machinery

A new final policy (family `policy-soundness`, `hard`/`error`, `selected-files`, `analysis: "types"`) over the same
population as `policy-soundness`. One arm, per-member: an `ImportDeclaration` whose specifier RESOLVES (identity, by
`getModuleSpecifierSourceFile()` path suffix) to one of the closed `FORBIDDEN_IMPORT_HOMES` — `contract/gate.ts`
(the legacy descriptor law: `ExemptionTable`, `ExemptionRow`, `Finding`, `GateDescriptor`, `GateRunCtx`),
`lib/pass.ts` (the legacy dispatcher), `lib/gate-ignore.ts` (the legacy marker parser), `lib/reviewed-grants.ts` (the
grant table — §12.5: *gate modules receive neither grant tables nor marker parsers*), `lib/ordinary-waiver.ts` (the
central marker engine), `lib/gate-authority.ts` (the central coordinator), `lib/policy-pass.ts` (the final
dispatcher), `lib/loader.ts` / `lib/policy-loader.ts` (the registry). Name prefilter, then identity, fail closed
inside the candidate set (`lib/origin-verdict.ts`'s header rule): a specifier whose BASENAME is a forbidden home's
and which resolves to NOTHING is reported under a disjoint UNREADABLE text; a same-basename module elsewhere is
acquitted by its resolved path. Every member has its own `mustFlag` row; the module carries the family's BLINDNESS
tripwire (its own path not reading as final → the run REFUSES). It goes RED on the nine modules in §1 — the honest
state of the tree, recorded in §9, owned by #1922.

**Severity fork (escalated, default taken).** DEFAULT `hard`/`error`: the owner's words are *"not doing the old gate
system's anti-patterns"*, and `error` is what "blocking" means on the final side. The alternative — `warning` +
`workItem: 1922`, per §12.5's *"unresolved debt is a warning tied to a positive workItem"* and the
`policy-proof-expectations` precedent — is one word to flip. Not put in `policy-soundness` because that module's
header and the family test pin its classes AT ZERO on the real corpus, and this class is at nine.

### 2.3 Alternatives rejected

| Arm | Verdict | Why |
| - | - | - |
| the discriminator as ARM R of `policy-proof-expectations` (the #2109 item-3 wording) | REJECTED | the needle is a plain string on the descriptor OBJECT and the envelope is contract data — a pure function of the descriptor is a LOAD-time rule (brief: *"a rule that belongs at LOAD time goes in `lib/policy-validation.ts`"*), and load-time is a blocking tool error where the family's arm would be `severity: warning` and block nothing |
| the envelope as literals in the contract with a liveness PIN, emitters untouched | REJECTED | two homes for one vocabulary (constitution: *"if it's used in more than one place, it's a constant"*); a renamed sentence would desync the validator silently until a pin caught it. The constants approach is the same bytes at every emitter and `tsc` finds every reader |
| a static "shared" verdict over the module's own refusal sources (ARM M's dual for `mustRefuse`) | DEFERRED, shape recorded | valuable only once a module carries ≥2 refusal rows; the reader is `staticSegments` over every `throw new Error(…)` argument plus receipt `source` literals plus `resourceRequestIdentity` of each declared resource; a needle hitting ≥2 sources is `shared`; zero hits is `unjudged` (a dispatcher-shaped refusal with an authored slot the census cannot see). Default: build when #2109 items 1–2 land the second consumer |
| E5 inside `policy-soundness` | REJECTED | the real-corpus pin `effectiveFindings(policySoundness) == []` states that module's classes are CLOSED; E5's class is open (nine live) and a hardcoded expected count is the #1969 rot |
| E5 by SPELLING (the specifier text) | REJECTED | a re-export shim or a same-named sibling defeats a spelling; the loader, `gate-modernization` ARM A and `enforcement-registry-parity` all judge by import origin, and so does this |
| a name-vocabulary exemption-table arm (`EXEMPTION_NAME_RE`) on final modules | NOT BUILT, judgment | measured 20 name hits in finals of which 7 are vocabularies or strings (`SANCTIONED_DOMAINS = ["import","export"]` is the seal's subject, `ALWAYS_ALLOWED_ROOT_FILES` is the template's rule); a heuristic that accuses a rule's own vocabulary is the accusation-shaped false positive `origin-verdict.ts` warns about. The identity half (a legacy `ExemptionTable` import) is exact and is what E5 polices; the name half stays a verifier read (§5 B10) |
| widening E3 to `node:child_process` | NOT BUILT | `tooling-child-process-door` (final, hard, `population: "@tooling"`) already polices every gate module; a second arm is noise |
| the converse of ARM E (`types` with no read) at depth 0 | NOT BUILT | 113 false positives on the tree; the honest predicate needs the transitive `lib/` closure |

### 2.4 The two hold-at-zero arms added to `policy-soundness`

- **E6 — a retired marker grammar parsed in a FINAL module.** `RETIRED_MARKER_OPENERS` (`contract/policy-descriptor-read.ts`;
  §7 kind 1 `@orb-gate-ignore` + the twelve gate-owned custom grammars + `ONESHOT-OK`/`PROSE-OK`/`@column-ok`) as
  a closed tuple. A `RegularExpressionLiteral` whose source contains an opener, a `new RegExp(<static text>)` carrying
  one, or a `.includes/.startsWith/.test/.exec/.indexOf` call whose first argument's static text carries one, is a
  PARSER of a grammar §12.5 retired. Prose is not: a `why`, a `message`, a `fix` naming the spelling is a MENTION
  (the guide §7 census rule) and is acquitted — three `mustPass` rows say so. One `mustFlag` row per opener for the
  regex shape, one each for the `new RegExp` and call shapes.
- **E7 — the `defineGate` argument is not a direct object literal (§12.1).** `finalRegistrationOf` (the reader) answers
  for any canonical callee whether or not its argument is a literal; E2's `inspectGateContract` verdict runs on every
  registration (its `descriptor-wrapper` code names the non-literal argument), while E1/E3/E4 need the literal.

### 2.5 `execution: "entire-population"` owes an `evaluate` hook — a `create`-phase refusal

`lib/policy-pass.ts#createRuns`: after `assertGatePolicyHooks`, an `entire-population` policy whose hooks expose no
`evaluate` is refused — *"declares entire-population but exposes no evaluate hook; with no post-walk phase its verdict
composes per file and selected-files is the honest execution"*. §12.1 makes `execution` a claim about composition; the
only hook that runs AFTER the whole walk is `evaluate`, so the claim is checkable from the hooks the runtime already
validates. Every policy's conformance rows exercise `create`, so the rule is on the bar. Zero live.

## 3. Coupled-site inventory (enumerated before building)

| Site | Change |
| - | - |
| `tooling/src/verify/contract/policy-conformance.ts` | `POLICY_REFUSAL_PREFIXES` |
| `tooling/src/verify/contract/policy-pass.ts` | `POLICY_PASS_REFUSALS` |
| `tooling/src/verify/contract/gate-authority.ts` | `GATE_AUTHORITY_ALARM_KINDS` tuple; the alarm union derives its `kind` |
| `tooling/src/verify/contract/policy-descriptor-read.ts` | `RETIRED_MARKER_OPENERS` |
| `tooling/src/verify/lib/policy-refusal-envelope.ts` (new) | the derived envelope + `genericRefusalTextContaining` |
| `tooling/src/verify/lib/policy-validation.ts` | `assertRefusalExpectation` consults the envelope |
| `tooling/src/verify/lib/policy-pass.ts` · `policy-pass-context.ts` · `resource-declaration.ts` · `resource-policy.ts` · `population-resolver.ts` | emitters compose from `POLICY_PASS_REFUSALS` (same bytes); `createRuns` gains the entire-population/evaluate refusal |
| `tooling/src/verify/ops/policy-conformance.ts` | `toolFailure`/`refusalFailure` compose from `POLICY_REFUSAL_PREFIXES` |
| `tooling/src/verify/lib/policy-descriptor-read.ts` | `finalRegistrationOf` |
| `tooling/src/verify/gates/policy-soundness.ts` | E6, E7; header |
| `tooling/src/verify/gates/policy-legacy-imports.ts` (new) | E5 |
| `tests/tooling/verify/lib/policy-refusal-envelope.test.ts` (new) · `policy-loader.test.ts` · `policy-pass.test.ts` · `tests/tooling/verify/ops/policy-conformance.test.ts` · `tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` | pins (§4) |
| `docs/architecture/core/Core-Enforcement-Active-Gates.md` | the `policy-soundness` row (E6/E7 as mechanisms — TWO WRITERS this hour: #2109 item 1 adds E4/`mustRefuse` to the same row; union at the merge), a new `policy-legacy-imports` row, the count line 300 → 301 |
| `docs/test-baseline/manifest.json` | one new tracked spec — regenerated in this worktree after `git add` |
| `docs/design/gate-runtime-read-first.md` SIZE cell for the roster | GENERATED and owed at the BARRIER (`ledgers:fresh` names it); this lane may not edit the gate docs |
| `structure:policy-conformance` totals | +1 policy, +its rows |

## 4. Test plan

- **Red-first** for every defect fix: the envelope rule is driven against the pre-fix validator (a `mustRefuse` row
  naming `"ERROR"` LOADS today — receipt in §7); E7 against the pre-fix family (a `defineGate(DESCRIPTOR)` module
  produces zero soundness findings today); the `countFrom` and `mustRefuse` validator pins are written to fail against
  a neutered predicate before the real one is run.
- **Planted controls both directions**, per member: every envelope member is refused as a needle and a needle carrying
  policy-authored text beside generic text is admitted; every forbidden import home has its `mustFlag` row and a
  same-basename sibling is acquitted; every retired opener has its regex row; the retired opener in PROSE is acquitted.
- **The family's blindness tripwire** on the new module (`runPolicyPass` with its own path as a lookalike → REFUSE).
- **Real-corpus receipt** for `policy-legacy-imports`: the arm's live finding set equals a second opinion (the
  `from "../contract/gate.ts"` import census over `gates/*.ts`) — derived, never a literal count.
- **Behavioural tier:** `pnpm test:scoped` over the five touched suites; `pnpm check:policy-conformance` whole
  (exit 2 = broken checker); `pnpm gate:contract` before/after; `pnpm typecheck --config tsconfig.json`; scoped
  biome/eslint; ONE `pnpm check:structure` in this worktree, serialized box-wide.

## 5. THE MATRIX

Columns: **rule** · **where stated** · **ENFORCER** (file:function, or NONE) · **tier** (from `pnpm verify --list`:
`load` = every stage that loads the corpus — `structure:full` (changed/static/push/full, scopable) and
`structure:policy-conformance` (static/push/full, whole-only, DEFERRED under `--changed`); `runtime` = the dispatcher
under both; `family` = a final policy under `structure:full` with its rows under `structure:policy-conformance`;
`legacy-gate` = a legacy descriptor under `structure:full`, whole-project, deferred under `--changed`/`--scope`;
`pin` = a vitest suite under `tests:tooling`, `--full`-only) · **blocking?** (`TOOL ERROR` exit 2 · `error` blocks ·
`warning` blocks nothing unless `--fail-on-warnings` · `alarm` is an error) · **verified how** (this lane's own drive,
or UNVERIFIED with the reason) · **gap class** when NONE.

### 5A. FIELDS — every §12.1 field present, exact, derived where the law says derived (44 rows)

| # | rule | where stated | ENFORCER | tier | blocking? | verified how | gap class |
| - | - | - | - | - | - | - | - |
| A1 | `id` present, kebab-case, control-free | §12.1; §3 | `lib/policy-validation.ts#assertGatePolicyDescriptor` (`KEBAB_RE`) | load | TOOL ERROR | `policy-loader.test.ts` "validates every required axis" (`Bad_Id`) — run §7 | — |
| A2 | `id` equals the filename | §12.1 (*"`id` equals the filename"*) | `lib/policy-module.ts#assertPolicyFilenameId` via `lib/loader.ts` | load | TOOL ERROR | `policy-loader.test.ts` "refuses filename/id mismatch" | — |
| A3 | ids unique across the corpus | §12.1 | `lib/policy-module.ts#assertUniquePolicyIds` (judged BEFORE filename, the pinned order) | load | TOOL ERROR | same suite, "duplicate ids" | — |
| A4 | `family` present, kebab-case | §3, §12.1 | validator (`KEBAB_RE`) | load | TOOL ERROR | §7 planted control (family `"Not Kebab"`) | — |
| A5 | a singleton family equals its sole id | §3 (*"a policy with no proven sibling is a singleton family under its own id"*) | `lib/policy-module.ts#policyFamilyNames` | load | TOOL ERROR | `policy-loader.test.ts` "singleton families equal their sole id" | — |
| A6 | a shared `family` names a REAL shared `lib/` reader (module + function) the members IMPORT, or a declared singleton with its reason; a theme, a filename prefix or a sibling-gate import is not a family | §3, §5b.4 | NONE — `policyFamilyNames` proves only cardinality; the reader is prose | — | — | census: 14 of 47 shared families have NO common `lib/` import (`registry-definitions` ×9, `tanstack-query-origin` ×5, and twelve `-health` pairs importing their twin's predicate) | **AWAITING RULING #2096** (sibling-gate predicate imports vs `lib/`); after the ruling the predicate "every member of a shared family imports ≥1 common `lib/` module" is a source-reading family arm; the header's reason sentence stays judgment |
| A7 | `population` from the closed algebra only: named roots/sets closed, exact operator keys, `under`/`notUnder` end-anchored globs with valid segments (`"x/"` refused as an empty segment), `named` basename-only, `ext` loadable, `not` overlapping and not total, `depth: "flat"` only; a function/custom resolver cannot be expressed | §12.1, §12.4 | `lib/population-resolver.ts#assertPopulationExpr` via the validator | load | TOOL ERROR | `population-resolver.test.ts` (12 tests) + §7 planted `under: ["x/"]` control | — |
| A8 | `{ of: "none", why }` only with `analysis: "resource"`; `{ of: "all", why }` reasoned | §12.4 | validator `isExplicitNone` + `assertPopulationExpr` | load | TOOL ERROR | `policy-loader.test.ts` `bad-none` | — |
| A9 | `resources` only from the 18 frozen kinds | §12.4 (`GATE_RESOURCE_REQUEST_KINDS` is the roster) | validator `assertGateResourceDeclaration` | load | TOOL ERROR | `policy-loader.test.ts` `unknown-kind` | — |
| A10 | closed ids per kind, keyed off each door's OWN definition object; exact key set per kind (no id on an id-less kind) | §12.4 | validator `resourceIds` + `exactKeys` | load | TOOL ERROR | `policy-loader.test.ts` "second-wave kinds admit their own closed id vocabularies" (7 kinds + 4 refusals) | — |
| A11 | no duplicate resource identity | §12.3 (*"duplicate provider ids … refuse"*) | validator `assertGateResourceDeclarations` | load | TOOL ERROR | `policy-loader.test.ts` `duplicate` | — |
| A12 | `installed-package`: closed mode; `file` required for `text`, forbidden otherwise; two modes are two declarations | §12.4 | validator `assertInstalledPackageRequest` | load | TOOL ERROR | `policy-loader.test.ts` two installed-package tests | — |
| A13 | `authored-text` needs an admitting (populated) sibling declaration | §12.4 | validator `assertAnalysisResources` | load | TOOL ERROR | `policy-loader.test.ts` "authored-text cannot be declared without a door that ADMITS paths" | — |
| A14 | `exact-file`: ONE declaration per id; a widened call cannot reach an undeclared id | §12.4 | validator (dup identity) + `lib/resource-policy.ts#fencedExactFiles` | load + runtime | TOOL ERROR | `resource-policy.test.ts` "the exact-file door is fenced PER ID" | — |
| A15 | `analysis: "resource"` ⇔ non-empty `resources` | §3, §12.4 | validator `assertAnalysisResources` | load | TOOL ERROR | `policy-loader.test.ts` `syntax-smuggle`, `resource-empty` | — |
| A16 | `analysis` ∈ the closed tuple; proof `mode` matches it | §12.1 | validator + `expectedMode` | load | TOOL ERROR | `policy-loader.test.ts` `mode-mismatch` | — |
| A17 | `analysis: "syntax"` honest — no compiler-reaching member anywhere in the module (13-member closed tuple incl. `ctx.checker()`) | §5b.1; #1958 | `gates/gate-modernization.ts` ARM E (`readsTypes`, whole-module subtree) | legacy-gate | error (legacy violation) | 13 per-member `mustFlag` rows in the module (planted suite `gate-conformance.repo.int` is orchestrator-only); the real-tree run in §7 shows the arm at 0 | — (migrates into the family at cutover; recorded non-arm in `policy-soundness`'s header) |
| A18 | `analysis: "types"` honest — the module (or the readers it consumes) actually reaches the compiler | §5b.1 | NONE | — | — | census: 113 of the types policies make zero DIRECT compiler calls; all but `scrubber-factory-home` import `lib/` identity readers | **needs a source-reading arm over the transitive `lib/` closure**; DEFAULT: verifier judgment; `scrubber-factory-home` is the one depth-0 candidate and reads exports through the symbol table (a compiler read the 13-member tuple does not name — the tuple is itself incomplete for the converse) |
| A19 | `execution` ∈ the closed tuple | §12.1 | validator | load | TOOL ERROR | `policy-pass.test.ts` "invocation boundary rejects … invalid policies" (`execution: "bogus"`) | — |
| A20 | `facts.length > 0` ⇒ `execution: "entire-population"` | §3 (*"read only via `ctx.fact()` in `evaluate`"*), §12.3 | validator `assertFacts` | load | TOOL ERROR | `policy-loader.test.ts` "shared fact descriptors are … restricted to entire-population consumers" | — |
| A21 | `execution: "entire-population"` honest — the verdict does NOT compose per file | §3 table, §5b.1, §12.1 | **BUILT** — `lib/policy-pass.ts#createRuns`: an `entire-population` policy whose hooks expose no `evaluate` is refused at `create` | runtime | TOOL ERROR | §7 pin in `policy-pass.test.ts` (both directions) + planted control | — (the residual — an `evaluate` that only re-reports per-file state — stays judgment) |
| A22 | `facts` entries branded by `defineFact`, exact keys, kebab id, valid population/analysis/resources, `create` a function; no duplicate provider id; two objects cannot claim one id | §12.3 | validator `assertGateFactDescriptor` + `assertFacts`; `lib/policy-pass.ts#assertInvocationPolicies` | load + runtime | TOOL ERROR | `policy-loader.test.ts` fact test; `policy-pass.test.ts` "different provider objects cannot claim the same fact id" | — |
| A23 | `authority` ∈ {hard, ordinary, reviewed-grant} | §12.1 | validator; `lib/gate-authority.ts#policyTable` re-checks at coordination | load + runtime | TOOL ERROR | `gate-authority.test.ts` invalid-policy rows | — |
| A24 | `severity` ∈ {error, warning} | §12.1 | validator + coordinator | load + runtime | TOOL ERROR | as A23 | — |
| A25 | `severity: "warning"` ⇒ own enumerable positive safe-integer `workItem` | §3, §12.1, §12.5 | validator `assertSeverityWorkItem` | load | TOOL ERROR | `policy-loader.test.ts` "warning debt requires one positive work-item issue" (4 refusals) + prototype-supplied refusal | — |
| A26 | `severity: "error"` ⇒ no `workItem` | §12.1 | validator | load | TOOL ERROR | same suite `error-work-item` | — |
| A27 | the `workItem` names an OPEN board issue | §12.5 (*"a warning tied to a positive `workItem`"*) — the pointer rots (#2024 closed twice under `over-art-plate-arm`) | NONE | — | — | — | **needs a runtime check with network** (`gh issue view`); a gate has no network by construction. DEFAULT: a barrier verb (`verify work-items --check` over every loaded warning policy) run by the orchestrator, never a gate |
| A28 | `hard` + `warning` — unsuppressible AND non-blocking | §12.5 STILL OPEN (#2025) | validator admits it (four live: `policy-proof-expectations`, `policy-waiver-identity`, `policy-waiver-spelling`, `user-bus-deferred-member`) | load | — | — | **AWAITING RULING #2025** |
| A29 | `message` non-blank, control-free | §12.1 | validator `nonBlank` | load | TOOL ERROR | `policy-loader.test.ts` `bad-message` | — |
| A30 | `fix` non-blank when present | §12.1 | validator | load | TOOL ERROR | §7 planted control (`fix: " "`) | — |
| A31 | `create` is a function; receives no Project/root | §12.1 | validator; `policy-pass.test.ts` "the public context type and runtime surface expose neither Project nor root" | load + pin | TOOL ERROR | `policy-loader.test.ts` `bad-create`; the pin | — |
| A32 | `create` returns exact hook keys, ≥1 hook, `visitors` non-empty with unique valid `SyntaxKind`s and function `visit`, optional hooks functions | §12.1 | `lib/policy-validation.ts#assertGatePolicyHooks` at `createRuns` | runtime | TOOL ERROR (withheld owner) | `policy-pass.test.ts` "visitor subscriptions reject impossible kinds and duplicates" + §7 planted control (`create: () => ({})`) | — |
| A33 | ≥1 `mustFlag` and ≥1 `mustPass` | §3, §12.1 | validator `assertProofArm` | load | TOOL ERROR | `policy-pass.test.ts` (`mustFlag: []` refused) | — |
| A34 | proof `mode` ∈ closed tuple and matches `analysis` | §12.1 | validator | load | TOOL ERROR | `policy-loader.test.ts` `missing-mode`, `mode-mismatch` | — |
| A35 | proof `files` a non-empty explicit repo-relative map; `.ts`/`.tsx` only in `source`/`types` mode | §12.1 (*"every self-proof row declares its fixture mode and paths explicitly"*), §4.8 | validator `assertProof` | load | TOOL ERROR | `policy-loader.test.ts` `string-files`, `empty-files`; `policy-conformance.test.ts` "reject compiler module extensions outside .ts and .tsx" | — |
| A36 | proof `why` non-blank | §12.1 | validator | load | TOOL ERROR | `policy-loader.test.ts` `missing-why` | — |
| A37 | `expect` only on `mustFlag`; exact keys; `count`/`line` positive integers; `count` xor `countFrom`; `token`/`messageIncludes`/`countFrom` non-blank | §4.1, #2001 | validator `assertExpectation` | load | TOOL ERROR | `policy-loader.test.ts` `must-pass-expect`; §7 planted `count`+`countFrom` control | — |
| A38 | `links` resource-mode only, non-empty, repo-relative paths, never colliding with a declared file | §4.8 | validator `assertProofLinks` | load | TOOL ERROR | `policy-loader.test.ts` "a proof `links` map is resource-mode only" | — |
| A39 | `mustRefuse` optional; never empty; every row carries `expect.messageIncludes`; `count`/`line`/`token` forbidden | §4.5b, §12.1 | validator `assertRefusalExpectation` | load | TOOL ERROR | was UNPINNED — **pins added** in `policy-loader.test.ts` (§7) | — |
| A40 | no unknown top-level key (`docRow`, `scanRoot`, `scopeSafety`, `run`, `begin`, `finalize`, `fsBacked`, `markerImmune`, `status`, `name`, `kinds`, `visit`, …) | §12.1, §12.8 | validator `exactKeys(POLICY_KEYS)` + `defineGate`'s `ExactPolicy` type | load (+ tsc) | TOOL ERROR | `policy-loader.test.ts` "refuses … unknown descriptor fields" (`scanRoot`) | — |
| A41 | exactly ONE branded export and it is named `gate`; a branded export under another name refuses; an unbranded final-shaped object refuses with the spread/clone wording | §12.1 (*"one policy per module"*), `lib/loader.ts` header rules 1–5 | `lib/policy-module.ts#assertPolicyModuleExport` via `lib/loader.ts#classify` | load | TOOL ERROR | `policy-loader.test.ts` "missing gate, and multiple descriptors"; `loader.test.ts` | — |
| A42 | the export is a DIRECT `defineGate({...})` object literal | §12.1 (*"The export is a direct `defineGate({...})` object literal"*) | was NONE on the bar — `lib/gate-contract.ts` reports `descriptor-wrapper` but `policy-soundness` reached it only through `finalDescriptorOf`, which returns `undefined` for a non-literal argument (the whole family skipped the module; the loader accepted it). **BUILT** as E7 via `finalRegistrationOf` | family | error | §7 red-first (pre-fix: 0 findings on `defineGate(DESCRIPTOR)`; post-fix: 1 `[descriptor-wrapper]`) | — |
| A43 | the descriptor is a direct plain object with own enumerable string-keyed properties (no prototype-supplied field) | §12.1 | validator `assertDirectDescriptor` | load | TOOL ERROR | `policy-loader.test.ts` "the loader refuses prototype-supplied warning ownership" + "direct descriptor validation" | — |
| A44 | no inert `ext: ["ts","tsx"]` (§5b.1 smallest contract) | #1959 | `gates/policy-soundness.ts` E1 | family | error | the module's rows (2 `mustFlag`, 1 `mustPass`) run under `check:policy-conformance` §7 | — |

### 5B. NOTHING FORBIDDEN BEHIND THE CONTRACT (§12.3, §12.5, §5b.7, §7) (36 rows)

| # | rule | where stated | ENFORCER | tier | blocking? | verified how | gap class |
| - | - | - | - | - | - | - | - |
| B1 | no `Project#getSourceFiles`, `getDescendants*`, `forEachDescendant`, `getFirstDescendant*` (identity: the member's declaration is ts-morph's; `getSourceFile*` only when the owner is `Project`) | §12.3, §3 | `lib/gate-contract.ts#inspectWalksAndProjects` via `policy-soundness` E2 | family | error | E2 rows (`[direct-walk]`) + the E2 `mustPass` declared limit (`node.getSourceFile()` admitted) run §7 | — |
| B2 | no `new Project` | §12.3 | `inspectWalksAndProjects` (`isTsMorphProjectConstructor`, re-export trace) via E2 | family | error | E2 row `[gate-owned-project]` | — |
| B3 | no module-scope `let`/`var` | §12.1 (*"state in `create`"*), §12.8 | `inspectModuleState` via E2 | family | error | E2 row `[module-let]` | — |
| B4 | no mutation of a module-scope binding (built-in mutators by lib declaration, `Object.assign`, assignment, update, delete) | §12.1, §12.3 (*"maintain their own workspace cache"*) | `inspectModuleState` via E2 | family | error | E2 row `[module-mutation]` | — |
| B5 | no committed `*.baseline.json` ledger read (count ratchet) | §12.5 (*"no count ratchet"*), §12.8 | `inspectBaselines` via E2; `gate-modernization` ARM D for legacy admitted counts | family + legacy-gate | error | E2 row `[baseline-ledger]` | — |
| B6 | no `node:fs` / `fs/promises` import | §12.3, §3 | `policy-soundness` E3 | family | error | E3 row + the E3 legacy scope control | — |
| B7 | no `node:child_process` (subprocess/git shell) | §12.3, §12.4 residual 1 | `gates/tooling-child-process-door.ts` (final, hard, `population: "@tooling"` — the gate corpus is inside it) | family | error | census 0 in final modules; the door's own rows run under `check:policy-conformance` | — |
| B8 | no private marker parser: no regex or membership test over a RETIRED grammar (`@orb-gate-ignore` + the twelve gate-owned custom grammars + `ONESHOT-OK`/`PROSE-OK`/`@column-ok`) in a FINAL module | §12.5 (*"no gate-specific exemption grammar"*), §7 kinds 1 and 3 | was NONE — **BUILT** as `policy-soundness` E6 over `RETIRED_MARKER_OPENERS` (regex literal · `new RegExp` · `.includes/.startsWith/.test/.exec/.indexOf` argument); prose mentions acquitted | family | error | §7: per-opener rows; census 0 live; planted control both directions | — (a NEW private grammar with a spelling outside the retired set stays judgment) |
| B9 | no gate-owned exemption table — the legacy `ExemptionTable`/`ExemptionRow`/`Finding` contract in a FINAL module | §12.5 (*"gate modules receive neither grant tables nor marker parsers"*), §3 non-negotiables, §5b.7 | was NONE (`gate-modernization` ARM B judges the STALE arm only) — **BUILT** as `policy-legacy-imports` (import origin `contract/gate.ts`) | family | error | §7: nine live findings; real-corpus second-opinion receipt | — |
| B10 | no exemption-VOCABULARY collection (`ALLOWLIST`/`SANCTIONED_*`/`EXEMPT*`/…) that is not a legacy-typed table | §12.5, §5b.7 | `gate-modernization` ARM B (both contracts, STALE-arm half only) | legacy-gate | error | census: 20 name hits in finals; 10 are the B9 set, 7 are rule vocabularies/strings (`SANCTIONED_DOMAINS`, `ALWAYS_ALLOWED_ROOT_FILES`, `UNWAIVABLE_TOKEN`, `WAIVED_FINDINGS`, `DEFERRED_RESULT`, `EXEMPT_FEATURE`, `STALE_ALLOW`), 3 unadjudicated (`own-tables-only#FILE_ALLOWLIST`, `verify-registry-parity#NON_STAGE_ALLOWLIST`, `vector-scope-derived#IMPORT_SANCTIONED`) | **judgment** — a name heuristic accuses a rule's own vocabulary (§2.3); the three unadjudicated go to a verifier |
| B11 | no grant-table read (`lib/reviewed-grants.ts`) | §12.5 | **BUILT** — `policy-legacy-imports` | family | error | §7 per-member row; census 0 live | — |
| B12 | no marker-engine / legacy-parser import (`lib/ordinary-waiver.ts`, `lib/gate-ignore.ts`) | §12.5 | **BUILT** — `policy-legacy-imports` | family | error | §7 rows; census 0 live | — |
| B13 | no dispatcher / registry / coordinator import (`lib/pass.ts`, `lib/policy-pass.ts`, `lib/gate-authority.ts`, `lib/loader.ts`, `lib/policy-loader.ts`) | §12.3 (a gate that runs a pass inside a pass owns a workspace cache) | **BUILT** — `policy-legacy-imports` | family | error | §7 rows; census 0 live | — |
| B14 | no scope predicate (a per-arm path fence is legal — `gate-authoring-lessons-hub`; a module-wide fence beside the population is not) | §3 non-negotiables, §5b.7 | NONE | — | — | — | **judgment** — the predicate is indistinguishable from a legal per-arm jurisdiction by shape |
| B15 | no private binding/origin resolution where `lib/reference-fact*` exists (`getDefinitionNodes`, hand-rolled `getSymbol().getDeclarations()`) | §12.3 (*"binding identity … are shared primitives"*) | NONE | — | — | census: `getDefinitionNodes` 2 sites (`context-definition-shape:134`, `ct-no-oneshot-live-read-assert:197`); `getDeclarations()` 23 sites in 21 modules | **AWAITING RULING #2097** |
| B16 | `ctx.relativePath` / `ctx.sourceFile` / `report.file` on a RESOLVED declaration outside the population (#1972 class) | §12.3 | runtime: `lib/policy-pass-context.ts#relativePath` throws with the fact-widening diagnosis; static NONE | runtime | TOOL ERROR (withheld) | `policy-pass.test.ts` "sourceFile cannot escape", "a file refused by ctx.relativePath NAMES the declared fact" | **static half needs flow analysis** (which declarations came from resolution) — judgment; the runtime throw is loud only when the escape executes |
| B17 | `ctx.fact()` only in `evaluate` (never in `create`'s body or a visitor) | §3, §12.3 | runtime: `makePolicyContext#fact` throws `declared fact is not finished` before `finishFactRuns` | runtime | TOOL ERROR | §7 planted control (visitor-phase read → `[visit] declared fact is not finished`); census 0 | — |
| B18 | `ctx.fact()` on an UNDECLARED provider refuses | §12.3 | runtime `fact` door | runtime | TOOL ERROR | `policy-pass.test.ts` "fact access is declared and post-finish" | — |
| B19 | a declared fact must be consumed; a consumer files ≥1 semantic receipt | §12.3, #1966 | `lib/policy-pass.ts#policyReceiptFailures` | runtime | TOOL ERROR (withheld) | `policy-pass.test.ts` "semantic and resource receipt failures remain visible"; `schema-fact.test.ts` inverted pin | — |
| B20 | no silent `return` on a non-ready resource; every `ctx.resources.<door>()` sits inside `readyResourceValue` imported from `lib/resource-declaration.ts`; the host never bound or passed | §12.3 (E4, #2019) | `policy-soundness` E4 | family | error | E4 rows (bare door · alias · local lookalike · admitted · data-field near-miss) | — |
| B21 | an undeclared resource read refuses (per request identity, per exact-file id) | §12.3 | `lib/resource-policy.ts#bindPolicyResources` | runtime | TOOL ERROR | `resource-policy.test.ts` "a caught undeclared request leaves the owner unresolved", "fenced PER ID" | — |
| B22 | every declared resource/request is consumed; a resource population files a resource receipt | §12.3 | `policyReceiptFailures` / `factReceiptFailures` | runtime | TOOL ERROR | `resource-policy.test.ts` "overlapping declared requests must each be consumed"; `policy-pass.test.ts` "declared resources without acquisition receipts cannot complete" | — |
| B23 | a resource fact outside the effective resource population refuses; an empty READY populated fact refuses | §12.3 | `bindPolicyResources#accept` | runtime | TOOL ERROR | `resource-policy.test.ts` "cannot consume a ready resource outside its effective resource population" | — |
| B24 | an ORDINARY finding's token is authored text at its exact line/column (a `report.file` synthetic token alarms) | §3, §12.5 | `lib/ordinary-waiver.ts#locateFinding` → binding failure → alarm on a completed owner; in conformance `toolFailure` fails the row on any alarm | runtime (+ every `mustFlag` row) | alarm (error) | `ordinary-waiver.test.ts` "missing or false finding coordinates fail loud", "a finding coordinate inside the marker comment is not authored code"; §7 planted control through `verifyPolicyProofs` | — |
| B25 | `report.node`'s explicit `{token, offset}` is an exact slice of the node text; a derived token is the first waivable identifier/literal/keyword | §3 | `lib/policy-pass-context.ts#reportNode` | runtime | TOOL ERROR | `policy-pass.test.ts` "node reports require an exact in-range token and offset pair", "bare node reports derive deterministic authored position tokens" | — |
| B26 | every finding anchors inside the policy's own effective population | §12.1, §12.3 | `reportNode` (`relativePath`) / `reportFile` (`effectivePaths`); `lib/gate-authority.ts#validateFinding` (`finding-outside-population`) | runtime | TOOL ERROR | `policy-pass.test.ts` resource-only findings are file-anchored; `gate-authority.test.ts` outside-population rows | — |
| B27 | a raw finding cannot author `policyId`/`severity`/`authority` | `contract/gate-authority.ts` header | `validateFinding` (`finding-spoofed-policy`) | runtime | TOOL ERROR | `gate-authority.test.ts:90` | — |
| B28 | `ctx.checker()` refuses a `syntax` owner | §3 | `makeCapabilityContext#checker` | runtime | TOOL ERROR | `policy-pass.test.ts` "the checker is lazy, shared once, and refuses syntax policies" | — |
| B29 | a minted position must be waivable (no paren/CR/LF) — the `isWaivablePosition` fence at the explicit-token and `report.file` doors | §3 (#1957) | **UNARMED by ruling** (`policy-pass-context.ts` header; #2107) — the derived path obeys it, the explicit paths do not | — | — | not driven (arming is #2107's) | **AWAITING #2107** (the value-as-carrier / leading-identifier-as-coordinate arm ruled 2026-09-12) |
| B30 | `hard` findings have no suppression door | §12.5 | `lib/gate-authority.ts#processPolicy` (hard → effective, unconditionally) | runtime | error | `gate-authority.test.ts` "grants targeting selected hard or ordinary policies tool-error without opening a suppression door" + `ordinary-waiver.test.ts` "unknown, hard, and reviewed-grant policy markers alarm and suppress nothing" | — |
| B31 | reviewed grants: typed central rows keyed by policy/subject/operation with `why`/`endsWhen`; unknown policy, wrong authority, duplicate id, duplicate identity refuse; exactly-one match GRANTS; zero after a complete run is STALE; >1 is OVER-BROAD and suppresses none; a withheld owner withholds liveness | §12.5 | `lib/gate-authority-validation.ts#validateReviewedGrants` + `lib/gate-authority.ts#processReviewed`/`reconcileAuthority`; `ops/policy-conformance-stage.ts` judges the WHOLE table | runtime + load(stage) | TOOL ERROR / alarm | `gate-authority.test.ts` (stale, over-broad, wrong authority, duplicates); `policy-pass.test.ts` "reviewed grants validate against the full known roster"; `policy-conformance-stage.int.test.ts` whole-table arm | — |
| B32 | the ONE ordinary marker `@orb-waive <id>(<position>): <reason>` binds exactly one occurrence (leading/trailing trivia up to the statement boundary, JSX carrier adjacency, resource line-above); malformed, unknown-policy, wrong-authority alarm on acquisition; stale, dead-position, unbound-trivia, ambiguous-trivia, over-broad, duplicate-target alarm after a complete owner; legacy and custom spellings are inert | §12.5 | `lib/ordinary-waiver.ts` engine | runtime | alarm (error) | `ordinary-waiver.test.ts` (21 tests) — run §7 | — |
| B33 | `warning` findings never block unless `--fail-on-warnings`; `error` blocks; alarms block | §12.5 (#2025) | `lib/gate-authority.ts` verdict (`blocking = errors + alarmErrors + (failOnWarnings ? warnings : 0)`) | runtime | — | `gate-authority.test.ts` promotion row; `warning-promotion.suite.int.test.ts` | — |
| B34 | no count ratchet / admitted budget (`ctx.scan({admitted})` does not exist on the final context) | §12.5 | `tsc` (`GatePolicyContext` has no `scan`) + B5 | compile + family | TOOL ERROR / error | by construction (type) — §7 planted control refused by `tsc` | — |
| B35 | an empty population is a REFUSAL, never a clean zero (zero candidates; zero admitted; a fact with an empty declared population; a resource-only policy with no resource paths) | §12.2, §12.4 | `lib/population-resolver.ts#resolvePopulation`; `lib/policy-pass.ts#resolveRun`/`resolveFactRuns` | runtime | TOOL ERROR | `population-resolver.test.ts` "refuses an empty candidate corpus"; `policy-pass.test.ts` "missing source populations are incomplete" | — |
| B36 | no `__g_`/`__dc_` planting from a final module | §4.8 (fixtures never touch the tree) | by construction — a final policy has no filesystem (B6) and its rows land in virtual/tmp roots; the loader excludes `__g_` MODULES | family | error | census: 9 string hits, all inside proof-row fixture PATHS (virtual) or a grant `value` (`eslint-grant-liveness` mirrors the eslint ignore) — none plants | — (an arm here would accuse fixture coordinates) |

### 5C. LEGACY ANTI-PATTERNS in a final module (10 rows)

| # | rule | where stated | ENFORCER | tier | blocking? | verified how | gap class |
| - | - | - | - | - | - | - | - |
| C1 | no legacy top-level field (`scanRoot`, `scopeSafety`, `run`, `begin`, `finalize`, `docRow`, `fsBacked`, `markerImmune`, `status`, `name`, `kinds`, `visit`) | §12.8 | validator `exactKeys` (any unknown key) + `lib/gate-contract.ts` `legacy-field` (the five hook-shaped ones) via E2 | load + family | TOOL ERROR / error | `policy-loader.test.ts` `scanRoot`; E2 row `[legacy-field]` | — |
| C2 | no `ExemptionTable`/`ExemptionRow` | §12.5 | **BUILT** (B9) | family | error | §7 | — |
| C3 | no `GateDescriptor`/`GateRunCtx`/`Finding`-typed helper (a legacy-runtime helper hosted in a final module) | §12.8 | **BUILT** (B9 — any named import from `contract/gate.ts`) | family | error | §7 (`Finding` is imported by two of the nine live) | — |
| C4 | no `__g_` planting | §4.8 | B36 | — | — | — | — |
| C5 | no `@orb-gate-ignore` consumption (the legacy central grammar) | §7 kind 1 | **BUILT** (B8 — `@orb-gate-ignore` is a member of `RETIRED_MARKER_OPENERS`) + B12 (`lib/gate-ignore.ts` import) | family | error | §7 rows | — |
| C6 | no `ctx.scan({ admitted })` | GATE-AUTHORING §1 (legacy), §12.5 | B34 (tsc) | compile | TOOL ERROR | by construction | — |
| C7 | no `fsBacked`/`markerImmune`/`docRow`/`status`/`name` | §12.8 | C1 | load | TOOL ERROR | — | — |
| C8 | no `runPass`/`loadGates`/`loadGateCorpus` import (the legacy dispatcher/registry) | §12.8 | **BUILT** (B13) | family | error | §7 rows | — |
| C9 | no `findGateIgnore`/`parseGateIgnoreMarker` import | §7 kind 1 | **BUILT** (B12) | family | error | §7 row | — |
| C10 | no legacy conformance harness (`ops/conformance.ts#verifyGateProofs`) or any `ops/*` import in a final module | §12.3 (a gate is not an entrypoint) | NONE | — | — | census: 0 final modules import from `../ops/` | **expressible** as a further `FORBIDDEN_IMPORT_HOMES` directory member; not built this lane (0 live, and an `ops/` import that resolves to a resource provider would need its own acquittal list) — DEFAULT: add the member when the first consumer appears |

### 5P. PROOF RULES (§4) and §5b criteria (16 rows)

| # | rule | where stated | ENFORCER | tier | blocking? | verified how | gap class |
| - | - | - | - | - | - | - | - |
| P1 | legacy rows carried into the conversion | §4.1 | NONE (a §4.6 differential is conversion evidence) | — | — | — | **judgment** → verifier lanes; #2000 makes the differential a commit-message obligation |
| P2 | every `mustFlag` carries `expect.count` (or `countFrom` + an identity field) | §4.1, #2001 | `policy-proof-expectations` ARM C (static) + `ops/policy-conformance.ts#countFromFailure` (runtime resolution of the driver) | family + runtime | **warning** (`workItem` 1968) / TOOL ERROR | ARM C rows run under `check:policy-conformance`; the runtime `countFrom` check was UNPINNED — **pin added** (§7) | the load-bearing half is a warning (A28) |
| P3 | a `messageIncludes` discriminates (not a single-source tautology, not shared across ≥2 sources; unreadable sources leave the row unjudged) | §4.1 | `policy-proof-expectations` ARM M | family | warning | ARM M rows (10 `mustFlag`, 9 `mustPass`) | — |
| P4 | `mustFlag` rows are statically readable object literals | §12.1 | ARM U | family | warning | ARM U row | — |
| P5 | a NARROWING owes a row that dies without it (§4.1 cut) | §4.1 | NONE | — | — | — | **mutation** → verifier lanes (#2066 harness parked pending an owner price) |
| P6 | the positive §4.2 identity arm for every ORDINARY policy (in-module marker-form `mustPass` or a family test importing the module and reading `waivedFindings`) | §4.2 | `policy-waiver-identity` | family | warning (`workItem` 1952) | its 5 `mustFlag` / 6 `mustPass` rows + the zero-receipt refusal pin in the family test | the §4.2 triple (`effectiveFindings []`, `waivedFindings 1`, `authorityAlarms []`) inside the family-test shape is read by `waivedFindings` presence only — the alarms assertion is judgment |
| P7 | §4.3 reviewed-grant identity pins beside the family | §4.3 | NONE | — | — | — | **expressible** as a sibling of `policy-waiver-identity` keyed on `grantedFindings` in a family test importing the module; DEFAULT: verifier judgment until the next reviewed-grant conversion wave |
| P8 | `mustRefuse` rows: the verdict is the other arms' INVERTED; the pass must refuse AND the refusal text must contain the needle | §4.5b | `ops/policy-conformance.ts#refusalFailure` | load(stage) | TOOL ERROR | `policy-conformance-stage.int.test.ts` "a mustRefuse row is COUNTED and PROVEN, and the same row goes RED when the policy does not refuse" | — |
| P9 | a `mustRefuse` needle names the POLICY's refusal text, never the runner's generic envelope (a substring like `ERROR`, `OWNER`, `incomplete`, `resolved zero members`, `[evaluate]` passes on ANY refusal) | §4.5b (*"a row not naming the refusal TEXT passes on ANY refusal"*), #2109 item 3 | was NONE — **BUILT** in `assertRefusalExpectation` over the contract-homed envelope | load | TOOL ERROR | §7 red-first + per-member pins in `policy-refusal-envelope.test.ts` | — |
| P10 | which policies OWE a refusal row (a verdict depending on a derived population: facts, resources, entire-population tripwires) | §4.5 | NONE — the arm is optional | — | — | 1 of 246 carries one | **deferred behind #2109 items 1–2** (the refusal-pin migration); DEFAULT after it lands: a warning arm "declares `facts`/`resources` and carries neither a `mustRefuse` row nor a family-test refusal pin" |
| P11 | invented rows owe a planted-break receipt | §4.7 | NONE | — | — | — | **judgment** (a receipt is report text) |
| P12 | fixtures never reach the checkout (virtual project / tmp root, deleted in `finally`) | §4.8 | `ops/policy-conformance.ts#runVirtualExample`/`runResourceExample` | load(stage) | by construction | `policy-conformance.test.ts` "resource proofs materialize exact content and clean temp roots"; the pid-scoped leak census | — |
| P13 | a fixture's relative import resolves inside its own file map (fail-closure control) | §4.8 | family tests (`danglingSpecifiers` in `policy-soundness-family.repo.int.test.ts` and siblings) | pin | — | run §7 | **per-family convention** — a corpus-wide arm (every proof row's relative specifier resolves in its map) is expressible in `verifyPolicyProofs`; not built (would need every family's planted stubs audited first); DEFAULT: verifier |
| P14 | ordinary `fix` names the exact `@orb-waive <id>(` spelling | §3 table, §5b.3 | `policy-waiver-spelling` | family | warning (`workItem` 1978) | its rows | — |
| P15 | `message` TRUE of what the code flags; header records family/port/census (§5b.2, §5b.5) | §5b | NONE | — | — | — | **judgment** → verifier lanes |
| P16 | §4.6 differential landed as a test or stated in the commit | §4.6, #2000 | NONE | — | — | — | **judgment** (commit-message text) |

### 5R. RUNTIME GUARANTEES (§12.2, §12.3) (10 rows)

| # | rule | where stated | ENFORCER | tier | blocking? | verified how | gap class |
| - | - | - | - | - | - | - | - |
| R1 | a fact provider files ≥1 receipt; `members === 0` or `unresolved > 0` refuses; a resource population files a resource receipt; unconsumed resources refuse | §12.3 | `lib/policy-pass.ts#factReceiptFailures`/`receiptFailures` | runtime | TOOL ERROR | `policy-pass.test.ts` "declared fact providers collect once", "one provider failure withholds every consumer" | — |
| R2 | a failed fact withholds every dependent BEFORE `evaluate` | §12.3 | `withholdFactDependents` | runtime | TOOL ERROR | same | — |
| R3 | a non-ready declared resource withholds the owner at the POPULATION phase (never reaches `create`) | §11 ruling 3, §12.3 | `lib/resource-declaration.ts#resolveResourceDeclarations` | runtime | TOOL ERROR | `resource-policy.test.ts` "ignored missing, empty, and unresolved resources withhold owner grant reconciliation"; `resource-declaration.test.ts` | — |
| R4 | a demand kind is never acquired at planning; an unpopulated kind is partitioned out of the empty-fact refusal BY NAME | §12.4 | `resolveResourceDeclarations` | runtime | TOOL ERROR | `resource-declaration.test.ts` "the demand doors are never ACQUIRED during planning", "an UNPOPULATED declaration contributes no path" | — |
| R5 | a narrowed request DEFERS an `entire-population` policy (`not-applicable`), never a partial verdict | §12.1 | `resolveRun` | runtime | — | `policy-pass.test.ts` "selected policies run intersections while entire-population policies visibly defer" | — |
| R6 | a not-applicable owner with findings, a missing/duplicate/unselected owner result, an incomplete or failed owner all tool-error and withhold | `contract/gate-authority.ts` | `lib/gate-authority.ts#validateResult`/`selectedResults` | runtime | TOOL ERROR | `gate-authority.test.ts` rows | — |
| R7 | only an ORDINARY owner's resource population demands a waiver carrier; a refused carrier is a receipted skip | #1947 | `lib/policy-pass.ts#ordinaryWaiverAcquisition` | runtime | — | `policy-pass.test.ts` "a HARD owner's resource population demands no ordinary-waiver carrier", "a refused carrier is a receipted skip" | — |
| R8 | `create` state is invocation-local; re-entry cannot observe a prior run | §12.1 | `runPolicyPass` (one `create` per invocation) | runtime | — | `policy-pass.test.ts` "create state is invocation-local across re-entry" | — |
| R9 | the run manifest reconciles (`ran === active`, corpus accounted) and an abandoned run is refused by every reader | `contract/run-manifest.ts` | `ops/structure.ts#reconcile` | structure | TOOL ERROR | `structure.int.test.ts` (not run by this lane) | UNVERIFIED by this lane — the suite is under `tests:tooling` and was not in the floor |
| R10 | the mixed loader classifies by exact contract identity; a lookalike, a duplicate id, a mis-named brand refuse; the legacy view REFUSES an empty legacy roster | `lib/loader.ts` header | `lib/loader.ts#classify`, `assertLegacyRosterIsMeasurable` | load | TOOL ERROR | `loader.test.ts`, `policy-loader.test.ts` | — |

## 6. Forks escalated (ask-and-continue; defaults stated)

1. **E5 severity** — DEFAULT `hard`/`error` (§2.2); alternative `warning` + `workItem: 1922`.
2. **The `policy-soundness` roster row has two writers this hour** (#2109 item 1 by `p-proof-soundness`; E6/E7 by this
   lane) — DEFAULT: this lane edits the row and the merge resolves by union.
3. **The read-first SIZE cell** for the roster is generated and owed at the barrier; this lane may not edit the gate doc.
4. **The new review doc's catalog receipt** — DEFAULT: land in the one commit, receipt owed (the `c5a6733e4` shape).

## 7. Receipts

Filled in as each instrument ran; every count is read off the actual run named beside it.

## 8. LAW DELTAS

## 9. LEDGER ROWS

## 10. WHAT I DID NOT COVER

## STATE FOR RESUME (written 2026-09-12 before a context compaction; the checkpoint is `b230adc1d`, NOT a completion receipt)

### 1. Overall update

- **Matrix so far:** 116 rows written (A 44 · B 36 · C 10 · P 16 · R 10) + section D (4 rows: D1 I/O doors, D2 fixture paths,
  D3 family-test substrate, D4 runner cleanup + scaffold) still to WRITE into §5 (measured). Verdicts so far: ENFORCED 96 (51
  driven by this lane — every family row through `pnpm check:policy-conformance` whole (247 final · 2881 proof rows · 2 refusal
  rows · 0 failures · exit 0 · 31.9 s) and the red-first/planted-control probe `scratchpad/cbfpa-redfirst-KEEP.log` (45
  controls, 0 mismatches); 45 owed to the vitest suite runs below); NONE 20: judgment 11 (A6, A18, A27, B10, B14, B16-static,
  P1, P5, P11, P13, P15/P16), AWAITING RULING 5 (A28 #2025, A6 #2096, B15 #2097, B29 #2107, P10 behind #2109 items 1–2),
  expressible-not-built 3 (C10 `ops/**` import member, P7 grant-identity arm, D3 family-test-substrate arm); BUILT 6 (below).
  The per-rule coupled-sites column and the §5U unification/layers table are NOT yet written — their data is built.
- **BUILT (all in `b230adc1d`; floors partly run):**
  - P9 the `mustRefuse` discriminator — `lib/policy-validation.ts#assertRefusalExpectation` refuses a needle inside the
    refusal envelope; the envelope is DERIVED in new `lib/policy-refusal-envelope.ts` from
    `contract/policy-conformance.ts#POLICY_REFUSAL_PREFIXES` (new) + `contract/policy-pass.ts#POLICY_PASS_REFUSALS` (new; the
    five lib emitters compose from it, same bytes) + `contract/gate-authority.ts#GATE_AUTHORITY_ALARM_KINDS` (new) + the
    phase/kind/status tuples. Red-first: HEAD loads `"ERROR"` / `"OWNER"` / `"[evaluate]"` / `"resolved zero members"`; NEW
    refuses all 11 probed needles and admits 4 authored ones. Pins: `policy-loader.test.ts` (per envelope member) and new
    `tests/tooling/verify/lib/policy-refusal-envelope.test.ts` (two-sided liveness through `verifyPolicyProofs`).
  - A21 `entire-population` ⇒ `evaluate` — `lib/policy-pass.ts#createRuns` create-phase refusal; red-first HEAD success →
    NEW `[create]` refusal; pin both directions in `policy-pass.test.ts`.
  - A42/E7 `defineGate(<non-literal>)` — `lib/policy-descriptor-read.ts#finalRegistrationOf` (+ `FinalRegistration` in the
    contract); `policy-soundness` E2 runs on every registration; red-first HEAD reader `undefined` / HEAD soundness 0.
  - B9/B11/B12/B13/C2/C3/C8/C9 — NEW `tooling/src/verify/gates/policy-legacy-imports.ts` (hard/error, family
    `policy-soundness`; 11 `mustFlag` incl. 9 per-member + fail-closed + two-declarations; 1 `mustRefuse` BLINDNESS; 5
    `mustPass`). RED on the real tree by design on the nine `contract/gate.ts` importers; real-corpus second-opinion assertion
    added to the family test; the `check:structure` leg is still owed.
  - B8/E6 retired-grammar parsers (16 per-opener rows + `new RegExp` + membership; `RETIRED_MARKER_OPENERS` in
    `contract/policy-descriptor-read.ts`) and D1/E3 widened to a closed I/O-door set (`fs`, `node:fs`, `fs/promises`,
    `node:fs/promises`, `fs-extra`, `child_process`, `node:child_process`, `_shared/proc.ts` by ORIGIN + fail-closed,
    value-position `import()`, `require()`, `process.binding()` on the global or the `node:process` import; 12 rows + 4
    near-miss) — both in `policy-soundness`, hold-at-zero, green under the stage.
  - Unification: `contract/policy.ts` carries ONE table per vocabulary (`POLICY_FIELDS`, `POLICY_OPTIONAL_FIELDS`,
    `POLICY_PROOF_ARMS`, `POLICY_PROOF_KEYS`, `POLICY_EXPECTATION_KEYS`, `POLICY_EXPECTATION_IDENTITY_KEYS`,
    `POLICY_HOOK_KEYS`), two-sided against the interfaces by `satisfies Record<keyof …, true>`; the validator's key sets, the
    runner's arm loop (`lib/policy-proof-rows.ts`, new), the stage's counts, `gate-modernization`'s `EXAMPLE_FIELDS`,
    `policy-proof-expectations`' identity fields and `PolicyProofArm` all DERIVE. Hand sites left (generator targets): the
    guide §12.1 block, `ops/new-gate.ts` (#2126), the roster rows.
  - Pins added for the previously UNPINNED `mustRefuse` validator rules (A39) and the `countFrom` runtime resolution (P2;
    `policy-conformance.test.ts` mutates a COPY of `verify-registry-parity`), plus `finalRegistrationOf`.
- **IN PROGRESS:** `tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` (FAMILY += `policy-legacy-imports`,
  `policyProofRows`, `declaredUnreadable` = 2 excused fail-closed rows, real-corpus second opinion) is edited and typechecks
  but has NOT run; if wrong it reds only itself.
- **NOT STARTED, in order:** (1) run the suites — `pnpm test:scoped` over `policy-loader`, `policy-pass`,
  `policy-descriptor-read`, `policy-refusal-envelope`, `ops/policy-conformance`, `gates/policy-soundness-family.repo.int`,
  then `gate-authority`, `ordinary-waiver`, `resource-policy`, `resource-declaration`, `population-resolver`,
  `ops/policy-conformance-stage.int`, `gates/enforcement-registry-parity.int`; (2) roster rows — rewrite `policy-soundness`
  (E3 widened, E6, E7 as mechanisms; TWO WRITERS with #2109 item 1, union at merge), add `policy-legacy-imports`, bump
  `(300 registered gates)` → 301; (3) `git add` the new spec, then
  `pnpm exec node tooling/src/verify/cli.ts baseline test-baseline-manifest`; (4) write §5D, the coupled-sites column, §5U,
  §7 receipts, §8 LAW DELTAS, §9 LEDGER ROWS (the nine, OPEN #1922), §10; doc-catalog `format --write` then `--check`; scoped
  `pnpm check:docs`; (5) `pnpm gate:contract` before/after, scoped biome/eslint over every touched file,
  `pnpm typecheck --config tsconfig.json`; (6) SendMessage "ready for structure leg", WAIT for "go", ONE `pnpm check:structure`
  here, per-policy raw/waived/granted/effective before/after for `policy-soundness` and `policy-legacy-imports` plus
  `N tool error(s)` / `N withheld` / `N alarm(s)`; (7) final commit STACKED on the checkpoint (never amend),
  `git status --short` empty, `git show --stat`.

### 2. Uncommitted work

EMPTY after the checkpoint. The tree typechecks (`pnpm typecheck --config tsconfig.json --config tooling/tsconfig.json` →
PASS ×2); every touched file is biome-formatted (scoped `--diagnostic-level=error --write`); eslint not yet run.

### 3. Re-entry order after compaction

(a) this section; (b) `gate-runtime-read-first.md` §0/§4 → `gate-runtime-standardization.md` §3, §4, §5b, §12 → the
`contract/*.ts` headers — NOT `GATE-AUTHORING.md`, NOT `exemplars-2026-09-11.md`, NOT the audit waves; (c) the fences: rows
this lane does not own are #2106/#2075 (`conversion-refusal-liveness`), #2107/#2108/#2109 items 1–2 (anchor/`fix`, roster
row + refusal-pin migration), #2110 (structure delta); the three gate docs are report-text only (§8); #1957's
`isWaivablePosition` fence stays UNARMED; resource kinds frozen at 18; #2096/#2097 AWAITING RULING (record, never build);
never touch the nine legacy-import modules (ledger rows); (d) the owner's no-shortcuts rule (no weakening a row, no widening a
trust rule, no new allowlist/grant/baseline/waiver, no UNFALSIFIABLE without a constructed row, no scoped-green-as-done) and
the ruling that `policy-legacy-imports` is `hard`/`error`; (e) next three: run the suites → roster rows + manifest → finish
the doc.

### 3b. Scope change and reds found after the checkpoint (2026-09-12, later)

- **#2109 items 1–2 are THIS lane's now** (primary's note 617): the `policy-soundness` roster row has ONE writer (done —
  E1–E7 as mechanisms, E4 included, count 300 → 301, `policy-legacy-imports` row added); the refusal pins are MIGRATED
  onto `mustRefuse` rows with authored needles: `warning-code-coverage` (the #1977 worked case, needle
  `population "WARNING_CODES" resolved zero members`), `bus-producer-coverage` ×2 (`bus definition fact is incomplete`,
  `bus rosters disagree about belted unions`), `user-bus-deferred-member` (`deferred UserBusEvent member
  connectionsChanged is no longer declared`). The family-test `runPolicyPass` twins STAY (they assert owner status, the
  empty finding set and the phase, which a row cannot express) — each module's row comment says so. #2107/#2108 remain
  p-proof-soundness's; this lane is in none of `lib/ordinary-waiver.ts`, `lib/caught-failure.ts`,
  `lib/policy-pass-context.ts`, the three CSS/Tailwind gates — `policy-pass-context.ts` was restored byte-for-byte to
  `0c5bedfd7` after an earlier edit, and its five refusal sentences are held equal to the contract's constants by a
  RUNTIME pin instead (`policy-refusal-envelope.test.ts`, the context-door test).
- **REAL RED, foreign modules (LEDGER ROWS OPEN, owner #2021's lane):** the family's real-corpus arm found
  `policy-soundness` E4 firing on `tsconfig-entry-liveness.ts` and `tsconfig-entry-liveness-health.ts` — both pass
  `ctx.resources` as an ARGUMENT to the shared reader `readTsconfigRoster(ctx.resources, repoPaths)`, landed by
  `97e68be91` after E4 (`f96f45fb4`); the family's zero-pin for `policy-soundness` is therefore RED on main today.
  Not touched by this lane; the zero-pin is asserted LAST in the real-corpus test so every other receipt prints.
- **Primary's question, answered:** the derived envelope preserves ALL THREE `mustRefuse` validation rules unchanged —
  `expect.messageIncludes` REQUIRED, `count`/`line`/`token` FORBIDDEN, `mustRefuse: []` REFUSED at load — the envelope
  containment is a FOURTH check appended after them; all three are pinned per case in `policy-loader.test.ts`.
- **E7 and the loader:** the loader CANNOT refuse `defineGate(<non-literal>)` — it brands the OBJECT and an object
  cannot reveal the syntax of its call site; no validator rule can express it. The source-reading tier is the honest
  enforcer: E7 for a canonical callee with a non-literal argument; `gate-modernization` ARM A +
  `enforcement-registry-parity`'s orphan arm for a wrapper callee (a lookalike registers nothing, loudly).
- **Suites so far:** conformance stage whole exit 0; `policy-loader` / `policy-pass` / `policy-descriptor-read` /
  `policy-refusal-envelope` / `ops/policy-conformance` / `gate-authority` / `ordinary-waiver` / `resource-policy` /
  `resource-declaration` / `population-resolver` all green (129 + 24 tests); the family suite's real-corpus arm red
  for the E4 reason above. `pnpm gate:contract`: 396 findings across 301 modules, none naming a touched final module.

### 4. Rulings waited on / defaults fired

RULED: E5 severity `hard`/`error`. DEFAULTS FIRED: this lane edits the `policy-soundness` roster row (two writers; union at
merge); the read-first SIZE cell is left to the barrier (`ledgers:fresh` names it); the new doc lands in the lane's commit
with its catalog receipt owed (the `c5a6733e4` shape); D3's arm is DEFERRED with its shape unless budget holds after the
floors; C10 and P7 recorded expressible-not-built with defaults. AWAITING: #2025, #2096, #2097, #2107 — recorded, not built
around.

### 5. For the orchestrator

- Real reds on foreign modules (LEDGER ROWS, OPEN #1922): `contract-derives-not-respells`, `depcruise-grant-liveness`,
  `domain-freshness-plane`, `eslint-grant-liveness`, `injected-op-caller-param`, `lifecycle-portability`,
  `no-raw-spacing-in-features`, `no-raw-typography-in-features`, `runner-config-path-liveness` — each imports
  `contract/gate.ts`. Three name-vocabulary collections unadjudicated (`own-tables-only#FILE_ALLOWLIST`,
  `verify-registry-parity#NON_STAGE_ALLOWLIST`, `vector-scope-derived#IMPORT_SANCTIONED`) → verifier judgment.
- Instruments found lying: none. Found UNPINNED: the `mustRefuse` validator rules and the `countFrom` runtime check (pinned).
- Coupled sites with no owner: the guide §12.1 block and `ops/new-gate.ts` restate `POLICY_FIELDS` by hand (generator
  targets; #2126 for the scaffold); the read-first SIZE cell (barrier); the two-writer roster row.
- Structure leg: NOT run; this lane still holds the request and will message "ready" after the suites and the doc.
- Law deltas drafted (exact text lands in §8): §12.1 (block derived from `POLICY_FIELDS`; direct literal enforced by E7);
  §4.5b (envelope rule at load, the envelope's home); §12.3 (forbidden-import list, `policy-legacy-imports`); §12.5
  (`RETIRED_MARKER_OPENERS`, E6); §3 table (`entire-population` owes `evaluate`); §5 (arm loop derives from
  `POLICY_PROOF_ARMS`).
