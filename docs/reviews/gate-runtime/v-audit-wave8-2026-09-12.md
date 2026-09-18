---
kind: review
status: active
updated: 2026-09-12
---

# v-audit-wave8 — the SERVER plane (home-server 11 + origin-server 14) against §5b PRISTINE (#1584)

Read-only adversarial audit of the SERVER-plane policies imported by
[`tests/tooling/verify/gates/home-server-family.suite.test.ts`](../../../tests/tooling/verify/gates/home-server-family.suite.test.ts)
and
[`tests/tooling/verify/gates/origin-server-family.suite.test.ts`](../../../tests/tooling/verify/gates/origin-server-family.suite.test.ts),
held to [`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b's seven
criteria and §4's proof rules. Method, verdict shape and the four-way clean-cut classification are copied
from [`v-audit-wave7-2026-09-12.md`](v-audit-wave7-2026-09-12.md) and
[`v-audit-wave6-2026-09-12.md`](v-audit-wave6-2026-09-12.md) so the waves are comparable.

Every number below came out of a run produced in this session, in an isolated worktree at `8fac273c3`.
Every probe was `cp f f.w8bak` … `mv f.w8bak f` **inside that worktree**, driven by a scratch harness that
restores in a `finally` and asserts byte identity; never `git stash`/`checkout`/`restore`. No shared-tree
file was touched, so no mid-run probe announcement was owed. `git status --short` was EMPTY and
`find tooling/src/verify/gates -name '*.w8bak'` returned nothing after the final round.

## Subject set and its size

The two imports give **25 distinct policies — 11 + 14**, well past the ~14 the brief capped a full pass at.
Per the brief's instruction I audited **home-server in full (11/11)** and took origin-server through the
**axes that are cheap and corpus-wide (14/14 on §4.2, §4.1-expectations, §5b.1/3/4/5 census)** while
leaving its §4.1 narrowing cuts and §4.5 reachability probes uncovered. What I did not cover is itemised
at the end.

| Family | Policies |
| - | - |
| **home-server** (full) | `bus-channel-primitive` · `content-part-seam` · `no-direct-users-read` · `no-raw-clock` · `no-raw-random` · `owner-role-split` · `scrubber-factory-home` · `scrubber-home` · `single-stream-transport` · `sole-env-reader` · `two-class-role-authority` |
| **origin-server** (partial) | `bounded-list-limit` · `byte-check-cast` · `discovery-no-stats-rollups` · `membership-enforcer` · `no-await-db-in-loop` · `no-direct-reports-write` · `no-handwritten-wire-json-schema` · `no-hardcoded-side-gen-sampling` · `persistence-no-in-memory-state` · `providers-runner-seal` · `test-fixture-imports` · `test-mock-doctrine` · `turn-identity` · `vector-scope-derived` |

### Fresh vs re-audit

**24 of 25 are FRESH.** Cross-checked by grepping all seven prior audit documents
(`v-exemplar-audit-2026-09-12.md`, `v-audit-wave2` … `wave7`) for each id: 24 return no match at all.

**One partial re-audit: `byte-check-cast`.** It appears exactly once in prior work —
`v-audit-wave3-2026-09-12.md:141`, a single row in that wave's `drizzleSchemaFact` receipt-routing table
(`:209` / `:212` / `ROUTES`). That is **one property** (does the consumer file its receipt before reading
`fact.value`), not a §5b pass. I did not re-derive that row and I did not re-count it; wave 3's
`recordReadySchemaFact` finding stands as its own receipt. Everything I report about `byte-check-cast`
below is fresh and disjoint from it. **Wave 5's double-count is not repeated: the subject count is 25, the
fresh count is 24, and no module is counted in two waves for the same property.**

Running total: **76 + 25 = 101 of 167 audited**, with the origin-server 14 audited on a narrower axis set
than waves 1–7 used.

## FLOOR — run once, as mandated

`pnpm check:structure`, one invocation, no wrapping `timeout`, read from the run's own artifact rather
than scrollback (run `agent-abc5fe2d41d096f46-3734773-2026-09-12T00-49-10-250Z`):

```
final policies: 171 ran · raw 1450 = waived 1150 + granted 105 + effective 195 (66 error, 129 warning)
  · 0 alarm(s) · 0 tool error(s) · 0 withheld
single-pass: ran 275/275 active gate(s) (104/104 legacy · 171/171 final) of 275 corpus file(s) — run COMPLETE
```

**`0 tool error(s)` · `0 withheld` · `0 alarm(s)`.** Exit 1 is the ordinary-violation exit, which is the
mid-migration baseline, not a defect of this audit. No policy in either subject family is blinded
(#1972) and none silently withholds. The floor is clean; every finding below is about PROOF, not about a
policy that failed to run.

## Headline

**All 25 are FINAL `defineGate` modules, all 25 pass conformance, and 24 of 25 are REFUTED.** Two axes
are the best yet measured in this program, and two are the worst.

1. **The §4.1-expectation record is PERFECT at the largest size yet: 155 of 155 `mustFlag` rows carry
   `expect`, and 155 of 155 carry `count`.** Wave 7's 71/71 was the previous best. 78 rows carry `token`
   (every origin-server row), 18 carry `messageIncludes`, **0 carry `line`**, and **0 discriminators are
   tautological** — verified two ways: no `messageIncludes` value is a substring of its own policy's
   `message`, and three sibling-arm TRANSPLANTS (`bus-channel-primitive`, `content-part-seam`,
   `no-direct-users-read`) all went RED.
2. **The §4.2 identity arm discriminates in 14 of 14 ordinary policies.** Every origin-server module
   carries an in-module `@orb-waive <id>(<position>)` arm; flipping each position to a dead one reds its
   row with the exact `AUTHORITY ALARM [ordinary-waiver] … names a dead position for <id>` message. 14/14
   is the first perfect discrimination sweep at this size (wave 6 measured 12/12 on a smaller set).
3. **The #944 THIRD ANSWER is REACHED in 7 of the 8 home-server modules that implement one** — against
   3 of 12 (wave 6) and 1 of 11 (wave 7). This family is the counter-example to the program's worst
   correlation, and it earns it: five modules carry an explicit `unreadable`/fail-closed `mustFlag` row.
4. **§5b.5 fails in 25 of 25.** Not one header records a FAMILY line, a POPULATION PORT, or a legacy SHA —
   and 20 of the 25 declare a SINGLETON family (`family === id`) without stating the singleton's reason
   anywhere. This is wave 3's D1 reproduced at corpus scale.
5. **§4.3 fails in 7 of the 10 reviewed-grant policies, and the family test's own header says otherwise.**

| Property | Wave 1 (10) | Wave 2 (7) | Wave 4 (9) | Wave 6 (12) | Wave 7 (14) | **Wave 8 (25)** |
| - | -: | -: | -: | -: | -: | -: |
| `mustFlag` rows with no `count` | 2 of 33 | 0 of 45 | 10 of 36 | 0 of 61 | 0 of 71 | **0 of 155** |
| Discriminators surviving a transplant | 5 of 8 | 6 of 6 | 21 of 22 | — | — | **3 of 3 sampled** |
| §4.2 arm exists AND discriminates | 10 of 10 | 7 of 7 | 6 of 9 | 12 of 12 | — | **14 of 14 ordinary** |
| §4.1 narrowings genuinely UNENFORCED | 12/30 (40%, unsplit) | 5/30 (17%) | 10/31 (32%) | — | 17/85 (20%) | **11 of 46 (24%)**, naive 19 (41%) |
| #944 third answer REACHED | — | — | — | 3 of 12 | 1 of 11 | **7 of 8** |
| Header records FAMILY / POPULATION PORT | — | 6 of 7 | 1 of 9 | — | — | **0 of 25** |
| `fix` names the exact waiver spelling | — | 7 of 7 | 4 of 8 | 1 of 12 | — | **3 of 14 ordinary** |

## The §4.1 narrowing ledger — 46 cuts, every one with its DIRECTION

Every cut below states what the predicate was replaced WITH, because §4.1's own worked case is an auditor
who substituted a different wrong value and manufactured a false UNENFORCED (wave 5). **Naive clean: 19 of
46 (41%). Classified UNENFORCED: 11 of 46 (24%) — a naive over-report of 73%**, in line with wave 7's 71%.

The four buckets, plus the one this wave had to add:

- **UNENFORCED** (11) — cut in the flags-MORE direction, arm proven REACHABLE, every declared row stayed
  green. Two carry a **built falsifier** (a row that is green on pristine source and red under the cut).
- **DEAD BRANCH** (4) — the cut came back clean because **no declared row reaches the branch at all**.
  Adding a `mustPass` row would not fix this; the branch needs a `mustFlag` row that enters it, or it is
  code the module cannot justify. Counting these as "unenforced" would be wrong, and counting them as
  clean would be worse.
- **MUTUALLY REDUNDANT** (2) — clean alone, RED when cut with its sibling.
- **DECLARED PREFILTER, clean by design** (2) — a candidate-name prefilter in front of an identity fence;
  the discriminating half (the home infix) REDs, which is the §4.1 rule working as written.
- **WRONG-DIRECTION, corrected** (1) — `scrubber-factory-home`'s `isHomeFile`. Widening it to `true`
  comes back clean and looks unenforced; that cut makes the policy flag **LESS**. The right-direction cut
  (narrow the home to nothing) REDs **5 rows**. Reported as ENFORCED.

| Module | Cuts | Naive clean | UNENFORCED | DEAD | REDUNDANT | PREFILTER |
| - | -: | -: | -: | -: | -: | -: |
| `bus-channel-primitive` | 5 | 3 | 1 (falsified) | 2 | — | — |
| `content-part-seam` | 4 | 1 | — | 1 | — | — |
| `no-direct-users-read` | 4 | 1 | 1 | — | — | — |
| `no-raw-clock` | 5 | 2 | 2 | — | — | — |
| `no-raw-random` | 3 | 2 | 2 | — | — | — |
| `owner-role-split` | 3 | 1 | — | — | 1 | — |
| `scrubber-factory-home` | 2 | 0 | — | — | — | — |
| `scrubber-home` | 4 | 3 | 1 | — | — | 2 |
| `single-stream-transport` | 4 | 1 | — | 1 | — | — |
| `sole-env-reader` | 6 | 3 | 3 (1 falsified) | — | — | — |
| `two-class-role-authority` | 6 | 2 | 1 | — | 1 | — |
| **Total** | **46** | **19** | **11** | **4** | **2** | **2** |

### The two BUILT falsifiers (control green → armed red, both directions run)

**D1 — `bus-channel-primitive`: the canonical `exportedName` half of the identity fence is UNENFORCED (HIGH).**

`constructsEventEmitter` ends with

```ts
return target.canonical.exportedName === EMITTER_EXPORT && EVENTS_DOORS.includes(originModuleSpecifier(target));
```

Cutting the DOOR half REDs `mustPass[2]` (the lookalike row) — enforced. Cutting the `exportedName` half
(`return EVENTS_DOORS.includes(…)`) leaves all twelve rows green. The falsifier is a barrel that re-exports
a DIFFERENT `node:events` export under the name `EventEmitter`:

```ts
"…/w8-a-barrel.ts": 'export { setMaxListeners as EventEmitter } from "node:events";',
"…/w8-a.ts":        'import { EventEmitter } from "./w8-a-barrel.ts";\nexport const bus = new EventEmitter();',
```

The name prefilter admits it (it names `EventEmitter`), the door check passes (it IS `node:events`), and
only the `exportedName` comparison rejects it. **Control run with the row added to pristine source: 0
failures. Armed run (same row + the `exportedName` half cut): 1 failure.** The fix is that `mustPass` row,
verbatim.

**D2 — `sole-env-reader`: the `node:process` DOOR comparison is UNENFORCED, and the ambient half is
unfalsified beside it (HIGH — this is the module's own headline claim).**

`readsProcessEnv` is the whole of the module's "IDENTITY, NOT SPELLING" paragraph. It has three resolved
clauses and one refusal clause. Measured:

| Cut (direction: flags MORE) | Result |
| - | - |
| ambient `globalName === "process" && memberPath === ["env"]` → `true` | CLEAN |
| `PROCESS_DOORS.includes(originModuleSpecifier(…))` half → dropped | CLEAN |
| `path.length === 1 && path[0] === ENV_MEMBER` half → dropped | CLEAN |
| **both resolved halves cut TOGETHER** (the §4.1 mutual-redundancy control) | **STILL CLEAN** |
| `classifyOriginRefusal(module.reason, node) === "unreadable"` → `true` | RED (1) |
| `destructuresEnv` prefilter → `true` | RED (7) |
| per-KEY operation grain → bare `OPERATION` | RED (4) |

So the only clause of the identity reader any declared row enforces is the REFUSAL classifier. The
falsifier for the door half is a project module whose default export carries an `env` key:

```ts
"…/cfg.ts":    'const cfg = { env: { A: "1" } };\nexport default cfg;',
"…/reader.ts": 'import cfg from "./cfg.ts";\nexport const a = cfg.env;',
```

**Control: 0 failures. Armed (door comparison cut): 1 failure** —
`expected zero effective findings but got 1: … Read: process-env-read in packages/server/src/domain/x/reader.ts.`
The fix is that `mustPass` row.

**I could NOT falsify the AMBIENT half, in two attempts** (a local `const process = { env: … }` and the
module-default shape above both route through the refusal classifier's `other` arm instead of reaching the
ambient comparison). Per §4.1's fourth outcome I record that as a measured gap rather than inventing a row
that does not discriminate: it is counted in the 11 as UNENFORCED-unproven, and a fix lane should treat
finding its falsifier as part of the work, not assume one exists.

### The nine remaining UNENFORCED narrowings (clean, right direction, arm proven reachable)

| Module | Clause cut | Replaced with | Arm reachable? |
| - | - | - | - |
| `no-direct-users-read` | `member.value.name === TABLE` | `member.kind === "resolved"` | YES — throw probe fired 3 rows |
| `no-raw-clock` | bare-identifier `callee.getText() === NOW_MEMBER` | `true` | YES — 2 rows |
| `no-raw-clock` | `member.value.name === NOW_MEMBER` | `member.kind === "resolved"` | YES — 7 rows |
| `no-raw-random` | bare-identifier `callee.getText() === RANDOM_MEMBER` | `true` | YES — 2 rows |
| `no-raw-random` | `member.value.name === RANDOM_MEMBER` | `member.kind === "resolved"` | YES — 6 rows |
| `scrubber-home` | `member.value.name === SCRUBBER_SYMBOL` | `member.kind === "resolved"` | YES — 1 row |
| `two-class-role-authority` | `parent.getExpression() !== root` (the condition-IDENTITY fence) | dropped | YES |
| `sole-env-reader` | ambient `globalName`/`memberPath` | `true` | unproven (see D2) |
| `sole-env-reader` | `path.length === 1 && path[0] === ENV_MEMBER` | dropped | unproven (see D2) |

The recurring shape is the **member-name half of a candidate prefilter**: six of the nine. In each case
the arm IS live and the identity fence behind it IS enforced, so this is not the §4.1 declared-prefilter
exemption — the module simply has no row placing a DIFFERENTLY-named resolved member inside the same
population. One `mustPass` row per module closes it.

## The #944 third answer, per module — probed, never read off the header

Probe: replace the branch's report/return with `throw` and run the module's own rows. **0 failures means
unreached.** The brief's warning that a DECLARED LIMIT paragraph is exactly the thing that is wrong here
held again — see D4.

| Module | Fail-closed arm | REACHED? | The acquittal (`other`) half |
| - | - | - | - |
| `bus-channel-primitive` | `classifyOriginRefusal(…) === "unreadable"` | **YES** (`mustFlag[5]`) | **UNREACHED** |
| `content-part-seam` | `readSealedOrigin` → `unresolved` | **YES** (`mustFlag[4]`) | **UNREACHED** |
| `no-direct-users-read` | `readSealedOrigin` → `unresolved` | **YES** (2 rows) | not probed separately |
| `no-raw-clock` | `readAmbientInvocation` → `unreadable` | **NO** | **YES** (3 rows) |
| `no-raw-random` | `readAmbientInvocation` → `unreadable` | **NO** | **YES** (1 row) |
| `scrubber-home` | `readSealedOrigin` → `unresolved` | **YES** (2 rows) | not probed separately |
| `single-stream-transport` | `origin.kind === "unresolved"` | **NO — the whole branch** | **UNREACHED** |
| `sole-env-reader` | `classifyOriginRefusal(…) === "unreadable"` | **YES** (1 row) | **YES** (1 row) |

**7 of 8 reach SOME refusal arm** — the program's best result by a wide margin, and unlike waves 6 and 7
it does not correlate with `messageIncludes` (these modules fuse the refusal into the ordinary message and
prove it with a `count` row on an unresolvable-door fixture instead, which works because the fixture
produces a finding that would not otherwise exist).

The three remaining gaps are real and each is a header claim no row enforces:

**D3 — `single-stream-transport`'s entire fail-closed branch is DEAD (HIGH).** `opensSocket`'s
`if (origin.kind === "unresolved") return classifyOriginRefusal(…) === "unreadable";` is reached by none of
its 8 rows: cutting it fully open (`return true`) is CLEAN, and a `throw` in the `other` arm never fires.
The module comment above it says *"Fail-closed on an unreadable receiver; a `subscription` property that
PROVABLY belongs to another declaration is not a subject."* Both halves of that sentence are unproven. The
reusable falsifier applies directly — `declare function opaque(): any; opaque().subscription(…)` drives
`resolveTypeMemberOrigin` into the unresolved arm.

**D4 — `no-raw-clock` and `no-raw-random` both advertise a fail-closed unreadable arm that no row reaches
(MEDIUM).** Both carry the comment *"FAIL-CLOSED on an unreadable callee; a callee that PROVABLY binds an
injected clock/PRNG passes."* The **second** half is proven (the `other` arm fires, 3 and 1 rows). The
**first** half — the `unreadable` verdict — is reached by zero rows in either module. This is the #1997
shape one layer down from a header: a code comment asserting a guarantee no row enforces.

**D5 — two dead branches in `bus-channel-primitive` (MEDIUM).** Neither `if (target.kind !== "module")`
nor `classifyOriginRefusal`'s `other` outcome is reached by any of its 12 rows (`throw` probes: 0
failures each). The header's sentence *"A construction that PROVABLY binds another declaration is a
different class and passes"* is enforced by nothing — the module imports `classifyOriginRefusal`, whose
entire purpose is that distinction, and never exercises it.

## The ANTI-pattern of this wave

**D6 — `content-part-seam` declares two visitor kinds that its subject can never produce, and its header
sells them as the conversion's value (HIGH — this is the shape that propagates).**

The module visits `ImportSpecifier`, `PropertyAccessExpression` and `ElementAccessExpression`, and its
`candidate()` has a matching member arm. A `throw` planted in that member arm fires on **zero** of its 11
rows. That alone would be a coverage gap; it is worse than that:

`ChatContentPart` is declared `export type` (`packages/contracts/src/chat/bus.ts:39`). A
`PropertyAccessExpression` / `ElementAccessExpression` is a **value-position** node. A type-only symbol
cannot appear in one. So the member arm is not merely unexercised by fixtures — it is **structurally
unreachable on the real tree**, which is a §5b.1 breach ("nothing declared that it does not use").

And the header's central paragraph reads: *"a namespace member (`chat.ChatContentPart`), a
computed-literal member, and a re-export through any other barrel all walked past it"* — sold as what the
conversion buys. The module's own `mustPass[0]` then states the opposite: the namespace spelling is a
`QualifiedName` in type position, *"not a `PropertyAccessExpression` — and no shared reader normalizes
that node today."* **The header claims a capability the code cannot have, and the module's own declared
limit is the proof.**

The propagation risk is exact and mechanical: `no-direct-users-read` and `scrubber-home` carry the SAME
three-kind visitor tuple and the SAME `candidate()` shape, and in both of those the member arm IS live
(throw probes fired 3 and 1 rows respectively) because `users` and `createHiddenSpanStreamScrubber` are
VALUES. A lane copying the tuple across without asking whether the sealed symbol is a value or a type
ships a dead arm with a confident paragraph. **The rule to write down: the visitor KIND set is a function
of whether the sealed symbol is a value or a type, and a type-only seal gets `ImportSpecifier` alone.**

## §4.3 — reviewed-grant identity, and a family-test header that overstates itself

**D7 — 7 of the 10 reviewed-grant policies have NO §4.3 grant pin anywhere, and
`home-server-family.suite.test.ts`'s header says every policy has one (HIGH).**

§4.2 is explicit that `runPass` pins `knownPolicies: [policy]` with `reviewedGrants: []`, so a
reviewed-grant policy **cannot** prove grant consumption in a module row — it belongs in the family test.
Census of `home-server-family.suite.test.ts` (its four `test(` blocks beyond the conformance call):

| Policy | Authority | Family-test pin |
| - | - | - |
| `bus-channel-primitive` | reviewed-grant | **grant identity ×3** — exact consumption, STALE after a rename, wrong-subject licenses nothing |
| `content-part-seam` | reviewed-grant | receipt refusal (moved home) — §4.5 only, **no grant pin** |
| `two-class-role-authority` | reviewed-grant | receipt withholding ×2 (absent / relocated) — §4.5 only, **no grant pin** |
| `scrubber-factory-home` | hard | receipt refusal + export-gone — §4.5, correct (hard has no grant) |
| `no-direct-users-read` | reviewed-grant | **NONE** |
| `no-raw-clock` | reviewed-grant | **NONE** |
| `no-raw-random` | reviewed-grant | **NONE** |
| `owner-role-split` | reviewed-grant | **NONE** |
| `scrubber-home` | reviewed-grant | **NONE** |
| `single-stream-transport` | reviewed-grant | **NONE** |
| `sole-env-reader` | reviewed-grant | **NONE** |

`grep '"<id>"' tests/tooling/**` returns `home-server-family.suite.test.ts` for only four of the eleven, and the
other three families' tests name none of them.

The file's own header states:

> *"this file pins the two things a proof CANNOT: the receipt refusals … and the grant liveness (a row
> consumed zero times is STALE; a row that would match two findings is OVER-BROAD, **which is why every
> policy here reports once per `(subject, operation)`**)."*

Grant liveness is pinned for **one** policy. Seven policies' `(subject, operation)` grain, STALE alarm and
over-broad behaviour — the entire mechanism their headers cite as the replacement for the legacy
`SANCTIONED_HOMES` rename tripwire — are asserted by nothing. **This is the same class as wave 7's
finding (a header claiming a proof it was never shown to catch), one level up: the FAMILY TEST's header,
not a module's.** It matters more here, because `home-server-family.suite.test.ts` is the file the remaining
sanctioned-home conversions will copy.

**D8 — `owner-role-split`'s withholding claim is unenforced, while its twin's is pinned (MEDIUM).** Both
role-vocabulary policies end `evaluate` with `if (members.size === 0) { return; }` after
`ctx.receipt(...tupleVocabularyReceipt(vocabulary))`. For `two-class-role-authority` that is safe and
PROVEN: the family test's two `test.each` arms show an absent or relocated `PARTICIPANT_ROLES` produces a
`[receipt]` tool error and `withheldPolicyIds: ["two-class-role-authority"]`. `owner-role-split` makes the
identical header claim — *"a vocabulary that stops resolving takes the receipt to zero and WITHHOLDS the
verdict"* — and has **no family pin at all**; a `throw` planted in its `members.size === 0` branch fires on
zero of its 13 rows. The mechanism is almost certainly sound (it is the same receipt helper), but §4.5
requires the pin, and "the twin's pin covers me" is not a receipt. Two `runPolicyPass` arms copied from
the `two-class` block close it.

## §5b.5 and §5b.4 — the systemic header gap, 25 of 25

Mechanical census over all 25 module headers (the text above the first `import`):

```
grep -c 'FAMILY'              → 0 in all 25
grep -c 'POPULATION PORT'     → 0 in all 25
grep -cE '[0-9a-f]{7,}\^'     → 0 in all 25   (a legacy pre-conversion SHA anywhere)
grep -ci 'singleton'          → 0 in all 25
```

§5b.5 requires the header to record *"the family and its reader, the population port (byte-identical, or
the intentional correction and why)."* §5b.4 requires *"a real shared `lib/` reader (module + function,
named in the header) **or a declared singleton with its reason**."*

**20 of 25 declare `family === id`** — a singleton — and not one states the singleton's reason. The five
that declare a genuine shared family do it in the `family:` field only:

| Shared family | Members |
| - | - |
| `ambient-determinism` | `no-raw-clock`, `no-raw-random` |
| `role-vocabulary` | `owner-role-split`, `two-class-role-authority` |
| `scrubber-home` | `scrubber-home`, `scrubber-factory-home` |
| `drizzle-schema` | `byte-check-cast` (+ wave 3's set) |

Partial credit where it is due: `no-raw-clock` names its shared reader in prose (*"the shared
`readAmbientInvocation` reader this policy shares with `no-raw-random`"*), and `scrubber-factory-home`
explains its split from `scrubber-home` at length. Neither uses the labelled form wave 2's family used,
and neither records a population port. **This is wave 3's D1 reproduced at 25/25 and it is now clearly
systemic rather than family-local** — it is the single property most likely to be copied forward, because
a lane copying a module with no FAMILY line has no example of one.

## §5b.3 — `fix` names the exact waiver spelling: 3 of 14

§5b.3 binds ORDINARY policies (a reviewed-grant or hard policy has no waiver for its `fix` to name), so
the denominator is the 14 origin-server modules, not 25. Three name it:
`no-await-db-in-loop`, `persistence-no-in-memory-state`, `test-mock-doctrine` — and all three do it well,
spelling the position placeholder (`@orb-waive no-await-db-in-loop(<the reported method>)`). The other
eleven fire on an author who is given no spelling to copy, in a family whose report anchor is deliberately
NOT what a reader would call the offense (`bounded-list-limit` anchors on the field name `limit`, never on
the unbounded chain that earned the finding). 3 of 14 is better than wave 6's 1 of 12 and worse than
wave 2's 7 of 7.

## Per-module verdicts

### home-server (full pass)

| # | Module | Verdict |
| -: | - | - |
| 1 | `bus-channel-primitive` | **REFUTED** — D1 (falsified unenforced `exportedName` half) + D5 (two dead branches); §4.3 is its one strength and it is the only policy that has it |
| 2 | `content-part-seam` | **REFUTED — worst of the family** — D6: two declared visitor kinds are structurally unreachable for a type-only symbol, and the header sells them |
| 3 | `no-direct-users-read` | **REFUTED** — one unenforced member-name half; no §4.3 pin (D7). Otherwise strong: home fence and fail-closed arm both proven |
| 4 | `no-raw-clock` | **REFUTED** — two unenforced prefilter halves; D4 dead `unreadable` arm; no §4.3 pin |
| 5 | `no-raw-random` | **REFUTED** — same two shapes as its family twin, one fewer arm; no §4.3 pin |
| 6 | `owner-role-split` | **REFUTED** — D8 (unpinned withholding); membership half mutually redundant, correctly classified |
| 7 | `scrubber-factory-home` | **REFUTED on §5b.5 ONLY** — 0 unenforced narrowings, both fences enforced in the right direction, receipt refusal pinned in the family test. The cleanest module in the wave and also the thinnest (no identity reader at all) |
| 8 | `scrubber-home` | **REFUTED** — one unenforced member-name half; two prefilters clean BY DESIGN (correctly exempted); no §4.3 pin despite a security-critical grant |
| 9 | `single-stream-transport` | **REFUTED** — D3: the whole fail-closed branch is dead; no §4.3 pin despite the ledger-is-the-grant-table header |
| 10 | `sole-env-reader` | **REFUTED — worst §4.1 record** — D2: the identity reader's resolved clauses are unenforced individually AND together; one falsified. The destructure arm and per-key grain are excellent |
| 11 | `two-class-role-authority` | **REFUTED on §5b.5 + §4.3** — the nearest miss; see below |

### origin-server (partial — §4.2, §4.1-expectations, §5b.1/3/4/5 only)

All 14 pass conformance, all 14 carry `count` on every `mustFlag` row, all 14 carry a `token` on every
`mustFlag` row, and all 14 §4.2 arms discriminate. All 14 fail §5b.5 (D-systemic); 11 of 14 fail §5b.3.
**No origin-server module received a §4.1 narrowing sweep or a third-answer reachability probe**, so none
of them can be called CONFIRMED or REFUTED on those axes by this document, and I am not assigning them a
verdict I did not earn.

## The COPY candidate

**The nearest miss is `two-class-role-authority`, and it does not clear the bar as it stands.**

For it: 9 `mustFlag` / 9 `mustPass`, all with `count`; the largest proof set in the family. Four of its six
narrowings are individually enforced, including the two that carry the whole policy — the
ENFORCEMENT-POSITION fence (5 rows red) and the one-level-deep `throws` scan (2 rows red) — and the
`conditionRoot` boolean-plumbing walk (2 rows red). Its fifth is correctly MUTUALLY REDUNDANT with the
axis fence, confirmed by the paired cut. Its §4.5 receipt-withholding is pinned in the family test in both
directions (absent vocabulary and relocated vocabulary), which is the pin `owner-role-split` lacks. Its
header states three declared limits explicitly rather than leaving them implied.

Against it: no §5b.5 FAMILY / population-port line (with everything else in the corpus); **no §4.3 grant
pin**, which for a reviewed-grant policy is the one thing a module row structurally cannot carry; and one
genuinely unenforced narrowing (the `parent.getExpression() !== root` condition-identity fence).

`scrubber-factory-home` is the only module with a clean §4.1 sheet, but it is a 106-line completeness
policy with no identity reader, so "copy this" teaches a lane almost nothing about the hard part.

**So: no module in this wave survives the sentence "point a conversion lane at this and tell it to copy."**
Two small additions would make `two-class-role-authority` the first that does — a §4.3 grant-identity block
in the family test (copyable verbatim from the `bus-channel-primitive` block already in the same file) and
a §5b.5 header paragraph.

## What I did NOT cover

- **`origin-server`'s §4.1 narrowing cuts and §4.5/§944 reachability probes — all 14 modules.** This is
  the largest gap and the obvious wave 9. The census, the §4.2 sweep and the expectation table ARE
  complete for them.
- **`origin-server` per-module verdicts.** Not assigned; see above.
- **§5b.7** (a private reader, walk, cache or scope predicate smuggled into a `lib/` helper only one
  module calls). Not audited in either family.
- **§4.6 conversion differentials.** Not replayed for any module; no legacy SHA was loaded.
- **Real-tree behaviour.** Every probe in this document runs a module's DECLARED ROWS through
  `verifyPolicyProofs`. The only real-tree evidence is the single `pnpm check:structure` floor, which
  establishes that nothing is withheld or tool-erroring — not that any arm fires on live code.
- **`byte-check-cast`'s schema-fact receipt routing.** Wave 3 measured it; I did not re-derive it.
- **`two-class-role-authority`'s "all three are zero-instance on this tree" claim.** Its header asserts
  that its three declared limits have no live instances; I did not count them.
- **`gate-ignore-grammar.repo.int` and `gate-conformance.repo.int`** — reserved to the orchestrator, not
  run.

## Durable lessons proposed (the orchestrator owns the memory write)

- **`visitor-kind-set-follows-value-vs-type`** — A sealed-symbol policy's visitor KIND tuple is a function
  of whether the sealed symbol is a VALUE or a TYPE. `PropertyAccessExpression` / `ElementAccessExpression`
  are value-position nodes, so a `export type` seal can never produce one and the member arm is
  structurally dead — even though the identical tuple is live in a sibling policy sealing a `const`.
  Copying the tuple across without asking which it is ships a dead arm plus a header paragraph selling it
  (`content-part-seam` vs `no-direct-users-read` / `scrubber-home`, #1584).
- **`reviewed-grant-identity-has-no-module-row-home`** — `runPass` pins `reviewedGrants: []`, so a
  reviewed-grant policy's `(subject, operation)` grain, STALE alarm and over-broad behaviour cannot be
  proven by ANY module row; the pin only exists if the family test has a grant block. Census the family
  test by policy id, not by reading its header — `home-server-family.suite.test.ts` claims grant liveness for
  "every policy here" and has it for one of ten.
- **`widening-a-home-fence-is-the-wrong-direction`** — For a fence that DEFINES a policy's population or
  home (`isHomeFile`, a path infix used to build the subject set), widening it makes the policy flag LESS
  and the clean cut is meaningless. Narrow it to nothing instead; `scrubber-factory-home` reads unenforced
  under the widening cut and REDs 5 rows under the narrowing one.
