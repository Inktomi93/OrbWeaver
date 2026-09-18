---
kind: review
status: active
updated: 2026-09-12
---

# Fresh-context verification of the twelve #1584 Verify-column rows (`cb-v-ledger-fixes`)

Lane `cb-v-ledger-fixes`, isolated worktree `.claude/worktrees/agent-ac04f9f9842761c83`, tree
`a182d1fab`. Every number below is a run I produced in this session; nothing is re-quoted from a commit
message except where the row explicitly says so.

## Verdict table

| board row | commit | verdict |
| - | - | - |
| #1968 | `f72fa4f0e` | CONFIRMED — arm C measured at exactly 11 on the real tree |
| #1993 | `ec336d41c` | CONFIRMED |
| #1999 | `2aba9c0ed` | CONFIRMED |
| #1989 / #1990 | `a54394df6` | CONFIRMED |
| #1987 | `8ad418868` (+ `23b31b3ca`) | CONFIRMED |
| #2000 | `23b31b3ca` (+ docs) | **PARTIAL** — Tier 2a only; 2b, 2c and Tier 3 remain |
| #2006 | `0b9a4dfa2` | CONFIRMED (one out-of-scope observation) |
| #1979 / #1998 / #2003 | `2bacd5ef9` | CONFIRMED |
| #2012 | `415d53370` + `2c79320a4` | CONFIRMED |

Three SCOPED suites are RED on the tree today. None is caused by these twelve rows; all three are
separate live regressions from later #1584 commits, recorded in
"[Three live scoped-suite reds](#three-live-scoped-suite-reds)" and as ledger rows below.

## Instrument runs

| run | result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/gates` + 4 named extras (84 files) | 3 files failed / 81 passed · 9 tests failed / 630 passed · exit 1 |
| the same three failing files, re-run alone on a swept tree | identical 9 failures — reproducible, not contention and not my probe |
| `pnpm -s check:policy-conformance` | 237 final policies · 2594 proof rows · **0 failures** · 131 grant rows · 0 invalid · exit 0 |
| `pnpm -s check:structure` | run COMPLETE · exit 1 · **0 tool error(s) · 0 withheld** · 0 alarms |

## Real-tree structure run

`reports/runs/structure/agent-ac04f9f9842761c83-2474787-2026-09-12T12-26-32-002Z/check-structure.json`.

- **`0 tool error(s)` and `0 withheld`** — the two numbers §5 names as the only real-tree question a
  conformance green cannot answer. Also `0 alarm(s)`.
- `ran 297/297 active gate(s) (60/60 legacy · 237/237 final)` — run COMPLETE, so no policy is silently
  absent from these counts.
- `final policies: 237 ran · raw 2220 = waived 1177 + granted 131 + effective 912 (857 error, 55 warning)`.
- **Exit 1 is the legacy baseline, not a verdict on this wave** (constitution / `#1584` standing
  exception). It is NOT exit 2: the run is a verdict.

**LOAD CAVEAT (orchestrator, mid-run).** Three `check:structure` runs were concurrent on the box during
this leg and a parity suite on main timed out under that load. Every millisecond figure the run printed
(`single-pass 165.7 s`, `policy-soundness 72.3 s`) is UNDER LOAD and is not a timing baseline. The
finding counts and the two headline numbers are unaffected — they are deterministic over the tree, the
run reported COMPLETE, and an exit-2 would have voided the leg (it did not occur).

### Raw findings, every policy the nine commits touched

All zero except three, and none of the three is attributable to these commits:

| policy | raw | note |
| - | -: | - |
| `policy-proof-expectations` | 50 | **ARM C = 11 · ARM M = 39** — see #1968 below |
| `no-inline-types` | 26 | pre-existing live debt, explicitly OUT of `8ad418868`'s scope (#1988). **This also adjudicates the refutation ledger's single UNADJUDICATED row** (wave 5's real-tree `no-inline-types` count): it is 26 today |
| `fetch-fn-in-features` | 1 | `packages/client/src/features/app-shell/lib/bug-report-capture.ts:223` — a real product finding, not a proof defect |

Zero raw on all of: `no-rejected-cors-proxy` · `zod-modern-spellings` · `persistence-boundary` ·
`schema-branding` · `no-array-literal-querykey` · both tier-home twins · all twelve origin-client
policies · all five #2006 modules plus `untrusted-regex-safe-exec` and `empty-state-has-action` ·
`client-structure` · `feature-structure` · `verify-registry-parity` · `eslint-grant-liveness` ·
`no-raw-color-in-css` · `bus-fact-health` · `no-raw-matchmedia` · `content-part-seam` ·
`no-inline-domain-interface` · `no-mutating-register-api` · `persisted-store-registry` ·
`domain-freshness-plane` · `lifecycle-portability` · `ownerid-registry`.

## Per-row evidence

### #1968 — `policy-proof-expectations` 78 → 11, and the eleven survivors

**Measured on the real tree, not read.** The enforcer reports **50 findings across 23 modules**, and
classifying each by its own message gives **ARM C 11 · ARM M 39**. The eleven ARM-C findings are exactly
the five #2001 modules at exactly #2001's cardinalities:

| module | ARM-C findings | #2001's table |
| - | -: | -: |
| `domain-freshness-plane.ts` (`:704 :711 :729 :745 :759 :773`) | 6 | 6 |
| `lifecycle-portability.ts` (`:551 :561`) | 2 | 2 |
| `ownerid-registry.ts` (`:176`) | 1 | 1 |
| `persisted-store-registry.ts` (`:375`) | 1 | 1 |
| `verify-registry-parity.ts` (`:103`) | 1 | 1 |

So the 78 → 11 burn-down HELD and the residue is precisely the declared exemption. The 39 ARM-M findings
across 18 other modules are a DIFFERENT arm accumulated by later conversions, not #1968's residue — but
they mean **the enforcer's total is 50 today and any forward-cite of "11 findings" is wrong**; "11 arm-C
findings" is the correct sentence.

Independently, reading every `expect: {` in the five modules found exactly eleven `mustFlag` rows with no
`count` — the same eleven, at the `expect:` lines (`domain-freshness-plane:707 725 741 755 769 781`,
`lifecycle-portability:557 568`, `ownerid-registry:182`, `persisted-store-registry:381`,
`verify-registry-parity:109`); the enforcer anchors a few lines earlier, on each row's own opening brace.

**Planted `count: 99` control**, four rows in `client-structure.ts`, each cut in isolation in a sibling
scratch module with an exactly-once anchor assertion and a 0-failure baseline first:
`mustFlag[0] got=3` · `mustFlag[1] got=1` · `mustFlag[4] got=1` · `mustFlag[8] got=1`. Every declared
count is EXACT.

**One correction, to #2001 rather than to the commit.** #2001 asserts *"Each of the 11 carries `token` +
an arm-specific `messageIncludes`"*. Three of the eleven carry `messageIncludes` ONLY and no `token`:
`ownerid-registry:182`, `persisted-store-registry:381`, `verify-registry-parity:109`. #2001 also heads the
class "11 rows across 6 files" while its own table lists five modules.

### #1993 — wave-1 residual

Re-cut in a sibling scratch module (never a `?query` re-import), cut DIRECTION stated, anchor asserted to
occur exactly once, baseline 0 failures before each cut:

| module | cut | result |
| - | - | - |
| `schema-branding` | drop `column.primaryKey` (flag MORE) | `mustPass[3]` red — *things.id … without a canonical brand* |
| `schema-branding` | drop `propertyName === "id"` (flag MORE) | `mustPass[4]` red — *things.code …* |
| `schema-branding` | drop `parentBrand === null \|\|` (flag MORE) | `mustPass[5]` red — *messages.chatId … parent chats.code carries none* |
| `no-array-literal-querykey` | widen the name fence to every `PropertyAssignment` | `mustPass[5]` red (as a PASS TOOL ERROR — the row's hardcoded `token: "queryKey"` cannot anchor on `otherKey`) |
| `no-array-literal-querykey` | widen `population: "@client"` → `"@authored"` | `mustPass[6]` red |

**The DISSOLVED cell is a MECHANISM, not a shrug.** `SANCTIONED_HOMES`
(`tooling/src/verify/gates/no-raw-spacing-in-features.ts:39`) has exactly two keys,
`packages/ui/src/layout/` and `packages/ui/src/markdown/`, both already inside the policy's
`["@client","@ui"]` population. No fixture placed under an ADDED population root can ever land on one, so
no discriminating fixture EXISTS — guide §4.1's fourth outcome, recorded in the header together with the
INVERTED cut direction a tripwire needs. The §4.5 deferral pin
(`tests/tooling/verify/gates/tier-home-health-family.suite.int.test.ts`) passed 3/3 in my battery.

### #1999 — the origin-client narrowings

Fourteen `mustPass` rows landed tagged `#1999` across nine modules; `no-context-returntype`'s two cuts are
documented in its header as MUTUALLY REDUNDANT / UNFALSIFIABLE rather than faked. 14 rows + 1 documented =
the commit's "15 narrowings", and its cited conformance delta (+14 rows) matches the ROW count, not the
narrowing count. Both numbers are internally consistent.

| cut | policy DRIVEN | result |
| - | - | - |
| `no-static-staletime` KEY fence (flag MORE) | `no-static-staletime` | `mustPass[6]` red |
| `no-static-staletime` BANNED-value fence (flag MORE) | `no-static-staletime` | `mustPass[7]` red |
| `no-context-provider` `.Provider` member-name fence (flag MORE) | `no-context-provider` | `mustPass[5]` red |
| **shared** `lib/react-origin.ts` `couldNameReactExport` prefilter, whole clause deleted | `no-forward-ref` | `mustPass[5]` red |
| the same patched reader | `no-use-context` | 0 failures |
| the same patched reader | `no-context-provider` | 0 failures |
| **shared** `lib/react-origin.ts` `importDoor` `getName() !== exportedName`, deleted | `no-forward-ref` | `mustPass[6]` red |
| the same patched reader | `no-use-context` · `no-context-provider` | 0 failures each |

The shared cuts re-imported the PATCHED reader through a patched copy of EACH gate, so the sibling zeros
are a measurement rather than §4.1's wrong-sibling false clean — and they are the expected shape: the
commit states the shared fence is pinned ONCE, in `no-forward-ref`.

### #1989 / #1990 — live escapes and dead third answers

- **#1989/D4, red-first.** Restoring the exact pre-`a54394df6` visitor (`enclosingBody` returning
  `undefined` at module scope, the call silently dropped) turns `no-manual-autosave-flush` `mustFlag[4]`
  red — *expected at least one effective finding but got 0*. The escape was real; the fix closes it.
- **Throw-probe, 3 of 9.** The unreadable branch's report replaced by
  `throw new Error("CBVLF-UNREADABLE-ARM-REACHED")` in a sibling scratch module:

| module | result |
| - | - |
| `no-forward-ref` | `mustFlag[7]` PASS TOOL ERROR `CBVLF-UNREADABLE-ARM-REACHED` — arm REACHED |
| `no-use-context` | `mustFlag[8]` PASS TOOL ERROR — arm REACHED |
| `fetch-fn-in-features` | `mustFlag[4]` PASS TOOL ERROR — arm REACHED |

Zero of three came back "0 failures", so on this sample the #944 third answer is genuinely live.

### #1987 — `no-rejected-cors-proxy` and the ordinary-visitors worst four

Every member of `STRING_KINDS` is individually pinned. Five cuts, each dropping ONE member:

| dropped kind | row that died |
| - | - |
| `StringLiteral` | `mustFlag[0]` |
| `TemplateHead` | `mustFlag[1]` |
| `NoSubstitutionTemplateLiteral` | `mustFlag[2]` |
| `TemplateMiddle` | `mustFlag[3]` |
| `TemplateTail` | `mustFlag[4]` |

Five kinds, five distinct rows, one row per kind — the header's *"in any part of a template"* is a pinned
claim rather than prose. The population fence: widening `population: "@server"` → `"@authored"` reds
`mustPass[2]`, which carries the in-population `anchor.ts` the population-falsifier rule requires.

`persistence-boundary`'s fail-closed third answer now has the written-binding row `mustFlag[6]`
(`messageIncludes: "cannot place its binding"`), disjoint from the precise arm's
`"outside the persistence doors"`. Its `mustPass[1]` `why` states plainly that the row does NOT isolate
`isCapabilityProbe` and points at the header's 2^3 cut matrix — that is the honest form §4.1 asks for, and
the header also records `memberPath.length === 0` as UNFALSIFIABLE with its mechanism.

### #2000 — PARTIAL

`tests/tooling/verify/gates/split-arm-parity.test.ts` covers **Tier 2a and only Tier 2a** — the four
wave-5 splits, both halves each (`no-raw-egress`/`no-rejected-cors-proxy`,
`persistence-boundary`/`persisted-store-registry`,
`registry-assembly-at-door-only`/`no-mutating-register-api`,
`no-inline-types`/`no-inline-domain-interface`), replayed against `BASE = 5dd83aaa4` with per-example
LEGACY-SIDE coverage asserted so a vacuous replay cannot read as a pass. It passed 8/8 in my battery.

What the row's own re-scope comment lists as remaining, and what is NOT on the tree:

- **Tier 2b (2 modules)** — `contract-banned-shapes`, `nullable-column-inequality`. No frozen-legacy
  replay exists: `tests/tooling/verify/gates/schema-fact-wave-1.suite.test.ts` contains no `BASE`, no
  `runPass`, no frozen-legacy import.
- **Tier 2c (7 modules)** — schema-fact's remainder. Same receipt: no differential anywhere.
- **Tier 3 (17 one-to-one ports)** — guide §4.6 carries the GENERAL close-by-rule form (*"a 1:1 port whose
  legacy side was EXECUTED and returned zero"*), but no per-module closure is recorded and the two named
  exceptions (`turn-identity`, `plugin-dump-guard` / #1986) are unaddressed.

**Recommendation: `refute` back to Ready** with the remaining spec = Tier 2b + Tier 2c + the Tier 3
close-by-rule ruling and its two exceptions. Everything Tier 2a promised did land, and it is a good
exemplar for the rest.

### #2006 — the sealed-origin decision

- **Five modules changed**, exactly the five the commit names: `discovery-no-stats-rollups`,
  `membership-enforcer`, `providers-runner-seal`, `turn-identity`, `vector-scope-derived`. Pre-fix source
  (`git show 0b9a4dfa2~1:…`) confirms `readSealedOrigin(...).kind !== "foreign"` in each.
- **`untrusted-regex-safe-exec` was NOT changed.** Its last commit is `4885cde80`, which predates
  `0b9a4dfa2`, and `:65` still reads `readSealedOrigin(callee, REGEX_KIT_HOME).kind === "sealed"` — the
  ACQUITTING direction, guide §4.6 shape 3. Correct as-is.
- **`empty-state-has-action` already called the decision** — `:94`
  `sealedOriginReports(readSealedOrigin(tagName, EMPTY_STATE_HOME), tagName)`, last touched `e7bbc809d`,
  also before `0b9a4dfa2`.
- **Post-fix census:** zero `kind !== "foreign"` comparisons survive anywhere under `tooling/src/verify/`.
- **Real-tree raw counts: 0 on all seven modules** (the five fixed plus the two correctly untouched), which
  matches the commit's "a latent trap, not live accusations".

**Out-of-scope observation, filed rather than fixed.** `vector-scope-derived`'s SECOND arm —
`vectorTableArgument` at `:80` and `:86` — still reads the verdict raw as `kind === "sealed"`. That is a
FOURTH polarity the guide's three shapes do not cover: only a PROVEN sealed origin reports, so an
UNREADABLE table argument at a write site passes SILENTLY (fail-OPEN), while the module's other arm is
fail-closed and its header says so in the same file. Pre-existing and outside #2006's stated scope.

### #1979 / #1998 / #2003

- **Resource readiness.** 22 modules declare `analysis: "resource"` today (the commit's "ten" has decayed
  upward); ALL 22 call `readyResourceValue`, plus `design-audit-rule-proof` which is not
  `analysis: "resource"`. `ast-grep -l ts -p '$X.status !== "ready"'` over `tooling/src/verify/gates/` —
  **scannedFileCount=305, one match: `bus-fact-health.ts:29`.** Planted positive control
  (a scratch file with the same comparison) re-ran to **scannedFileCount=306, two matches**, then removed.
  The other three grep hits (`client-structure.ts:18`, `ui-exports-map-complete.ts:35`,
  `server-layout.ts:27`) are COMMENT text explaining why the branch is absent — which is exactly why the
  ast-grep census decides and the grep only corroborates.
- **`bus-fact-health` must not be "fixed", and has not been.** `:25-36` receipts a CONSTANT `members: 1`
  (§4.5b corollary 2), REPORTS the non-ready fact via `ctx.report.file`, and throws only on an empty
  effective population.
- **FIVE grants.** `lib/reviewed-grants.ts` holds five `policyId: "no-raw-matchmedia"` rows
  (`:402 :411 :419 :427 :435`). The module header `:12` says *"All FIVE are exact `(subject, operation)`
  rows"*. The roster row `Core-Enforcement-Active-Gates.md:306` enumerates five mechanisms rather than
  carrying a count, which is what the commit said it would do.
- **`content-part-seam` member arm.** `kinds: [SyntaxKind.ImportSpecifier]` only (`:82`); the
  `readMemberReference` import is gone (the only surviving mention is the header comment at `:21`). The
  subject really is type-only: `packages/contracts/src/chat/bus.ts:39` `export type ChatContentPart =`.
  Siblings keep their value-position tuples (`no-direct-users-read:73`, `scrubber-home:80`). The commit
  calls the two sibling tuples "identical"; `scrubber-home` also carries `CallExpression` — a prose
  imprecision, not a defect.

### #2012 — the refutation ledger's rollup

I re-implemented the ledger's own stated counting method (every `| `-prefixed line between `## THE LEDGER`
and `## CLASS ROLLUP` splitting into ≥6 `" | "` cells, dropping each table's two header lines; bin cell 5
by its first bolded state word, cell 4 by its first named class) and ran it over today's body.

- **Row set: 100.** Eleven separator lines found — the eleven tables the method names.
- **TOTAL: `100 · CLOSED 45 · OPEN 48 · SUPERSEDED 4 · DISSOLVED 1 · UNADJUDICATED 1 · N/A 1`** — exactly
  the published rollup.
- **Per class:** §4.1 48 (15/30/2/1) · §4.2 1 (0/0/1) · §4.5 4 (1/3) · §4.6 0 · §5b.2 3 (2/1) ·
  §5b.5 8 (4/4) · §5b.7 6 (4/2) · roster row 7 (3/4) · other 23 (16/4/1/–/1/1). All match.
- **One under-specification in the stated method.** "Bin cell 4 by its FIRST named class" is ambiguous for
  the single row whose cell reads `other (§5b.3) · §5b.5 header`: read literally the first named class is
  §5b.3, which is not a rollup column. The published table treats it as `other` (other 23 / §5b.5 8);
  reading it as §5b.5 gives other 22 / §5b.5 9. Every other row is unambiguous and the TOTAL is invariant.
- The ledger's single UNADJUDICATED row (wave 5's real-tree `no-inline-types` count) is now measurable:
  **26** (this session's `check:structure`).

## Three live scoped-suite reds

`.claude/rules/gates-and-tooling.md` makes the #1584 red-by-construction list EXHAUSTIVE and a scoped
suite red never baseline. All three reproduce on a clean tree at `a182d1fab`; none is attributable to the
twelve rows.

1. **`tests/tooling/verify/ops/structure-mixed.suite.int.test.ts` — 5 tests.** Its three-file probe corpus
   expects `ran 3/3 active gate(s) (1/1 legacy · 2/2 final)`; the run reports `(0/0 legacy · 3/3 final)`.
   Cause: `04e455f4d` converted `assumes-single-replica` to `defineGate` — the documented #1983
   legacy-roster-shrink class. `04e455f4d` is NOT an ancestor of `2bacd5ef9`, so that commit's
   "structure-mixed.suite.int green" floor claim was TRUE when it was made.
2. **`tests/tooling/verify/gates/over-art-plate-arm.int.test.ts` — 1 test.** `17a495fb8` moved the gate's
   `workItem` from 626 to 2024 (`over-art-plate-arm.ts:160`) and did not sweep
   `over-art-plate-arm.int.test.ts:137`, which still asserts 626.
3. **`tests/tooling/verify/gates/dangling-refs.repo.int.test.ts` — 3 tests, 10 phantom cites in LIVING law
   docs.** `Core-Enforcement-Active-Gates.md:87,89,95,97,99,128` and `Core-Tooling-Law.md:73,230,259` cite
   `ROOT_CONFIG_IMPORTS` · `PROJECT_SITES` · `FULL_PRIORITY_CALLERS` · `CLOCK_SITES` · `ARGV_ENTRIES` ·
   `YOU_MODAL_IDS`, constants the front-door split `e2b183b80` deleted. And
   `docs/design/gate-runtime-standardization.md:539` cites the ILLUSTRATIVE fixture path
   `packages/ui/src/primitives/index.ts/x.ts`, added by docs commit `481b16d2f` — a doc that teaches a
   §4.1 method by naming a path that does not exist trips the repo's own phantom-path gate.

## LEDGER ROWS (9 rows)

Written in `refutation-ledger-2026-09-12.md`'s row format for verbatim append under a
`### cb-v-ledger-fixes` section.

| module | wave · `path:line` | defect | class | state | receipt |
| - | - | - | - | - | - |
| `structure-mixed.suite.int` | cb-v-ledger-fixes `tests/tooling/verify/ops/structure-mixed.suite.int.test.ts:100` | the suite asserts `ran 3/3 active gate(s) (1/1 legacy · 2/2 final)` on its own three-file probe corpus; `04e455f4d` converted `assumes-single-replica`, so the real answer is `(0/0 legacy · 3/3 final)` and all 5 tests red | other (#1983 legacy-roster shrink) | **OPEN** | reproduced twice on a swept tree at `a182d1fab`, once inside the 84-file battery and once alone; `git merge-base --is-ancestor 04e455f4d 2bacd5ef9` is FALSE, so `2bacd5ef9`'s "structure-mixed.suite.int green" floor line was true when written |
| `over-art-plate-arm` | cb-v-ledger-fixes `tests/tooling/verify/gates/over-art-plate-arm.int.test.ts:137` | the pin asserts `{ severity: "warning", workItem: 626 }`; `17a495fb8` moved the gate to `workItem: 2024` (`over-art-plate-arm.ts:160`) and did not sweep its own int test | other (coupled site) | **OPEN** | `pnpm test:scoped` — *expected { severity: 'warning', workItem: 2024 } to deeply equal { severity: 'warning', workItem: 626 }* |
| `dangling-refs` (roster docs) | cb-v-ledger-fixes `docs/architecture/core/Core-Enforcement-Active-Gates.md:87,89,95,97,99,128` + `Core-Tooling-Law.md:73,230,259` | nine phantom SYMBOL cites (`ROOT_CONFIG_IMPORTS`, `PROJECT_SITES`, `FULL_PRIORITY_CALLERS`, `CLOCK_SITES`, `ARGV_ENTRIES`, `YOU_MODAL_IDS`) left behind when the front-door split `e2b183b80` deleted the legacy constants | roster row | **OPEN** | `dangling-refs.repo.int.test.ts` 3 tests red on a swept tree; the gate names all nine with `file:line` |
| `gate-runtime-standardization` | cb-v-ledger-fixes `docs/design/gate-runtime-standardization.md:539` | the §4.1 "UNFALSIFIABLE owes a constructed fixture" paragraph teaches its method by naming the ILLUSTRATIVE fixture path `packages/ui/src/primitives/index.ts/x.ts`, which resolves to nothing and trips the repo's own phantom-path gate | other (doc drift) | **OPEN** | added by `481b16d2f` (`git log -L 539,539`); one of the ten `dangling-refs` findings |
| `vector-scope-derived` | cb-v-ledger-fixes `tooling/src/verify/gates/vector-scope-derived.ts:80,86` | the WRITE arm (`vectorTableArgument`) still reads the sealed VERDICT raw as `kind === "sealed"` — a FOURTH polarity beside guide §4.6's three: only a PROVEN sealed origin reports, so an UNREADABLE table argument at a write site passes SILENTLY while the module's other arm is fail-closed and its header claims fail-closure | §5b.2 message | **OPEN** | `0b9a4dfa2` fixed only the import/member arm (`:119`); post-fix census over `tooling/src/verify/` shows these two as the only raw sealed-verdict reads besides `untrusted-regex-safe-exec:65` (correct, shape 3) |
| `policy-proof-expectations` | cb-v-ledger-fixes `tooling/src/verify/gates/policy-proof-expectations.ts` (enforcer worklist) | the enforcer's real-tree residue is **50**, not the 11 the #1968 commit and the ledger's cross-cutting row both cite; the extra **39 are ARM M** (non-discriminating `messageIncludes`) accrued by later conversions across 18 modules | other | **OPEN** | `check:structure` `2474787-…T12-26-32`: 50 findings / 23 modules; classified by message text ARM C 11 · ARM M 39. **ARM C is still exactly 11 and exactly #2001's five modules** — the #1968 burn-down HELD; only the forward-citable total is wrong |
| `#2001` (the exemption's own text) | cb-v-ledger-fixes `#2001` body | *"Each of the 11 carries `token` + an arm-specific `messageIncludes`"* is FALSE for three of them, and the heading says "11 rows across 6 files" while the table lists five modules | other | **OPEN** | `ownerid-registry:182`, `persisted-store-registry:381`, `verify-registry-parity:109` carry `messageIncludes` only, no `token` |
| `no-inline-types` | w5 (the ledger's one UNADJUDICATED row) | wave 5's real-tree finding count could not be adjudicated because `check:structure` was fenced | other | **CLOSED (adjudicated)** | `check:structure` this session: **raw 26**, `ok=false`, all `exported type/zod-schema outside a type home`. Pre-existing #1988 debt, explicitly out of `8ad418868`'s scope |
| `#2000` | cb-v-ledger-fixes `tests/tooling/verify/gates/split-arm-parity.test.ts` | the row's re-scoped spec is Tier 2a + 2b + 2c + a Tier 3 ruling; only Tier 2a landed | §4.6 differential | **OPEN (PARTIAL)** | `split-arm-parity.test.ts` covers the four wave-5 splits (8 policies) against `BASE 5dd83aaa4`, 8/8 green. `schema-fact-wave-1.suite.test.ts` contains no `BASE`, no `runPass`, no frozen-legacy import → Tier 2b/2c absent; no per-module Tier 3 closure recorded and `turn-identity` / `plugin-dump-guard` unaddressed |

## WHAT I DID NOT COVER

- **No `pnpm check` / `pnpm verify` / `pnpm verify --push`, no `gate-conformance.repo.int`, no
  `gate-ignore-grammar.repo.int`, no `check-gates.repo.int`** — the first are red by construction
  mid-migration and the last three are orchestrator-fenced.
- **`pnpm gate:contract` was NOT run.** Every "761 findings / 0 for this module" line in the nine commit
  messages is therefore UNVERIFIED by me.
- **No typecheck, no biome, no eslint.** Those claims in the commit messages are unverified.
- **The conformance-row DELTAS are unverifiable today.** Each commit cites a before/after row count
  (1686 → 1704, 1770 → 1784, 1784 → 1789 …). The corpus is now 237 policies / 2594 rows, so I can only
  confirm the CURRENT state is 0 failures; the historical deltas are re-quoted, not re-measured.
- **The re-cuts are a SAMPLE.** 5 of #1993's narrowings, 3 of #1999's (plus both shared-reader fences),
  5 of 5 `STRING_KINDS` members, 3 of 9 #1990 throw-probes, 1 of 3 #1989 live escapes, 4 planted
  `count: 99` controls in ONE of #1968's 17 modules. Unsampled rows are unmeasured by me.
- **`8ad418868`'s `no-inline-types` (6 falsifiers) and `zod-modern-spellings` (6) were READ, not CUT.**
- **The #2000 Tier 2a differential was not adversarially probed.** I ran it and read its assertions; I did
  not plant a positive control inside `split-arm-parity.test.ts` to prove it discriminates. Tier 1's lane
  did that for its own eight; nobody has for these four.
- **#2001's per-row "driven by" counts (24/25/42/27/14/41) are unverified** — I confirmed WHICH rows are
  exempt and that there are eleven, not that each count equals the named registry's cardinality.
- **No rendered / UI check.** `2bacd5ef9` edited `packages/ui/src/primitives/media-grid/media-grid.tsx`
  (10 lines) and I did not look at the rendered result; that is a `side-eye` question.
- **The three live reds are attributed by `git log -L` and ancestry, not by bisect.**
- **All timings in the structure run are UNDER LOAD** (three concurrent structure runs on the box); only
  the finding counts, the two headline numbers and the COMPLETE verdict are load-independent.

## Proposed lessons (the orchestrator owns the memory write)

- **A shared-reader §4.1 cut owes the SIBLING zeros, not just the consumer red.** Driving one patched
  `lib/` reader against every consumer policy is what turns "the fence is pinned once, deliberately" from
  a header claim into a measurement — and it is the same instrument that catches §4.1's wrong-sibling
  false clean.
- **A gate-corpus suite is contaminated by your own scratch probe.** A verifier that plants
  `_cbvlf_*.ts` under `tooling/src/verify/gates/` while a `tests/tooling/verify/gates/**` battery is
  running reads its own probe as a corpus regression. Battery FIRST, probe SECOND, and re-run any red
  suite on a swept tree before attributing it.
- **A §4.1 row can die as a PASS TOOL ERROR rather than as a finding**, when the row's `expect.token` is a
  literal the widened subject does not contain. Still a discriminating row — but "the cut reds this row"
  and "the cut makes the policy flag" are different sentences and the receipt should say which.
- **An enforcer's TOTAL and its ARM are different numbers, and only the arm is the burn-down.**
  `policy-proof-expectations` reads 50 today against a recorded 11; the 11 is still exactly right for
  ARM C. Cite the arm, never the total, or every later conversion looks like a regression of the fix.
