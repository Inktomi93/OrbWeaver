---
kind: review
status: active
updated: 2026-09-12
---

# `cb-v-hooks-wave` — fresh-context verification of the four #1584 mixed-hook merges

Lane `cb-v-hooks-wave`, 2026-09-12, on quiet `main` at `a182d1fab` (engines down, prod down, sole load).
Every number below is a run this lane produced in this session. Nothing is re-quoted from a commit
message, a design doc or the landing comment; where a lane's claim could not be reproduced the report
says so rather than inheriting it.

## Verdicts

| commit | lane | verdict |
| - | - | - |
| `aebf416fc` | `p-hooks-split` — `testid-liveness` + `ui-variant-axes-stamped` splits | **CONFIRMED** |
| `7b80f66a4` + `35afe3fa8` + `c19da53c3` | `f-mixed-hooks` group 4 — `tooling-shared-plumbing` → ten policies | **CONFIRMED** |
| `ac0085c91` | `p-hooks-single` — `agent-bridge-lock`, `design-audit-rule-proof`, `tooling-instrument-proof` | **REFUTED** (two independent real-tree defects) |
| `4ed5a94d5` | `p-union-redecl` — `no-inline-union-redecl` → one ordinary policy | **CONFIRMED**, with one recorded caveat |

## A. The mandatory real-tree run

`pnpm -s check:structure`, once, on quiet `main`. Run slot
`reports/runs/structure/main-2274575-2026-09-12T11-53-23-745Z/`. Wall 125 s final pass / 111 s
single pass. `EXIT=1` — the legacy product backlog, baseline by construction, not laundered.

The two numbers the guide asks for:

```
final policies: 237 ran · raw 2220 = waived 1177 + granted 131 + effective 912 (857 error, 55 warning)
                · 0 alarm(s) · 0 tool error(s) · 0 withheld
single-pass: ran 297/297 active gate(s) (60/60 legacy · 237/237 final) of 297 corpus file(s) — run COMPLETE
```

**`0 tool error(s)` · `0 withheld`.** All eighteen policies this wave produced RAN and none is withheld:

| policy | verdict line |
| - | - |
| `testid-liveness` | ✓ ordinary/error · population 6303 |
| `testid-liveness-health` | ✓ hard/error · population 1 |
| `ui-variant-axes-stamped` | ✓ hard/error · population 366 |
| `ui-variant-axes-stamped-health` | ✓ hard/error · population 1 |
| `tooling-project-home` | ✓ reviewed-grant · granted 9 |
| `tooling-browser-door` | ✓ reviewed-grant · granted 2 |
| `tooling-child-process-door` | ✓ reviewed-grant · granted 5 |
| `tooling-artifact-path-home` | ✓ reviewed-grant · granted 1 |
| `tooling-artifact-run-slot` | ✓ hard · 2 + 1 home receipts |
| `tooling-process-exit-home` | ✓ reviewed-grant · granted 1 |
| `tooling-cli-entry` | ✓ hard · population 16 |
| `tooling-port-registry` | ✓ reviewed-grant · granted 1 |
| `tooling-clock-budget` | ✓ ordinary · **waived 1** |
| `tooling-runner-config-literals` | ✓ hard/resource · 3 resources |
| `agent-bridge-lock` | ✓ hard · population 1320 |
| `design-audit-rule-proof` | **✗ (1)** — see D1 |
| `tooling-instrument-proof` | **✗ (654)** — see D2 |
| `no-inline-union-redecl` | ✗ (15) — see the caveat |

Noted and NOT adjudicated: `integer-line-boxes` reports 4 (the #2043 SVG-text false positives).

### The pre/post control this run made possible

`reports/runs/structure/` still holds a PRE-wave `main` run — `main-152313-2026-09-12T02-44-32-393Z`,
`checkout: main`, `corpusFiles 275`, legacy 103 / final 172 — against this run's `corpusFiles 297`,
legacy 60 / final 237. That pair is a two-sided real-tree differential for the whole wave, which is the
arm two of the four merges never ran:

| policy | pre-wave (legacy descriptor) | post-wave (final policy) |
| - | -: | -: |
| `testid-liveness` (+ `-health`) | 0 | 0 (+ 0) |
| `ui-variant-axes-stamped` (+ `-health`) | 0 | 0 (+ 0) |
| `tooling-shared-plumbing` → ten policies | 12 | 0 across all ten |
| `agent-bridge-lock` | 0 | 0 |
| `design-audit-rule-proof` | 0 | **1** |
| `tooling-instrument-proof` | 0 | **654** |
| `no-inline-union-redecl` | 9 | 15 |
| whole-run `blocking` | 66 | **857** |

## REFUTED — `ac0085c91`

### D1. `tooling-instrument-proof` — 0 → 654 unsuppressible false positives on the real tree

**Expected:** a HARD policy whose subject is the instrument-proof contract, reporting what the legacy
descriptor reported (0 on this tree). **Actual:** 654 `error` findings across 67 files, anchored on
built-in globals. Token census of the 654: `String` 259, `JSON` 89, `Promise` 78, `Number` 48,
`Math` 39, `Object` 29, `Date` 27, `Array` 13 — **582 of 654 are ambient JavaScript globals**. Worst
file `tooling/src/snap/ops/run-report-render.ts` at 45.

Sample verbatim from the run:

```
✗ tooling-instrument-proof (654)  ·  final hard/error · population 1620 source
    tooling/src/cpu-profile/ops/report.ts:35:24  Math
    tooling/src/cpu-profile/ops/report.ts:43:19  Number
    tooling/src/cpu-profile/ops/report.ts:55:19  String
```

**Mechanism, read off the code.** Arm F's `CallExpression` visitor
(`tooling/src/verify/gates/tooling-instrument-proof.ts`) classifies EVERY call in a registered
instrument file that imports the artifacts specifier:

```ts
const verdict = classifyProjectHomeOrigin(callee, artifactsHome());
if (verdict === "unreadable") { unjudgedCalls.push({ node, tool }); }   // → a finding
```

`classifyProjectHomeOrigin` (`lib/project-home-origin.ts`) routes through
`resolveModuleMemberOrigin` — the MODULE-member reader. An ambient global has no module origin, so it
returns `unresolved` and `classifyOriginRefusal` answers `unreadable`, which arm F reports as *"arm F is
UNJUDGED here, which is never a pass"*. The repo has the correct reader for this shape one function
away in the same file (`resolveGlobalMemberOrigin`, used by `readsAmbientGlobalPath`).

**Why every green stayed green.** The legacy arm (`ac0085c91^`, `:126-171`) only pushed a candidate when
`isPrintResultCall(...)` matched a binding SPELLED `printResult`; no builtin can qualify. The
conversion's conformance rows and its committed §4.6 differential
(`mixed-hook-singletons-conversion.test.ts`, 34 legacy examples on a real tmpdir) all pass — none of
those 34 fixtures calls `String(...)`, `JSON.stringify(...)` or `Math.round(...)` inside an instrument
file that imports the artifacts door. This is §5b's blind spot exactly, in the over-reporting direction.

**Fix spec.** In arm F's visitor, resolve an ambient-global callee BEFORE the module reader and classify
it `other` (or fence the candidate set to callees whose root is not an ambient global) — the `unreadable`
third answer must mean *a module reference this policy could not place*, never *a language builtin*.
Then land a `mustPass` row whose instrument fixture imports the artifacts door AND calls
`JSON.stringify` / `String` / `Math.round`, so the row dies if the fence is removed. The 654 must be 0
on `check:structure` before this module is Done.

### D2. `design-audit-rule-proof` — the converted policy is BLIND on the real tree

**Expected:** the per-rule proof denominator enforced over the live registry (62 rule ids ×
`fires`/`silent`). **Actual:** exactly ONE finding, and it is the blindness tripwire:

```
tooling/src/ui-audit/contract/rules.ts:1:1
  … zero-population design-audit registry — no rule ids were readable from DESIGN_AUDIT_RULES …
```

`registry.size === 0` on a registry that is 62 authored `{ id, family, severity }` rows
(`tests/tooling/ui-audit/index.test.ts:99` asserts `toHaveLength(62)`). So the gate's actual job — every
registered rule owing both executable proofs — is enforcing **nothing** on this tree, while the legacy
descriptor reported 0 findings, i.e. it read the registry and found the denominator complete.

**Mechanism.** The registry visitor gates on
`resolveAuthoredComposite(initializer)` resolving to an `ArrayLiteralExpression`.
`resolveAuthoredComposite` (`lib/static-authored-value.ts:255-272`) calls `explicitCompositeRefusal`,
which refuses with `reason: "dynamic"` when `invokedMemberThroughAliases` finds an invoked member on the
BINDING. `tooling/src/ui-audit/contract/rules.ts:93` is:

```ts
export const DESIGN_AUDIT_RULE_IDS: readonly DesignAuditRuleId[] = DESIGN_AUDIT_RULES.map((rule) => rule.id);
```

— an invoked member on `DESIGN_AUDIT_RULES`, three lines below the array. The refusal is about the
binding's downstream USE, which is irrelevant to reading an authored literal in place. The module's own
fixtures (`ONE_RULE`) declare the array with no consumer, so every conformance row resolves.

**Fix spec.** Read the registry initializer directly — unwrap `as`/`satisfies`/parentheses and take the
`ArrayLiteralExpression`, the way the legacy `lib/ast-read.ts` path did — instead of routing it through
`resolveAuthoredComposite`'s write/invocation refusal. Add a `mustPass` row whose registry fixture
carries a sibling `export const IDS = REGISTRY.map(...)` in the SAME file: that row is red today and
green after the fix, and it is the fixture shape the real tree has.

### What D1 and D2 have in common — the missing arm

`ac0085c91`'s floor names `mixed-hook-singletons{,-conversion}`, `absent-subject-anchor`,
`enforcement-registry-parity`, `verify/ops/conformance.int`, `verify/lib/loader`, `gate:contract`,
`check:policy-conformance`, biome/eslint/typecheck/check:docs. It does **not** name
`pnpm check:structure`, which guide §8.8 puts in the per-conversion floor and §5b calls the only
instrument that asks the question. Its §4.6 differential is fixture-level ONLY: no real-corpus arm for
any of the three modules. Both defects live precisely in the gap.

`agent-bridge-lock`, the third module in the same commit, is clean (0 findings pre and post) and its
proofs re-run green; the REFUTED verdict is for the commit, not for all three modules.

## CONFIRMED — `aebf416fc` (`p-hooks-split`)

- **Arity amendment 1 is TRUE on the tree.** `git show aebf416fc^:tooling/src/verify/gates/ui-variant-axes-stamped.baseline.json`
  is `{}` — **3 bytes**. History is exactly three commits (`da01f7eb9` mint → `fc5f99e4c` drain →
  `aebf416fc` delete). So there were zero rows to convert into warning debt and the amendment stands.
- **Marker census 0 = 0 = 0, measured.** `git grep -c '@orb-gate-ignore testid-liveness'` and
  `… ui-variant-axes-stamped` at `aebf416fc^` over tracked `*.ts`/`*.tsx` (gate self-quotes and engine
  fixtures excluded) → no lines. **Planted positive control in the same invocation:** the same sweep
  enumerated 42 marker-bearing lines for other ids (`baseui-derives-not-respells` 12, `real-gate` 11,
  `line-scan-probe` 9 …), so the instrument measured rather than failed. Current `@orb-waive` for both
  ids: 0 (control: 1,619 `@orb-waive` lines tree-wide).
- **Both legacy real-tree anchors retired**, and both `-health` populations are the home itself
  (`population 1 source` for each in the structure run) — the population-phase refusal is the mechanism,
  as claimed.
- **Real-corpus differential both sides zero at 6296 / 366**: reproduced in direction — the pre/post
  control above shows 0 → 0 for both ids. Correctly recorded by the lane as vacuity shape 1; the
  evidential differential is the committed fixture replay, whose legacy side EXECUTED and was NONZERO
  (3 consumer findings, 1 dead row, 1 tripwire red, asserted per example) and whose `-health` arm carries
  its PER-EXAMPLE zero-legacy-coverage statement with four constructed successor rows. That satisfies
  §4.6's split rule.
- **§4.1 re-cut, two cells, both ENFORCED** (see the cut table below).
- Roster rows read as MECHANISMS, not coordinates.

## CONFIRMED — `7b80f66a4` + `35afe3fa8` + `c19da53c3` (`f-mixed-hooks` group 4)

- **All 19 new reviewed grants are consumed exactly once on the real tree, measured by my own
  `check:structure`:** `tooling-project-home` granted 9, `tooling-browser-door` 2,
  `tooling-child-process-door` 5, `tooling-artifact-path-home` 1, `tooling-process-exit-home` 1,
  `tooling-port-registry` 1 = **19**, with `0 alarm(s)` run-wide (a stale row is an alarm, an over-broad
  row is an alarm; there are none) and 0 effective findings on all ten policies. The three rows the
  legacy census "never listed" — `ops/conformance`, `spelling-twins`, `ops/policy-conformance` — are
  inside `tooling-project-home`'s 9 and therefore all consumed; none is stale on arrival.
- **The `tool-guard.int` waiver binds:** `tooling-clock-budget … waived 1` in the run, and the marker is
  at `tests/tooling/tool-guard.int.test.ts:738`, the line immediately above the `timeout: 120_000` it
  names.
- **Red-first 13 → 0, corroborated rather than replayed.** I did NOT probe-copy the eleven pre-fix files
  back (see WHAT I DID NOT COVER). What I did measure: the ten policies report **0** effective findings
  on this tree, the legacy `tooling-shared-plumbing` reported **12** on pre-wave `main`, and the family
  test's own real-tree arm re-ran green in my floors run.
- **The drift fixes preserve quiet-box values, proven from the code, not the message.**
  `budget(base) = max(base, min(budgetCeilingMs(), ceil(base × computeLoadFactor(...))))`
  (`tooling/src/_shared/load-budget.ts:189-193`) and
  `computeLoadFactor = min(cap, max(1, loadavg1 / cpuCount))` (`:163-168`) — factor is exactly 1 below
  per-core 1.0, and every base in the nine replacements (300 000 / 120 000 / 60 000 / 30 000 / 180 000 /
  15 000) is ≤ the 600 000 default ceiling, so each returns its base unchanged. `ORB_DEDICATED_BOX` does
  not appear anywhere in `budget`'s path — it is a runner-concurrency switch, not a budget input — so
  `playwright.config.ts`'s three replacements are behaviour-identical with it unset.
- **§4.1 re-cut, three cells, all ENFORCED** including one in a split family driven against the named
  policy (below).
- **`enforcement-registry-parity` 12/12** in my floors run, with the roster count line at 297 matching
  the 297-module corpus the structure run loaded.

## CONFIRMED (with a caveat) — `4ed5a94d5` (`p-union-redecl`)

- **Arity amendment is TRUE on the tree.** `git show 4ed5a94d5^:…/no-inline-union-redecl.ts:28` is
  `const FILE_CLASS_EXEMPT: ExemptionTable = {};` — literally empty, with the stale-row sweep at `:327`
  iterating nothing. The ruled reviewed-grant and grant-health policies would have had no subject.
- **Catch-neutrality holds at every site I can compare.** All **9** sites the pre-wave `main` run
  recorded for the legacy descriptor appear at **byte-identical `file:line`** in the post-wave run
  (`policy-loader.test.ts:19,21` · `resource-declaration.test.ts:13` · `contract/bus-fact.ts:64` ·
  `contract/ordinary-waiver.ts:12` · `lib/caught-failure.ts:592` · `lib/project-home-origin.ts:37` ·
  `lib/react-origin.ts:31` · `lib/role-vocabulary.ts:103`), now carrying authored position tokens where
  the legacy carried none.
- **§4.1 re-cut, three of the thirteen, all ENFORCED** (below).
- **The §4.2 identity arm DISCRIMINATES, both arms** (below).

**CAVEAT, not a refutation.** The commit claims *"legacy 12 and final 12 with IDENTICAL file:line
sites"*. On `main` the policy reports **15**. The extra six are all declarations minted by the #1584
program itself, in the same `"<x>" | "other" | "unreadable"` verdict-alias shape:

| new site | minted by |
| - | - |
| `lib/artifact-filing.ts:35 PathCalleeVerdict` | `7b80f66a4` — **this wave** |
| `tests/tooling/verify/gates/tooling-plumbing-family.test.ts:539 LegacyArm` | `35afe3fa8` — **this wave** |
| `tests/tooling/verify/gates/mixed-hook-singletons-conversion.test.ts:130 Delta` | `ac0085c91` — **this wave** |
| `lib/id-brand.ts:67 KitIdCallVerdict` | `250c9eb60` |
| `lib/broadcast-channel-origin.ts:34 BroadcastChannelVerdict` | `f1bbc34e7` |
| `lib/process-member-origin.ts:29 ProcessMemberVerdict` | `e2b183b80` |

Owner law is *gates land on a FIXED tree*. Three of the six are this wave's own commits, and the shared
`ProjectHomeVerdict`/`ProcessMemberVerdict`/… axis is a genuine one-home candidate. This is a row to
file, not a reason to hold the conversion.

## The re-measured §4.1 cuts (item F)

Method: a sibling scratch module in the SAME directory, the cut anchor asserted to occur **exactly
once**, `rmSync` in a `finally`, one fresh process per cut, driven through `verifyPolicyProofs`. A `lib/`
cut also copies the GATE with its quoted import specifier rewritten (rewrite count printed), because in a
split family the module under test is the POLICY. Harness control: a no-op cut on both a gate and a lib
returns `ROWS_DIED=0`.

| # | policy driven | fence cut | direction | rows died | lane said | verdict |
| -: | - | - | - | -: | - | - |
| 1 | `no-inline-union-redecl` | the `@showcase` population root, dropped | fewer | 1 (`mustFlag[6]`) | ENFORCED | reproduced |
| 2 | `no-inline-union-redecl` | `lib` `ALIAS_MIN_MEMBERS` 3 → 1 | MORE | 1 (`mustPass[0]`) | ENFORCED | reproduced |
| 3 | `no-inline-union-redecl` | `lib` D54 `ui`↛`contracts` clause, opened | MORE | 1 (`mustPass[5]`) | ENFORCED | reproduced |
| 4 | `tooling-process-exit-home` | `EXIT_MEMBER` `exit` → `exitCode` | different-name | 5 (`mustFlag[0..4]`) | `mustFlag[0..4]` | reproduced exactly |
| 5 | `tooling-port-registry` | `lib` `portLiteralOf`'s registry-VALUE half, dropped | fewer | 3 (`mustFlag[0]`,`[1]`,`[5]`) | same three | reproduced exactly |
| 6 | `testid-liveness-health` | `lib` `TEST_IDS` owner-name fence, OPENED | inverted | 1 (`mustFlag[0]`) | ENFORCED | reproduced |
| 7 | `ui-variant-axes-stamped-health` | `lib` `AXIS_TUPLE_NAME` fence, OPENED | inverted | 1 (`mustFlag[0]`) | ENFORCED | reproduced |

**No cell was refuted.** I also reproduced the wave's own recorded split-family false clean, twice and
deliberately: cut 5 driven against the WRONG sibling (`tooling-clock-budget`) reports `ROWS_DIED=0`, and
cut 6 driven against the WRONG sibling (`testid-liveness`) reports `ROWS_DIED=0`. The rule *a clean cut
in a split family owes the POLICY NAME it was driven against* is live and load-bearing on this corpus.

## The §4.2 identity arms (item G)

All three ordinary policies assert all three components (`effectiveFindings []`, `waivedFindings 1`,
`authorityAlarms []`). `testid-liveness` already ships its dead-position discrimination control in-tree
(`testid-variant-split-family.test.ts:126-132`); the other two did not, so I flipped the marker position
in a `cp`-backed copy of the two REAL test files (announced to the orchestrator before and after; both
restored, `git status --short` empty):

| policy | flip | result |
| - | - | - |
| `tooling-clock-budget` | `(30_000)` → `(45_000)` | `ordinary waiver at tooling/src/ui-audit/ops/walk.ts:1:1 names a dead position for tooling-clock-budget` — 1 test failed |
| `no-inline-union-redecl` arm A | `(Mode)` → `(Nope)` | `… names a dead position for no-inline-union-redecl` — failed |
| `no-inline-union-redecl` arm B | `('a' \| 'b' \| 'c')` → `('x' \| 'y' \| 'z')` | `… names a dead position` — failed |

All three DISCRIMINATE. Restored and re-run green.

## "Ordinary is a claim about the door" (item K)

| policy | `report.node` position | `fix` names it | authored text at the coordinate |
| - | - | - | - |
| `testid-liveness` | `firstAnchor(reported, [anchor])` — the whole authored literal | yes, with three worked spellings | yes; `undefined` falls back to the derived token rather than throwing |
| `tooling-clock-budget` | `{ token: clock.literal.getText(), offset: 0 }` on the NUMERIC LITERAL | yes, `@orb-waive tooling-clock-budget(<literal>)` | yes — and the live waiver at `tool-guard.int.test.ts:738` BINDS (`waived 1` in the run) |
| `no-inline-union-redecl` | alias NAME (arm A) / the inline SET's own text (arm B), via `firstAnchor` | yes, both spellings, in the run's own `fix` line | yes; a newline-spanning set falls back to the first member literal |

No paren, no comment trivia, no synthetic label in any of the three.

## The floors, re-driven (item B)

```
pnpm test:scoped  testid-variant-split-family · tooling-plumbing-family · mixed-hook-singletons
                · mixed-hook-singletons-conversion · union-axis-family · absent-subject-anchor
                · enforcement-registry-parity.int · reviewed-grants
Test Files  8 passed (8)
     Tests  54 passed (54)
Type Errors  no errors      EXIT=0
```

Artifact `reports/runs/test/main-2300124-2026-09-12T12-01-28-439Z/test-report.json`. Per file:
`testid-variant-split-family` 10, `tooling-plumbing-family` 17, `enforcement-registry-parity` 12,
`union-axis-family` 5, `absent-subject-anchor` 4, `reviewed-grants` 3,
`mixed-hook-singletons-conversion` 2, `mixed-hook-singletons` 1.

**Read this result against D1/D2:** `mixed-hook-singletons-conversion`'s differential is GREEN while the
two policies it certifies are 654-false-positive and blind on the real tree. A fixture-level differential
that replays only the legacy examples cannot see either defect, by construction.

## Marker reconciliation (item H)

Legacy `@orb-gate-ignore <id>` counts at each pre-conversion SHA, over tracked `*.ts`/`*.tsx`, excluding
`verify/gates/**`, `verify/lib/**`, `tests/tooling/gate-ignore-grammar*`, `tests/tooling/verify/lib/**`:

| legacy id | pre-SHA | legacy | current `@orb-waive` on the successor id(s) | class |
| - | - | -: | -: | - |
| `testid-liveness` | `aebf416fc^` | 0 | 0 | clean |
| `ui-variant-axes-stamped` | `aebf416fc^` | 0 | 0 | clean |
| `tooling-shared-plumbing` | `7b80f66a4^` | 0 | 1 (`tooling-clock-budget`) | `current > legacy` — the §4.6 category-5 exemption-mechanism move (a `CLOCK_SITES` table row became a waiver), bound and consumed |
| `agent-bridge-lock` | `ac0085c91^` | 0 | 0 | clean |
| `design-audit-rule-proof` | `ac0085c91^` | 0 | 0 | clean |
| `tooling-instrument-proof` | `ac0085c91^` | 0 | 0 | clean |
| `no-inline-union-redecl` | `4ed5a94d5^` | 0 | 0 | clean |

**No file anywhere has `current < legacy`**, so there is no LOST-SUPPRESSION candidate in the wave.
Positive control for the census instrument, taken in the same invocation: 42 marker-bearing lines for
other gate ids at `aebf416fc^`.

## The differentials, judged by the §4.6 rules (item E)

| conversion | what was compared | legacy side executed & nonzero? | own population applied? | per-example split coverage? | verdict |
| - | - | - | - | - | - |
| `testid-liveness` pair | findings + positions (containment) + a measured population-port equality + population-phase tool errors | yes — 3 consumer findings, 1 dead row, 1 tripwire red | yes | yes, stated per example | sufficient |
| `ui-variant-axes-stamped` pair | findings + positions (byte-identical) + the retired-A4 assertion | yes — 4 recipe findings (A1×1, A2×1, A3×2) | yes | yes — A5's ZERO legacy coverage asserted per example, successor = 4 constructed rows | sufficient |
| plumbing ten | findings over 36 legacy examples with per-arm coverage, PLUS a real-workspace run with the central grant table (populations printed per policy), PLUS a red-first over the pre-fix tree | yes — every arm the descriptor carried | yes | n/a (no vacuous `-health` cell) | **strongest in the wave** |
| mixed-hook singletons | findings over 34 legacy examples on a real tmpdir; 8 classified anchor moves | yes | yes, for the FIXTURES | n/a | **insufficient — no real-corpus arm, and both D1 and D2 live there** |
| `no-inline-union-redecl` | findings over 10 legacy examples (5 flag) + one classified POSITION/TOKEN move; a real-tree 12=12 claim | yes | yes | n/a | sufficient; the real-tree number is 15 on `main` (caveat above) |

None of the five replays measured its own proof fixtures (the #2033 trap): each drives `runPolicyPass`
with the policy's declared population, and the plumbing and union-redecl records print their populations.

## The roster coupled site (item I)

`enforcement-registry-parity` 12/12 green in my floors run, and its count line (297) equals the corpus
the structure run loaded (297 files, 60 legacy + 237 final). I read all eighteen new/rewritten rows: each
names MECHANISMS — `lib/project-home-origin.ts#readPackageExportOrigin`,
`lib/plumbing-literals.ts#portLiteralOf`, `#fixedClockOf`, `#runnerConfigLiteralFacts`,
`lib/caught-failure.ts`'s anchor contract, `lib/testid-registry.ts`, `lib/variant-axis-stamp.ts`,
`lib/union-axis.ts`, `lib/absent-subject-anchor.ts` — not `file:line` coordinates into a gate module and
not deleted helper names. Every named symbol resolves in its module (`grep -c` per pair, all ≥ 1;
`absent-subject-anchor` has three gate importers plus its spec). **No false row found.**

## WHAT I DID NOT COVER

This CONFIRMED covers what is measured above and nothing its own disclaimers exclude.

1. **I did not probe-copy the eleven pre-fix files from `b6a4e012d` back onto `main`** and so did not
   independently reproduce the plumbing lane's `13 effective findings` red-first number. I corroborated
   its two endpoints only (legacy 12 pre-wave; ten policies at 0 post-wave). The specific composition of
   the 13 — 8 clocks + the un-waived tool-guard row + 3 `playwright.config.ts` clocks + `model-ab` — is
   UNVERIFIED by me.
2. **I sampled 7 of roughly 44 recorded §4.1 cells** (3 of `no-inline-union-redecl`'s 13, 2 of the
   plumbing 19, 1 fence in each `-health`). The other ~37 are unverified. A refutation could be hiding in
   any of them.
3. **I did not re-derive the population-port byte-identity claims** (`testid-liveness`'s admitted-set
   equality, `no-inline-union-redecl`'s 7,165 = 7,165 symmetric-difference-zero). I read the measured
   equality test's PASS in the floors run, which is the lane's own instrument, not mine.
4. **`agent-bridge-lock`, `tooling-cli-entry`, `tooling-artifact-run-slot`, `tooling-runner-config-literals`,
   `tooling-browser-door`, `tooling-child-process-door` were verified only at the run level** (ran, 0
   findings, receipts filed, grants consumed) plus their proof rows through the family tests. I did not
   read all ten plumbing modules line by line, and I did not audit any of the eighteen against §5b's
   seven-point PRISTINE bar.
5. **`gate-conformance.repo.int`, `gate-ignore-grammar.repo.int`, `check-gates.repo.int` were not run**
   (orchestrator-only, per the brief). The three `__g_` fixture-block deletions in
   `check-gates.repo.int.test.ts` are therefore unexercised by me.
6. **I did not run `pnpm verify --push`, the CT suites, or the product node tests.** Nothing in this wave
   touches product code, but that is an argument, not a receipt.
7. **The pre/post structure comparison uses `main-152313-2026-09-12T02-44-32-393Z` as the pre-wave
   baseline.** It is `checkout: main` at `corpusFiles 275`, which brackets the wave, but I did not pin it
   to an exact SHA. It bounds the direction of every delta above; it does not attribute a delta to one
   commit on its own — the attributions in D1/D2 rest on reading the legacy code, which I did.
8. **`integer-line-boxes`'s 4 findings are noted, not adjudicated** (#2043), per the brief.

## Proposed lessons (orchestrator owns the write)

**1. `docs/architecture/history/…` index line:**
`- [fixture differential can't see a real-tree explosion](fixture-differential-blind-to-real-tree-explosion.md) — a §4.6 replay of the legacy EXAMPLES passed while the same policy went 0 → 654 on the tree`

Body: A conversion whose §4.6 differential is fixture-level ONLY certifies that the new code agrees with
the old code *on the shapes the old author wrote fixtures for*. `tooling-instrument-proof`'s 34-example
replay on a real tmpdir was identical on both engines and the policy still went from 0 to 654
unsuppressible findings on `main`, because no legacy fixture called a JavaScript builtin inside an
instrument file. The differential that would have caught it costs one command. **A conversion floor that
omits `pnpm check:structure` has not measured the thing conversion is most likely to break** — make the
real-corpus arm non-optional for any policy whose subject is a whole tree, and read the two numbers
before AND after.

**2. index line:**
`- [a fail-closed "unreadable" arm needs the right reader for ambient globals](fail-closed-arm-needs-the-global-reader.md) — resolveModuleMemberOrigin answers "unreadable" for String/JSON/Math`

Body: `classifyProjectHomeOrigin`, `classifyProjectDirectoryOrigin` and every reader built on
`resolveModuleMemberOrigin` answer `unreadable` for an ambient global, because a global has no module
origin. A policy that reports its `unreadable` third answer and classifies EVERY call in a file will
therefore report every `String(...)`, `JSON.stringify(...)` and `Math.round(...)` it sees. The correct
pairing is `resolveGlobalMemberOrigin` (or `readsAmbientGlobalPath`) first, then the module reader; the
\#944 third answer must mean *a module reference I could not place*. Any new arm that classifies an
unfiltered `CallExpression` population owes a `mustPass` row that calls a builtin.

**3. index line:**
`- [resolveAuthoredComposite refuses on the binding's DOWNSTREAM use](authored-composite-refuses-on-downstream-use.md) — one `.map()` three lines below the array blinds a registry read`

Body: `resolveAuthoredComposite` (`lib/static-authored-value.ts:255`) runs `explicitCompositeRefusal`,
which refuses `dynamic` when any REFERENCE to the binding has an invoked member. So
`export const IDS = REGISTRY.map(r => r.id);` beside the array makes `REGISTRY` unreadable — even though
the literal itself is perfectly authored. That is right for a value whose CONTENT must be trusted at a
distance and wrong for reading an authored literal in place. `design-audit-rule-proof` shipped blind on a
62-row registry for exactly this. **When a gate reads a registry in its own declaring file, unwrap the
initializer directly, and give it a fixture with a sibling consumer** — a fixture whose array has no
other reference is a fixture that cannot reach the refusal.

**4. index line:**
`- [a program's own new readers violate the gates it just converted](program-readers-violate-their-own-gate.md) — six `"<x>" | "other" | "unreadable"` verdict aliases`

Body: #1584's shared readers each declare a private
`export type <X>Verdict = "<hit>" | "other" | "unreadable";`. Six of them now flag
`no-inline-union-redecl` on `main`, three minted by the same wave that converted it. When a program mints
a repeated 3-member axis across new `lib/` modules, that axis is a one-home candidate and the converted
gate will say so — check the gate you just converted against the code the conversion itself added.

## Tree state

```
$ git -C /home/inktomi/inktomi-stack/development/orbweaver status --short
?? docs/reviews/gate-runtime/v-hooks-wave-2026-09-12.md
```

Nothing staged, nothing committed, every probe restored.
