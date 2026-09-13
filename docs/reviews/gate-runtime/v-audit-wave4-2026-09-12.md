---
kind: review
status: active
updated: 2026-09-12
---

# v-audit-wave4 — the raw-CSS / token-surface family against §5b PRISTINE (#1584)

Read-only adversarial audit of the ten modules the orchestrator named as the raw-CSS / token-surface family,
held to [`gate-runtime-standardization.md`](../../design/gate-runtime-standardization.md) §5b's seven criteria
and §4's proof rules. Method, verdict-block format and the three-bucket clean-cut classification are copied
from [`v-audit-wave2-2026-09-12.md`](v-audit-wave2-2026-09-12.md), so wave 2 and wave 4 are comparable.
Every number below came out of a run produced in this session, in an isolated worktree at `b4714536d`.

## Headline

**Nine of the ten are FINAL; the tenth is LEGACY and §5b does not bind it.** All nine pass conformance. All
nine are REFUTED, and this family is markedly WORSE than wave 2's on the two criteria that matter most for
copying — the narrowing pins and the identity arms.

| Property | Wave 1 (10 exemplars) | Wave 2 (7 final) | **Wave 4 (9 final)** |
| - | -: | -: | -: |
| §4.1 narrowings genuinely UNENFORCED | 12 of 30 (40%, unsplit) | 5 of 30 (17%) | **10 of 31 (32%)**, each with a built falsifier |
| §4.2 identity arm present at all | 10 of 10 | 7 of 7 | **6 of 9** — three ordinary policies have NONE, anywhere |
| `fix` names the exact waiver spelling (§5b.3) | — | 7 of 7 | **4 of 8 ordinary** |
| `mustFlag` rows with no `count` | 2 of 33 | 0 of 45 | **10 of 36** (all in one module; derived count = 1 for all ten) |
| Discriminators that survive a sibling-arm transplant | 5 of 8 | 6 of 6 | **21 of 22** — the one failure is `no-color-literals` |
| Header records a POPULATION PORT | — | 6 of 7 | **1 of 9** (and that one states it inline at the field) |
| Roster rows accurate | 3 of 8 | 3 of 8 | **2 of 9** |
| §4.5 refusal / receipt pins | 5 of 7 | 5 of 7 | **1 of 9** (`no-tailwind-dark-variant` only) |
| `ctx.relativePath` #1972 exposure | 1 live | 5 reproduced | **0 — checked, clean, receipt below** |

| # | Module | Verdict |
| -: | - | - |
| 1 | `no-raw-spacing-in-features` | **REFUTED** (5, 6, 7) — D1: the #1954 carrier-fence repair pinned the OUTER fence and left BOTH halves of the claim it makes unenforced; two built falsifiers |
| 2 | `no-raw-typography-in-features` | **REFUTED** (5, 6, 7) — byte-for-byte the same two defects. The mirror is exact |
| 3 | `spacing-tier-home-health` | **REFUTED (minor — criterion 6 only)** — 1 of 1 narrowing ENFORCED, message discriminates in BOTH directions including across the twin, roster row accurate. **Missing only a §4.5 pin.** The copy candidate for a HARD policy |
| 4 | `typography-tier-home-health` | **REFUTED (minor — criterion 6 only)** — identical |
| 5 | `no-raw-color-in-css` | **REFUTED** (1, 3, 5, 6) — the §12.3 SILENT non-ready `return`; `fix` names no waiver spelling; the roster promises an allowlist ratchet + anchor guard + mode-B arm that do not exist |
| 6 | `no-raw-container-widths` | **REFUTED** (3, 4, 5, 6) — no §4.2 arm anywhere; no singleton reason; two unenforced narrowings incl. the `notUnder` subtraction that excludes 24 real files |
| 7 | `no-color-literals` | **REFUTED** (2, 3, 4, 5, 6) — **the worst module in the family.** The policy `message` is one of three and is printed as the group header for all of them; 4 of 5 rows PROVEN unable to name which pattern fired; the one token discriminator FAILS its transplant; its header cites a real-tree pin its own conversion disconnected |
| 8 | `no-off-token-radius-shadow` | **REFUTED** (3, 5, 6) — no §4.2 arm; the D1 mirror spreads here as a THIRD module; roster describes a retired allowlist and a retired preset carve-out. **Its conversion left `gate-conformance.repo.int.test.ts:49` RED** (D5) |
| 9 | `no-tailwind-dark-variant` | **REFUTED** (5, 6) — the strongest of the nine by a wide margin. 10 count-less rows, one unenforced fence, a stale roster count. **The ordinary-policy copy candidate once those close** |
| 10 | `no-arbitrary-tw-values` | **NOT A SUBJECT — LEGACY.** `GateDescriptor` at `:105`, six `gate:contract` findings. §5b does not bind an unconverted module (premise correction 1) |

## Premise corrections

1. **`no-arbitrary-tw-values` is LEGACY, not final.** Re-derived against `pnpm check:policy-conformance` as
   the brief asked. `tooling/src/verify/gates/no-arbitrary-tw-values.ts:105` is
   `export const gate: GateDescriptor = {`, not `defineGate`. Two independent receipts: `pnpm gate:contract`
   reports six findings, all of them this module's — `[module-mutation]` at `:80` (a module-scope
   `passSeenAllowlisted` mutated via `clear()`), `[descriptor-wrapper]` at `:105`, and `[legacy-field]`
   `scopeSafety` `:109` / `scanRoot` `:112` / `begin` `:114` / `finalize` `:131` — and `check:structure`
   prints it in the LEGACY line shape (`✓ no-arbitrary-tw-values · scanned 1685/7413 files`) rather than the
   final shape (`· final ordinary/error · population N source`). **I audited the other nine and report this
   one as out of scope.** It is a conversion candidate, not a defect.
2. **The brief's three premises about this family all HELD, and I confirmed each independently:**
   - *"Mirrored defects propagate INSIDE the exemplar set — check whether that is still true and whether it
     spreads further."* **Still true, and it HAS spread.** Both halves of `inClassCarrier` are unenforced in
     both raw-CSS twins (A2/A3, A6/A7), and the identical pair is unenforced a THIRD time in
     `no-off-token-radius-shadow`'s `isClassStringSite` (A23/A24). Six built falsifiers, each run in both arms.
   - *"A legacy `ExemptionTable` survives behind `defineGate` here, not in the census."* **Confirmed, and the
     class is larger than the two.** `SANCTIONED_HOMES: ExemptionTable` at `no-raw-spacing-in-features.ts:35`
     and `no-raw-typography-in-features.ts:35`, imported from the LEGACY `contract/gate.ts`. Corpus-wide:
     **42 gate modules import `ExemptionTable`; NINE of them are FINAL** (`contract-derives-not-respells`,
     `depcruise-grant-liveness`, `eslint-grant-liveness`, `injected-op-caller-param`, `lifecycle-portability`,
     the two above, `ownerid-registry`, `persisted-store-registry`). `exception-authority-census.md` is based
     on `53bb2d35f` (2026-09-05) and counts these as LEGACY mechanisms; it structurally cannot have classified
     a table that survived a later conversion. **#1922 scope: the census owes a re-derivation keyed on
     contract form, not on the table type.**
   - *"Three carry NO §4.2 identity arm anywhere; my own earlier count said 0 of 88 and was wrong because the
     grep matched prose."* **Confirmed exactly.** A repo-wide `rg 'orb-waive <id>\('` over the ten ids returns
     ten hits: four are live identity arms (spacing `:128`, typography `:128`, css `:117`, dark `:384`), four
     are `fix`-string prose (spacing `:75`, typography `:75`, dark `:33`), and **three are header PROSE only —
     `no-raw-container-widths:17`, `no-off-token-radius-shadow:10`, `no-color-literals:17`.** Neither those
     three modules nor any family test carries a `runPolicyPass` arm for them.
3. **The commit that would have covered them did not.** `ec16dc7a8` ("the eight visual/CSS/token policies get
   their identity arms", 2026-09-11) says *"All eight now carry one"* and *"Every ordinary `fix` now states
   the exact waiver spelling"* — true of ITS eight. `git show --stat ec16dc7a8` names
   `modal-body-not-placeholder`, `no-media-queries-in-features`, `no-off-token-inline-style`,
   `no-raw-spacing-in-features`, `no-raw-typography-in-features`, `no-tailwind-dark-variant`,
   `settings-section-anchored`, `ui-accname-survives-spread`. **My three armless modules and
   `no-raw-color-in-css` were never in that pass.** The commit claim is scoped and honest; the coverage gap is
   real and unrecorded anywhere.

## What I ran

| Instrument | Result |
| - | - |
| `pnpm check:policy-conformance` (baseline, at `b4714536d`) | `167 final policies · 1679 proof rows · 0 failure(s) · 105 grant rows (whole table) · 0 invalid · 52774ms`, **exit 0** — identical to the brief's floor |
| `pnpm check:policy-conformance` (final, after all six probe rounds) | `167 · 1679 · 0 failure(s) · 105 · 0 invalid · 16121ms`, **exit 0** — restored byte-for-byte |
| `pnpm gate:contract` | `761 finding(s) across 271 gate module(s)`, exit 1. Total did NOT rise. **grep over the log for all nine FINAL subject ids returns 0**; the only subject-named findings are the legacy `no-arbitrary-tw-values`'s six |
| **`pnpm check:structure`** (run ALONE, once) | exit 1 (migration baseline). Tail: `final policies: 167 ran · raw 1323 = waived 1141 + granted 105 + effective 77 (77 error, 0 warning) · 0 alarm(s) · **0 tool error(s)** · **0 withheld**`; `single-pass: ran 271/271 active gate(s) (104/104 legacy · 167/167 final) … run COMPLETE`. **All ten subjects `✓` with non-zero real-tree populations** (receipts in D2/D6). Run id `agent-acb7c8ea57e1b987a-3440227-2026-09-11T23-52-30-216Z` |
| `pnpm test:scoped tests/tooling/verify/gates/` | 57 files, **55 passed / 2 failed**; 3 failing tests. **All three of my subjects' test files PASSED**: `ui-token-surface-wave-1.test.ts` (68 ms), `no-raw-color-in-css.test.ts` (155 ms), `no-tailwind-dark-variant.int.test.ts` (2 tests, 380 ms) |
| quiet re-run of the two failing files alone | **STILL 3 failed, in 20 s.** NOT contention — see D6 |
| `pnpm test:scoped tests/tooling/gate-conformance.repo.int.test.ts` | **2 failed / 5 passed**, and one failure is caused by a subject of mine — D5 |
| 6 probe rounds through the production door | 31 narrowing cuts · 2 cluster cuts (mutual-redundancy detectors) · 1 narrow-direction population control · 10 count derivations · 22 sibling-arm transplants · 4 dead-position controls · 1 foreign-policy-id control · 10 built-falsifier rows run in BOTH arms. Every round `cp`-backed and restored; `git status --short` EMPTY after every round and at the end |

**Instrument control, run first.** Every probe ran through `verifyPolicyProofs` — the exact function the
production stage calls (`ops/policy-conformance-stage.ts:56`) and the exact function every family test in this
area calls (`ui-token-surface-wave-1.test.ts:29`). I proved the driver is not lying before trusting it: a
planted `count: 99` on `no-raw-spacing-in-features` `mustFlag[0]` produced
`expected effective finding count=99 but got 1`, and the tree was restored clean.

`pnpm exec biome` / `pnpm typecheck` were **not** run: this lane wrote one markdown file and modified no
tracked code. `pnpm check:docs` was run scoped for that file.

## DEFECTS

### D1 — the #1954 carrier-fence repair pinned the OUTER fence and left BOTH INNER HALVES unenforced, in THREE modules (HIGH)

This is the brief's central question and the answer is the worst case: the mirror is exact, and it spread.

All three modules implement the same two-clause carrier predicate:

```ts
// no-raw-spacing-in-features.ts:53-60 · no-raw-typography-in-features.ts:48-55 · no-off-token-radius-shadow.ts:84-95
const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
if (jsxAttr !== undefined && jsxAttr.getNameNode().getText() === "className") { return true; }
const callExpr = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
return callExpr !== undefined && CLASS_COMPOSERS.has(callExpr.getExpression().getText());
```

The #1954 repair added one `mustPass` row per twin placing the banned literal in an ordinary string constant
with **no JSX attribute and no call at all**. That row dies when the WHOLE predicate is cut (verified: A1, A5,
A22) and survives every cut INSIDE it — because the fixture visits neither clause.

So the two claims the header and the `message` actually make — *"a `className` attribute"* and
*"a `cn`/`clsx`/`cva`/`tv` call"* — are each unpinned in all three modules:

| Cut | Module | Every declared row | Falsifier (unmodified → cut) |
| - | - | -: | - |
| `=== "className"` → any JSX attribute | spacing `:55` | 0 failures | `<div title="p-4" />` — **PASS → RED** |
| `CLASS_COMPOSERS.has(...)` → any call | spacing `:59` | 0 failures | `describe("p-4 spacing helper")` — **PASS → RED** |
| `=== "className"` → any JSX attribute | typography `:50` | 0 failures | `<div title="text-sm" />` — **PASS → RED** |
| `CLASS_COMPOSERS.has(...)` → any call | typography `:54` | 0 failures | `describe("text-sm sizing helper")` — **PASS → RED** |
| `=== "className"` → any JSX attribute | radius `:86` | 0 failures | `<div title="rounded-lg" />` — **PASS → RED** |
| `CLASS_STRING_CALLEES.has(callee)` → any call | radius `:94` | 0 failures | `describe("rounded-lg card corners")` — **PASS → RED** |

**They are NOT mutually redundant — I ran the cluster cut.** Cutting BOTH halves together, in spacing and in
radius, still leaves every declared row green (`F-A2/A3 BOTH HALVES CUT TOGETHER: 0 failure(s)`;
`F-A23/A24 BOTH HALVES CUT TOGETHER: 0 failure(s)`). So the fix is six `mustPass` rows, not a deletion and not
a cluster row.

**Why this matters beyond the six rows.** `no-raw-spacing-in-features.ts:13-23` is the longest and most
confident header in the family: *"THE CARRIER FENCE IS REAL, AND THE MESSAGE'S 'in className' IS THEREFORE
EARNED (re-derived 2026-09-11, #1954 …) RE-VERIFIED 2026-09-11 (#1584 pristine pass) by the two-command
narrowing test the claim asks for."* That paragraph is TRUE of the cut it names and FALSE of the claim it
defends: today the message could say `className` while the code admits `title=`, or name four composers while
the code admits every call, and every proof row stays green. **A header that names a narrowing test is the
strongest signal a lane has that the fence is pinned — and here it is pointing one level too high.**

### D2 — three ORDINARY policies have no §4.2 identity arm anywhere, and four `fix` strings do not name the waiver spelling (§5b.3, HIGH)

`no-color-literals`, `no-off-token-radius-shadow` and `no-raw-container-widths` are each `authority: "ordinary"`
with a live real-tree population (`check:structure`: 1685 / 1685 / 1661 source files) and **no positive waiver
arm in the module and none in any family test.** The repo-wide receipt is in premise correction 2.

This is not cosmetic. `no-off-token-radius-shadow`'s `mustFlag[0]` fixture emits TWO findings from ONE node
(`className="rounded-lg shadow-md"`) with DIFFERENT tokens — the exact shape §4.2 says is separately waivable,
and exactly the shape whose door nobody has proven opens. `no-color-literals`'s `mustFlag[4]` emits THREE from
one node in a `.ts` variant map. If either module's report ever loses its per-occurrence token, every marker
becomes `over-broad` and the gate becomes unwaivable — silently, at 0 conformance failures.

The four arms that DO exist are strong; I ran the discrimination controls §4.2 asks for:

```
✗ no-raw-spacing-in-features    · mustPass[3]  AUTHORITY ALARM [ordinary-waiver] … packages/client/src/test.tsx:1:1 names a dead position
✗ no-raw-typography-in-features · mustPass[3]  AUTHORITY ALARM [ordinary-waiver] … packages/client/src/test.tsx:1:1 names a dead position
✗ no-raw-color-in-css           · mustPass[1]  AUTHORITY ALARM [ordinary-waiver] … packages/client/src/styles/waived.css:2:3 names a dead position
✗ no-tailwind-dark-variant      · mustPass[6]  AUTHORITY ALARM [ordinary-waiver] … packages/ui/src/x.tsx:1:1 names a dead position
✗ no-raw-spacing-in-features    · mustPass[3]  AUTHORITY ALARM [ordinary-waiver] … targets unknown policy no-raw-typography-in-features
```

Separately, §5b.3 requires every ordinary policy's `fix` to name the exact waiver spelling. **Four of the eight
ordinary policies do not:** `no-raw-color-in-css:63`, `no-raw-container-widths:61`, `no-color-literals:77`,
`no-off-token-radius-shadow:28-30`. Three of those four also have no arm, so a reader who trips the gate has
neither a spelling to copy nor a proven door. `render.ts:233-236` prints `message` and then `fix` as the group
header on every failing run, so the `fix` string IS the user-facing remedy, not documentation.

### D3 — `no-color-literals` declares one of its three messages as THE policy message, and 4 of 5 rows cannot say which pattern fired (§5b.2 + §4.1, HIGH)

The module flags three disjoint patterns with three distinct per-finding messages
(`MESSAGE_NON_TOKEN` / `MESSAGE_PALETTE` / `MESSAGE_HEX`, `:22-27`) but declares
`message: MESSAGE_HEX` (`:76`). `lib/render.ts:233` prints `policy.message` as the GROUP HEADER for every
failing policy, so **a real run that flags only palette classes prints "arbitrary hex color class
(…-\[#rrggbb])" over them**, and the `fix` beneath it (`:77`) names only "a design token". §5b.2 is exactly the
\#1954 criterion ("the `message` is TRUE of what the code flags") one axis over: here the message is true of one
third of what the code flags.

And the proof rows cannot catch it, which I measured rather than asserted. Four of the five `mustFlag` rows
carry `expect: { count: N }` with **no `token` and no `messageIncludes`**, while each `why` names which pattern
it is testing. §4.1: *"name `token` … whenever the row's `why` claims WHICH node flags."* Reproduction — I
swapped `mustFlag[0]`'s fixture from the hex class its `why` names to a palette class:

```
B5  files: { "packages/client/src/x.tsx": 'export const G = <div className="text-red-500" />;' }   // was text-[#abc]
    RESULT: 0 failure(s)                                          // why: "arbitrary hex color"
```

The row's `why` says "arbitrary hex color"; the row passes on a palette class. The same probe on
`no-off-token-radius-shadow` `mustFlag[0]` (`rounded-lg shadow-md` → `rounded-2xl shadow-inner`) also produced
**0 failures**: two count-only rows there are likewise blind to which token fired.

**The one token discriminator in `no-color-literals` FAILS its transplant.** `mustFlag[4]`'s
`expect: { count: 3, token: "bg-red-500" }` — I moved the token to a sibling arm's token in the SAME fixture:

```
B4  expect: { count: 3, token: "text-white" }    RESULT: 0 failure(s)
```

`token` runs through `findings.some(...)` (`ops/policy-conformance.ts:203-213`), and this fixture emits all
three patterns, so any of the three satisfies the row. **This is the only transplant failure in 22** — the
other 21 (nine in `no-tailwind-dark-variant`, two in the raw-CSS twins, two in css, one in widths, two in
radius, three in the health twins) all correctly went RED. The fix is per-arm `messageIncludes`: the three
messages are genuinely distinct and `conformance.ts:171` reads `f.message ?? gateMessage`, so a
`messageIncludes` row here WOULD discriminate. No row uses one.

### D4 — `no-raw-color-in-css` answers a broken resource with a SILENT RETURN (§12.3, MEDIUM-HIGH)

```ts
// tooling/src/verify/gates/no-raw-color-in-css.ts:66-69
const inventory = ctx.resources.cssInventory("authored");
if (inventory.status !== "ready") {
  return;
}
```

§12.3 is explicit: *"a non-ready fact here means the runtime's own guard broke … a TOOL ERROR, never a
reportable finding and never a silent zero. So the branch THROWS; it does not `return`."* The sanctioned idiom
`readyResourceValue` (`lib/resource-declaration.ts:30`) is used by five siblings
(`package-layout`, `feature-owns-definition`, `depcruise-grant-liveness`, `server-layout`,
`ui-exports-map-complete`), two of which carry a header paragraph saying precisely why a silent return is
wrong. Today's tree:

| Answer to a non-ready resource | Final policies |
| - | - |
| `readyResourceValue` / no branch (correct) | `package-layout`, `feature-owns-definition`, `depcruise-grant-liveness`, `server-layout`, `ui-exports-map-complete` |
| **silent `return`** | `client-structure:239`, `eslint-grant-liveness:106`, `feature-structure:188`, `verify-registry-parity:84`, **`no-raw-color-in-css:67`** |

`eslint-grant-liveness` at least carries a comment naming the reason; `no-raw-color-in-css` carries nothing.
This module's population is `{ of: "none" }` and its ENTIRE verdict comes from that one resource — a
`cssInventory` that fails leaves it reporting a clean zero over 3035 resources.

**And it is unfalsifiable, which is the §4.5b finding.** I replaced the return with the sanctioned throw:

```
A14  if (inventory.status !== "ready") { throw new Error(...) }     RESULT: 0 failure(s)
```

No proof row exercises a non-ready inventory, and none can: §4.5b gap 1 — `toolFailure` runs before the arm
verdict, so an arm whose correct outcome is a refusal is neither `mustFlag` nor `mustPass`. Per §4.5b the
honest output is **the measured pair of messages in the header plus a board row**, and this module's header
records neither.

### D5 — converting `no-off-token-radius-shadow` left a coupled test RED, and disconnected the ONLY real-tree proof of the `@orb-gate-ignore` vocabulary (HIGH)

**Reproduced, twice, on a quiet tree.**

`lib/loader.ts:190-192` — `loadGates(root)` returns `(await loadMixedGateCorpus(root)).legacy`, final policies
excluded by construction. Two committed real-tree suites still reach for final policies through it:

**(a) `tests/tooling/gate-conformance.repo.int.test.ts:49` is RED today.**

```
FAIL tests/tooling/gate-conformance.repo.int.test.ts > the loader discovers at least the ported worked-example gate
AssertionError: expected [ 'agent-bridge-lock', … 'no-arbitrary-tw-values', … 'zustand-selector-derived' ]
  to include 'no-off-token-radius-shadow'
```

`7993f264c` (2026-09-11) converted the module; the test file has not been touched since `46b658696`
(2026-09-08). Its own header (`:7-8`) still reads *"During the migration this covers only the ported gates
(currently `no-off-token-radius-shadow`)"* — the sentence and the assertion both describe a world that ended
with the conversion. **`.claude/rules/gates-and-tooling.md` makes the baseline-red list EXHAUSTIVE
(`pnpm check`/`verify`/`check:structure`, the lefthook hooks, and `check-gates.repo.int.test.ts` throwing in
setup) and says a scoped suite red is NEVER baseline.** This one is not on that list. It is a real regression
owned by this family's conversion. (The second failure in that file — `verifyGateProofs` over the legacy
corpus, reporting `json-column-write-parity` stale-sweep rows — is a separate pre-existing legacy matter and
is not mine.)

**(b) `tests/tooling/gate-ignore-grammar.repo.int.test.ts` has lost ALL THREE of its carriers.** That suite is
the GATE-AUTHORING §5 six-case real-tree probe and its own header states why nothing else can replace it:
*"conformance runs ONE gate standalone, so in a mini-project no SIBLING gate can ever consume a marker — every
suppression-consumption verdict (STALE, OVER-EXEMPT) is unobservable there."* It loads its corpus with
`loadGates(ROOT)` and names three carriers:

| Carrier | Line | Contract form today |
| - | - | - |
| `no-color-literals` (the node-arm carrier) | `:35` | **FINAL** (`defineGate` at `no-color-literals.ts:66`) |
| `no-raw-intl-time` (the scripts-arm carrier) | `:46` | **FINAL** |
| `test-determinism` (the finding-arm carrier) | `:18` | **FINAL** |

All three are absent from the legacy roster the test loads (the roster is printed verbatim in the (a) failure
above; none of the three appears in it). **I deliberately did NOT run this suite** — it plants `__g_` fixtures
in the working tree, it is the suite the doctrine names as not concurrency-safe with itself, and it is the one
whose live probe once shipped a blinded gate. The static refutation stands on its own and the run belongs to
the orchestrator during a train.

The consequence lands inside my subject: `no-color-literals.ts:12-14` states that its unfenced behaviour is
pinned *"on the real tree, by tests/tooling/gate-ignore-grammar.repo.int.test.ts, whose whole six-case probe
rests on this gate biting a bare `export const g1 = "bg-black";` under packages/ui/src."* **That pin cannot
execute.** A header claiming a proof that structurally cannot run is the §5b.5 defect in its purest form.

### D6 — two scoped suites red on a QUIET tree; the contention tell does not apply (MEDIUM, not mine)

`pnpm test:scoped tests/tooling/verify/gates/` reported 2 files / 3 tests failed, all with
`Test timed out in 5000ms` — the shape the brief named as the contention tell. **A quiet re-run of just those
two files reproduced all three failures in 20 s total**, so it is not contention:

- `tests/tooling/verify/gates/grant-liveness-family.test.ts:25` — `verifyPolicyProofs([depcruiseGrantLiveness, eslintGrantLiveness])` with **no timeout argument**, so it inherits the 5 s default. `check:structure` measured `eslint-grant-liveness` at 5022.9 ms in its population phase alone. The file next door (`ui-token-surface-wave-1.test.ts:24`) declares `scaledBudget(120_000)` for exactly this reason and passes in 68 ms.
- `tests/tooling/verify/gates/drizzle-registry-conversion.test.ts` — two tests, same shape.

These are outside my subject family; I report them because a lane reading the family-test floor as green would
be reading a red one. **`ui-token-surface-wave-1.test.ts` itself is a further finding:** its only content is
`expect(verifyPolicyProofs(FAMILY)).toEqual([])` over three policies, which §4.9 says the conformance stage
already covers by construction — so the one file that exists for `no-off-token-radius-shadow` carries none of
the four things §4.9 says a family test is FOR (the §4.2 arm, §4.3 grants, §4.5 pins, the §4.6 differential),
and that module has none of them.

### D7 — seven of nine roster rows are wrong, and two are dense about a RETIRED implementation (§5b.5, MEDIUM)

`Core-Enforcement-Active-Gates.md` is a coupled site. Wave 1 found bare LABELS, wave 2 found rows dense about
the retired implementation. **This family has BOTH.**

| Row | The claim | The tree |
| - | - | - |
| `:254` `no-raw-spacing-in-features` | "raw spacing tokens/values in features" | **BARE LABEL.** Says nothing about the tier permission, the carrier fence, the `raw-spacing-tier` split or the waiver door |
| `:256` `no-raw-typography-in-features` | same shape | **BARE LABEL** |
| `:285` `no-raw-container-widths` | "raw content-width utilities **on container elements** — use layout tokens" | **BARE AND WRONG.** The module header `:4-10` states the scan is DELIBERATELY UNFENCED and `mustFlag[2]` pins a bare record with no JSX in the file at all. The remedy is `<Container size>`, not "layout tokens" |
| `:273` `no-color-literals` | "… **in className/cn** …" | **FALSE — the #1954 defect surviving in the roster after being fixed in the module.** `no-color-literals.ts:5-14` states the scan is unfenced for all three patterns and `mustFlag[4]` pins a `.ts` variant map with "no JSX, no className attribute, no cn() call anywhere" |
| `:210` `no-off-token-radius-shadow` | "Both-ways ALLOWLIST ratchet (allowlist in the gate file; `packages/client/src/features/preset/**` is structurally excluded, mid-revamp lane)" | **BOTH HALVES FALSE.** `:7-11`: "the legacy ALLOWLIST/stale-arm ratchet retired with NO ROWS TO PORT"; there is no allowlist in the file; and `mustFlag[4]` exists precisely to pin that "the preset lane is scanned like any other feature file (its mid-revamp carve-out was retired)" |
| `:274` `no-raw-color-in-css` | "a both-ways ALLOWLIST ratchet (a listed file that holds no raw color any more REDs, **anchor-guarded for mode-B**)" | **FALSE.** `rg 'ALLOWLIST\|ANCHOR\|Exemption\|health'` over the module returns NOTHING. `GENERATED_THEME` is a bare `const` at `:11` with no liveness arm, no anchor guard and no health sibling. The stale-arm the row promises does not exist — so if `theme.css` is ever renamed, the exemption follows it into the void silently, which is the exact failure mode the two `*-tier-home-health` siblings were built to prevent |
| `:227` `no-tailwind-dark-variant` | "Its **13 mustFlag + 5 mustPass** controls" | **STALE COUNT.** The tree carries **15 mustFlag + 7 mustPass**. The row also ends in process residue ("final graduation joins the grouped CSS-train review/barrier") |
| `:255` `spacing-tier-home-health` · `:257` `typography-tier-home-health` | family, authority, the mode-B tripwire, the shared table, the `entire-population` rationale | **ACCURATE and dense.** The two rows worth copying |

### D8 — 10 of 31 narrowings genuinely UNENFORCED (32%), and 1 of 9 modules has any §4.5 pin (MEDIUM)

The full classification is Sweep A. The distribution is the finding: `no-raw-color-in-css` is 3-of-3 enforced
and `no-tailwind-dark-variant` 4-of-5, while the three carrier-fence modules are 1-of-3 each and
`no-raw-container-widths` is 2-of-4. **Every module whose header states "deleting X reds row Y" was re-cut and
found TRUE** — the same correlation wave 2 measured. The modules that fail are the ones whose headers make a
claim about the fence's SHAPE without naming the row.

And §4.5: `no-tailwind-dark-variant.int.test.ts:47` is the only refusal/deferral pin in the family. Both
`*-tier-home-health` twins declare `execution: "entire-population"` because "does this row resolve to a file"
is a whole-tree question — a narrowed run that answered it partially would report both sanctioned homes DEAD —
and **neither has a family test at all.** Neither does `no-raw-container-widths`, `no-color-literals`,
`no-raw-spacing-in-features` or `no-raw-typography-in-features`.

## Checked and CLEAN — three negatives, with their receipts

**No `ctx.relativePath` exposure (#1972 / §12.3).** Seven call sites across five of the nine modules, and
**every one takes a node the policy VISITED, never a declaration reached by RESOLUTION**:

| Site | Argument |
| - | - |
| `no-raw-spacing-in-features:83` · `no-raw-typography-in-features:83` | the visitor's own `sourceFile` parameter |
| `spacing-tier-home-health:31,34` · `typography-tier-home-health:31,34` | members of `ctx.files` |
| `no-tailwind-dark-variant:211` | members of `ctx.files` |

No module in this family calls `canonical.sourceFile`, `symbol.declaration.getSourceFile()` or any resolved
declaration's path, so the class is out of reach here by construction. **Positive control that the boundary
machinery is live in this family anyway:** cutting the health twins' anchor guard produced
`PASS TOOL ERROR [evaluate] finding file is outside the effective population: packages/ui/src/tokens/index.ts`
— the population fence throws when asked about a file it does not own, exactly as §12.3 describes.

**No loader-property limit is asserted in this family.** I read all nine headers for a claim that the analysis
program cannot see something. The nearest is `no-tailwind-dark-variant:15-21`, which declares that two position
shapes have NO waiver spelling — and that is a claim about the MARKER GRAMMAR, not the loader, so it is
checkable and I checked it: `lib/ordinary-waiver.ts:19` spells the position group
`` `^${MARKER}\s+(${KEBAB})\(([^()\r\n]+)\):[\t ]*(\S[^\r\n]*)$` `` — parens are genuinely excluded, and the
module's own `mustFlag[14]` reports exactly such a candidate
(`supports-[selector(:has(*))]:dark:text-foreground`). So the module flags a shape it honestly declares
unwaivable and routes it to #1584 rather than shortening the token and breaking the runtime's exact-slice
identity rule. **That is the §4.1 "UNFALSIFIABLE, documented rather than faked" outcome done correctly, and it
is the single best paragraph in the family.** It is also a live hole in a live gate: a real-tree finding of
that shape cannot be suppressed by anyone.

**No fail-open receipt shape.** None of the nine declares a fact provider, so §4.5b gap 2 (a consumer
declaring a fact and forgetting `ctx.receipt`) cannot apply. `no-tailwind-dark-variant:206-210` explains at
length why it deliberately files NO receipt — because the shared receipt kinds refuse the whole policy when
`unresolved > 0`, which is right for a semantic census and wrong for a policy whose unresolved entries are
already reported findings. I checked that reasoning against `lib/policy-pass.ts`'s `receiptFailures` and it is
correct.

## MANDATORY SWEEP A — the §4.1 narrowing cut table, CLASSIFIED

Method, per §4.1: `cp` the module, cut the narrowing, run every declared row through `verifyPolicyProofs`,
`mv` back. A clean cut is routed into a bucket, never counted; an UNENFORCED verdict is issued only with a
falsifier run in BOTH arms.

| Module | Narrowing (`path:line`) | Cut | Row that died | Verdict |
| - | - | - | - | - |
| `spacing` | `inClassCarrier(node)` whole predicate (:87) | drop it | `mustPass[2]` — **exactly the row its `why` names** | ENFORCED |
| | `=== "className"` attribute identity (:55) | any JSX attribute | — | **UNENFORCED** — falsifier built (D1) |
| | `CLASS_COMPOSERS.has(...)` (:59) | any call expression | — | **UNENFORCED** — falsifier built (D1) |
| | `sanctionedHome(...)` early return (:83) | delete it | `mustPass[0]` | ENFORCED |
| `typography` | `inClassCarrier(node)` (:87) | drop it | `mustPass[2]` | ENFORCED |
| | `=== "className"` (:50) | any JSX attribute | — | **UNENFORCED** — falsifier built (D1) |
| | `CLASS_COMPOSERS.has(...)` (:54) | any call expression | — | **UNENFORCED** — falsifier built (D1) |
| | `sanctionedHome(...)` early return (:83) | delete it | `mustPass[0]` | ENFORCED |
| `spacing-health` | the real-tree ANCHOR self-guard (:31) | delete it | `mustPass[1]` — **exactly as its `why` names** | ENFORCED |
| `typography-health` | the real-tree ANCHOR self-guard (:31) | delete it | `mustPass[1]` | ENFORCED |
| `css` | `declaration.file !== GENERATED_THEME` (:71) | judge theme.css too | `mustPass[2]` | ENFORCED |
| | `withoutQuotedContent(value)` (:38) | judge quoted content | `mustPass[0]` | ENFORCED |
| | `&& !authored.includes("var(--")` (:39) | judge derived colours | `mustPass[3]` | ENFORCED |
| | the non-ready `return` (:67) | sanctioned throw | — | **UNFALSIFIABLE — §4.5b gap 1** (D4). No must-refuse arm exists |
| `widths` | `notUnder: [layout/**, markdown/**]` (:55) | widen to bare `@client`+`@ui` | — | **UNENFORCED** — falsifier built (two-file fixture; see below) |
| | `$` end anchor on `WIDTH_RE` (:25) | prefix match | `mustPass[0]` (`w-1/2`) | ENFORCED |
| | `min-` excluded from the numeric arm (:25) | admit `min-w-N` | `mustPass[2]` | ENFORCED |
| | the whitespace TOKEN SPLIT (:36) | scan the whole literal | — | **UNENFORCED** — falsifier built (a "flags LESS" cut: the falsifier is a `mustFlag` the cut turns GREEN) |
| `colors` | the `else if` exclusivity chain (:54-60) | judge all three per token | — | **UNFALSIFIABLE — and honestly so.** The three patterns are DISJOINT by construction: `NON_TOKEN_RE` requires `black\|white`, `PALETTE_RE` requires one of 22 ramp names + a step, `HEX_RE` requires `-[#…]`. No token can match two, so the chain is semantically identical to three independent `if`s. Document it; do not invent a row |
| | `-\d{2,3}` numeric-step requirement in `PALETTE_RE` (:35) | make the step optional | — | **UNENFORCED** — falsifier built, and it also refutes `mustPass[1]`'s `why` (see below) |
| | the whitespace TOKEN SPLIT (:48) | scan the whole literal | `mustFlag[3]` + `mustFlag[4]` | ENFORCED |
| `radius` | `isClassStringSite(node)` whole predicate (:122) | delete it | `mustPass[2]` ("Prose shadow") | ENFORCED |
| | `=== "className"` (:86) | any JSX attribute | — | **UNENFORCED** — falsifier built (D1) |
| | `CLASS_STRING_CALLEES.has(callee)` (:94) | any call expression | — | **UNENFORCED** — falsifier built (D1) |
| | terminal-segment strip `split(":").at(-1)` (:39) | judge the whole token | `mustFlag[3]` (`hover:shadow-lg`) | ENFORCED |
| | `^` start anchor on `SHADOW_SCALE_RE` (:33) | suffix match | `mustPass[0]` (`drop-shadow-sm`) | ENFORCED |
| `dark` | `.slice(0, -1)` LAST-SEGMENT fence (:118) | search every segment | `mustPass[5]` — **exactly as its `why` names** | ENFORCED |
| | `part.text === "dark"` exact equality (:119) | prefix match | `mustPass[4]` (`darkroom:bg-card`) | ENFORCED |
| | `state.stack.length === 0` top-level test (:107) | split every colon | — | **UNENFORCED** — falsifier built |
| | the REAL_TREE_ANCHOR guard on the zero-root tripwire (:211) | always judge | `mustPass[0..2]` | ENFORCED |
| | the exact-slice guard in `reportAnchored` (:160) | always anchor precisely | `mustFlag[8]` (tool error: token not anchored at its declared offset) | ENFORCED |

**Totals: 31 cut → 19 ENFORCED · 10 genuinely UNENFORCED (32%) · 2 UNFALSIFIABLE (documented) · 0 MUTUALLY
REDUNDANT** — and the zero is measured, not assumed: both cluster cuts (spacing's two halves together, radius's
two halves together) came back clean, which REFUTES redundancy and means six separate `mustPass` rows are owed.

### The falsifier table (§4.1's real receipt)

Every UNENFORCED verdict is backed by a row run in BOTH arms: planted on UNMODIFIED source it must PASS, and
with the fence cut it must go RED.

| Falsifier | Unmodified | Fence cut |
| - | - | - |
| `spacing` — `<div title="p-4" />` (a non-`className` JSX attribute) | PASS | **RED** |
| `spacing` — `describe("p-4 spacing helper")` (a non-composer call) | PASS | **RED** |
| `typography` — `<div title="text-sm" />` | PASS | **RED** |
| `typography` — `describe("text-sm sizing helper")` | PASS | **RED** |
| `radius` — `<div title="rounded-lg" />` | PASS | **RED** |
| `radius` — `describe("rounded-lg card corners")` | PASS | **RED** |
| `widths` — TWO-FILE: `packages/ui/src/layout/w4.tsx` with `max-w-96` **plus** an admitted `packages/client/src/features/x/w4ok.tsx` | PASS | **RED** |
| `widths` — `className="mx-auto max-w-96 rounded"` as a `mustFlag` with `{count:1, token:"max-w-96"}` | PASS | **RED** (a "flags LESS" cut: 1 → 0 findings) |
| `colors` — `className="bg-red text-slate"` (ramp names with NO numeric step) | PASS | **RED** (0 → 2 findings) |
| `dark` — `className="[&_.x:dark:y]:bg-card"` (a `dark` segment nested inside an arbitrary selector) | PASS | **RED** |

**The `notUnder` falsifier needed two files, and that is itself a finding.** My first attempt was the obvious
single-file fixture inside the excluded home. It does not pass on unmodified source — it is a TOOL ERROR:

```
F-A15a  ✗ no-raw-container-widths · mustPass[0]
        PASS TOOL ERROR [population] Invalid population resolution: expression admitted zero paths from 1 candidate(s)
```

A population subtraction cannot be proven by a fixture that is entirely inside the subtraction, because the
resulting population is empty and the runtime refuses. The fixture must carry a second file the population
DOES admit. Anyone writing the six-plus-two owed rows needs that, and no guide section says it today.

**`no-color-literals` `mustPass[1]`'s `why` names a narrowing the row does not prove** (the wave-1 D6 /
wave-2 D4 shape, recurring). It reads: *"semantic theme tokens (bg-primary / text-muted-foreground /
border-border) have no numeric palette step — the palette arm must NOT catch them."* Making the step optional
leaves that row green: those three classes are saved because they name no RAMP, not because they carry no
step. My falsifier (`bg-red`, `text-slate` — ramp names without steps) is the row that actually proves it.

### The population field is LIVE — the narrow-direction control

Widening a population adds files, not subjects, so a "flags more" cut cannot falsify a `notUnder` on its own
(hence the two-file fixture above). The control is the NARROW direction. Narrowing `no-raw-container-widths`
to `{ in: ["@client"], under: ["packages/client/src/state/**"] }` reds **all six** of its rows with
`[population] expression admitted zero paths`. And the real-tree receipt from `check:structure` is the number:
**`no-raw-container-widths` runs over 1661 source files while its eight siblings run over 1685 — the `notUnder`
subtraction excludes 24 real files from judgement, and no proof row pins it.**

## MANDATORY SWEEP B — the expectation rows (#1968)

`expectationFailure` read off the source: `count` compares `findings.length` EXACTLY
(`ops/policy-conformance.ts:194-196`); `line`/`token`/`messageIncludes` run through `findings.some(...)`
(`:203-213`), so ANY match satisfies the row.

**36 `mustFlag` rows across the nine final subjects. TEN carry no `count` — all ten in one module.**
Mechanical census (`expect: {` rows per module, minus those naming `count` / `token`):

| Module | rows | no `count` | no `token` |
| - | -: | -: | -: |
| `no-raw-spacing-in-features` | 2 | 0 | 0 |
| `no-raw-typography-in-features` | 2 | 0 | 0 |
| `spacing-tier-home-health` | 1 | 0 | 1 (carries `messageIncludes`) |
| `typography-tier-home-health` | 1 | 0 | 1 (carries `messageIncludes`) |
| `no-raw-color-in-css` | 2 | 0 | 0 |
| `no-raw-container-widths` | 3 | 0 | 0 |
| `no-color-literals` | 5 | 0 | **4** |
| `no-off-token-radius-shadow` | 5 | 0 | **2** |
| **`no-tailwind-dark-variant`** | **15** | **10** | 6 |

**Derived counts.** I planted `count: 99` on all ten count-less rows in one run. Every one reports
`expected effective finding count=99 but got 1`: `mustFlag[0,1,2,3,5,10,11,12,13,14]` each produce **exactly
one** effective finding. So no row currently hides a wrong count — but each is a row that would pass silently
the day its fixture starts producing two, which is precisely what `count` exists to stop. The ten `count: 1`
values are ready to paste.

**The transplant round — 22 transplants, 21 correctly RED.** Each row's sole discriminator moved onto a
sibling arm's value, in the same module wherever possible:

```
✗ no-tailwind-dark-variant   · mustFlag[0]   "dark:bg-card"          → "dark:alias-wrapper"
✗ no-tailwind-dark-variant   · mustFlag[1]   "hover:dark:text-fore…" → "dark:reexported-composer"
✗ no-tailwind-dark-variant   · mustFlag[2]   "dark:alias-wrapper"    → "dark:bg-card"
✗ no-tailwind-dark-variant   · mustFlag[3]   "dark:reexported-comp…" → "dark:alias-wrapper"
✗ no-tailwind-dark-variant   · mustFlag[5]   "dark:bg-card", line 1  → "dark:border-border", line 1
✗ no-tailwind-dark-variant   · mustFlag[10]  "dark:"                 → "dark:bg-card"
✗ no-tailwind-dark-variant   · mustFlag[11]  "dark:border-border"    → "dark:namespace-dot"
✗ no-tailwind-dark-variant   · mustFlag[12]  messageIncludes "unresolved" → "unresolvable"
✗ no-tailwind-dark-variant   · mustFlag[13]  "[&:where(.x:y)]:dark:bg-card" → "supports-[selector(:has(*))]:…"
✗ no-tailwind-dark-variant   · mustFlag[14]  "supports-[selector(:has(*))]:…" → "[&:where(.x:y)]:dark:bg-card"
✗ no-raw-spacing-in-features · mustFlag[0]   '"p-4"'                 → '"gap-2"'
✗ no-raw-typography-…        · mustFlag[0]   '"text-sm"'             → '"text-xl"'
✗ no-raw-color-in-css        · mustFlag[0]   "#ff0000", line 2       → "oklch(0.5 0.2 30)", line 2
✗ no-raw-color-in-css        · mustFlag[1]   "oklch(0.5 0.2 30)"     → "#ff0000"
✗ no-raw-container-widths    · mustFlag[0]   "w-[600px]"             → "max-w-96"
✗ no-off-token-radius-shadow · mustFlag[1]   "shadow-lg"             → "shadow"
✗ no-off-token-radius-shadow · mustFlag[3]   "hover:shadow-lg"       → "shadow-lg"
✗ spacing-tier-home-health   · mustFlag[0]   "stale SANCTIONED-HOME row" → "stale sanctioned home row"
✗ typography-tier-home-health· mustFlag[0]   "stale SANCTIONED-HOME row" → "stale sanctioned home row"
✗ spacing-tier-home-health   · mustFlag[0]   "stale SANCTIONED-HOME row" → "typography-token implementation tier"   ← CROSS-TWIN
  no-color-literals          · mustFlag[4]   "bg-red-500"            → "text-white"        ← 0 failures: NOT DISCRIMINATING (D3)
  (plus the two fixture swaps in D3 that left count-only rows green)
```

The sharpest control in the set is the **cross-twin** one: `spacing-tier-home-health`'s row correctly refuses
the text its byte-identical typography twin emits, which proves the two modules' messages are distinguishable
from each other and not merely from noise. That control does not exist in wave 1 or wave 2 and it is the right
one for any twinned family.

## PRISTINE per module — ten verdict blocks, seven criteria each

Legend: **P** pass · **F** fail · **N/A** does not bind · **NE** not evaluated.

### 1. `no-raw-spacing-in-features` — REFUTED (criteria 5, 6, 7)

1. **P** — `facts: []` / `resources: []` explicit, no `ctx.checker()`, `analysis: "syntax"` honest (a regex
   over literal text), `execution: "selected-files"` honest (a per-literal verdict composes over a subset).
2. **P** — the message names both admitted carriers and both are true of the code today. (What nothing keeps
   true is criterion 6's problem, not 2's.)
3. **P** — `fix` names `@orb-waive no-raw-spacing-in-features(<position>)` AND states the position is the whole
   quoted literal including quotes. Dead-position and foreign-policy-id controls both bite.
4. **P** — real 2-member family `raw-spacing-tier`; the shared reader `lib/sanctioned-home.ts` is named in the
   header with the reason for the ordinary/hard split.
5. **F** — no POPULATION PORT line; the roster row `:254` is a bare label (D7); and the header's "RE-VERIFIED …
   by the two-command narrowing test the claim asks for" is true of the outer fence and false of the claim it
   defends (D1).
6. **F** — §4.2 arm present and PROVEN discriminating; 2 of 4 narrowings ENFORCED; **2 genuinely UNENFORCED
   with built falsifiers** (D1); both `expect` rows exact and transplant-proven. **No §4.5 refusal or receipt
   pin, and no family test at all.**
7. **F** — a legacy `ExemptionTable` (`contract/gate.ts`) survives behind `defineGate` at `:35`. Mitigated:
   the table is READ through the shared `lib/sanctioned-home.ts` and its liveness is owned by a real sibling
   policy, which is strictly better than a private sweep — but §12.4's law is "exact reviewed grants with
   rename/deletion liveness, never population subtraction", and this is neither. **#1922 scope.**

### 2. `no-raw-typography-in-features` — REFUTED (criteria 5, 6, 7)

Byte-for-byte the same module with a different regex and vocabulary; every verdict above transfers, every
probe was run independently against it, and every result matched. `:50` / `:54` are the two unenforced
narrowings; the roster row `:256` is the bare-label twin.

**The mirror itself is the finding.** Wave 1 said mirrored defects propagate inside the exemplar set. These
two files are the proof: one repair, applied twice, correct twice, and incomplete twice in exactly the same
way. A conversion lane handed either one will reproduce the gap a third time — as
`no-off-token-radius-shadow` already did.

### 3. `spacing-tier-home-health` — REFUTED (criterion 6 only, LOW)

1. **P** — 69 lines, nothing declared it does not use, `execution: "entire-population"` honest and ARGUED
   ("does this row resolve to a file" cannot be answered per-file).
2. **P** — `authority: "hard"`; both the policy message and the per-finding message name the row, the tier and
   the remedy file.
3. **N/A** — a hard policy has no waiver arm (§4.4).
4. **P** — family `raw-spacing-tier` with its sibling; shares the exact table rather than re-spelling it.
5. **P** — the header states the mode-B rationale and the `execution` reason; **roster row `:255` is accurate
   and dense** — one of two in the family.
6. **F (LOW)** — 1 of 1 narrowing ENFORCED and the anchor guard's `why` names the exact row that dies;
   `expect` carries `count` + `messageIncludes` and the discriminator survives BOTH a dead-text transplant and
   a cross-twin transplant. **The single gap: no §4.5 pin.** Its verdict depends on receiving the ENTIRE
   population and on a real-tree anchor, and nothing proves a narrowed run defers instead of declaring both
   homes dead. `no-tailwind-dark-variant.int.test.ts:47` is the shape it should copy.
7. **P** — no private reader, walk, cache, table of its own, scope predicate or fs read.

### 4. `typography-tier-home-health` — REFUTED (criterion 6 only, LOW)

Identical; independently probed; identical results. Roster row `:257` also accurate.

### 5. `no-raw-color-in-css` — REFUTED (criteria 1, 3, 5, 6)

1. **F** — the §12.3 silent non-ready `return` at `:66-69` (D4). Otherwise minimal and correct:
   `population: { of: "none", why: … }` with a stated reason, one declared resource, no checker.
2. **P** — the message is exactly true of what the code flags, including the token-derived carve-out.
3. **F** — the §4.2 arm exists and the dead-position control bites, but `fix` (`:63`) names no waiver spelling
   (§5b.3). This is the one module where the door is PROVEN to work and unfindable from the failure output.
4. **P** — declared singleton WITH its reason, including the loader law that forced it and the condition for
   re-declaring the shared family (`:4-8`). A model paragraph.
5. **F** — no population port; roster row `:274` promises an allowlist ratchet, an anchor guard and a mode-B
   stale arm, none of which exist (D7).
6. **F** — 3 of 3 narrowings ENFORCED (the strongest ratio in the family), two exact counts, both transplants
   RED. But **no §4.5 pin**, and the non-ready branch is unfalsifiable by construction (A14) — §4.5b says the
   honest output is the measured pair of messages in the header plus a board row, and the header records
   neither.
7. **P**.

### 6. `no-raw-container-widths` — REFUTED (criteria 3, 4, 5, 6)

1. **P**.
2. **P** — the message was correctly made context-free by #1954 and `mustFlag[2]` pins the unfenced scan in a
   `.ts` record with no JSX in the file. This module's header is honest about its false-positive cost.
3. **F** — **no §4.2 identity arm anywhere** (D2), and `fix` (`:61`) names no waiver spelling — while the
   header at `:17-18` promises the door exists.
4. **F** — `family: "no-raw-container-widths"`, a singleton with NO stated reason. §5b.4 requires "a declared
   singleton **with its reason**". Contrast its three siblings in this same family, which all price theirs.
5. **F** — roster row `:285` is a bare label that also contradicts the module's declared-unfenced scan (D7).
   **Credit where due:** the population port IS stated, inline at the field (`:53-54`), naming the legacy
   predicate and why `notUnder` is the non-lossy replacement. It is the only port statement in the family.
6. **F** — 2 of 4 narrowings ENFORCED; **2 UNENFORCED with built falsifiers** (the `notUnder` subtraction that
   excludes 24 real files, and the whitespace token split); three exact counts, transplant RED; no §4.2 arm;
   no §4.5 pin; no family test.
7. **P**.

### 7. `no-color-literals` — REFUTED (criteria 2, 3, 4, 5, 6) — the worst in the family

1. **P** — minimal contract, honest `analysis`/`execution`.
2. **F** — `message: MESSAGE_HEX` is one of three per-finding messages and is printed as the group header for
   all of them (D3).
3. **F** — **no §4.2 identity arm anywhere**, on a policy whose fixtures emit two and three findings per node;
   `fix` (`:77`) names no waiver spelling while the header at `:17-18` promises it (D2).
4. **F** — singleton with no stated reason.
5. **F** — the header cites `gate-ignore-grammar.repo.int.test.ts` as its real-tree pin and its own conversion
   disconnected that suite (D5); roster row `:273` asserts the "in className/cn" context the module explicitly
   disclaims (D7); no population port.
6. **F** — **4 of 5 rows PROVEN unable to name which pattern fired** (B5, reproduced); the one token
   discriminator FAILS its transplant (B4) — the only transplant failure in 22; 1 narrowing UNENFORCED with a
   built falsifier; 1 UNFALSIFIABLE and documented here; `mustPass[1]`'s `why` names a narrowing the row does
   not prove; no §4.2 arm; no §4.5 pin; no family test.
7. **P** — no private reader or walk; the three regexes are local classifiers, which is legitimate.

### 8. `no-off-token-radius-shadow` — REFUTED (criteria 3, 5, 6)

1. **P** — and it is the only module in the family whose visitor subscribes to the three template-part kinds,
   with `mustFlag[1]` pinning the `TemplateHead` case a plain-string scan misses. Good work.
2. **P**.
3. **F** — **no §4.2 identity arm anywhere**, and `fix` (`:28-30`) is a remedy sentence with no waiver
   spelling, while `:10-11` promises one (D2).
4. **P** — declared singleton WITH its reason, and it goes further than any sibling: it names two concrete
   MERGE candidates (`no-hover-display-swap`, `ui-size-via-variant`), states the shared SHAPE they repeat, and
   says why the merge is not forced here. **That is the best §5b.4 paragraph in the family.**
5. **F** — roster row `:210` describes an allowlist and a preset carve-out the module retired and pins
   against (D7); no population port.
6. **F** — 3 of 5 narrowings ENFORCED; **2 UNENFORCED with built falsifiers** — the D1 mirror arriving in a
   third module; 2 of 5 rows count-only and proven non-discriminating (B6); no §4.2 arm; no §4.5 pin; and its
   family test contributes nothing the conformance stage does not already run (D6).
7. **P**.

Plus D5: its conversion left `tests/tooling/gate-conformance.repo.int.test.ts:49` RED, reproduced today.

### 9. `no-tailwind-dark-variant` — REFUTED (criteria 5, 6) — the strongest of the nine

1. **P** — `execution: "entire-population"` is honest (cross-file provenance) and, uniquely in this family,
   **PINNED**: `no-tailwind-dark-variant.int.test.ts:47` proves a narrowed request defers rather than running
   partially. The "NOT a `ctx.receipt()`" paragraph (`:206-210`) reasons correctly from `receiptFailures`'
   actual semantics and is the kind of negative claim §5b wants.
2. **P**.
3. **P** — `fix` names the spelling, the exact position shape, what the position is NOT, and declares the two
   shapes that have no waiver spelling at all. I verified the paren limit against `ordinary-waiver.ts:19`: it
   is TRUE.
4. **P** — declared singleton with a real reason that names the shared reader, enumerates its five consumers,
   and explains why minting a family string unilaterally would be wrong.
5. **F** — no population port; roster row `:227` says "13 mustFlag + 5 mustPass" against 15 + 7 on the tree,
   and ends in process residue (D7).
6. **F** — **10 of 15 `mustFlag` rows carry no `count`** (derived: all exactly 1); 4 of 5 narrowings ENFORCED
   with two `why` strings naming the exact dying row (re-cut, both TRUE); **1 UNENFORCED with a built
   falsifier** (the top-level bracket-depth test); 9 of 9 token transplants RED; §4.2 arm PROVEN. The
   zero-carrier-root tripwire at `:211` has no §4.5 pin — its anchor guard is enforced, but nothing proves the
   tripwire FIRES when `walked.roots === 0` on a populated tree.
7. **P**.

### 10. `no-arbitrary-tw-values` — NOT A SUBJECT (LEGACY)

`GateDescriptor` at `:105`; six `gate:contract` findings, all of them its; `check:structure` prints the legacy
line shape. §5b does not bind an unconverted module. Its `[module-mutation]` finding at `:80` (a module-scope
`Set` cleared per pass) is worth carrying into whatever lane converts it — that is state in module scope,
which the final contract puts inside `create`.

## NAME THE MODULE A LANE SHOULD COPY

**There are two answers here, and the split is the point.**

**For a HARD `-health` / tripwire policy: `spacing-tier-home-health`** (69 lines,
`tooling/src/verify/gates/spacing-tier-home-health.ts`). 1 of 1 narrowing enforced with its `why` naming the
dying row; an `expect` carrying both `count` and `messageIncludes`; a discriminator that survives a dead-text
transplant AND a cross-twin transplant; a real 2-member family with the ordinary/hard split argued from
`execution`; an accurate, dense roster row; nothing forbidden behind the contract. **Its only §5b failure is a
missing §4.5 pin** — one `runPolicyPass` deferral test, in the shape of
`no-tailwind-dark-variant.int.test.ts:47`. It is the cleanest module I measured in this family and the closest
thing to copyable today. The caveat a lane must be told: it is `hard`, so it never exercises §4.2 or §5b.3 and
teaches nothing about the waiver door.

**For an ORDINARY policy: `no-tailwind-dark-variant`, but NOT YET.** It is the best ordinary module in the
family — the identity arm is proven, the `fix` is the most complete in the corpus I have seen, the singleton
reason is exemplary, the `entire-population` claim is genuinely pinned, and its declared-limit paragraph is
the correct §4.1 UNFALSIFIABLE shape rather than a faked row. But handing it to a lane today copies **ten
count-less `mustFlag` rows** into the next twenty modules, which is precisely how #1968 got to 60 rows across
20 modules. Close the ten counts (all `count: 1`, derived above), close the bracket-depth fence with the
falsifier in the table, and fix the roster count — then it is the ordinary-policy exemplar this family owes.

**And name the anti-pattern, because it is more actionable than the exemplar.** No lane should be pointed at
`no-raw-spacing-in-features`'s header. It is the most confident narrowing-verification paragraph in the corpus
and it certifies one level above the claim it defends. A lane that copies its structure copies the gap.

## What I did NOT cover

- **I did not run `tests/tooling/gate-ignore-grammar.repo.int.test.ts` or
  `tests/tooling/check-gates.repo.int.test.ts`.** Both plant fixtures in the working tree; the second throws in
  setup by migration baseline; the first is the suite whose live probe once shipped a blinded gate. **So D5(b)
  is a STATIC refutation** — `loadGates` returns legacy only, and all three of that suite's carriers are final
  — and the actual failure mode (red vs. vacuously green) is UNMEASURED by me. It needs an orchestrator run
  during a train.
- **I did not run `pnpm check` / `pnpm verify` / `pnpm verify --push`.** The static tier's whole-tree checks are
  RED by construction under the #1584 posture; I ran the three instruments my floor names and read them in full.
- **I did not audit the remaining five FINAL modules carrying a legacy `ExemptionTable`**
  (`contract-derives-not-respells`, `depcruise-grant-liveness`, `eslint-grant-liveness`,
  `injected-op-caller-param`, `lifecycle-portability`, `ownerid-registry`, `persisted-store-registry`). I
  counted them and named them; whether each table is a sanctioned-home-with-liveness (defensible) or debt
  parking (not) is a reading task I did not do.
- **I did not measure the real-tree finding delta** of any proposed fix. `check:structure` reports
  `0 tool error(s) · 0 withheld` and all ten subjects `✓`, so nothing in this family is blinded TODAY — but
  closing the ten unenforced narrowings changes no behaviour, while the `no-color-literals` message split and
  the `no-raw-color-in-css` throw both would. Neither was run against the tree.
- **I did not verify the `gate-ignore-inventory` consequence.** It is the only legacy gate in that suite's
  cast and it inventories `@orb-gate-ignore` markers corpus-wide; whether the three carriers going final
  changes what it inventories is unexamined.
- **`no-color-literals`'s `else if` chain is UNFALSIFIABLE on my reading of the three regexes**, not on a
  measurement. I reasoned that the patterns are disjoint (ramps exclude `black`/`white`; hex requires
  `-[#…]`); I did not enumerate the cross-product.

## Paste-ready #1584 paragraph

> **Wave 4 (the raw-CSS / token-surface family, 9 final + 1 legacy) — all nine REFUTED; the family is worse
> than wave 2 on the two criteria that govern copying.** `no-arbitrary-tw-values` is LEGACY (`GateDescriptor`
> at `:105`, six `gate:contract` findings) and out of §5b scope. **D1 (HIGH):** the #1954 carrier-fence repair
> pinned the OUTER fence in `no-raw-spacing-in-features`, `no-raw-typography-in-features` AND
> `no-off-token-radius-shadow`, leaving BOTH halves of the claim each one makes — `className` attribute
> identity and `cn/clsx/cva/tv` membership — unenforced in all three; six falsifiers built and run in both
> arms, and the cluster cuts REFUTE mutual redundancy, so six `mustPass` rows are owed. **D2 (HIGH):**
> `no-color-literals`, `no-off-token-radius-shadow` and `no-raw-container-widths` are ordinary policies with no
> §4.2 identity arm anywhere, and four of eight ordinary `fix` strings name no waiver spelling; `ec16dc7a8`'s
> eight-module pass never reached them. **D3 (HIGH):** `no-color-literals` declares `MESSAGE_HEX` as the policy
> message for three patterns (printed as the group header by `render.ts:233`), and 4 of 5 rows are proven
> unable to say which pattern fired — swapping `mustFlag[0]`'s hex fixture for a palette class leaves it green;
> its one token discriminator is the only transplant failure in 22. **D4:** `no-raw-color-in-css:67` answers a
> non-ready resource with a silent `return` (§12.3 says throw; five siblings do) and no row can express it
> (§4.5b gap 1). **D5 (HIGH):** converting `no-off-token-radius-shadow` left
> `tests/tooling/gate-conformance.repo.int.test.ts:49` RED (reproduced on a quiet tree — NOT baseline), and all
> three carriers of `gate-ignore-grammar.repo.int.test.ts` — the only real-tree proof of the `@orb-gate-ignore`
> vocabulary — are now final while it loads via `loadGates` (legacy only); `no-color-literals`'s header cites
> that dead pin as its real-tree receipt. **D6:** `grant-liveness-family.test.ts` and
> `drizzle-registry-conversion.test.ts` are red on a quiet tree (5 s default timeout, no `scaledBudget`).
> **D7:** 7 of 9 roster rows wrong — two bare labels, one asserting the "in className/cn" context #1954
> removed, two describing retired allowlists, one stale row count. **Sweeps:** 31 narrowings cut → 19 enforced
> / **10 unenforced (32%)** each with a both-arms falsifier / 2 unfalsifiable-and-documented / **0 mutually
> redundant (measured)**; 36 expectation rows, 10 count-less (all in `no-tailwind-dark-variant`, derived count
> \= 1 for all ten), 21 of 22 transplants correctly red. **Clean:** zero `ctx.relativePath` #1972 exposure (all
> 7 call sites take visited nodes), no loader-property claims, `check:structure` `0 tool error(s) · 0 withheld`
> with all ten subjects `✓`. **Copy candidates:** `spacing-tier-home-health` for a HARD tripwire policy (owes
> one §4.5 pin); `no-tailwind-dark-variant` for an ORDINARY policy but only after its ten counts and one fence
> close. **Anti-pattern to name explicitly:** `no-raw-spacing-in-features`'s header, whose narrowing-verification
> paragraph certifies one level above the claim it defends.
