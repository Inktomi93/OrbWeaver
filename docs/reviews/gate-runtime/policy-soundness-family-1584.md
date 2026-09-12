---
kind: design
status: active
updated: 2026-09-11
---

# The §5b soundness enforcer — the `policy-soundness` family (#1971, #1584)

Lane `p-soundness-enforcer`, based at `8257071ee`. The mechanizable half of
[`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b, built as FOUR final `defineGate`
policies over the gate corpus itself — the first meta-policies that are themselves final policies. This document is
the design (written before any module existed), the alternatives it rejected, the coupled-site inventory, the proof
plan, and the receipts of what the finished family re-found on wave 1's ten exemplars.

## 1. Premises re-derived on the tree (every number below is from an AST run, never a grep)

An AST prototype of the arm predicates ran over `tooling/src/verify/gates/*.ts` + `tests/tooling/verify/gates/*.ts`
(recognizer: `lib/gate-contract-origin.ts` `isCanonicalDefineGate`, import origin, never spelling) at `8257071ee`:
167 final / 104 legacy / 88 ordinary. Two of the brief's premises died:

| Brief said | Measured | Consequence |
| - | - | - |
| §4.2 identity arms: 0 of 88 outstanding, pin at `error` | **4 outstanding** — `no-color-literals`, `no-off-token-radius-shadow`, `no-raw-container-widths` (their only `@orb-waive <id>(` is header prose at `:17`/`:10`/`:17`) and `no-form-state-in-useeffect` (its only marker is the NEGATIVE arm in `simple-visitors-wave-4.test.ts:94`, a `no-default-props` fixture). The four family-test arms the brief predicted are exactly the four found | `warning` + `workItem: 1952` (the row that recorded "0 of 86 CLOSED"); orchestrator-approved |
| ordinary `fix` names `@orb-waive <own id>(`: 0 today | **51 of 88** lack it (wave-1 D7's `no-array-literal-querykey:26` and `no-inline-types:42` still among them) | `warning` + its own row (filed by this lane on the orchestrator's instruction); orchestrator-approved |
| `mustFlag` rows with no `expect.count`: 64 rows / 20 modules | 60 rows / 20 modules (lanes landed since) | `warning` + `workItem: 1968` as briefed |
| inert `ext: ["ts","tsx"]`: swept to 0 | 0 | `error` — pins the closed class |
| forbidden APIs / `node:fs` in a final module: 0 | 0 direct-walk / project / module-state / baseline findings on the final subset (`lib/gate-contract.ts` reader); 0 `node:fs` imports | `error` — pins the closed class |
| declared-but-unread `facts:` entry: unmeasured | ALREADY REFUSED at runtime — `lib/policy-pass.ts:703` `declared facts were not consumed` withholds the consumer | NOT BUILT (a duplicate refusal is noise); recorded in the module header |
| `analysis: "syntax"` + `node.getType()`: #1958 | ALREADY ENFORCED — `gate-modernization` ARM E (`gate-modernization.ts:162-213`) | NOT BUILT; recorded in the header. It migrates into this family when the legacy meta-gate retires |

The greps the brief warned about were confirmed false positives by the AST run: `getSourceFiles`/`forEachDescendant`
text in ten modules is comment prose (0 call sites), and no `under:` member on the tree ends in `/`.

## 2. Home — (b), four sibling FINAL policies; (a) rejected

**Rejected (a): new arms on `gate-modernization`.** It is a legacy `GateDescriptor`: one severity per descriptor, no
`workItem`, a `run` hook over `ctx.project.getSourceFiles()`. The severity split this family needs (`error` for the
closed classes, `warning` + a debt row per open class) is inexpressible there, and every arm written into it is written
twice — once now, once at its own conversion.

**Rejected: one policy with every arm.** The contract gives a policy ONE severity, ONE `workItem`, ONE execution. Four
debts with four owners cannot honestly ride one `workItem`, and the cross-file identity arm needs `entire-population`
while the per-module arms compose over a subset. So the family splits on exactly those axes:

| Policy id | Authority / severity / `workItem` | Execution | Arms |
| - | - | - | - |
| `policy-soundness` | hard / error / — | selected-files | E1 inert `ext: ["ts","tsx"]` · E2 final-contract residue (`lib/gate-contract.ts` codes on a final module: direct walk, gate-owned Project, module `let`, module mutation, baseline ledger, legacy field, descriptor spread/computed key) · E3 a `node:fs` import |
| `policy-proof-expectations` | hard / warning / 1968 | selected-files | C `mustFlag` row with no `expect.count` · M `messageIncludes` that discriminates nothing — a substring inside the static text of the module's ONLY message source, or inside the static text of TWO OR MORE sources |
| `policy-waiver-identity` | hard / warning / 1952 | entire-population | I an ordinary policy with no positive §4.2 arm — neither a `mustPass` fixture carrying a marker-form `@orb-waive <id>(` line nor a `tests/tooling/verify/gates/**` test that imports the module and drives a marker-form fixture inside a `test(...)` that reads `waivedFindings` |
| `policy-waiver-spelling` | hard / warning / (own row) | selected-files | S an ordinary policy whose `fix` does not name `@orb-waive <id>(` (§5b.3, wave-1 D7) |

Family string `policy-soundness`; shared reader `tooling/src/verify/lib/policy-descriptor-read.ts` (the final-descriptor
locator, the static-text-segment reader, the proof-row and `files`-map readers, the report-site and message-source
census). Four consumers, so it is a shared reader by count, not by address. `authority: "hard"` throughout: a gate
module waiving its own soundness check is exactly how an enforcer gets waived into silence.

`analysis: "types"` is honest — every arm resolves identity through symbols (`isCanonicalDefineGate`,
`resolveStableExpression`, `inspectGateContract`'s receiver types); proof rows are `mode: "types"` and plant a stub
`tooling/src/verify/contract/policy.ts` so the import origin resolves inside the virtual project.

## 3. Why an AST policy, not a script — the three things a text tool cannot do, done

1. **Identity, not spelling.** A module is FINAL when its `gate` initializer is a call whose callee resolves by import
   origin to `contract/policy.ts` — a same-named local `defineGate` registers nothing (the mixed loader's and
   `gate-modernization` ARM A's rule). Fixture rows carry the lookalike as a control.
2. **Static text, resolved.** `fix`, `message`, `messageIncludes` and fixture contents are read through
   `resolveStableExpression` — const aliases, `+` concatenation, template literals with resolvable spans, and
   conditional expressions (both branches are possible message text) — as CONTIGUOUS SEGMENTS, so a substring is only
   ever tested against text that can actually appear in one finding. A dynamic span breaks the segment rather than
   being guessed. This is the reader that makes wave-1 D3 findable: `ui-exports-map-complete`'s `"not"` lives in a
   conditional inside a template inside a message.
3. **Cross-file.** The identity arm joins a module to the family tests that import it — by resolved module specifier,
   not by path text — and reads polarity off the enclosing `test(...)` call: the positive arm asserts `waivedFindings`,
   the negative arm asserts alarms. A marker naming policy X inside policy Y's negative arm is not X's arm (the
   guide's own rule, §4.2 "counting arms is a reading task"), and that is exactly `no-form-state-in-useeffect`.

Report sites are recognised through `resolveCallableMember`: `ctx.report.node(...)`, `report.node(...)` after
destructuring, and a const alias of the sink all read as the same site. A site that passes no `message` makes the
descriptor `message` a live source. The message census also counts every `message:` / `unreadableMessage:` property
in the module body, because the one shared reporter (`lib/reviewed-grant-findings.ts:57`) emits from those two fields
of the object the policy hands it. An unreadable message anywhere in the module makes the module UNJUDGED on arm M —
a declared limit, never a guess.

## 4. Declared limits — what this family says it cannot see

- §5b criteria 2 (is the `message` TRUE of what the code flags) and 5 (does the header record the decisions) are
  judgment about prose matching behaviour; the §4.1 narrowing cut is a MUTATION. All three stay with the reading lanes.
- Arm I recognises a family-test arm by import + marker-form literal + `waivedFindings` in the enclosing test. A test
  that asserts the positive arm through a helper whose body carries the assertion is not recognised (none exists today;
  the corpus's four family-test arms are all direct).
- Arm M is unjudged when any message source is unreadable (a message built by a function call, a parameter, a
  spread of unresolvable details). It never reports on an unreadable module.
- Arm E2 is `inspectGateContract`'s verdict on the module body only; a reader smuggled into a `lib/` helper with one
  consumer (§5b.7's second half) is a consumer-count question this family does not ask.
- A row's `files` content built by a helper call is still searched for the marker form (every string literal inside
  the row is read), but a marker assembled from a non-const expression is invisible.

## 5. Blindness controls

Each policy self-anchors: when its OWN module path is in the effective population and does not read as final, the run
throws — a dead recognizer refuses instead of reporting ✓ over the corpus forever. `policy-waiver-identity` (the
entire-population member) additionally receipts `members` = the final modules it recognised, so a corpus that
recognises none is withheld by the dispatcher's own `count === 0` rule. The family test pins both through
`runPolicyPass`, and carries a real-corpus control: the recognizer's final count over the live gate directory equals a
second opinion (`^export const gate = defineGate(` per file — the guide's own honest shape test).

## 6. Coupled sites (enumerated before building)

| Site | Change |
| - | - |
| `tooling/src/verify/gates/policy-{soundness,proof-expectations,waiver-identity,waiver-spelling}.ts` | new final policies; auto-discovered by the mixed loader |
| `tooling/src/verify/lib/policy-descriptor-read.ts` | the family's shared reader |
| `tests/tooling/verify/gates/policy-soundness-family.test.ts` | conformance + refusal pins + real-corpus control |
| `tests/tooling/verify/lib/policy-descriptor-read.test.ts` | the segment reader's own controls (join boundaries, conditional branches, dynamic spans) |
| `docs/architecture/core/Core-Enforcement-Active-Gates.md` | four Layer-3 ACTIVE rows beside `gate-modernization`'s; the count line 271 → 275 (`enforcement-registry-parity` reads both) |
| `docs/test-baseline/manifest.json` | two new tracked specs — regenerated in this worktree after `git add` |
| `structure:policy-conformance` totals | 167 → 171 policies; rows grow by this family's declared rows |
| doc catalog | this doc + the roster edit are NOT re-attested, like every 2026-09-11/12 gate-runtime doc landing (`check:doc-catalog` is baseline red, guide §2) |

## 7. The fact-population subset arm — judged, not built here

The orchestrator raised (#1972's lane): a `defineFact` provider's population must be a SUBSET of every declared
consumer's, or the provider hands the consumer nodes it cannot NAME (`relativePath` and `sourceFile` both throw,
`policy-pass-context.ts:211-225`); `tupleVocabularyFact` (`@client`+`@server`+`@contracts`) → `warning-code-coverage`
(`@server`+`@contracts`) is the live case. **Default taken: it belongs at the DISPATCHER, not in this family.** The
subset relation is exact only over RESOLVED path sets, which `lib/policy-pass.ts` already holds for both provider and
consumer at plan time; a symbolic subset over the population algebra (globs, `named`, `not`) is a second resolver, and
an AST arm here would have to evaluate two object literals into `PopulationExpr` values first. The right shape is a
resolution-time REFUSAL — every effective provider path is in the consumer's effective path set, or the consumer is
withheld with a tool error — with a two-direction control in `tests/tooling/verify/lib/policy-pass.test.ts`. A
deliberate superset cannot exist: the consumer structurally cannot name those nodes, so this is a contract violation,
not warning debt. `lib/policy-pass.ts` is outside this lane's fence; the recommendation is recorded here and in the
report for its own row.

## 8. Proof plan

Every arm carries a founding `mustFlag` row with `count` (+ `token` where the anchor is a descriptor property) and the
near-miss `mustPass` rows that separate it from its neighbours: a legacy descriptor (out of scope), a local-lookalike
`defineGate` (registers nothing), `ext: ["tsx"]` (a real narrowing), a row WITH `count`, a `messageIncludes` that picks
one of two sources, a `fix` that names the spelling, an in-module identity arm, a family-test identity arm, a
family-test NEGATIVE-only arm (still a finding), a message built from a parameter (unjudged), a conditional-branch
substring that discriminates. Refusal pins (self-anchor, zero-recognised receipt) run through `runPolicyPass` in the
family test because a throw is not a row.

## 9. Receipts — what the finished family found

Every number below came out of a run in this lane's worktree at `8257071ee` + this change (the fix-spelling debt row is
**#1978**, filed on the orchestrator's instruction; `policy-waiver-spelling` carries it as `workItem`).

| Instrument | Before | After |
| - | - | - |
| `pnpm check:policy-conformance` | 167 final · 1,662 rows · 0 failures · exit 0 | **171 final · 1,709 rows · 0 failures · exit 0** (13.7 s; corpus 275 modules, 104 legacy) |
| `pnpm gate:contract` | 761 findings / 271 modules | **761 findings / 275 modules** — zero naming any file of this family |
| `pnpm test:scoped tests/tooling/verify/lib/policy-descriptor-read.test.ts tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts` | — | **18 passed / 18** (real-corpus arm 63 s; 180 s beside a sibling suite on the first run) |
| `pnpm typecheck` (all 11 runnable programs) | — | PASS ×11 |
| `pnpm exec eslint <9 new files>` · scoped biome | — | clean |
| `pnpm check:docs <this doc> <roster>` | — | 2 file(s) formatted |
| `pnpm check:ledgers-fresh` | — | manifest FRESH (2,620 specs); `caught-failure-ownership/population.json` STALE by ONE moved line in `lib/schema-fact.ts` (546 → 545) — a file this lane never touched, so main's own drift, left for the barrier |
| `pnpm check:structure` (ONCE, the real tree; run `agent-aa57f2249e7350a08-3559603-2026-09-12T00-15-21-743Z`) | 4:01 wall / 270 modules (guide §2) | exit 1 (the baseline product backlog, never this lane's), **`final policies: 171 ran · … · 0 alarm(s) · 0 tool error(s) · 0 withheld`**; single-pass 220.6 s + final-pass 128.7 s wall. **`policy-soundness` is the slowest final policy at 57.7 s (evaluate)** — the price of `inspectGateContract`'s type-backed mutator identity over 171 modules (the same reader `pnpm gate:contract` runs at 73 s over 275); a cheaper walk-only export from `lib/gate-contract.ts` is a follow-up outside this lane's fence |

**Live-corpus findings, through the production dispatcher over the real gate directory + family tests (35 s, 0
tool errors, nothing withheld, receipt `final policy modules = 171`):**

| Policy | Findings | What they are |
| - | -: | - |
| `policy-soundness` (error) | **0** | the three closed classes are closed |
| `policy-proof-expectations` (warning, #1968) | **81** | 60 rows with no `expect.count` across 20 modules · 18 single-source tautologies · 3 substrings shared across ≥2 sources (`ui-exports-map-complete:130` `"not"`, `freeze-provenance-write-pairing-health:149`, `no-tailwind-dark-variant:328`) · 0 unreadable rows |
| `policy-waiver-identity` (warning, #1952) | **4** | `no-color-literals:125`, `no-form-state-in-useeffect:126`, `no-off-token-radius-shadow:169`, `no-raw-container-widths:95` |
| `policy-waiver-spelling` (warning, #1978) | **51** | the 51 ordinary `fix` strings with no spelling (list on #1978) |

Spot-checks of the arm-M verdicts against the modules' own constants: `no-untyped-soft-ref` reads as ONE source because
`const UNREADABLE = MESSAGE;` (`:42`) — its two "messages" are one text; `no-tailwind-dark-variant`'s `MESSAGE` itself
contains `unresolved:*` (`:30`), so `messageIncludes: "unresolved"` is in every text the module can emit;
`freeze-provenance-write-pairing-health`'s two BLIND messages (`:106`, `:119`) both open with the substring row 149
pins; `config-group-completeness` (a prototype false positive) is now UNJUDGED because its report helper takes the
message as a parameter.

## 10. The wave-1 re-find table — the ten exemplars against the finished family

| Wave-1 defect | Reachable? | Re-found by | Evidence |
| - | - | - | - |
| **D1** `server-layout` `mustFlag[0]` tolerates 8 findings, no `count` | yes | `policy-proof-expectations` arm C | live finding at `server-layout.ts:65` (the row) |
| **D3** `ui-exports-map-complete` `messageIncludes: "not"` matches the sibling arm | yes | arm M "shared" | live finding at `ui-exports-map-complete.ts:130`; reachable only because a conditional contributes both branches — `mustFlag[4]` of the policy is that exact shape, and the honest sibling row (`"no entry at all"`) is a `mustPass` |
| **D7** `no-array-literal-querykey` + `no-inline-types` `fix` names no spelling | yes | `policy-waiver-spelling` | both among the 51 live findings (`:26`, `:42`) |
| **D10** `user-bus-deferred-member` inert `ext` | yes | `policy-soundness` E1 | differential through the production dispatcher: the PRE-sweep blob (`15ee23df7`, the parent of the #1959 sweep) → ONE finding `user-bus-deferred-member.ts:57:48 ext`; the swept blob (`8257071ee`) → 0 |
| `ui-exports-map-complete` `mustFlag[2]` no `count` (audit sweep B) | yes | arm C | live finding at `:140` |
| the four TAUTOLOGY rows the audit named (`spacing-tier-home-health`, `typography-tier-home-health`, `user-bus-deferred-member`, and the constant-token `no-array-literal-querykey`) | 3 of 4 | arm M | the three `messageIncludes` tautologies are live findings (`:49`, `:49`, `:95`); a constant `token` is not a `messageIncludes` and is out of this arm's vocabulary |
| **D2** the `no-raw-matchmedia` DECLARED LIMIT is false in three documents | **no** — judgment (§5b.2/5) | — | correctly out of scope: whether a header's claim is TRUE of the code is a reading task |
| **D4** the resource not-ready guard is UNREACHABLE | **no** — judgment | — | dead code behind a contract guarantee is a reading task (and a mutation to prove) |
| **D5** the fail-closed arm exercised by no row · **D6** a `mustPass` that passes for the wrong reason | **no** — mutation (§4.1) | — | the narrowing cut is a `cp`/`mv` experiment, not a read |
| **D8** a legacy `ExemptionTable` behind `defineGate` | not this family | `gate-modernization` ARM B / #1922 | already someone else's arm |
| **D9** four roster rows are bare labels | **no** — judgment (§5b.5) | — | prose density is a reading task |

So of wave 1's ten defect classes the family independently re-finds the four the brief predicted (D1, D3, D7, D10) plus
the audit's sweep-B tautologies, and correctly stays silent on the six that are judgment or mutation — which is exactly
the half of a §5b audit a reading lane no longer has to spend on.
