---
kind: design
status: active
updated: 2026-09-11
---

# One ts-morph runtime for every Orb gate — the program guide (#1584)

The single operating document for the gate-runtime standardization program: the transition model, the state of the tree, the proof rules, the order of work, the per-conversion procedure, the dispatch mechanics, and the contract itself. It supersedes [gate-config-system.md](gate-config-system.md) and every earlier resume or atomic-cutover order. Native Biome/ESLint/community rules continue to own generic ecosystem lint; every Orb-specific policy uses one ts-morph runtime and one capability contract. `tooling/src/verify/gates/GATE-AUTHORING.md` is the LEGACY descriptor guide and is not an input to a conversion.

**The review layer under [`docs/reviews/gate-runtime/`](../reviews/gate-runtime/) is not all one thing, and treating it as "evidence" cost a full session of re-deriving answers it already held.** Four of its documents are LIVE LAW this guide delegates to; the rest are completed-family evidence. **Before proposing a capability, a family, a table's disposition or a marker translation, read the one that owns the question:**

| Question | The document that already answers it |
| - | - |
| what resource capability does the corpus need? | [`resource-gate-access-patterns.md`](../reviews/gate-runtime/resource-gate-access-patterns.md) §§1–8 — eight families with their required surfaces as TypeScript, a per-gate access/scan/proof table, a `__g_` fixture-replacement destination per row, a keep-vs-move-behind-host map for ten helpers, and nine numbered prerequisites |
| what blocks THIS gate, and what family is it? | [`uncovered-gate-conversion-census.md`](../reviews/gate-runtime/uncovered-gate-conversion-census.md) — per-gate blocker class, family, population notation, authority and source-line receipts. **This is the Phase D ordering source**, not a filesystem grep: its blockers are shared readers and grant migration, which no `fs` test can see |
| where does this exemption table / baseline / marker go? | [`exception-authority-census.md`](../reviews/gate-runtime/exception-authority-census.md) — 97 exemption tables, 319 rows, 25 sanctioned-home tables, 9 baselines and 11 duplicate grammars, each already classified as grant, waiver, warning debt, policy data or delete. **A table's NAME is not evidence of its nature** — `no-floorless-control-in-wrap`'s `JUDGMENT_DEFERRED` holds permanent rulings that belong under reviewed grants (`:113,142`) |
| what is a marker, and what happens to this legacy grammar? | [`ordinary-waiver-source-migration.md`](../reviews/gate-runtime/ordinary-waiver-source-migration.md) §"Exact central grammar", §"Closed 11-grammar disposition", §"Explicit non-migrations". Its atomic-cutover framing is dead (see its banner); its grammar contract and per-grammar verdicts bind |
| what shape do I copy? | [`exemplars-2026-09-11.md`](../reviews/gate-runtime/exemplars-2026-09-11.md) — one converted gate per capability, each read in full. Its "did not cover" section is part of the record: an exemplar marked unconfirmed is a lead, not a precedent |

**THE STALENESS RULE, and it explains nearly every stale claim in that layer:** the gate program started BEFORE the type-worlds program (#1351), so every one of those documents is dated 2026-09-05/06 while #1351 completed 2026-09-10. **Anything they call blocked, required, or missing may have been built or retired by the world program rather than by us** — measured 2026-09-11: eight of `resource-gate-access-patterns`'s ~15 required facts are shipped, its §8 consumer no longer exists, and two of its nine prerequisites are closed. Their COUNTS rot by construction; their MECHANISM paragraphs are law. Re-derive every blocked/required claim against the tree before acting on it, and never quote a roster from them — the loader, `pnpm gate:contract` (what is CONVERTED) and `pnpm check:policy-conformance` (what is converted AND PROVEN) are the roster.

## 1. The decision that changed everything: mixed runtime, not atomic cutover

The integration branch was fast-forwarded onto `main` on 2026-09-11. The tree now carries both descriptor shapes in
production, so the atomic-cutover invariant ("no production state supports old and new descriptors together") is moot
and no longer an acceptance requirement. Purity guarantees such as zero legacy descriptors, zero legacy fields, or one
runtime shape are NOT gates on progress. The transition has three phases:

1. ~~**Legacy-only production path**~~ — OVER. `check:structure` used to load only `GateDescriptor`s and throw on a
   `defineGate` module, so converted policies ran only where a committed family test imported them.
2. **Mixed execution — WHERE WE ARE, landed 2026-09-11 (`d21ece8d8`).** One front door loads BOTH contracts, runs each
   through its own dispatcher in one invocation, and reports them together. Every converted policy is a live gate the
   moment it lands, and its declared proof rows run on the commit bar (§5). Conversion proceeds under this phase until
   the legacy set is empty.
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
| gate modules / final / legacy | 270 / 162 / 108 | `pnpm check:policy-conformance` (the authoritative roster). **A bare `defineGate` grep OVERCOUNTS by 3** — `gate-modernization` and `enforcement-registry-parity` carry it inside proof-fixture STRINGS and `runner-config-path-liveness` inside its refusal comment. The honest shape test is `^export const gate = defineGate(` |
| converted modules with NO committed test importing them | no longer the bar | `structure:policy-conformance` runs every final policy's declared rows on the static tier (§5). A module with no family test still lacks its §4.2/§4.3/§4.5/§4.6 pins. At least 12 are in that state, named across three lanes — `baseui-render-prop-composition`, `bus-on-data-no-store-write`, `membership-fan-guard`, `no-caller-user-id`, `no-external-media-without-gate`, `no-color-literals`, `test-factory-contract`, `no-raw-container-widths`, `no-raw-typography-in-features`, `no-raw-spacing-in-features`, `no-decorators`, `no-array-literal-querykey`, `no-if-is-group` |
| ordinary policies with no positive `@orb-waive` identity arm | **0 of 86 — CLOSED** (#1952) | The last 22 landed 2026-09-11 across three lanes (`158c4993c`, `d660d6442`, `f52492f44`), every one an in-module `mustPass` so no lane touched a shared test file. A fresh-context verifier sampled seven across all three commits, flipped each marker to a dead token, and got the §4.2 `AUTHORITY ALARM … names a dead position` on all seven; each sampled fixture produces exactly one finding |
| `mustFlag` rows carrying no `expect` | 0 — closed at `cf38cd6df` | all 39 pinned across 14 modules, with planted count/token/line breaks proving each dimension bites |
| working-tree fixture planting under `tests/tooling/verify/gates/**` | 4 files, all covering LEGACY modules | `tsconfig-entry-liveness`, `no-blanket-suppression`, `biome-grant-liveness`, `runner-config-path-liveness` — the last `__g_`/`__dc_` planters in the gates tree; legitimate until those four convert, and the reason `check-gates.repo.int.test.ts` stays orchestrator-only during a train. Zero final policies plant, by construction (§4.8) |
| first MIXED baseline (both contracts, one door, real tree) | 270 modules · 635 findings = 200 legacy + 435 final; 4:01.81 wall / 6.57 GB peak RSS; parity 26 s | phase A lane §11.9, `d21ece8d8`. Supersedes the 119-policy wave-5 figure |
| whole-corpus conformance | 162 final policies · 1,510 rows · **0 failures**, exit 0 · ~11 s | `pnpm check:policy-conformance` at `493beea1a`. Independently re-derived from the loaded policies (`source 403 + types 1049 + resource 58` = `mustFlag 732 + mustPass 778`), not read off stdout. It was 95 failures at the start of 2026-09-11; both remaining failures were one class — a fact provider whose receipt counted what it FOUND instead of what it MEASURED, fixed per subject in `registry-fact.ts` (#1953) and per provider in `bus-fact.ts` + `bus-definition-fact.ts` (#1955) |
| central reviewed-grant table | 105 rows at wave 5 (+1 coarse-pointer row after the main merge) | `lib/reviewed-grants.ts` |
| shipped runtime | `defineGate` contract + validator, policy loader, `runPolicyPass`, six-kind scope resolver, planner/executor (`planPolicyArgv`/`executePolicyPlan`), ResourceHost with 7 closed kinds, `defineFact` providers (bus-producers, bus-definitions, drizzle-schema, registry-definitions, tuple-vocabularies), central ordinary-waiver engine, central reviewed-grant reconciler, hermetic conformance runner (`verifyPolicyProofs`) | checkpoint + planner-cli-integration.md + resource-host-foundation.md |
| NOT shipped | ResourceHost kinds beyond the seven — and whether they SHOULD exist is the Phase C fork, not a backlog (playbook §2); the overload-aware barrel-re-export fix; `QualifiedName` normalization | #1930, checkpoint "runtime follow-ups" |
| known red by construction | `check:structure` exit 1 (real product backlog: 315 `ONESHOT-OK`, 58 `@owner-scope*`, …), `gate-ignore-grammar.int.test.ts` (LEAKS `__g_gi` fixtures — never run on a shared tree), `check-gates.repo.int.test.ts` (not concurrency-safe with itself; orchestrator-only during a train), `check:doc-catalog` 34 inherited rows, 12 `types:graph` errors in five legacy-loader test files | phase A lane §"still red", 2026-09-11 |
| NOT baselined red — treat as a real verdict | `structure:policy-conformance` and every SCOPED family test. The posture's red-by-construction list above is EXHAUSTIVE; a scoped suite red is a regression until reproduced on a clean tree and dated against the commit that broke it | `registry-family.test.ts` sat red five days because this was assumed the other way (#1953) |

Open rows: **#1930** (the ruled capability build — §11, and the design it implements is
`resource-gate-access-patterns.md`), **#1922** (sanctioned-home tables → reviewed grants, one lane not pair-by-pair,
incl. `ALLOWLIST`/`CALLER_FREE_OPS`), **#1950** (forge, the 13 mixed-hook splits — the only remaining forge-class work),
#1946. Defects found by the 2026-09-11 exemplar wave and its verifier, none blocking a conversion: **#1956**
(`css-family-ownership`'s real-tree manifest stale since 2026-09-07), **#1957** (two unwaivable finding classes — a
paren in the position, and a file-constant position), **#1958** (`analysis: "syntax"` fences only `ctx.checker()`;
blast radius currently zero, the gap is recurrence), **#1959** (`ext: ["ts","tsx"]` is inert and survives in 32
policies, 4 providers and the `TS-MORPH-CAPABILITIES.md` example that teaches it), **#1960**
(`no-media-queries-in-features` misses interpolated class strings and its message misnames the shape).
DONE 2026-09-11 after a fresh-context verifier CONFIRMED: #1941, #1952, #1953, #1954, #1955. Still at Review, NOT
covered by that verifier and not to be swept into it: **#1948**.
Closed as superseded: #1608/#1609/#1637 (the ESLint-engine architecture; commits on `archive/codex-eslint-cutover/*`).
Conversions themselves get no rows; they land as comments on #1584.

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
private cache, private marker parser, gate-owned exemption table, scope predicate or filesystem read; state in
`create`; every anchor inside the policy's own resolved population; population `under: ["x/**"]` (a `"x/"` matches
nothing). A read the seven shipped resource kinds cannot serve, or a shared reader that does not exist in `lib/`,
STOPS that module — it stays legacy and armed, and the exact read goes to #1930. That refusal is a SUCCESS; keeping a
private reader behind `defineGate` lowers the census while leaving the forbidden machinery in place.

**The reported position, which is also the waiver position.** `report.node`'s token is an exact slice of the node
text, and when a policy passes NO token the sink DERIVES one (`policy-pass-context.ts:109`): the first identifier,
literal or keyword in the reported node's own text containing no paren or newline. That token is what an author must
type in `@orb-waive <id>(<position>)`. **It is routinely NOT the thing a reader would call the offense** — a policy
reporting the type argument `Registry<string, number> | null` is waived at `Registry`; `no-manual-autosave-flush` at
`pushFieldValue` though `handleSubmit` is half the defect; `bounded-list-limit` at the field name rather than the
unbounded chain, because both report a pair- or chain-level verdict anchored on one locus. A string-literal token
INCLUDES its quotes. **Read the `report.node` call, never the message.** Unguessable is the norm, which is why an
ordinary policy's `fix` owes the spelling — and why a token containing a paren makes the policy UNWAIVABLE, since the
marker grammar's position group is `[^()\r\n]+` and every marker against it parses as malformed.

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

   **A NARROWING is a claim, and it owes a row that dies without it.** A carrier fence, an ancestor guard, a context
   predicate — anything that makes the policy flag LESS than its population — is invisible to a proof set built only
   from positives and near-misses, because deleting the narrowing only ever ADDS findings at sites no row visits.
   Measured on the corpus (#1954): deleting `inClassCarrier` from `no-raw-spacing-in-features` and
   `no-raw-typography-in-features` left EVERY pre-existing row green in both modules. The test is two commands — cut
   the narrowing in a `cp`-backed copy, run the module's rows, restore — and the fix is a `mustPass` row placing the
   same literal OUTSIDE the fence. This is the one place a conversion owes a planted break for a row it did not
   invent: §4.7 covers new properties, and this covers an old property nothing was ever shown to enforce.
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
   **Build the arm on a fixture that produces exactly ONE finding**, because one marker consumes one occurrence: a
   founding row that fires twice (an import door plus its call site, as in `no-forward-ref`) leaves the second finding
   effective and fails the row. Use the member or namespace arm instead and state the cardinality in the `why`. This is the arm-authoring face of a
   standing rule — **finding granularity must match waiver granularity** — whose exact predicate is POSITION identity,
   not statement identity. `ordinary-waiver.ts` narrows candidates TWICE: carrier containment, then exact
   `finding.token === marker.position`. So two findings inside one statement are still separately waivable when their
   position tokens DIFFER (`className="rounded-lg shadow-md"` takes two markers), and a site is unwaivable only when
   two findings share the same carrier AND the same token — then every marker is `over-broad` and suppresses neither,
   and adding markers makes it worse. `checkpoint-2026-09-05.md` states this as "two findings per statement", which is
   the approximate form; the predicate above was measured against the corpus by planting real markers (#1954: 37 of 40
   multi-finding rows waivable, 3 not). **The shape that produces it** is a report call inside a loop, or one shared
   anchor spread into two report calls — both emit byte-identical findings. An ordinary policy with such a shape has no
   working door and was mis-authored; fix by reporting once per call site or giving each finding its own subject
   anchor. **Prove discrimination once per family with a two-command control:** flip the marker's position in a
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
8. **Fixtures — where a proof's files actually go, and why a final policy CANNOT plant in the working tree.**
   A proof row declares `mode` plus a `files` map of path → content. **The MODULE never chooses the substrate; the
   runtime does**, from `mode` (`ops/policy-conformance.ts`):
   - `mode: "source"` / `"types"` → `runVirtualExample`. Files are created with `Project#createSourceFile` under the
     synthetic root `/orb-policy-conformance-<n>` in a project built `useInMemoryFileSystem: true`. **Nothing is
     written to disk anywhere** — there is no file, not merely no file in the repo. Sources are removed before and
     after each example, so rows cannot see each other's fixtures.
   - `mode: "resource"` → `runResourceExample`. A real directory under the OS tmpdir
     (`mkdtempSync(join(tmpdir(), "orb-policy-conformance-"))`), OUTSIDE the checkout, deleted in a `finally` with
     `rmSync(root, { recursive: true, force: true })` whether the row passes, fails or throws.
   - Real-corpus controls are virtual overlays on the loaded Project, never edits to tracked files.

   So **"no planting in the working tree" is enforced by construction, not by author discipline.** A final policy has
   no filesystem access at all (§12.3 bans reads; there are zero writes across the corpus), and its proof rows cannot
   reach the checkout even deliberately. The legacy runtime did the opposite — it planted `__g_`/`__dc_` fixtures in
   the working tree, which is why `check-gates.repo.int.test.ts` is still not concurrency-safe with itself, why it
   stays the orchestrator's to run during a merge train, and why a live probe was once swept into a commit and shipped
   a BLINDED gate. Those hazards retire with the legacy suites, not with a rule.

   **The paths in a `files` map are population coordinates, not locations.** `"packages/client/src/features/a/data.ts"`
   places that fixture inside the policy's declared population; change the path and you change whether the policy sees
   it at all. That is how a row proves a population fence.

   **This does not change how you probe a REAL file.** Fixtures are for proof rows; probing live behaviour still uses
   a throwaway scratch path, or `cp f f.bak` … `mv f.bak f` — never `git stash`/`checkout`/`restore` (constitution §4).

   A fixture's relative import that resolves to nothing makes every identity row pass by fail-closure while
   conformance stays green, so a specifier-resolution control is part of every family floor.
9. **One family test may cover several siblings**; a file per gate is unnecessary. **A conversion no longer owes a
   family test for its DECLARED rows** — the conformance stage (§5) runs every final policy's `mustFlag`/`mustPass` on
   the static tier. A family test is owed only for what a row cannot express: the §4.2 identity arm through
   `runPolicyPass` (which asserts `waivedFindings === 1` and `authorityAlarms === []`, neither of which a `mustPass`
   row separately asserts), §4.3 grant identity, §4.5 refusal/receipt pins, and the §4.6 differential. Several
   converted modules have no family test at all and therefore no home for those pins; that is the remaining debt, not
   the declared rows.

## 5. The runtime you have (Phase A landed 2026-09-11, `d21ece8d8`)

This is no longer work; it is the substrate every lane now builds on. What it guarantees:

- **One front door.** `pnpm check:structure` and the scoped door load BOTH contracts in one invocation over one
  Project, classify each module by exact contract identity (a branded `defineGate` result vs a validated
  `GateDescriptor`; a lookalike or duplicate id is a tool error), and emit ONE artifact that `check:show` renders.
  Exit classes unchanged: 0 clean, 1 violations, 2 tool error, 3 misuse.
- **A converted policy is LIVE the moment it lands.** It no longer runs only where a family test imports it.
- **Its proof rows run on the commit bar.** `structure:policy-conformance` is a STATIC stage (in `pnpm verify --list`,
  under changed/static/push/full, whole-only) that runs `verifyPolicyProofs` over every final policy — 1,510 rows
  across 162 policies in ~11 s. **So a conversion no longer owes a family test for its DECLARED rows.** A family
  test is still owed for what the rows cannot express: the §4.2 identity arm driven through `runPolicyPass`, §4.3 grant
  identity, §4.5 refusal/receipt pins, and the §4.6 conversion differential.
- **Marker routing is fenced:** legacy `@orb-gate-ignore` reaches only legacy owners, `@orb-waive` only final ordinary
  policies, reviewed grants only final reviewed-grant policies.

**Read the conformance stage's exit as a real verdict — it is GREEN as of `097958302`.** It was never baselined red
the way the whole-tree checks are; it exited 2 only while fact-provider defects were open, and those are closed. A red
here is a regression.

**But green is a FLOOR, not the bar — see §5b.** The stage proves that each module's DECLARED rows execute and pass.
It cannot tell you the module declared the RIGHT rows, used the smallest complete contract, named its family honestly,
or told the truth in its `message`. A module with two trivial rows and a lying message sits at 0 failures. Three did
(#1954).

## 5b. PRISTINE — the bar a converted module is actually held to (owner, 2026-09-11)

> *"Pristine does not mean the number goes to 0. It means the gates that are new all need to maximally be set, and
> proper, and not violate the rules that we set forth — so when we convert legacy shit we can point to them and say:
> see, go look how they do it."*

**The test is not "does it pass." The test is "can I point a conversion lane at this module and tell it to copy?"**
A module that passes conformance but cannot survive that sentence is NOT done, whatever the verdict says. This matters
more than it sounds: the exemplars are the transmission mechanism for the whole remaining corpus, so a defect in a
converted module does not stay in that module — it gets copied 106 times.

A converted module is pristine when all seven hold. The first six are the contract; the seventh is why the bar exists.

1. **Smallest complete contract for its evidence plane** (§3's table). Nothing declared that it does not use: no
   `facts:` entry it never reads, no `ctx.checker()` on a pure-syntax gate, no `execution: "entire-population"` where
   the verdict composes over a subset. An over-declared contract teaches the next lane to over-declare.
2. **The `message` is TRUE of what the code flags.** Every context clause is a claim — "in `className`", "in a feature
   surface", "at a call site" — and it must match the population, the carrier and the report call. Three modules
   claimed "in className" and did not mean it (#1954); each was green.
3. **`fix` names the exact waiver spelling**, for every ordinary policy, read off the `report.node` call and never off
   the message. The position is routinely not what a reader would call the offense (§3), so a missing or guessed `fix`
   makes the policy unusable by the person it fires on.
4. **The family is a real shared `lib/` reader** (module + function, named in the header) or a declared singleton with
   its reason. A theme, a filename prefix and a shared topic are not families.
5. **The header records the decisions**: the family and its reader, the population port (byte-identical, or the
   intentional correction and why), and the marker census if a private vocabulary was retired.
6. **The proofs meet §4 in full**: legacy rows carried; `expect` on every `mustFlag`; a row that dies without each
   narrowing (§4.1); the positive identity arm for every ordinary policy (§4.2); refusal/receipt pins where the verdict
   depends on a derived population (§4.5).
7. **Nothing forbidden survives behind the contract** — no private reader, walk, cache, exemption table, scope
   predicate or filesystem read, and none smuggled into a `lib/` helper that only this module calls. A private reader
   wearing a shared reader's clothes is the same rot with a better address.

**Measuring this is a READING task and a script can only bound it.** Items 1, 4, 6 and 7 are partly greppable; items 2,
3 and 5 are judgment about whether prose matches behavior, which is exactly where a mechanical sweep returns a false
clean (playbook §5). Audit it with `verifier`-class lanes at family granularity, requiring a per-module verdict line so
a miss surfaces as a missing row rather than hiding inside "none found". Gaps are defects and get rows; they are not
conversion debt to be carried forward, because every one of them propagates.

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

**Remaining: 108 modules. THE PER-GATE BLOCKER IS NOT LISTED HERE — it is in
[`uncovered-gate-conversion-census.md`](../reviews/gate-runtime/uncovered-gate-conversion-census.md), one row per gate,
and that document is the Phase D ordering source.** The shape below is for dispatch planning only; no bucket count in
it is current.

| Bucket | Lane class |
| - | - |
| resource-backed (`fsBacked`) run/visit/file gates: CSS family, config liveness, Base UI + installed/generated, documents/registries/ledgers, `db-structure`, the test-presence trio, `tooling-instrument-proof` | executor per family, as each capability lands (#1930) |
| run-only whole-population evaluators | executor (Opus) — most want `evaluate` on a provider that already exists |
| direct-walking visitors and file hooks | executor — inversion into visitors + ancestor checks, state into `create`, markers translated in-commit |
| the 13 ruled mixed-hook modules (`tooling-argv-front-door`, `tooling-shared-plumbing`, `no-inline-union-redecl`, …) | forge (#1950); multi-way splits touching `lib/reviewed-grants.ts` and exported coupled sites |
| self-policing gates that read the gate corpus (`enforcement-registry-parity`, `gate-ignore-inventory`, `finding-overload-provenance`, `gate-modernization`, `dangling-refs`) | runtime lane; two of them retire at legacy deletion rather than converting |

**A FILESYSTEM TEST IS NOT A CONVERTIBILITY TEST, and neither is `gate:contract`.** Measured 2026-09-11: 60 of the 108
import no `node:fs`, reference no `node_modules`, and reach no fs-touching `lib/` reader — and that says nothing about
whether they can convert. The census's blockers are SHARED READERS and GRANT MIGRATION, which no `fs` probe and no
shape check can see: a module marked `X` there carries a gate-local table, sanction, deferred row, stale arm or custom
marker, and its conversion needs a grant home before it needs a lane. `gate:contract`'s simple tier shape-matches the
descriptor literal and is blind to what a gate READS. **Route Phase D families from the census, never from a grep.**
Its own rule is the one that binds: *a row remains blocked when the required reader or ResourceHost fact does not yet
exist.*

## 7. What constrains any order

**The SEQUENCE is not here.** It lives in [gate-runtime-orchestrator-playbook.md](gate-runtime-orchestrator-playbook.md)
§2, which is the one home for phase order and moves as the owner rules on it. This section carries only the hard
dependencies that constrain ANY sequence, because they are law rather than scheduling:

- The mixed front door (§5) precedes everything. Until it lands, a converted policy runs only where a committed family
  test imports it, so "converted" does not mean "enforcing".
- **No gate converts on a resource kind before that kind lands** (#1930). Each kind ships as a provider with
  ready/missing/empty/unresolved receipts and its own controls.
- A conversion lane translates its own legacy markers in the SAME commit — comment-only edits under `packages/**` and
  `tests/**` are inside that lane's fence — so the converted gate is green on the live tree at landing. Marker
  translation is conversion work, never a separate final-launch lane. Grammar and binding:
  `ordinary-waiver-source-migration.md` §"Exact central grammar".
- Authority reconciliation (#1922, the nine baseline JSON ledgers, decisions #1939 and #1921) needs the central grant
  table stable, so it follows the conversions that feed it. Per-row dispositions: `exception-authority-census.md`.
- Legacy retirement runs only when `gate:contract` shows zero legacy modules. The deletion list is
  `ordinary-waiver-source-migration.md` §"Atomic cutover checklist" (legacy parser/pass accounting, `markerImmune`, the
  two retired auditors, `__g_` suites, baselines, census command), plus rewriting `GATE-AUTHORING.md`, `gate:new` and
  `gate-modernization` against `defineGate`, an idle composed-pass remeasurement, and a catalog re-attest.

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
- Roles and models: runtime/architecture lanes and the 13 splits → forge (#1950, RULED 2026-09-11); families where a
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

- **2026-09-11 — PHASE C: THE DESIGN ALREADY EXISTS; ONLY THE DELTA IS RULED HERE (#1930).**
  **[`resource-gate-access-patterns.md`](../reviews/gate-runtime/resource-gate-access-patterns.md) §§1–8 IS the Phase C
  design** — eight resource families with their required surfaces written as TypeScript, a per-gate access/scan/proof
  table, a `__g_` live-probe replacement table with a destination per fixture, a keep-vs-move-behind-host map for ten
  helpers, and nine numbered prerequisites. **Read it before proposing any capability.** An earlier version of this
  ruling re-derived a worse subset of it from scratch; that is withdrawn. Its COUNTS are stale (255-module corpus,
  atomic premise); its ENGINEERING binds. What is ruled here is only what that document could not know:

  1. **Eight of its ~15 typed facts are SHIPPED** (`contract/resource-host.ts`): `authoredTree`, `authoredCss`,
     `productCss`, `cssInventory`, `packageMetadata`, `staticConfig`, `nativeConfig`, `trackedFiles`. In particular
     §2's "preserve the static reader's algorithm, put its loading behind `staticConfig`" is DONE, and §1's
     `authoredTree` carries 12 closed ids covering every identity §1 names. **Genuinely absent:** `json`, `jsonc`,
     `exactFiles`, `mirrorIndex`, `vendorCssSurface`, `documents`, `ledger`, `baseUiSurface`, `tokenContract`,
     `devtoolsClosure`, `installedReactCompiler`.
  2. **§8 is STRUCK, and BLOCKED #5 with it.** `tsconfigPrograms()` existed only for `tsconfig-routing-parity`, which
     no longer exists — the world program retired it in phase 6 (#1896), successor at `ops/tests-type-membership.ts`,
     and §12.7 forbids resurrecting it.
  3. **BLOCKED #2 and #3 are CLOSED.** #2: the status union is `ready | missing | empty | unresolved | malformed`
     (`contract/resource.ts:3-4`), `resolveResourceDeclarations` throws on any non-ready declaration and on an empty
     fact, and `factReceiptFailures`/`withholdFactDependents` withhold every consumer before `evaluate`. #3: the
     overlay question is answered — `ResourceReaderOptions.overlay` feeds the resource reader, `mergeOverlay` merges
     overlay entries into tree walks, and `runResourceExample` hands the SAME map to both substrates in one call.
  4. **`biome.json` is a strict `json()` read, never a native loader** (§2 already says so: *"Strict JSON remains
     distinct for `biome.json` …"*). Biome ships an executable, not a config API — `@biomejs/biome` 2.5.1 has no
     `main`, no `exports`, no `@biomejs/js-api`, and no subcommand emits a resolved configuration. `tsconfig` is
     `jsonc()` plus `extends` FOLDING, also per §2. **No `CONFIG_SNAPSHOT_RUNNERS` member is added for either.**
  5. **OWNER RULING — one `installed-package` kind with a closed three-mode return shape** (`ast` | `metadata` |
     `text`), each receipted, rather than §6/§7's three narrow facts. A capability serving one gate is that gate's
     private reader wearing a contract's clothes, and three kinds cost three passes over the four policing surfaces
     instead of one. This is the one place the ruling deliberately overrides the document.
  6. **An authored-path identity door**, plus absolute-selector normalization, specified by a measured refusal at
     `runner-config-path-liveness.ts:23-39`: `exists · file|directory · symlink-resolves-outside` for a repo-relative
     selector, and a way to relate an ABSOLUTE selector to the repo at all (`GatePolicyContext` carries no root).
     Without it an in-repo symlink pointing outside the tree silently PASSES. **`ResourceFileSnapshot`'s `symlink`
     variant does NOT satisfy this — it is internal and never reaches a policy.** `runResourceExample` needs the
     matching fixture-side expression. **`runner-config-path-liveness` is NOT a converted precedent**: it is a legacy
     `GateDescriptor` (`:306`) that REFUSED conversion citing this row.
  7. **The carrier-demand hazard is one KIND's defect, not a property of resource declarations.** `native-config`'s
     fact paths are the whole repository inventory, so an ordinary consumer's waiver-carrier demand throws on tracked
     symlinks; both shipped consumers are `authority: "hard"` and hard policies never demand carriers. An ORDINARY
     policy CAN carry a resource declaration — `no-raw-color-in-css` is the worked exemplar (`ordinary` + `resource` +
     `authored-css`).
  8. **No CSS census `defineFact`.** `authored-css` already IS that corpus and `cssInventory` already parses it, so
     the four duplicating modules declare `authored-css` as `no-raw-color-in-css` does. A fifth CSS home is the rot.

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
unresolved fact or a tool error and NEVER returns absence, and collapsing the two silently blinds the consumer.

**A provider's receipt states what it MEASURED, never what it FOUND.** `members` is the denominator the provider
actually walked — the authored sources admitted by its population — and `unresolved` is reserved for syntax the
provider could not read. It is NOT the census the provider built. The reason is mechanical: the predicate is
`receiptFailures` (`lib/policy-pass.ts:628-639` — `count === 0` at `:631`, `unresolved > 0` at `:635`), flat-mapped by
`factReceiptFailures` (`:641`), and `withholdFactDependents` (`:679`) drops every consumer BEFORE `evaluate` runs
(`finishFactRuns` → `withholdFactDependents` → `evaluateRuns`, `:821-822`).

**Two different things are called a receipt; do not confuse them.** The PROVIDER's semantic receipt is what the
refusal above judges, and **no policy can reach it at all** — `$X.receipts` appears zero times across `gates/`
(control: the same pattern in `lib/policy-pass.ts` returns 8). What several consumers DO read is `fact.receipt.<field>`
on the fact VALUE, a plain data field the provider publishes for its consumers (e.g. `bus-definition-fact.ts:330-340`,
source `"bus-definition-fact"`), which is a different object from the provider's own receipt (`:372`, source
`"bus-definition-sources"`). The discriminator below means the consumer's `ctx.receipt` call and its fail-closed throw,
never the fact value's data field. So a provider that receipts its findings preempts its own designated accuser —
an empty or holed census becomes a FACT TOOL ERROR instead of reaching the `-health` policy whose whole job is to
report it, and that policy's empty-corpus `mustFlag` arm can never execute. That was both of the last two conformance
failures: `bus-producers` and `bus-definitions` each receipted their census (#1955), exactly as `registry-fact.ts` had
summed six kinds' (#1953). The discriminator is cheap and mechanical — read every consumer's own `ctx.receipt` and its
fail-closed throw; **if no consumer expresses its dependency through the provider's `unresolved`, the provider must
not publish one.** Emptiness and holes belong in the fact's own `status`/`unresolved` FIELDS, which are delivered to
consumers and judged by them. The refusal does not weaken: it moves to the provider's POPULATION phase (zero admitted
paths), which is per-provider and fires strictly earlier. And a family with two providers has the defect twice — the
`bus-definitions` twin only became visible once `bus-producers` was fixed, having until then swallowed the
`bus rosters disagree` message a hard pin asserts. Early/undeclared
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
