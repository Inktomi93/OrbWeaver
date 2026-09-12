---
kind: design
status: active
updated: 2026-09-12
---

# One ts-morph runtime for every Orb gate — the program guide (#1584)

> **A COLD OR COMPACTED SESSION READS [`gate-runtime-read-first.md`](gate-runtime-read-first.md) BEFORE THIS FILE.** It is the ordered onboarding read list with its costs and its STOP rules, and it carries the standing rulings that override anything here. It exists because reading this doc's full citation set (\~1.3 MB) consumed 60% of an orchestrator's context window on 2026-09-12, most of it on evidence whose headline findings were already closed.

The single operating document for the gate-runtime standardization program: the transition model, the state of the tree, the proof rules, the order of work, the per-conversion procedure, the dispatch mechanics, and the contract itself. It supersedes [gate-config-system.md](gate-config-system.md) and every earlier resume or atomic-cutover order. Native Biome/ESLint/community rules continue to own generic ecosystem lint; every Orb-specific policy uses one ts-morph runtime and one capability contract. `tooling/src/verify/gates/GATE-AUTHORING.md` is the LEGACY descriptor guide and is not an input to a conversion.

**The review layer under [`docs/reviews/gate-runtime/`](../reviews/gate-runtime/) is not all one thing, and treating it as "evidence" cost a full session of re-deriving answers it already held.** Four of its documents are LIVE LAW this guide delegates to; the rest are completed-family evidence. **Before proposing a capability, a family, a table's disposition or a marker translation, read the one that owns the question:**

| Question | The document that already answers it |
| - | - |
| what resource capability does the corpus need? | [`resource-gate-access-patterns.md`](../reviews/gate-runtime/resource-gate-access-patterns.md) §§1–8 — eight families with their required surfaces as TypeScript, a per-gate access/scan/proof table, a `__g_` fixture-replacement destination per row, a keep-vs-move-behind-host map for ten helpers, and nine numbered prerequisites |
| what blocks THIS gate, and what family is it? | [`uncovered-gate-conversion-census.md`](../reviews/gate-runtime/uncovered-gate-conversion-census.md) — per-gate blocker class, family, population notation, authority and source-line receipts. **This is the Phase D ordering source**, not a filesystem grep: its blockers are shared readers and grant migration, which no `fs` test can see |
| where does this exemption table / baseline / marker go? | [`exception-authority-census.md`](../reviews/gate-runtime/exception-authority-census.md) — 97 exemption tables, 319 rows, 25 sanctioned-home tables, 9 baselines and 11 duplicate grammars, each already classified as grant, waiver, warning debt, policy data or delete. **A table's NAME is not evidence of its nature** — `no-floorless-control-in-wrap`'s `JUDGMENT_DEFERRED` holds permanent rulings that belong under reviewed grants (`:113,142`) |
| what is a marker, and what happens to this legacy grammar? | [`ordinary-waiver-source-migration.md`](../reviews/gate-runtime/ordinary-waiver-source-migration.md) §"Exact central grammar", §"Closed 11-grammar disposition", §"Explicit non-migrations". Its atomic-cutover framing is dead (see its banner); its grammar contract and per-grammar verdicts bind |
| what shape do I copy? | [`exemplars-2026-09-11.md`](../reviews/gate-runtime/exemplars-2026-09-11.md) — one converted gate per capability, each read in full. Its "did not cover" section is part of the record: an exemplar marked unconfirmed is a lead, not a precedent. **REFUTED 2026-09-12 — NINE OF ITS TEN ARE NOT COPYABLE; read its banner FIRST.** A §5b audit refuted nine (two of the three it marked "Wart: none found" were refuted SEVERE) and found 12 of 30 narrowings unenforced; only `user-bus-deferred-member` survives. What still binds: its central-files table, the capability→shape mapping, and every §4.2 identity arm. Receipts: [`v-exemplar-audit-2026-09-12.md`](../reviews/gate-runtime/v-exemplar-audit-2026-09-12.md) |
| **what does THIS gate actually enforce?** | **[`Core-Enforcement-Active-Gates.md`](../architecture/core/Core-Enforcement-Active-Gates.md) — **275** rows, one per gate module, and each "Enforces" cell is a dense SPECIFICATION, not a label.** **IT IS NOT THE ENFORCEMENT SURFACE, and absence from it is evidence of NOTHING** (owner correction, 2026-09-12): constitution §2.2 makes enforcement a LADDER — resolve-time package deps, compile-time branded types and exhaustive unions, lint-time biome/dep-cruiser/gates, test-time suites — and §2.3 requires a placement to name its enforcer at SOME tier. A control-flow-dependent or per-request property is routinely held by a BEHAVIOURAL suite BY DESIGN (`table-scoping-class`'s own row delegates its membership rung to `cross-tenant-sweep.suite.int.test.ts` in exactly those words), so "no gate of that name" never means unenforced. Ask which TIER holds it before filing a gap. The roster PAIR is 275 active + 28 deferred + 2 prebuilt + 3 dropped = 308 rows, and the deferred half is one-sided (#2008). `caught-failure-ownership`'s single row names its three arms with their position shapes (`promise:<work>`, `empty:<binding>`, `default:<binding>`), every owner-provenance rule and its lookalike traps, the success-discriminator refusal, that provenance dies on reassignment, the exact escape spelling, and **five DECLARED LIMITS each stated to have a `mustPass` row** — which is directly checkable, and exactly where this program keeps finding unpinned claims. **Read your gate's row before converting it.** It is also a COUPLED SITE: a conversion rewrites its row, a split adds and removes them. **WRITE THE ROW AS MECHANISMS, NEVER AS COORDINATES** (measured 2026-09-12): of eight false rows found in one family, SIX were false because they named a deleted helper, table, filename regex or reader path — `fileLoaded(compose/authed-app.tsx)` appearing zero times in its module, a `non-literal-copy` skip that is now a fail-closed finding, "the shared `registryDefinitionFact`" which does not exist singular. All greppable, all silently falsified by the conversion that deleted them. A row written with symbol names and BEHAVIOURS, carrying no `file:line` into a gate module, cannot be re-staled by the next edit. Wave 1 found four rows that were bare LABELS; wave 2 found five that were dense about the RETIRED implementation — the second is worse, because it reads authoritative |

**THE STALENESS RULE, and it explains nearly every stale claim in that layer:** the gate program started BEFORE the type-worlds program (#1351), so every one of those documents is dated 2026-09-05/06 while #1351 completed 2026-09-10. **Anything they call blocked, required, or missing may have been built or retired by the world program rather than by us** — measured 2026-09-11: eight of `resource-gate-access-patterns`'s \~15 required facts are shipped, its §8 consumer no longer exists, and two of its nine prerequisites are closed. Their COUNTS rot by construction; their MECHANISM paragraphs are law. Re-derive every blocked/required claim against the tree before acting on it, and never quote a roster from them — the loader, `pnpm gate:contract` (what is CONVERTED) and `pnpm check:policy-conformance` (what is converted AND PROVEN) are the roster.

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
| gate modules / final / legacy | **275 / 171 / 104** (2026-09-11 evening; was 271/166/105 — the +5 final are #1971's four meta-policies plus one conversion) | `pnpm check:policy-conformance` (the authoritative roster). **A bare `defineGate` grep OVERCOUNTS by 3** — `gate-modernization` and `enforcement-registry-parity` carry it inside proof-fixture STRINGS and `runner-config-path-liveness` inside its refusal comment. The honest shape test is `^export const gate = defineGate(` |
| converted modules with NO committed test importing them | no longer the bar | `structure:policy-conformance` runs every final policy's declared rows on the static tier (§5). A module with no family test still lacks its §4.2/§4.3/§4.5/§4.6 pins. At least 12 are in that state, named across three lanes — `baseui-render-prop-composition`, `bus-on-data-no-store-write`, `membership-fan-guard`, `no-caller-user-id`, `no-external-media-without-gate`, `no-color-literals`, `test-factory-contract`, `no-raw-container-widths`, `no-raw-typography-in-features`, `no-raw-spacing-in-features`, `no-decorators`, `no-array-literal-querykey`, `no-if-is-group` |
| ordinary policies with no positive `@orb-waive` identity arm | **0 of 86 — CLOSED** (#1952) | The last 22 landed 2026-09-11 across three lanes (`158c4993c`, `d660d6442`, `f52492f44`), every one an in-module `mustPass` so no lane touched a shared test file. A fresh-context verifier sampled seven across all three commits, flipped each marker to a dead token, and got the §4.2 `AUTHORITY ALARM … names a dead position` on all seven; each sampled fixture produces exactly one finding |
| `mustFlag` rows carrying no `expect` | 0 — closed at `cf38cd6df` | all 39 pinned across 14 modules, with planted count/token/line breaks proving each dimension bites |
| working-tree fixture planting under `tests/tooling/verify/gates/**` | 4 files, all covering LEGACY modules | `tsconfig-entry-liveness`, `no-blanket-suppression`, `biome-grant-liveness`, `runner-config-path-liveness` — the last `__g_`/`__dc_` planters in the gates tree; legitimate until those four convert, and the reason `check-gates.repo.int.test.ts` stays orchestrator-only during a train. Zero final policies plant, by construction (§4.8) |
| first MIXED baseline (both contracts, one door, real tree) | 270 modules · 635 findings = 200 legacy + 435 final; 4:01.81 wall / 6.57 GB peak RSS; parity 26 s | phase A lane §11.9, `d21ece8d8`. Supersedes the 119-policy wave-5 figure |
| whole-corpus conformance | **171 final policies · 1,733 rows · 0 failures, exit 0 · \~12.3 s** (2026-09-11 evening, measured on `main` after the #1971 merge). Rows rose from 1,567 on real reproduced-red-first proof, not on new policies alone. **The stage did NOT regress when the enforcer landed** — 12341ms before, 12283ms after, with four more policies | `pnpm check:policy-conformance` at `f5cfd6370`. Independently re-derived from the loaded policies (`source 403 + types 1049 + resource 58` = `mustFlag 732 + mustPass 778`), not read off stdout. It was 95 failures at the start of 2026-09-11; both remaining failures were one class — a fact provider whose receipt counted what it FOUND instead of what it MEASURED, fixed per subject in `registry-fact.ts` (#1953) and per provider in `bus-fact.ts` + `bus-definition-fact.ts` (#1955) |
| central reviewed-grant table | 105 rows at wave 5 (+1 coarse-pointer row after the main merge) | `lib/reviewed-grants.ts` |
| shipped runtime | `defineGate` contract + validator, policy loader, `runPolicyPass`, six-kind scope resolver, planner/executor (`planPolicyArgv`/`executePolicyPlan`), ResourceHost with **18 closed kinds, FROZEN 2026-09-11** (§12.4), `defineFact` providers (bus-producers, bus-definitions, drizzle-schema, registry-definitions, tuple-vocabularies), central ordinary-waiver engine, central reviewed-grant reconciler, hermetic conformance runner (`verifyPolicyProofs`) | checkpoint + planner-cli-integration.md + resource-host-foundation.md |
| NOT shipped | `jsonc` — §11.4 named it required; it was never built and is now RULED OUT with its reason (§12.4). The Phase C capability fork is CLOSED: the vocabulary is frozen at 18 kinds and the condition that reopens it is in §12.4. Still open: the overload-aware barrel-re-export fix; `QualifiedName` normalization | #1930 (freeze landed), checkpoint "runtime follow-ups" |
| known red by construction | `check:structure` exit 1 (real product backlog: 315 `ONESHOT-OK`, 58 `@owner-scope*`, …), `gate-ignore-grammar.int.test.ts` (LEAKS `__g_gi` fixtures — never run on a shared tree), `check-gates.repo.int.test.ts` (not concurrency-safe with itself; orchestrator-only during a train), `check:doc-catalog` 34 inherited rows, 12 `types:graph` errors in five legacy-loader test files | phase A lane §"still red", 2026-09-11 |
| NOT baselined red — treat as a real verdict | `structure:policy-conformance` and every SCOPED family test. The posture's red-by-construction list above is EXHAUSTIVE; a scoped suite red is a regression until reproduced on a clean tree and dated against the commit that broke it | `registry-family.test.ts` sat red five days because this was assumed the other way (#1953) |

Open rows: **#1930** (the ruled capability build — §11, and the design it implements is
`resource-gate-access-patterns.md`), **#1922** (sanctioned-home tables → reviewed grants, one lane not pair-by-pair,
incl. `ALLOWLIST`/`CALLER_FREE_OPS`), **#1950** (forge, the 13 mixed-hook splits — the only remaining forge-class work),
\#1946. Defects found by the 2026-09-11 exemplar wave and its verifier, none blocking a conversion: **#1956**
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

**SHAPE BY PLANE — and this table was POISONED until 2026-09-12, so read the verdict column.** The §5b audit
refuted SIX of the seven modules this paragraph used to name, including both it called "Wart: none found". A
lane sent here picked a refuted shape and copied it, which is the transmission failure §5b exists to stop.
**The bar for this program is therefore ONE CONFIRMED EXEMPLAR PER PLANE, named here — not a module count.**

| Plane | Copy THIS | Audit verdict | Do NOT copy |
| - | - | - | - |
| pure syntax / name-by-law | `no-mutating-register-api.ts` | CONFIRMED (wave 5-6): its `mustPass[3]` `why` says *"the only row that dies without it"* and the cut proved that sentence TRUE | ~~`no-array-literal-querykey`~~ REFUTED — `fix` names no waiver spelling, name fence unenforced |
| entire-population tripwire | `spacing-tier-home-health.ts` — **HARD tripwire only, and only once it lands its one §4.5 pin** | REFUTED minor; the ANCHOR self-guard IS enforced | its occurrence sibling's HEADER |
| **closed resource (ResourceHost)** | `server-layout.ts` · `ui-exports-map-complete.ts` — **verifier REFUTED one cell; copy the PROOF shape, not the `kind === "file"` header claim** | Wave 1 refuted both SEVERELY; repaired at `0fab76771`, the #1979 class closed at `2bacd5ef9` (10 of 10 `analysis: "resource"` modules on `readyResourceValue`), and **confirmed to the §5b bar at `be4cdebcd`**: every `count` exact under a planted `count: 99` (`got=1,1,6` and `got=1,1,1,1,1,2`), every discriminator transplant-tested, and **§4.5 pins per declared resource per reachable status** in `resource-layout-wave-1.test.ts` — `ui-exports-map-complete` had NONE and gained four. **The contract a lane copies is [`resource-policy-contract.md`](resource-policy-contract.md)**, not this cell | do not copy the PRE-`0fab76771` shape from wave 1's receipts — **that audit is superseded**. And do not invent a `-health` sibling: §12.3 states why one is structurally impossible |
| fact consumer (`defineFact`) | `db-enum-from-tuple.ts` | CONFIRMED (wave 3): *"the module to hand a conversion lane"* — 4 of 4 narrowings enforced, 10 exact counts, the strongest identity-counterfactual set in its family | ~~`schema-branding`~~ REFUTED minor — three arm narrowings unenforced |
| reviewed-grant identity | `no-raw-matchmedia.ts` — **fix #1998 first** (header and roster row say "all four" grants; there are FIVE) | REFUTED SEVERE at wave 1, REPAIRED `b157bb9be`, **wave 7 re-audited and confirmed the repair HELD** — the only module in 26 whose #944 third answer is actually REACHED | — |
| warning debt | `user-bus-deferred-member.ts` | **CONFIRMED TWICE** (wave 1's sole survivor; wave 10 re-audited it against all five new method rules and it survived). The densest honest header in the corpus | — |
| split family | `bus-definition-belts.ts` | CONFIRMED (wave 10) — the bus headers are among the corpus's best | ~~`no-raw-spacing-in-features` + `-health`~~ REFUTED — both halves of the carrier-fence claim unenforced in both twins |
| registry / completeness | `section-registry-completeness.ts` | CONFIRMED (wave 2): 4 of 4 narrowings enforced, both fence rows state their own cut result and both are TRUE, header AND roster row accurate | — |

**CORRECTION, 2026-09-12: this table's resource cell was written from wave 1's verdicts WITHOUT re-deriving
against the tree, twelve hours after the repair landed.** That is the error the refutation ledger exists to
prevent — an audit verdict is a claim about the tree ON ITS DATE. **Before citing any audit cell in this
table, check the module.** The ledger (`docs/reviews/gate-runtime/refutation-ledger-2026-09-12.md`) carries
each defect's state; where it says UNADJUDICATED, you re-derive.

**The §5b.5 caveat that applies to the whole column:** several confirmed modules still carry an INCOMPLETE
header (no FAMILY line, no POPULATION PORT, no legacy SHA — #2005). Where that is so, tell the lane to copy
the module's PROOF shape and take its HEADER from `section-registry-completeness`, which is complete.

Non-negotiables inside a module: no `Project#getSourceFiles`, `getDescendants*`, `forEachDescendant`, `new Project`,
private cache, private marker parser, gate-owned exemption table, scope predicate or filesystem read; state in
`create`; every anchor inside the policy's own resolved population; population `under: ["x/**"]` (a `"x/"` matches
nothing). A read the 18 FROZEN resource kinds (§12.4) cannot serve STOPS that module — it stays legacy and armed, and the
exact read goes to #1930. That refusal is a SUCCESS; keeping a private reader behind `defineGate` lowers the census
while leaving the forbidden machinery in place.

**NOTHING GETS TO REFUSE TO CONVERT — owner ruling, 2026-09-12, and it is the stronger form of the paragraph
above.** *"Convert or die, and we build what we need."* A gate that needs a capability the tree does not have is a
reason to BUILD THE CAPABILITY, or — if it is not worth building — to DELETE THE GATE. It is not a reason to park
the module and record a refusal. The refusal sentence above survives only in its ORIGINAL narrow subject (a
resource KIND that would serve exactly one consumer, §11.5), and even there the outcome is convert-or-delete, not
park-indefinitely: mixed runtime makes a legacy module tolerable forever, and *tolerating it forever is the skimp
that produced this program* (§"Phase C"). **And a lane never makes this call by refusing: it ASKS** (§9's
escalation model — SendMessage, state a DEFAULT, keep working).

**A SHARED-READER GAP IS BUILD WORK AND WAS NEVER COVERED BY THAT DOCTRINE.** The refusal above exists because §12.4 FROZE the capability vocabulary, and a
kind minted for a single consumer is that gate's private reader wearing a contract's clothes (§11.5). **A missing or
refusing `lib/` READER is the opposite case and is BUILD work, not refusal work.** §12.4's own reopening condition
says so from the other side — a read with **two or more independent consumers** reopens the set — and a shared
reader has them by construction (`resolveModuleMemberOrigin` has 22 callers). The owner's words: *"legacy shit
doesn't get to stay alive — it's a conversion process; if it doesn't have what you need then build it."*

**The worked case, and it is the template.** `resolveModuleMemberOrigin` refused an OVERLOADED export as
`ambiguous`, which closed `defineBusChannel.publish` for every channel on the tree and cost three families their
precise verdict. The fix was NOT a per-gate workaround and NOT a recorded gap: it was
`reference-fact-module.ts#overloadHome`, built in the SHARED reader, proven by an armed red-first spec, a
**reached-arm census over the whole authored tree** (775 specifiers newly resolving, 182 still refusing as genuine
merges) and a **composed pre/post over the same corpus** that was EMPTY in every direction — the census is what
makes an empty diff evidence rather than a false clean. It also DELETED the two gate-local workarounds it
superseded, with a byte-identical fact receipt as the receipt.

**A REFUSAL IS A SNAPSHOT, NOT A STANDING VERDICT, and nothing re-opens one when its blocker lands** (#2013).
`runner-config-path-liveness` refused citing a missing `authored-path` identity door; §12.4's `authored-path` row
records that the kind was **specified BY that refusal** — it shipped, and the gate is still legacy. Same shape as
the deferred roster's 8 entries still reading "not yet ported" after landing (#2008). **Before inheriting any
recorded refusal, re-derive its condition against today's tree.**

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

   **A CLEAN CUT HAS THREE MEANINGS, AND ONLY ONE OF THEM IS "UNENFORCED" (measured 2026-09-12 across two fix
   lanes — the naive sweep OVER-REPORTS, so classify every clean cut before counting it):**

   - **UNENFORCED** — genuinely unpinned. The fix is a `mustPass` row placing the subject OUTSIDE the fence.
   - **MUTUALLY REDUNDANT** — two fences guard ONE subject, so each is individually uncuttable because the sibling
     catches it. `server-layout.topEntry` carried a `startsWith(SERVER_SOURCE/)` test AND a `relative.length > 0`
     test, both aimed at the root entry; the sweep reported both unenforced and **the obvious fix was wrong** — no
     fixture can produce that subject at all (the tree is rooted at the prefix, and `walk` emits children only), so
     the answer was DELETING BOTH, not adding a row. **When two cuts in one function both come back clean, cut them
     TOGETHER before concluding.**
   - **WRONG-DIRECTION CUT** — the standard cut assumes removing a fence makes the policy flag MORE. That holds for a
     carrier fence and FAILS for a fence that changes a DERIVED path, which exists to prevent a FALSE CLEAN.
     `ui-exports-map-complete`'s `target.startsWith("./")` survived, because an unfenced non-`./` target still
     resolves to a nonexistent path and is reported either way. Falsifying it needed a fixture whose UNFENCED
     resolution lands on a **real file** — `"~/src/primitives/button/index.ts"`, two junk characters before a live
     path. **The row must be one the cut turns GREEN, not one asserting a bogus input is reported.**

   **READING A SEALED-ORIGIN VERDICT HAS THREE SHAPES, AND ONLY ONE IS THE BUG (measured 2026-09-12, #2006).**
   `readSealedOrigin` returns a VERDICT; `sealedOriginReports(verdict, anchor)` is the DECISION. But **polarity
   decides which applies**, and a mechanical sweep for the wrong call will weaken a security gate:

   1. **ACCUSING direction, verdict used directly — THE BUG.** `kind !== "foreign"` reports, so a purely local object
      whose KEY is spelled like the sealed export is accused. Five modules. Fix: call `sealedOriginReports`.
   2. **ACCUSING direction, decision called — correct.** `empty-state-has-action` already does this.
   3. **ACQUITTING direction — correct, and `sealedOriginReports` is NOT applicable.** `untrusted-regex-safe-exec`
      computes `safe = kind === "sealed"`: **only a PROVEN sealed origin acquits and everything else reports.**
      Scoping the refusal there would WEAKEN a security-adjacent gate, and its own `mustFlag[1]` pins the
      local-helper case as MUST-FLAG. **Do not "fix" shape 3.**

   **So the tell is not the call — it is which side of the comparison reports.** Check polarity before routing any
   module into this class.

   **§4.6'S FOUR CATEGORIES ARE INCOMPLETE — TWO MORE, AND THE FIRST IS THE COMMONEST DELTA IN THE CORPUS
   (measured 2026-09-12 across all seven conversion records).**

   **5. EXEMPTION-MECHANISM MOVE.** A site the legacy `scanRoot` subtraction, path allowlist or inline marker HID is
   now REPORTED and licensed by a reviewed grant — so the differential reads `legacy 0 → final N raw → 0 effective`.
   This is the DOMINANT delta in three records (+30, +40, +47) and fits none of the four; every record explains it in
   prose because there was no name for it. **Its falsifier is different from the other four:** the question is not
   *"does it still catch"* but **"did every hidden site become exactly ONE live, consumed row"** — which is what the
   grant-liveness pass answers, not a replay.

   **6. ANCHOR MOVE — and it is NOT metadata.** A conversion that moves a finding's reported position (receiver-start
   → the actual dot; line-1-col-1 → the real column) changes what a **positioned waiver BINDS TO**, so it can silently
   orphan or re-bind a marker. `mechanical-gates-1584.md` classified two of these as *"intentional metadata deltas"*.
   **They owe a receipt**, not a bucket: confirm each moved anchor's markers still bind.

   **AND A CATCH-ALL CELL IS ONE QUESTION WEARING A TABLE'S CLOTHES.** A per-policy differential table ending in
   `every other policy | 0 | 0 | 0` has not asked N questions; it has asked one. Where those are 1:1 ports whose
   legacy side actually RAN, that is fine and closable by rule. **Where one of them is a SPLIT ARM, the cell is
   Tier 1's `-health` vacuity hiding in a table** — `ordinary-visitors-family-1584.md` swept four split arms into one
   such cell, and `origin-server-family-1584.md` swept ten modules into another.

   **So a close-by-rule must name what it closes on:** *a 1:1 port whose legacy side was **EXECUTED** and returned
   zero.* That is true of 18 modules and **false of everything in `schema-fact`**, whose legacy side was never run.

   **DIFFERENTIAL VACUITY HAS TWO SHAPES, AND THE SECOND IS THE ONE THAT LOOKS LIKE EVIDENCE (measured
   2026-09-12 across all seven conversion records).** **Read the LEGACY-SIDE number FIRST**; a zero there downgrades
   the record to a population/outcome receipt no matter how much prose follows.

   1. **Both sides zero.** The classic — the clean verdict is evidence of nothing. 22 modules across
      `ordinary-visitors`, `origin-server` and `home-client`, plus Tier 1's `-health` arms.
   2. **The legacy side is zero BECAUSE the legacy exemption mechanism was a `scanRoot` SUBTRACTION.** The exempt
      sites never entered the legacy population at all, so the new policy's nonzero raw count proves **liveness and
      outcome parity** and still says **nothing about whether it catches what legacy caught.** This is the whole
      sanctioned-home family, and it reads like a rich receipt.

   **Only a FIXTURE-LEVEL method reaches catch parity** — extract the pre-conversion descriptors, shim their
   contract import, and replay through the legacy `runPass` **over each proof's own file map**
   (`origin-client-family-1584.md:151`). **Two of the seven 2026-09-05/06 records used it**; the other five are
   real-corpus-only. A real-corpus replay is informative only where a side is nonzero.

   **A POPULATION DIFFERENTIAL IS NOT A FINDING DIFFERENTIAL — it is ONE THIRD of what §4.6 asks, and records
   call both “the differential” (measured 2026-09-12).** §4.6 requires comparing **findings, populations AND tool
   errors**. A record headed *“Population equality, over one frozen 7,138-path candidate set”* proves only that the
   admitted SET matches — it says nothing about what the gate REPORTS on that set, which is where a catch-regression
   lives. `schema-fact-family-1584.md` is the worked case: its landing commit says *“and its differentials”*, that
   claim resolves to a population table over **five** policies, and its other named policies have neither a
   population nor a finding differential.

   **So when crediting a record with parity evidence, read WHICH of the three it compared.** A population-only
   comparison leaves the module in the backlog. And beware the inverse: the same doc carries an excellent finding
   replay WITH a planted positive control — for a **retired** stage. Evidence being present in a document is not
   evidence being present for the module you are asking about.

   **AND A REVIEW'S CELL COUNT DECAYS THE MOMENT ANY OTHER LANE LANDS A FIX IN ITS SCOPE — a second,
   independent staleness from the one below (paid 2026-09-11 on #1999).** Wave 6 reported 25 unenforced cells for
   the origin-client family. By the time a fix lane started, a DIFFERENT lane closing #1989/#1990 had already landed
   D1 (nine modules), D2 and all five of D5. **Fifteen were genuinely open, not 25.** The lane found this by reading
   each module rather than trusting the doc, which predates those closures.

   Distinguish the two: the rule below is that the CLASSIFICATION changed; this one is that the TREE changed. Either
   alone makes a count stale, and they compound. **So re-derive a review's remaining-work count against the current
   FILE, not only against the newer classification rules — and never dispatch a lane with a review's row count as its
   scope without saying it is an upper bound.**

   **A LATER WAVE'S VERDICT SUPERSEDES AN EARLIER WAVE'S CUT TABLE — check the most recent one before building a
   row from an old cell (measured 2026-09-11; two audits of the same corpus disagreed and the LATER one was right).**
   Wave 1 recorded the tier-home-health population fence as UNENFORCED, and the cut genuinely does come back clean.
   Wave 4 read the same fence and did not list it as a narrowing at all, because `SANCTIONED_HOMES`' keys are
   hardcoded under one package — **no fixture placed under an added population root can ever land on one, so no
   discriminating fixture EXISTS.** That is a structural NON-narrowing, not a gap: §4.1's fourth outcome
   (UNFALSIFIABLE, documented rather than faked), reached by a later reader with more context.

   **A fix lane working from the older table would have invented a row that discriminates nothing** — which this
   section already calls worse than recording the gap, because it converts an honest limit into a false pin. As the
   method rules accumulate (cut direction, the prefilter shape, the reusable UNREADABLE falsifier), **an old cell can
   dissolve rather than merely shrink.** Re-cut every cell yourself before building against it, and when two waves
   disagree, read BOTH and prefer the one whose reasoning names a mechanism.

   **A DECLARED PERFORMANCE PREFILTER CUTS CLEAN BY DESIGN — counting it is counting HONESTY as a defect
   (measured 2026-09-11, and it is the single largest source of false UNENFORCED cells).** Where a candidate-name
   prefilter sits in FRONT of an identity reader, cutting the whole prefilter comes back CLEAN, because the identity
   fence behind it rejects everything the prefilter would have admitted. That is the prefilter working: it is a
   speed optimisation, not a correctness fence, and the module usually says so in a comment. **Cut the
   DISCRIMINATING HALF instead** — the alias arm of the identity check — and it REDs. Wave 7's naive sweep read 29
   of 85 cuts clean and classified down to **17 (34% → 20%), an over-report of 71%**, almost entirely from this
   shape. **So every wave's NAIVE number is an upper bound, and the earlier waves' figures (32%, 35%, 42%) were not
   corrected for it.** When a clean cut sits in front of an identity check, say which half you cut.

   **CUT IN THE RIGHT DIRECTION, OR YOU MANUFACTURE A FALSE “UNENFORCED” — the auditor's own failure mode
   (measured 2026-09-11).** The cut must make the policy flag **MORE**. Replacing a predicate with a DIFFERENT wrong
   value is not that cut, and it can leave every row green for a reason unrelated to the fence. Worked case: a wave-5
   audit reported that not one of `persistence-boundary`'s six narrowings was individually enforced. A fix lane
   re-cut `classifyOriginRefusal` in the §4.1 direction — fail it OPEN (`return "unreadable"` unconditionally) — and
   **`mustPass[2]` and `[3]` both went red on the pre-existing row set**. The clause was enforced all along; the
   audit had most likely cut it to `"other"`, a different wrong answer rather than an open one.
   **So a clean cut owes its DIRECTION in the receipt**, not just its result: say what you replaced the predicate
   WITH. And where a fence has several clauses, report the matrix — the same module's three-clause sweep showed one
   clause singly enforced, one enforced only when the classifier is also open, and one reddening only in the triple.
   A single-clause sweep over an interacting fence set is not a measurement.

   **"UNFALSIFIABLE" IS A CLAIM YOU OWE A CONSTRUCTED FIXTURE ATTEMPT, NOT AN ARGUMENT (measured 2026-09-12;
   TWO of them fell in ONE wave, both to a fixture built in under five minutes, and both were in modules §3
   names as exemplars).** The fourth outcome below is legitimate and it is also the most comfortable place to
   file a cell you could not think about hard enough — so the bar is a ROW YOU WROTE AND RAN, never a
   sentence explaining why none could exist.

   - `ui-exports-map-complete` recorded its `entry.kind === "file"` index fence as unfalsifiable because it
     *"would matter only for a DIRECTORY named `index.ts`."* **A `mode: "resource"` fixture can create exactly
     that** — `packages/ui/src/primitives/index.ts/x.ts` — and with the fence cut, that row and only that row
     reds.
   - `runner-config-path-liveness` recorded its real-tree `anchorOk` cut as unfalsifiable. It cut clean only
     because **every existing row went through the module's own `configs()` helper**, which plants exact rows
     and therefore never reaches the zero-exact branch below the anchor. A fixture that stops using that
     helper discriminates immediately.

   **The tell is the same in both, and it is the thing to look for:** every existing row reached the fence
   through ONE fixture helper that structurally avoided the branch, so the clean cut measured THE HELPER, not
   the fence. **Before recording UNFALSIFIABLE, write the row that would discriminate and RUN it.** If it
   passes today and reds under the cut, the classification is UNENFORCED and you have just written its fix.
   Reserve the fourth outcome for a property whose counterexample is structurally unconstructible — a depth-1
   file has no children, so no fixture can give it one — and say WHICH construction you attempted.

   **And a fourth outcome is legitimate: UNFALSIFIABLE, documented rather than faked.** For a reviewed-grant policy,
   `reportReviewedGrantCandidates` dedupes by `(subject, operation)`, so any narrowing whose only counterexample sits
   ABOVE an already-flagging node cannot change the finding count — `no-raw-matchmedia`'s `memberPath.length === 0`
   is the worked case, measured identical with and without the clause. The clause stays (it is the shared reader's
   contract) and the header says plainly that no fixture enforces it. **Inventing a row that does not discriminate is
   worse than recording the gap**, because it converts an honest limit into a false pin.

   **A FAIL-CLOSED “THIRD ANSWER” OWES A `messageIncludes` ROW, OR IT IS DEAD CODE WITH A CONFIDENT PARAGRAPH
   (#1990, measured 2026-09-12).** A policy's `unreadable` verdict — the #944 third answer, and the arm that is the
   conversion's whole value over the legacy gate — produces the SAME finding count as the ordinary verdict and
   differs only in `message`. So a row carrying `{ count: N }` and no `messageIncludes` passes identically whether
   the arm fires or is unreachable. **9 of 12 modules in one family advertised the arm in their header and no
   declared row reached it**; the three that proved theirs are exactly the three that wrote `messageIncludes`. This
   is not a narrowing, so §4.1 does not catch it — a lane can satisfy §4.1 in full and still ship the arm dead. The
   probe is one command: replace the branch's report call with `throw` and run the module's own rows; **0 failures
   means unreached. RUN THE PROBE INSTEAD OF READING THE HEADER** — a module's DECLARED LIMIT paragraph is exactly
   the thing that is wrong here. Measured 2026-09-11: `persistence-boundary`'s limit claimed a bare `localStorage`
   “lands on the fail-closed unreadable finding”; it resolves as the ambient global with an empty member path and
   takes the PRECISE message, so the arm the paragraph advertised was reached by no row at all. A confident header
   is not evidence about which fixture hits which branch.

   **THE REUSABLE FALSIFIER FOR AN UNREADABLE ARM — stop reverse-engineering one per module (measured
   2026-09-11 across nine).** Where the branch sits behind an origin resolver (`resolveGlobalMemberOrigin`,
   `resolveTypeMemberOrigin`, the `lib/react-origin.ts` readers), **an opaque `any`-typed receiver drives every one of
   them into fail-closed territory**:

   ```ts
   declare function opaque(): any;
   opaque().<member>   // no symbol, no declaration → the UNREADABLE arm
   ```

   **One documented exception, and it cost a probe cycle:** a module-level identifier bound purely in TYPE space (a
   `ReturnType` alias). Forcing an unresolvable IMPORT there still binds a broken `ImportSpecifier` declaration, so the
   reader judges it *provably non-ambient* and passes silently. The trigger that works is referencing the type-only
   symbol in **value position**, which yields `getSymbol() === undefined` outright.

   Confirm the row DISCRIMINATES rather than passing by luck: `messageIncludes` must match text the UNREADABLE branch
   alone emits — check by literal comparison that no ordinary `MESSAGE` string contains the fragment. If `UNREADABLE`
   is built as `` `${MESSAGE} …` ``, no fragment can do this and the two messages must be made disjoint first. And when `UNREADABLE` is built as `` `${MESSAGE} …` `` the base text is a SUBSTRING of both,
   so it can never discriminate in either direction — **keep the two messages disjoint or neither arm is pinnable.**

2. **Identity, once.** Each ORDINARY policy proves that its own report supplies the correct policy id and position:
   one POSITIVE arm, the correct `// @orb-waive <id>(<position>): <reason>` at the reported position, yielding 0
   effective findings, 1 waived, 0 alarms. Two shapes are valid — a `mustPass` row in the module
   (`schema-branding.ts:137`) or a `runPolicyPass` pin in a family test (`ordinary-visitors-family.test.ts:187-196`
   — the POSITIVE arm ONLY; `:198-205` beside it is a dead-position NEGATIVE arm and the next sentence forbids copying
   it, so the range must stop at :196). **Verified twice, once per direction: flipping `(Foo)`→`(Bar)` reds it with
   `AUTHORITY ALARM … names a dead position`, so it DISCRIMINATES.** Its sibling at `:207-218`
   (`empty-state-has-action`) is NOT the shape to copy — it omits the `authorityAlarms` assertion, so an over-broad
   or duplicate marker (which alarms WITHOUT changing the finding count) would pass it. **The §4.2 arm is all three
   assertions — `effectiveFindings []`, `waivedFindings 1`, `authorityAlarms []` — or it is not the arm.**
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
   5b. **WHAT THE PROOF RUNTIME STRUCTURALLY CANNOT EXPRESS — three gaps, measured. Do not invent a row for any of them.**

   - **There is NO "must refuse" arm.** `toolFailure` runs BEFORE the arm verdict and fails on a non-success owner
     status, so an arm whose CORRECT outcome is a refusal is neither `mustFlag` (no finding is reported) nor
     `mustPass` (the owner did not succeed). Worked case: `warning-code-coverage` with its tuple planted outside its
     population returns `unresolved`, the receipt scores `members: 0 / unresolved: 1`, and the policy's own receipt
     refuses — the designed blindness tripwire firing correctly, unprovable by construction. **Measure both sides by
     hand, record the two verbatim messages in the module header, and say plainly that no row can carry it** (#1977).
   - **CLOSED 2026-09-11 (#1966, `178ee3a4c`) — a policy that files NO semantic receipt now REFUSES.**
     `policyReceiptFailures` (`lib/policy-pass.ts:701-732`) reds on `facts.length > 0 && receipts.length === 0`,
     so the guarantee is enforced rather than held by per-family convention. The pin in
     `tests/tooling/verify/lib/schema-fact.test.ts` is inverted to assert the refusal and keeps the old fail-open
     shape quoted verbatim. **Blast radius was measured ZERO by RUNNING the dispatcher over all 167 final policies**
     (35 declare facts; all 35 filed ≥ 1 receipt), which is also how the registry fact count was corrected from 7 to
     **8** — `chrome-registry-completeness` declares both `registry-definitions-chrome` and `tuple-vocabularies`.
     Three corollaries, each of which cost time:
     1. **The arm keys off DECLARATION, not consumption** — strictly broader, free, and it does not need the failure
        function to know whether a fact was actually consumed.
     2. **A `-health` policy whose job is reporting an empty census must receipt a CONSTANT** (`members: 1` = *I
        measured one fact*), never the census — otherwise `receiptFailures`' `count === 0` predicate turns its own
        finding into a tool error and it never reaches its report. That is §12.3's provider-side inversion
        relocated one layer out, to the consumer. Two such sites exist and BOTH literals are correct.
     3. **Per-declared-fact CORRESPONDENCE is not buildable, at load time or run time** — and read that word
        precisely. A receipt is a runtime call and its `source` is FREE TEXT with zero fact-id validation
        (`policy-pass-context.ts:150,165`); measured 2026-09-11, **17 of the 35 fact-declaring policies already use a
        source that is not their fact id**, so divergence is the NORM, not an edge (`bus-belt-total` declares
        `bus-definitions` and receipts `bus-definition-fact`). Tying a receipt to a fact is therefore impossible
        without a contract change. **What IS buildable and is deliberately not built: a weaker CARDINALITY rule**
        (`receipts.length >= facts.length`), which reds 0 of 35 today — it would not tie a receipt to a fact, so it is
        not the shape this section names. Do not read this row as *no stronger predicate exists at all*; read it as
        *no predicate that establishes correspondence exists*. Nothing today distinguishes an honest constant
        `members` from a lazy one (#1982).
   - **Nothing checks that a provider's population is a SUBSET of its consumers'.** `tupleVocabularyFact`
     (`@client`+`@server`+`@contracts`) is a strict superset of `warning-code-coverage`'s, so the provider hands the
     policy nodes the policy may not NAME — the structural form of the `ctx.relativePath` throw, needing no unusual
     import. Mechanically checkable at load from `fact.population` vs `policy.population`, both `PopulationExpr`
     (#1976). Same family as #1953 one axis over: there the provider's FAILURE granularity mismatched its consumers',
     here its POPULATION does.

   **The common shape: the runtime can PRODUCE a behaviour it cannot PROVE.** When you meet one, the honest output is
   a measured pair of messages in the header plus a row on the board — never a proof row that does not discriminate.

5. **Refusal and receipt controls** wherever correctness depends on a home, provider, resource or derived population,
   and a proof row cannot express the failure: renamed/removed home, vanished subject, missing/empty/malformed/unresolved
   resource, incomplete or inconsistent fact, entire-population under a narrowed request, absent or forged receipt.
   These are `runPolicyPass` pins in the family test (`bus-pair.test.ts`, `bus-fact-health.test.ts`). A clean zero
   from a detector that might be blind is not evidence.

6. **Conversion differential — AND ITS EVIDENCE MAY NO LONGER VANISH (#2000).** This section used to end
   *“conversion evidence for the landing commit, not standing law”*, which permitted the differential to be run and
   then retired. **Measured 2026-09-11: of 171 converted policies, \~18 carry a differential in a committed test and
   19 of 95 conversion commits mention one — and there is no way to tell “ran it and retired it” from “never ran
   it.”** A rule whose evidence is allowed to disappear and whose execution is unrecorded is indistinguishable from
   a rule nobody follows. **So a conversion now does ONE of two things, and §8.8 names it in the floor:** land the
   differential as a committed test, OR state in the commit message that it ran and **what it found** (identical, or
   the classified differences). Silence is no longer compliance.

   **Why this check is not redundant with the rest of §4.** Every other rule asks whether the new gate is internally
   sound. The differential asks whether conversion **silently changed what the gate CATCHES**. A narrowed population,
   a retired arm with no successor, or a stronger reader that no longer matches an old shape produces a module that
   is sound by every other check and has quietly stopped catching something. **The conformance stage is structurally
   blind to it** — a proof row rewritten after conversion only proves the new code agrees with itself. It has already
   happened at the worst possible scale: `caught-failure-ownership`, the program's largest conversion at 336 files,
   shipped with no differential (#1970).

   **A LEGACY GATE'S CODE WAS OFTEN STRICTER THAN ITS OWN MESSAGE — convert the PREDICATE, then fix the message
   (measured 2026-09-11, #2000 Tier 1, and it produced the program's first real catch-regression).**
   `injected-op-caller-param`'s legacy `seenOps.add(…)` sat INSIDE the visitor, behind the entity-id trigger, so a
   `CALLER_FREE_OPS` row whose op no longer took a branded entity id was reported STALE. Its own message said only
   *"no domain contract declares an op function type of that name"* — which describes a WEAKER predicate. The
   conversion implemented the message, and the row now survives forever: a standing caller-free exemption on an op
   that reaches no tenant data, which is the rot the two-sided ratchet exists to kill.

   **So when a conversion's predicate disagrees with the legacy predicate, the MESSAGE is the thing to fix, not the
   predicate.** Reading the message instead of the code is how a catch gets lost while every check stays green.
   General form: **a tripwire must apply the same predicate as the thing it guards, or it is weaker than the
   exemption it polices.**

   **A CLEAN DIFFERENTIAL OVER AN ARM THE LEGACY SUITE NEVER EXERCISED IS EVIDENCE OF NOTHING — and this is
   exactly where a SPLIT is riskiest (measured 2026-09-11, #2000 Tier 1).** Four of the eight `-health` split arms
   guard their `finalize` verdict on a REAL-TREE ANCHOR, and **not one legacy `mustFlag`/`mustPass` example loads
   that anchor.** So replaying the legacy rows exercises the arm zero times and comes back green whatever the split
   did to it.

   The assumption this inverts is the dangerous one: the differential feels strongest on a split, because a split is
   the biggest behavioural change. It is **weakest** there, because **the arms that get carved into a `-health`
   sibling are the awkward ones nobody wrote proof rows for in the first place** — that is often WHY they were
   carved out.

   **So a split's differential owes a coverage statement, not just a verdict.** Where a moved arm has no legacy
   coverage: say so **PER EXAMPLE in the test rather than in prose**, and CONSTRUCT the successor proof from the
   arm's own trigger conditions instead of replaying. Asserting the zero-coverage fact is what stops the next reader
   mistaking a vacuous replay for a passing one.

   **This is not hypothetical.** The same Tier 1 pass found a real catch-regression in the one split whose arm WAS
   exercised: `injected-op-caller-param` populated its census INSIDE the visitor, after the entity-id trigger, so an
   exemption row whose op no longer took a branded entity id was reported STALE. The `-health` sibling counts every
   Promise-returning op function type with no entity-id condition, so that row now survives silently — a standing
   caller-free exemption on an op that reaches no tenant data, which is the rot the two-sided ratchet exists to kill.
   **A tripwire must apply the same predicate as the thing it guards, or it is weaker than the exemption it polices.**

6b. **The original procedure.** For a converted policy, load the legacy descriptor from the pre-conversion SHA, replay
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

8b. **A PROOF ROW CAN BE GREEN FOR THE WRONG REASON, BECAUSE THE VIRTUAL PROJECT RESOLVES A REAL PACKAGE DOOR
DIFFERENTLY THAN THE TREE DOES (measured 2026-09-12, and it nearly shipped a repair that killed a live
policy).** §5 already says conformance runs on `useInMemoryFileSystem: true` with no `node_modules`. The
consequence nobody had drawn: a fixture naming a package specifier resolves to NOTHING, which the origin
readers classify as `external-door` — **a clean, resolvable answer**. On the real tree the same specifier
resolves into the installed package's own `.d.ts`, whose declaration shape may be one the reader REFUSES.

Worked case: `no-raw-id`'s Zod door. zod 4.4.3's `index.d.cts:1,3` is
`import * as z from "./v4/classic/external.cjs";` then `export { z };` — a namespace-forwarding export
specifier that `reference-fact-module.ts:185` refuses as
`unsupported | local export z forwards an imported binding without a proven canonical export`. Routing the
policy's door through the shared reader took it from **21 real-tree findings to 0** in `packages/contracts`
alone, corroborated by 21 `stale ordinary waiver … no live finding bound` alarms proving it used to bite
there. **Every conformance row stayed green**, because in the virtual project "zod" resolves to nothing and
lands as `external-door`.

**So an identity row that names a REAL package door proves nothing about that door until it is driven
against the real program.** Two rules follow:

- **Plant the package** (`gates/_proof/react.ts`, `client-vendors.ts`, `zustand.ts` are the shape) so the
  specifier resolves to a declaration whose SHAPE matches what the installed package actually ships — not a
  convenience stub with a simpler shape than the real thing.
- **Before crediting a door-identity claim, measure it once against the real tree**, the way §8.8's
  `check:structure` line exists for the withheld-policy class. The same blindness, one layer over.

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
  across 162 policies in \~11 s. **So a conversion no longer owes a family test for its DECLARED rows.** A family
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

**AND IT IS STRUCTURALLY BLIND TO A WHOLE DEFECT CLASS — a policy at 0 failures can be FULLY WITHHELD on the real
tree.** Proof rows run on virtual projects (`useInMemoryFileSystem: true`, `ops/policy-conformance.ts`) with no
`node_modules` and no real repo layout, so **no fixture can resolve an import into an installed `.d.ts`, express a
symlink, or reach a real absolute path.** Any defect whose trigger is one of those is invisible to this stage by
construction — and this stage is what lanes use as their verdict. Measured 2026-09-11: `freeze-provenance-write-pairing`
sat at 0 conformance failures while reporting NOTHING on every real-tree run (#1972).

**The only instrument that asks is `pnpm check:structure`, and the answer is two numbers in its tail:**
`N tool error(s)` and `N withheld`, plus the per-policy `⚠ … owner incomplete … WITHHELD by authority` line. The
cheap habit for a converted module is to read those two numbers once, before and after. §8.8 names that run in the
per-conversion floor; it costs \~4 min / 6.5 GB, no lane was executing it, and that economy is exactly what let a dead
gate ship (#1973, and #1964 for the gate-scoped door that would make it affordable).

**A fresh-context verifier's "what I did NOT cover" section is therefore load-bearing, not a footnote.** The batch
verifier declared *"I did not run `pnpm check:structure` … the real-tree finding delta is therefore UNMEASURED by me"*
— and the defect landed precisely there. A CONFIRMED verdict covers what its report says it measured, and nothing
its own not-covered list disclaims.

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

- **A GRAMMAR'S MARKERS TRANSLATE ONLY WHEN ITS OWNING GATE IS ALREADY FINAL, and the runtime will not tell you
  otherwise.** Marker routing is fenced (§5): the legacy grammars reach only LEGACY owners, `@orb-waive` only FINAL
  ordinary policies. Translating a marker whose gate has not converted loses the legacy suppression AND binds the new
  marker to nothing — silent in both directions, because neither engine reports a marker addressed to the other's
  world. This is why marker translation rides WITH a conversion rather than running ahead of it, and why a standalone
  backlog lane must check each grammar's owner before touching a site. Measured 2026-09-11: five of the eleven custom
  grammars still had LEGACY owners (`@swallowed-ok`, `@sub-floor-ok`, `@surface-focus-elsewhere`, `@first-boot-only`,
  `@over-art-plate-ok`), and `@finding-overload-ok`'s delete-with-the-gate disposition means its 24 sites cannot be
  removed ahead of that gate either.

- **"THE MARKERS" IS NOT ONE THING — THERE ARE NINE KINDS OF IGNORE, AND EACH LEGACY GATE OWNS ITS OWN PASS.** This is
  the single most miscounted thing in the program (owner correction 2026-09-11, after the orchestrator measured TWO
  spellings and reported the backlog closed on #1584). A census of one grammar tells you nothing about the others,
  because **a legacy gate implements its own marker parser, its own consumption map and its own stale sweep** — the
  disposition table in `../reviews/gate-runtime/ordinary-waiver-source-migration.md` §"Closed 11-grammar disposition"
  names each one by `file:line`, and `exception-authority-census.md` names each parser receipt again. The whole point of
  the final contract is that this per-gate ownership **ends**: §12.5, no gate-specific exemption grammar, gate modules
  receive neither grant tables nor marker parsers.

  **The `uncovered-gate-conversion-census.md` authority notation is the per-gate classification: `O` ordinary shared
  marker · `X` gate-local table, sanction, deferred row, stale arm OR custom marker · `MI` marker-immune · `B` baseline
  ratchet.** A gate marked `X` has something gate-owned that must find a central home before it converts. Read your
  gate's row.

  | # | Kind | Spelling / home | Reaches | Disposition |
  | -: | - | - | - | - |
  | 1 | central LEGACY marker | `@orb-gate-ignore <gate>`; parser `lib/gate-ignore.ts:10-43`, consumption `lib/pass.ts:192-234`, auditor `gate-ignore-inventory.ts` | LEGACY owners ONLY | translate per converted owner; parser + auditor delete at Phase F |
  | 2 | central FINAL waiver | `@orb-waive <policy-id>(<position>): <reason>`; `contract/ordinary-waiver.ts` + `lib/ordinary-waiver.ts` | FINAL **ordinary** policies ONLY | the one surviving vocabulary |
  | 3 | eleven gate-owned CUSTOM grammars | each gate's own regex + maps + stale loop (receipts in both censuses) | that gate only | 7 CENTRALIZE · 3 DELETE EMPTY · 1 DELETE WITH ITS GATE |
  | 4 | `markerImmune` (`MI`) | `contract/gate.ts:181-194`, a legacy DESCRIPTOR door | refuses every marker | deletes with `GateDescriptor` — authority is required data on `GatePolicy`, so a hard policy has no parser door BY CONSTRUCTION |
  | 5 | reviewed grants | typed central `(policy, subject, operation)` + `why`/`endsWhen` | FINAL **reviewed-grant** policies ONLY | 97 `ExemptionTable` decls / 73 files / 319 rows · 20 equivalent non-`ExemptionTable` collections / 79 rows · 25 `SANCTIONED_HOMES` tables / 42 rows (#1922) |
  | 6 | baseline ratchets (`B`) | 9 tracked `*.baseline.json` | their own gate | retire to a fix, an exact grant, or `workItem` warning debt |
  | 7 | **native tool directives — NOT an Orb waiver** | `biome-ignore` / `eslint-disable` / `@ts-expect-error`; parsed by `suppressions.ts:20-35`, shared carriers with `no-blanket-suppression` | neither engine | **EXPLICIT NON-MIGRATION.** 274 file rows / 572 occurrences. Do NOT route these through `ordinary-waiver.ts` |
  | 8 | `@public` | push-tier reader for `orphan-export-ratchet` | that ratchet | **OUTSIDE this migration.** A hard semantic fact, not a waiver |
  | 9 | the AST lens's own `@swallowed-ok` | `tooling/src/ast/ops/swallowed.ts:32-43,149-193` — a SECOND consumer of a spelling a gate also reads | the lens, on demand | **explicitly NOT an alias.** Translating the six shared source files can silently change the LENS verdict; resolve it as its own migrate-or-retire decision |

  **So a marker census names its grammar, its carrier test and its universe, or it is not a census.** The honest
  marker-form predicate is a comment whose CONTENT BEGINS with the opener (`^\s*(//|/\*|\{/\*)\s*<opener>`) — the same
  fence §"Exact central grammar" states as *"a spelling inside a string, template, JSX text, regular expression, or
  later in explanatory prose is a mention, not a marker."* Counting mentions instead of markers inflates every
  grammar, because each converted gate's header PROSE names the retired spelling it no longer parses, its `fix` names
  the new one, and its proof fixtures carry both as strings.

  **Live custom-grammar census, marker-form, measured 2026-09-11 evening (re-derive; never quote).** Baseline is the
  census vector `70, 2, 24, 20, 31, 0, 0, 8, 2, 1, 0` = 158 custom openers + 633 central = 791.

  | Grammar | live | census | owner FINAL? | state |
  | - | -: | -: | - | - |
  | `@foreign-id-ok` | **0** | 70 | yes | CENTRALIZED |
  | `@owner-scope-ok` + `@owner-scope-write-ok` | **0** | 51 | yes | CENTRALIZED |
  | `@nullable-cmp-ok` | **0** | 1 | yes | CENTRALIZED |
  | `@sub-floor-ok` | 2 | 2 | **no** (`sub-floor-disclosure`, a #1950 split) | PARKED behind the fence above |
  | `@swallowed-ok` | 8 | 8 | **no** (`detached-work-traced`) | PARKED — and kind 9 above is its second consumer |
  | `@surface-focus-elsewhere` | 2 | 2 | **no** (`surface-a11y-focus`) | PARKED |
  | `@finding-overload-ok` | 21 | 24 | n/a | DELETE with its gate; never translate |
  | `@owner-scope-upsert-ok` · `@first-boot-only` · `@over-art-plate-ok` | 0 | 0 | — | delete the empty grammar at Phase F |

  **The 12 parked markers are correctly parked, not missed.** All four owners are still legacy `GateDescriptor`s, and
  the fence above is the reason: translating them would lose the legacy suppression AND bind the new marker to
  nothing, silently in both directions. They convert with their gates.

- **THE MARKER BACKLOG IS NOT A BACKLOG — it is one conversion.** Measured 2026-09-11 over the tracked `.ts`/`.tsx`
  universe: **681** central `@orb-gate-ignore` markers name **36** distinct gates, and **578 of them name one gate,
  `caught-failure-ownership`** (126 files under `tooling/src`, 112 under `packages/server`, 78 under
  `packages/client`). Every other legacy gate's markers together are **28**; **38** are translatable today because
  their owner is already final; **37** are deliberate negative-control fixtures naming gates that do not exist
  (`no-such-gate`, `real-gate`, `line-scan-probe`, `dormant-gate`) which live in `gate-ignore.test.ts` and
  `gate-ignore-inventory.ts` and retire with the legacy engine rather than translating. So do not plan marker lanes:
  plan the conversions, and the markers ride with them.

- **Translation is not a text codemod, but it is not opaque either — a legacy position is `<arm>:<token>`.** An earlier
  version of this paragraph called the legacy vocabulary "a taxonomy of the site's shape"; that was an overstatement
  and is withdrawn. The PREFIX is the arm, the SUFFIX is a real source identifier: the enforcement roster's row for
  `caught-failure-ownership` states its arms as `promise:<work>`, `empty:<binding>`, `default:<binding>`, so
  `empty:err` is arm `empty`, binding `err`. The corpus shape is `default:catch` (138), `empty:catch` (112),
  `empty:error` (83), `empty:err` (47), `promise:run`; the prefix spellings are not fully consistent (`empty:err` /
  `empty:error` / `empty:e`), but the suffix is joinable data.
  It is still not a rewrite, for two reasons that survive: the final position must EXACTLY equal `finding.token`, an
  exact slice of the reported node's text, so a suffix is a CANDIDATE and never a guarantee; and a splitting module
  means the legacy gate name is NOT the final policy id (`ordinary-waiver-source-migration.md:125`).
  **So derive every position from what the CONVERTED policy actually reports**: run it over the real tree, dump
  effective findings (`file:line:column` + `token` + `policyId`), join each legacy marker's LOCATION to the finding(s)
  there, carry the legacy reason verbatim, and use the suffix to CHECK the join rather than to skip it. Then classify
  the three exceptions rather than guessing — DEAD (a marker with no finding: list it, never invent a waiver), MULTI
  (N findings need N markers with distinct tokens), UNWAIVABLE (two findings sharing carrier AND token).

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
2. Trace every read, one `lib/` hop included. A read outside the 18 frozen resource kinds (§12.4), or a needed reader not in
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

   **THE PER-FILE COUNT RECONCILIATION IS PART OF THIS STEP, NOT A LATER SWEEP (owner, 2026-09-11).** Markers are the
   conversion lane's own in-commit work (§7: *do not plan marker lanes*), so the lane PROVES it did not drop one,
   in the same commit, per file:

   ```
   legacy  = git show <pre-conversion-sha>:<path> | grep -c '<legacy opener>'
   current = grep -c '@orb-waive <policy-id>' <path>
   ```

   **THE ALARM CONDITION IS DIRECTIONAL** (measured 2026-09-11 by the reconciliation lane; this is the refined form —
   an earlier version of this paragraph said "any file where the two differ", which over-reports badly):

   - **`current > legacy`** → an expected **MULTI** split: one legacy marker became N markers with distinct tokens.
     This is the rule working. Confirm each new token binds, then move on. On the caught-failure conversion **four of
     the five mismatches were this**, so a wave of correct splits would otherwise read as forty suspected drops.
   - **`current == legacy`** → clean.
   - **`current < legacy`** → **the only shape that can be a LOST SUPPRESSION.** Classify every one: **DEAD** (the
     legacy marker named a site the converted policy no longer flags — list it, never invent a waiver), **UNWAIVABLE**
     (two findings share a carrier AND a token, so every marker is `over-broad` and suppresses neither — that site
     gets a comment stating the measured placements, not a marker), or a real drop to repair.

   A lane's "N pre-existing debt" line CANNOT distinguish a real drop from a dead marker — which is the whole reason
   this is arithmetic and not judgement.

   **Close the arithmetic, do not just diff the files.** The reconciliation is complete when total real legacy markers
   equals total real waives equals the census's `deliberate-absorb` count. On the caught-failure conversion that was
   572 = 572 = 572, with zero unbound or dead markers, every residual hit accounted for as prose. A per-file diff finds
   the drop; only the closed total proves nothing else is hiding.

   **Why it is mandatory and why a position sample does not substitute:** a WRONG position alarms loudly through the
   central engine (`AUTHORITY ALARM … names a dead position`); a DELETED marker is silent in BOTH directions, because
   neither engine reports a marker addressed to the other's world, and it simply reappears in the census as
   indistinguishable "pre-existing debt". Measured 2026-09-11 on the caught-failure conversion: a verifier sampled 15
   translated positions across four directory classes and **all 15 bound correctly**, then one file-count comparison
   found `tooling/src/stack/ops/engines-ctl.ts` had gone 2 → 1 — its `safeUsername` marker deleted while its
   `healthOk` sibling translated correctly. One command found what the sample structurally could not.

   Exclude gate self-quotes and engine fixtures from the count (`verify/gates/**`, `verify/lib/**`,
   `tests/tooling/gate-ignore-grammar*`, `tests/tooling/verify/lib/**`) — a module's header prose, its `fix` string and
   its proof fixtures all name both grammars. The caught-failure lane's own header records that correction as
   "576 raw − 2 prose = 574".
7. Proofs per §4: carry every legacy row; add the positive identity arm if ordinary; add refusal/receipt pins where the
   verdict depends on a derived population; conversion differential; planted-break receipt only for invented rows.
8. Floors (scoped, never whole-tree): the family test(s) you touched; `pnpm gate:contract` before/after (per-module zero,
   total not rising); `pnpm exec biome check <files> --diagnostic-level=error`; `pnpm exec eslint <files>`;
   `pnpm typecheck --config tsconfig.json`; behavioral mirror suites for any product file whose comments you touched
   (comment-only edits still owe the compile); **the step-6 per-file marker count reconciliation, with every mismatch
   classified — a lane that translated markers and cannot show this table has not finished.** **The §4.6 DIFFERENTIAL,
   either as a committed test or as a commit-message statement of what it found (#2000) — silence is not compliance.** After §5 lands: the mixed `check:structure` before/after on the real
   tree with the finding delta explained.

   **THE ROSTER COUPLED SITE — a conversion breaks suites that are not its own (measured 2026-09-11).**
   `loadGates()` (`tooling/src/verify/lib/loader.ts:190`) returns `corpus.legacy` ALONE — its own comment says
   *the legacy descriptor list alone* — so **every conversion SHRINKS that roster**. The predicate is NOT merely
   “asserts membership”; it is **any assertion whose expected value is DERIVED from the legacy roster**. Membership
   (`toContain`) is one shape; a two-sided SHRINK-ONLY ledger compared with `toEqual` is another and is worse —
   `gate-spelling-twins.int.test.ts:117` holds 79 gate names of which **54 have converted**, so every conversion
   orphans a row and reds the suite with no membership assertion anywhere in the file. Worse than red: its #1506
   spelling control now covers **only legacy gates, no converted policy at all** — uninformative while looking
   authoritative. A grep filtered on membership-shaped matchers MISSES it (paid 2026-09-11, by the orchestrator's
   own census, which reported a population of 2 and was wrong). A lane's floor names its OWN family test and therefore never sees this.
   So: **grep `tests/tooling/**` for the converted gate's id AS A STRING LITERAL, and run every suite that names
   it.** Cheap, mechanical, complete.

   This is the one gap the migration posture does not cover. `.claude/rules/gates-and-tooling.md` declares the
   baseline-red list EXHAUSTIVE and a scoped red never-baseline, but these suites are in NEITHER set: not
   red-by-construction, and not in any lane's scoped floor. Because `tests/tooling/**` is `--full`-only (#1842)
   and nothing runs `--full` on a cadence, the break is unobservable. **It has now happened three times in one
   five-day window** — `registry-family.test.ts` (#1953), `gate-ignore-grammar.repo.int.test.ts` (red from
   2026-09-06, broken by a #1584 conversion commit), and `gate-conformance.repo.int.test.ts:49` (found by this
   rule, at zero load, the day `no-off-token-radius-shadow` converted). Tracked as #1983.

   **A carrier in such a suite is LEGACY BY REQUIREMENT, so re-pointing it is a treadmill with an end:** at the
   atomic cutover the legacy roster is EMPTY and there is no carrier for any arm. Those suites RETIRE with the
   legacy `@orb-gate-ignore` grammar they exist to test. Say that in the suite header rather than per carrier.
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
- Cap: **5 while this program is the work, 3 otherwise** (the base cap was restored to 3 at `faed86039` on
  2026-09-11 09:19 and the owner raised it again later the same day, conditioned on this program — the later word wins;
  `.claude/rules/orchestration.md` is the cap's one home). The §5 runtime lane runs alone; whole-tree runs never alongside lanes; engines stopped and
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

  1. **Eight of its \~15 typed facts are SHIPPED** (`contract/resource-host.ts`): `authoredTree`, `authoredCss`,
     `productCss`, `cssInventory`, `packageMetadata`, `staticConfig`, `nativeConfig`, `trackedFiles`. In particular
     §2's "preserve the static reader's algorithm, put its loading behind `staticConfig`" is DONE, and §1's
     `authoredTree` carries 12 closed ids covering every identity §1 names. **Genuinely absent:** `json`, `jsonc`,
     `exactFiles`, `mirrorIndex`, `vendorCssSurface`, `documents`, `ledger`, `baseUiSurface`, `tokenContract`,
     `devtoolsClosure`, `installedReactCompiler`. **The ruling stands as the dated record; §12.4 states what it became.**
     Every one of those shipped EXCEPT `jsonc`, which §12.4 now rules out with its reason — and the set is FROZEN there
     at 18 kinds, so this list is no longer a work queue.
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

**`ctx.relativePath` IS PARTIAL — IT THROWS, AND IT KILLED A CONVERTED EXEMPLAR FOR AN ENTIRE RUN** (measured
2026-09-11). `lib/policy-pass-context.ts:211-217` raises `source file is outside the effective population: …` for any
file not in the resolved population. That is safe for a node the policy VISITED, and unsafe for a declaration reached
by RESOLUTION — `canonical.sourceFile`, `symbol.declaration.getSourceFile()` — because an imported `.d.ts` is in the
ts-morph Project but in no policy's population. `freeze-provenance-write-pairing` asked it about every named import in
`@packages`; the first `import { useQuery } from "@tanstack/react-query"` resolved into a `node_modules` `.d.ts`, threw,
and the policy reported NOTHING on every real-tree run while sitting at 0 conformance failures.

**The total house idiom is the declaration's own path** — `lib/id-brand.ts:88` and `lib/sealed-origin.ts:27` both use
`canonical.sourceFile.getFilePath().replaceAll("\\","/")`. Use it for any home question about a resolved declaration.
**Do NOT substitute membership in `ctx.files`:** `policy-pass.ts:316` intersects `run.files` with a scoped run's
requested paths, so that test reads silently clean under every `--scope`/`--changed` run — a false clean, strictly
worse than the loud throw it replaces. Class census 2026-09-12: seven call sites in six modules, live once and latent
six times, because whether a resolution escapes the population is a property of what the SUBJECT imports, not of the
policy (#1972).

**A RESOURCE FACT IS A DISCRIMINATED UNION, so consuming one is a TYPE obligation, not a style choice.**
`ResourceLoad<T>` (`contract/resource.ts:3-4`) carries `value` only on the `ready` arm; the other four carry `reason`.
So a policy cannot read `.value` without narrowing, and the narrowing CANNOT be deleted — only written correctly.
§11 ruling 3 settles what a non-ready fact MEANS (`resolveResourceDeclarations` throws at the POPULATION phase and
withholds every consumer before `evaluate`), which makes one reaching a policy a broken runtime guarantee: **a TOOL
ERROR, never a reportable finding and never a silent zero.** So the branch THROWS; it does not `return`.

```ts
/** Every resource this policy declares is checked ready by `resolveResourceDeclarations` before `create`
 *  ever runs — a non-ready fact here means the runtime's own guard broke, not a reportable finding. */
readyResourceValue(fact) // lib/resource-declaration.ts — the module that owns the refusal law at :182
```

**A RESOURCE POLICY CANNOT HAVE A `-health` SIBLING AT ALL, AND THE REASON IS THE PHASE ORDER** (measured
2026-09-12 by the `f-resource-exemplar` design pass). `resolveRuns` WITHHOLDS any owner that declares a
resource one phase before `create`, so **no policy can ever observe a broken resource** — the RUNTIME is the
accuser, and its answer is a tool error (exit 2, "not a verdict"), not a finding. That is the exact opposite
of a FACT, whose non-ready state IS delivered to its consumer, which is why `bus-fact-health` exists, is
correct, and must not be "fixed" to throw. **Do not invent a `-health` sibling for a resource policy; there
is no state for it to report.**

**A `-health` POLICY IS THE DESIGNATED ACCUSER, SO THE PROTECTIONS THAT GUARD AN ORDINARY CONSUMER MUST NOT APPLY
TO IT.** Every mechanism in this section — refuse, withhold, throw — exists to stop a policy reporting on evidence it
could not gather. A `-health` sibling's entire job is to report **exactly that condition**, so applying the same
protection to it silences the accuser with the thing it accuses. Three measured instances, all one shape:

1. **A provider must not receipt its own findings** (§12.3 below) — an empty census would become a fact TOOL ERROR
   instead of reaching the `-health` policy whose job is to report it (#1953, #1955).
2. **A `-health` consumer receipts a CONSTANT `members: 1`, never its census** — otherwise `receiptFailures`'
   `count === 0` turns its own finding into a receipt refusal (#1966, §4.5b).
3. **A `-health` consumer REPORTS a non-ready fact rather than throwing on it.** `bus-fact-health.ts:24-30` does
   exactly this while its siblings `bus-producer-coverage` and `user-bus-deferred-member` throw through
   `recordReadyBusFact` — and that asymmetry is the design, not a defect. **Do not "fix" a `-health` policy to
   throw**; it throws only on a genuinely broken guarantee (an empty effective population), which is a different
   condition from the one it reports.

**The tell that you are looking at this shape**: the policy's `family` matches an ordinary sibling's, its authority
is `hard`, and the branch you are about to "correct" is the only thing that would ever report the failure.

Measured 2026-09-12: **nine of ten resource policies answered a broken resource with a silent `return`**, and
`depcruise-grant-liveness.ts:157-164` was the only one that refused loudly. A silent return there is a policy
reporting CLEAN on a run it could not perform — and the exemplars document was teaching it as a headline virtue, so it
was propagating into every future resource conversion.

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
source universe is authored `.ts`/`.tsx` only; JSON/JSONC, CSS, Markdown, SQL enter only through the closed
ResourceHost declarations frozen below; a hybrid's dual role is explicit and receipted.

#### THE RESOURCE VOCABULARY IS CLOSED — 18 kinds, frozen 2026-09-11 (#1930)

**A capability set that is still moving cannot be policed.** The §5b soundness enforcer (#1971) is blocked on this
freeze, and every kind added costs a mandatory pass over the policing surfaces below, forever. Phase C is over: the set
is CLOSED and conversions proceed against a vocabulary that no longer moves.

**The roster is `GATE_RESOURCE_REQUEST_KINDS` in `tooling/src/verify/contract/resource-declaration.ts` — DATA, never
this table.** The table is the PROVENANCE record: why each member is in a closed set. A vocabulary a reader cannot
audit member-by-member is not closed, it is merely finished.

| Kind | What it serves | Authorized by |
| - | - | - |
| `authored-tree` | 14 closed tree ids (`AUTHORED_TREE_PATHS`) — the directory/liveness family: feature/package/server/ui/db/test/gate layout, plus `docs` and `scripts` as the ADMITTING population for `authored-text` | §11.1 (shipped pre-ruling); `docs`/`scripts` ids added by the `authored-text` wave |
| `authored-css` | the authored stylesheet corpus; `cssInventory("authored")` rides this declaration | §11.1 · §11.8 (no separate CSS census fact — a fifth CSS home is the rot) |
| `product-css` | the exact five-home product CSS identity; `cssInventory("product")` rides this declaration | §11.1 · §11.8 |
| `package-metadata` | `package.json` manifests by closed id (root, tooling, the workspace packages) | §11.1 |
| `static-config` | statically-evaluated JS/TS configs (eslint, depcruise, the three runner configs) behind `config-static-read`'s preserved evaluator | §11.1 (access-patterns §2's "preserve the algorithm, host the loading" — DONE) |
| `native-config` | native loader observations (eslint `ConfigArray`, dependency-cruiser). **Carrier-demand hazard, ONE kind's property:** its fact paths are the whole repository inventory, so an ORDINARY consumer's waiver-carrier demand throws on tracked symlinks. Both shipped consumers are `authority: "hard"`, which is why they work | §11.1 · §12.7 (#1351) · §11.4 (no member for biome or tsconfig) |
| `tracked-files` | the one `git ls-files` inventory behind the grant-liveness family | §11.1 · access-patterns §3 |
| `json` | STRICT JSON over five closed ids (biome, migration journal, token vault, doc catalog, Base UI manifest). Missing / empty / unparseable stay three distinct facts; none becomes `{}` | §11.1 (named genuinely absent; built `4f9726e78`) |
| `installed-package` | ONE kind, three receipted modes (`ast` \| `metadata` \| `text`) over five closed ids, resolved through NODE's own algorithm because pnpm reaches every installed package through a store symlink the authored reader refuses by design | **§11.5, the ruling that deliberately overrides access-patterns §6/§7** — it absorbs `baseUiSurface`, `installedReactCompiler` and the narrow installed facts |
| `mirror-index` | the derived source↔test mirror membership (`package-test`, `tooling-test`) — membership, not the mirror RULE | §11.1 (named genuinely absent; built `899ec74a7`) |
| `documents` | the living-document corpus + catalog status, for the citation/dangling families | §11.1 · access-patterns §5 |
| `ledger` | four named registries by closed id (`core-path-registry`, `core-audits-debt`, `gate-enforcement-roster`, `ratchet-baselines`). Two doors beside `documents` because a corpus tolerates a refused member and an IDENTITY does not | §11.1 · access-patterns §5 |
| `exact-file` | exact named files by closed id (db baseline SQL, client/CSS/CT entries, the app-shell surface). **ONE declaration PER ID** even though the door takes a list, so a policy that declared one file cannot read a second by widening its argument | §11.1 (named genuinely absent; built `899ec74a7`) |
| `vendor-css-surface` | the committed-mirror ↔ installed-vendor comparison surface (Base UI mirror, Streamdown selector sources) | §11.1 · access-patterns §4 |
| `token-contract` | the canonical generated token bundle (vault, themes, resolver, removed) behind the preserved `validateTokenContract` | §11.1 · access-patterns §7 |
| `devtools-closure` | the exact DevTools pin/closure/licence tuple behind the preserved `verifyDevToolsAssetsSync` | §11.1 · access-patterns §7 |
| `authored-path` | the DEMAND identity door: `file \| directory \| absent \| outside \| unresolved` for a repo-relative or ABSOLUTE selector, with absolute-selector normalization. Catches an in-repo symlink resolving outside the tree, which `trackedFiles()` structurally cannot see | **§11.6**, specified by the measured refusal at `runner-config-path-liveness.ts:23-39` |
| `authored-text` | the DEMAND text door: comment-aware snapshots of exactly the demanded paths, TOTAL over them where the private door silently dropped unknown formats | **NOT a §11 ruling — an EXPOSURE.** `ResourceInvocation.ordinaryWaiverCarriers` was already built and private; this publishes it under the declaration fence. Recorded here rather than left unexplained, because a closed set whose provenance a reader cannot trace is not auditable |

Two kind CLASSES are named in the contract rather than applied as a silent downstream skip, because a silently skipped
declaration is exactly how a request that resolved nothing reads as a clean zero. **UNPOPULATED** (`installed-package`,
`authored-path`, `authored-text`) contribute no authored path, so the empty-fact refusal that is correct for every other
kind is skipped BY NAME. **DEMAND** (`authored-path`, `authored-text`, a strict subset) take their subject at the call,
so the population-membership fence does not apply and the DECLARATION fence is the only thing between the door and an
undeclared filesystem read.

`cssInventory` is a HOST DOOR with no kind of its own (it rides `authored-css` / `product-css`): **19 doors, 18 kinds**,
and that is deliberate, not an omission.

##### What a new kind costs — MEASURED, and it is why the set is closed

Re-derived 2026-09-11 against `899ec74a7` (the 7-door wave) and `4f9726e78` (json + installed-package + the two demand
kinds). **Four mandatory edits, plus two new files, plus one conditional:**

| Surface | Always | Why |
| - | - | - |
| `contract/resource-declaration.ts` | yes | the union arm + the UNPOPULATED/DEMAND tuples |
| `contract/resource-host.ts` | yes | the door |
| `lib/resource-policy.ts` | yes | the binding, the declaration fence, the receipt |
| `lib/policy-validation.ts` | yes | the id vocabulary and the exact key-set shape |
| `contract/resource-<family>.ts` + `ops/resource-<family>.ts` | yes (new files) | the closed ids and the provider |
| `ops/policy-conformance.ts` | ONLY when the fixture substrate cannot express the subject | `authored-path` needed real symlinks (`links` + `symlinkSync`); the 7-door wave did not touch it |

**Two modules are NOT policing surfaces for this vocabulary, despite appearances.** `gates/enforcement-registry-parity`
reads the gate ROSTER, never the resource vocabulary. `gates/gate-modernization` contains zero references to it — its
hunk in `4f9726e78` was ARM E (#1958, the `analysis`-token honesty arm) and is unrelated. An earlier count of FIVE
surfaces came from reading those two commits' file lists without reading the hunks.

And the proofs: a kind ships with `ready | missing | empty | unresolved | malformed` receipts and controls in BOTH
directions — `resolveResourceDeclarations` throws on any non-ready declaration and on an empty fact, so a planted
control must REFUSE and a planted control must be ADMITTED.

##### The three residuals, closed

1. **A STAGED-BLOB / git-index read — NOT MINTED, and its gate stays LEGACY.** `no-blanket-suppression` arm C shells
   `git grep --cached` + `git show :<path>` (`:330`, `:342`) to re-judge STAGED blobs, so a stale staged blob cannot
   commit while every working-tree check reads clean (the #954 shape). `TrackedResourceIndex` is `{ repoPaths }` only,
   and no shipped kind serves it. **It has exactly ONE consumer in the whole verify tree** (re-derived 2026-09-11:
   every other git call under `verify/**` is `ls-files` / `diff` / `rev-parse` / `merge-base` / `log`, and the only
   other `--cached` mention is `lib/repo-paths.ts:61-62`'s inventory of the verbs this tree runs, which names this
   gate). §11.5's own principle governs: *a capability serving one gate is that gate's private reader wearing a
   contract's clothes.* So `no-blanket-suppression` stays a legacy `GateDescriptor`, armed and enforcing, and its
   private reader survives to Phase F. That is the STOP-IF-MISSING-KIND refusal working, not a gap.
2. **`jsonc` — RULED REQUIRED IN §11.4, NEVER BUILT, AND NOW RULED OUT.** This is the one real diff between the ruling
   and the tree, and it is stated rather than quietly dropped. §11.4 says *"`tsconfig` is `jsonc()` plus `extends`
   FOLDING"*; `contract/resource-json.ts`'s own header still describes a `jsonc` door beside `json`. Two measurements
   close it: (a) the whole gate corpus contains exactly ONE JSONC parse — `tsconfig-entry-liveness.ts:233` — so the
   kind would serve one gate, the §11.5 test again; (b) the FOLDING half §11.4 names is already owned by the world
   program's shared compiler reader (`lib/policy-program-membership.ts:78-85`, `readConfigFile` +
   `parseJsonConfigFileContent`, #1351, completed 2026-09-10 — AFTER the inputs §11.4 was drafted against, so THE
   STALENESS RULE applies). A `jsonc` resource kind would therefore be one gate's private reader AND a second home for
   config folding. **`tsconfig-entry-liveness` stays legacy; its conversion route is a shared-READER question — the
   compiler reader exposing per-config RAW `include`/`exclude` entries, unfolded and unexpanded, which is what that
   gate actually judges — not a capability question.** `biome.json` does not reopen this: §11.4 ruled it a strict
   `json()` read and that shipped.
3. **`authored-text`'s provenance** — see its row above.

##### Is `node_modules` traversal declarable? — RULED: YES, and ONLY through `installed-package`

Answered in practice by §11.5 and ruled here. The installed tree is deliberately not the authored transaction: the
authored reader REFUSES every symlink traversal by design, and under pnpm every installed package is reached through a
store symlink, so an installed read cannot come through it at all. It is declarable through exactly one kind, resolved
by NODE's own algorithm from a declared base, over a closed id set, in one of three receipted modes. Everything else
about `node_modules` stays undeclarable: no path glob, no directory walk, no id a gate supplies. Adding an installed
SUBJECT is an id row with a named consumer (cheap, and inside the freeze); adding an installed READING SHAPE would be a
fourth mode and is a reopening under the condition below.

##### What reopens the set

Exactly one condition, and it is a RULING, not a lane's call: a CONVERSION that is blocked by a read no shipped kind
serves, **and** whose read has TWO OR MORE independent consumers after read-tracing the remaining legacy corpus one
`lib/` hop deep. One consumer is a private reader by definition and the gate stays legacy instead (both residuals above
took that arm). A new id inside an existing kind is not a reopening — it is a contract edit with a named consumer, which
is what keeps `json`/`exact-file`/`ledger` from becoming `readFile(path)`.

##### OPEN, proposal only — one directory-tier population operator (#1922)

Not built, and `population.ts`'s algebra is untouched by this freeze. Recorded because the freeze forces the question:
the algebra has named roots plus `under`/`notUnder`, and a SANCTIONED HOME ("this concept lives in exactly these
directories") is expressed today as 25 `SANCTIONED_HOMES` tables / 42 rows plus per-gate path liveness. **Arm A — add
one reviewed, tested directory-tier operator**: shrinks path-liveness and #1922 together, and a home becomes declared
data rather than a gate-local table. Cost: it is a POPULATION operator, so it prices in against §12.4's own rule that a
predicate which cannot be represented blocks a conversion — every existing policy's resolved population must be proven
byte-identical, and the operator needs its own two-sided proofs. Risk: a home expressed as population SUBTRACTION is
exactly what the 2026-09-06 ruling forbade (*"sanctioned homes convert as exact reviewed grants with liveness, never
population subtraction"*), so the operator must be an ADMISSION tier, never a subtraction, or it reverses a standing
ruling. **Arm B — no operator; homes stay exact reviewed grants** per that ruling, and #1922 lands as grant rows.
**Default if unruled: ARM B**, because it is the arm the 2026-09-06 ruling already took and arm A cannot be evaluated
without measuring how many of the 42 rows are genuinely directory-tier rather than file-exact. **That measurement
belongs to #1922's lane, not to this one** — whoever takes #1922 should produce the directory-tier-vs-file-exact split
as a by-product of converting the tables, and the operator question is answerable only after it. Until then this stays
recorded, not scheduled.

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

**WHAT #1351 ACTUALLY BUILT — read this before proposing any config, path, program or liveness work, because this
program does NOT own these and has repeatedly tried to rebuild them.** Its own record is
[`docs/history/type-worlds-program-2026-09-10.md`](../history/type-worlds-program-2026-09-10.md); the table below is
the map, not a substitute for it. Note the dates: the gate program STARTED FIRST, so every gate-runtime review
document predates this and describes a tree where none of it existed.

| What #1351 built | Mechanism, and what it means for a conversion |
| - | - |
| **Program purity** — every authored TS file has an intended world and explicit compiler ownership | `_shared/project-worlds.ts` (intent) + `ops/tests-type-membership.ts` (enforcement). A file being IN some program is not being in the CORRECT program, and a correct root does not prove its imported closure is compatible. `types: []` disables ambient inclusion but does NOT stop imported declarations adding Node globals — ISO acceptance inspects the real declaration closure |
| **Derived paths and programs** | The shared compiler reader (`lib/policy-program-membership.ts`) is the one parser: authored roots, imported closures, ambient worlds and references all come from it. **No directory heuristic and no hand-maintained per-program command table is authoritative.** `pnpm typecheck` discovers every runnable program; scoped verification forwards the affected set as repeated `--config` |
| **Generated tsconfigs** | `verify baseline type-configs` WRITES the world templates and runnable configs from `_shared/type-config-intent.ts`; `--check` verifies freshness without writing. Package worlds, test kinds, helper homes and ambient scopes determine the generated fields. **Never hand-edit a generated field — change the intent.** Abstract templates carry `files: []` |
| **vitest / playwright / CT liveness** | `verify config-snapshot vitest <config>` loads selector fields through Vitest's PUBLIC config loader; `runner-config-path-liveness` consumes that observation instead of interpreting imported JS. Exact paths keep field-specific file/directory semantics and repo containment; glob rows are explicitly reported as UNJUDGED |
| **eslint liveness** | `ops/config-snapshot.ts` + `gates/eslint-grant-liveness.ts` (`084991033` / #1895). Real `ConfigArray` evaluation — default selection, local ignores/basePath, ordering and per-entry identities preserved. Whole execution is `pnpm lint:eslint`; a separate native discovery pass enumerates the same files with rules disabled, and that is DISCOVERY DATA, never a lint verdict |
| **dependency-cruiser liveness** | `gates/depcruise-grant-liveness.ts`, same `native-config` shape as eslint. Both are `authority: "hard"` — which is WHY they work: a `native-config` declaration drags the whole repo inventory into the policy's resource population, and an ORDINARY consumer's waiver-carrier demand then throws on tracked symlinks |
| **biome** | **No loader exists and none is coming** — `@biomejs/biome` ships `bin/biome` plus a schema, no `main`, no `exports`, no `@biomejs/js-api`, and no subcommand emits a resolved configuration. Biome is a strict JSON read. It is also a policy HOST, not only a lint config: `1bf7ff7d9` moved D12's import ban INTO biome's `noRestrictedImports`, and `0df3fa9d6` (#1245) ruled that **biome checking ZERO files is a REFUSAL, never a clean lint** |
| **stryker** | `_shared/stryker-config.ts` composes both configs natively (`a24feaadb` / #1897). Derivation stays PURE — importing it cannot mutate the base Vitest config — and a native dry run proves loading and test execution but NEVER substitutes for mutation-score calibration |
| **vite** | Not a liveness surface. The dev stack self-heals on source changes; workspace packages are source-consumed. It appears here only so nobody adds a vite gate looking for symmetry |

**The rule that binds every row above** (#1351's own words): *"Preserve and adapt native-config liveness checks when
selectors move behind imports or generated layers. A static reader that cannot follow the new form must REFUSE or be
replaced by an effective-config witness, never silently pass."* `runner-config-path-liveness`'s documented refusal to
convert is that rule working correctly, not a gap in this program. And #1351 scoped itself explicitly: *"the remaining
gate conversions are not bundled into this program by default … the gate program remains a subsequent work queue."*
So these are OUTPUTS we inherit and must convert without breaking — never evidence that the gate contract can already
express them.

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
