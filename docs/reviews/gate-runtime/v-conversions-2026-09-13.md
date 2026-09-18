---
kind: review
status: active
updated: 2026-09-13
---

# Verifier report — the text-citation and callback-provenance conversion wave (#1584)

Lane `v-conversions-2026-09-13`, fresh context, READ-ONLY on source. Subjects: `ff3eacb44` (text-citation
family) and `1e81658b4` (callback-provenance four, with the `detached-work-traced` split). Every number
below was produced in this session; nothing is quoted from a lane report or a commit message except to
name the claim being tested.

**The tree moved under this run and the movement is disjoint from the subjects.** Measurements began at
`main` = `4f121ffb3` and finished at `011233309`; the three intervening commits
(`5dd925273`, `64dfbf349`, `011233309`) touch `docs/design/gate-runtime-standardization.md`,
the former `docs/test-baseline/manifest.json`, `tests/tooling/verify/cli.int.test.ts`,
`tests/tooling/verify/ops/warning-promotion.suite.int.test.ts`, `tooling/src/verify/cli.ts`,
`tooling/src/verify/index.ts`, `tooling/src/verify/lib/policy-command.ts`,
`tooling/src/verify/lib/verb-tail.ts`, `tooling/src/verify/ops/scoped.ts` and
`tooling/src/verify/ops/structure.ts` — none of the eight gate modules, neither family test, and nothing
inside `lib/policy-pass.ts` or `lib/ordinary-waiver.ts`. The floor was re-run at the new tip and is
identical. `git status --short` was EMPTY at the end: no probe touched the working tree at any point.

## Verdict summary

| # | Claim | Verdict |
| - | - | - |
| 0 | The orchestrator's floor (198 / 2,185 / 0 / 279 / 81; 24 + 10 test cases; `ledgers-fresh` 0) | **CONFIRMED** (reproduced twice, at both tips) |
| 1 | All four ordinary doors re-anchored on authored text and discriminating in both directions | **CONFIRMED** (driven, with a no-marker control per policy) |
| 2 | The text-citation family's `hard` authority is a measured runtime fact | **CONFIRMED as a mechanism · PARTIALLY REFUTED as applied** — two of the three have an arm reporting on AUTHORED text where the ordinary door demonstrably works |
| 3a | `audit-client-tests`' deleted refusal arm was unreachable because resolution never leaves the calling file, in the final policy AND in legacy | **REFUTED** — it leaves the file for `import * as h; h.expectOk(…)`, and legacy FOLLOWED it |
| 3b | `execution: "selected-files"` is correct | **CONFIRMED** (scoped verdicts equal the full-run slice for every file, including both helper-import shapes and the cross-file-leak shape) |
| 4 | The five translated `detached-work-traced` markers BIND (real tree 0 effective / 5 waived / 0 alarms) | **CONFIRMED** (driven on the real workspace) |
| 5a | `diagnostic-legibility` 100 → 71 with 43 legacy-only rows, all legacy false positives | **CONFIRMED** — independently reproduced at exactly 100 / 71 / 43, and 0 of the 43 is a plain literal |
| 5b | Exactly ONE legacy example loads the `-health` arm and it reproduces 1:1 | **CONFIRMED** (all 20 legacy rows replayed) |
| 5c | "13 final-only from the `unreadableMessage` widening" | **REFUTED (count)** — there are **14**, and the 14th is a different widening class. The lane's own arithmetic does not close: 100 − 43 + 13 = 70, not 71 |
| 6 | `pd-citation-integrity` 2 findings on both sides at columns 46/20 | **REFUTED** — 0 on both sides. Reported mid-run; already ruled into §4.6 at `011233309` |

Four secondary findings (S1–S4) are listed after the main items.

## 0 — The floor

```
pnpm test:scoped tests/tooling/verify/gates/callback-provenance-family.suite.test.ts \
  tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts \
  tests/tooling/verify/gates/text-citation-family.suite.test.ts \
  tests/tooling/diagnostic-legibility.residual.test.ts
→ EXIT=0 · Test Files 4 passed · Tests 35 passed · Type Errors no errors
   callback-provenance-family 12 · enforcement-registry-parity 12 · text-citation-family 10 · residual 1
```

```
pnpm check:policy-conformance
→ EXIT=0 · 198 final policies · 2185 proof rows · 0 failure(s) · 105 grant rows · 0 invalid
         · (corpus: 279 module(s), 81 legacy proven by gate-conformance)
pnpm check:ledgers-fresh
→ EXIT=0 · fresh manifest.json (2632 derived) · population.json (595) · flags.md (123) · configs (13)
```

Re-run at `011233309`: conformance identical (198 / 2185 / 0 / 279 / 81), the three family suites 34
passed. **CONFIRMED.**

Structural row audit over all eight modules (loaded through their real exports, not grepped): every
`mustFlag` row carries an `expect`; exactly one row is bare-`{count}` only —
`detached-work-traced` `mustFlag[1]` (`count: 8`, the eight promise-link shapes, ported verbatim from the
legacy row whose count WAS the discriminator). No proof fixture in any of the eight uses a bare package
specifier; every relative specifier is planted in the row's own file map, which the committed
dangling-specifier sweep re-derives from the descriptors (it ran green, and it asserts its own visited
count).

## 1 — The four ordinary waiver doors. CONFIRMED, driven.

Driven independently of the committed family test, through `runPolicyPass` against each policy's real
export, in the session scratchpad (`v-conv-door.ts`); no file in the repo was read as evidence of
behaviour. Three arms per policy: a **no-marker control** (the fixture must produce exactly ONE finding on
its own — otherwise a "waived" arm is green by vacuity), the **positive** triple, and the **dead-position
negative**.

| policy | control findings / token | positive (eff / waived / alarms) | negative (eff / own alarms) | alarm text |
| - | - | - | - | - |
| `diagnostic-legibility` | 1 / `message` | 0 / 1 / 0 | 1 / 1 | `… names a dead position for diagnostic-legibility` |
| `evaluate-no-scope-capture` | 1 / `MARK` | 0 / 1 / 0 | 1 / 1 | `… names a dead position for evaluate-no-scope-capture` |
| `audit-client-tests` | 1 / `test` | 0 / 1 / 0 | 1 / 1 | `… names a dead position for audit-client-tests` |
| `detached-work-traced` | 1 / `res.body.cancel` | 0 / 1 / 0 | 1 / 1 | `… names a dead position for detached-work-traced` |

`toolErrors` was 0 in all twelve runs. All three §4.2 assertions hold for all four
(`effectiveFindings []`, `waivedFindings 1`, `authorityAlarms []`), and each arm DISCRIMINATES: flipping
the position token to one the carrier does not declare leaves the finding effective and raises the
dead-position alarm naming that exact policy. The committed family test asserts the same triple inline per
policy and pins the negative sweep's cardinality to `FAMILY.filter(authority === "ordinary").length`, so
it cannot silently shrink.

## 2 — The text-citation `hard` claim. Mechanism CONFIRMED; application PARTIALLY REFUTED.

Probe: each of the three policies re-branded through `defineGate({...gate, authority: "ordinary"})` and
driven over a disk-backed, `git init`-ed scratch fixture exactly as the family test's own `pass()` helper
does. Nothing in the repo was modified.

| policy / arm | subject text | own-policy alarms |
| - | - | - |
| `d-citation-integrity` — TS comment arm | `// per D999 …` | 1 · `ordinary finding packages/contracts/src/x.ts:1:8 points into comment trivia rather than authored code` |
| `d-citation-integrity` — **core-doc Markdown PROSE arm** | `The ruling is D777, …` | **0** |
| `pd-citation-integrity` — TS comment orphan cite | `// FLAG[PD-9]` | 1 · `… packages/server/src/x.ts:1:9 points into comment trivia …` |
| `pd-citation-integrity` — **duplicate id in the registry MARKDOWN** | `\| PD-1 \| again \|` | **0** |
| `dangling-doc-cite` — arm A, TS comment | `// See docs/design/nope-not-here.md …` | 1 · `… points into comment trivia …` |
| `dangling-doc-cite` — arm B, root config | a cite in `knip.ts` | 1 · `… knip.ts:1:8 has no declared source or resource carrier for waiver binding` |

**The mechanism is exactly as the headers describe** — `lib/ordinary-waiver.ts:432` emits *"points into
comment trivia rather than authored code"* and it fires verbatim for every comment-resident arm.

**But the application over-claims for two of the three.** `d-citation-integrity`'s header says *"A `D<n>`
citation lives in a COMMENT **or in doc prose**, and `locateFinding` refuses an ordinary finding whose
token does not survive comment blanking."* Markdown body prose is NOT comment trivia:
`blankResourceComments(text, "markdown")` blanks only `<!-- … -->`, so the restored core-doc arm's finding
survives blanking. Proven positively, not just by the absence of an alarm — adding
`<!-- @orb-waive d-citation-integrity(D777): … -->` above the prose line yields **waived 1** and the prose
finding disappears, i.e. **that arm has a fully working ordinary door**. (The same run also shows the
policy reporting the `D777` inside my own HTML-comment marker, at `:5:38`, which DOES take the
comment-trivia alarm — a neat two-sided control in one fixture.) The same holds for
`pd-citation-integrity`'s duplicate-id arm, which anchors on the second authored occurrence in the
registry's Markdown table.

I am **not** calling `hard` the wrong choice: a policy has ONE authority, both modules also carry a
genuinely comment-resident arm that can never bind, and `dangling-doc-cite` additionally carries the
whole-inventory carrier refusal (reason 2, independently confirmed above — the arm-B finding fails with
*"has no declared source or resource carrier"*, exactly as the header predicts). What is wrong is the
stated REASON in `d-citation-integrity`'s header, which asserts the refusal absolutely and is false for
the arm that conversion RESTORED. `pd-citation-integrity`'s header is better — it hedges with *"this
policy's dominant arm"* — but its adjacent sentence *"A `FLAG[PD-n]` citation lives in a COMMENT — that is
what a citation is here"* is false of the duplicate-id arm. Both are one-sentence corrections; neither
changes a shipped verdict.

## 3 — `audit-client-tests`: the deleted arm, and `execution`

### 3a — the reachability premise. REFUTED.

The claim: *"an imported identifier's symbol declares an `ImportSpecifier`, which has no body, so
`resolveCalleeBody` never leaves the calling file — true of the legacy gate too, neither calls
`getAliasedSymbol`."* `resolveCalleeBody` was re-implemented verbatim from
`tooling/src/verify/gates/audit-client-tests.ts:214-222` and run over four shapes:

```
named import                       callee=expectOk  bodyHome=(no body)      LEFT-THE-FILE=false
NAMESPACE import + property access  callee=expectOk  bodyHome=/p/support.ts  LEFT-THE-FILE=true
aliased named import               callee=expectOk  bodyHome=(no body)      LEFT-THE-FILE=false
same-file helper (control)         callee=expectOk  bodyHome=/p/d.test.ts   LEFT-THE-FILE=false
```

`import * as h from "./support.ts"; h.expectOk(1)` resolves the property-access name node straight to the
exported `FunctionDeclaration` in the other file — no `getAliasedSymbol` needed. So the premise is false.

**And it is a behaviour divergence from legacy, not merely a wrong paragraph.** The legacy
`assertsViaExpectOrHelper` (`86ce80b6c:tooling/src/verify/gates/audit-client-tests.ts:156-183`) recurses
into whatever body it resolved, with no same-file test. The final `assertsWithin`
(`audit-client-tests.ts:262`) adds `body.getSourceFile() === node.getSourceFile()`. Replaying the legacy
function verbatim over one fixture:

```
d.test.ts (namespace helper): LEGACY asserts=true  -> legacy PASSES (no finding)
e.test.ts (named   helper):   LEGACY asserts=false -> legacy FLAGS
```

and the final policy driven through `runPolicyPass` over the same corpus FLAGS `d.test.ts`
(a fixture finding tuple — there is no `tests/tooling/d.test.ts` on the real tree — printed as `d.test.ts:2:1:test`, message "this test callback contains no `expect(...)`"). Legacy
passes it; final flags it. That is a catch-differential the §4.6 record does not name, and **no proof row
pins the guard**: all 17 of this module's rows were read in full and none uses `import * as`, so cutting
the guard reds nothing.

**Blast radius on today's tree is ZERO, measured.** 2,108 `*.test.ts(x)` files under `tests/` scanned; 5
namespace imports exist, and 0 namespace-qualified `expect*`/`assert*` calls. Planted positive control in
the same shell: the pattern fires on `test("x", () => { h.expectOk(1); });`. So this is a latent
divergence plus a false declared-limit paragraph, not a live regression.

### 3b — `execution: "selected-files"`. CONFIRMED.

Driven, not argued. A six-test corpus plus an out-of-population helper, run whole and then once per file
with `requestedPaths` narrowed to that single file:

```
FULL population = 6, toolErrors 0, findings:
  tests/tooling/a.test.ts:1:1:test        (stub)
  tests/tooling/d.test.ts:2:1:test        (namespace helper)
  tests/tooling/e.test.ts:2:1:test        (named import helper)
  tests/tooling/f.test.ts:1:1:describe    (empty describe)
SCOPED a/b/c/d/e/f : SAME · SAME · SAME · SAME · SAME · SAME   MISMATCHES=0
```

Every scoped verdict equals the full-run slice for that file, including the cross-file-leak shape (`b`'s
matcher-expect must not satisfy `a`) and both helper-import shapes. The same-file guard in `assertsWithin`
makes the verdict file-local **by construction** regardless of whether `resolveCalleeBody` can leave the
file, so 3a's refutation does not undermine 3b. The risky field is correct.

## 4 — `detached-work-traced` marker translation. CONFIRMED.

Real workspace (`getWorkspace({root})`, 7,448 files), `detached-work-traced` through `runPolicyPass`:

```
population=1493  owner=success  toolErrors=0
raw=5  effective=0  waived=5  OWN-POLICY ALARMS=0
raw sites: serial-lanes.ts:79:3 tail · engine.ts:1855:13 catch · engine.ts:1996:10 releasedBody
           · model-cache.ts:218:10 entry.promise · rate-limit.ts:90:6 where
```

Five raw findings, five waivers consumed, nothing effective, and **zero alarms attributable to this
policy** — so no marker is stale, dead-positioned, over-broad or duplicated. The 334 alarms in the batch
are all `ordinary waiver at <path> targets unknown policy <x>`, the unavoidable artifact of a
`knownPolicies: [policy]` single-policy run, and every one names a foreign policy id. The five sites and
positions match the five translated markers in the diff one-for-one, including the one position the lane
said changed (`promise` → `entry.promise`). The count is the load-bearing part and it closes at 5 = 5.

Real-tree receipts for the other four in the same invocation:
`detached-work-traced-health` 0 findings, owner success, toolErrors 0 (population 1,493 — the tripwire
does not fire, correctly); `evaluate-no-scope-capture` population 1,110, 0 findings, 0 tool errors;
`audit-client-tests` population 2,109, 0 findings, 0 tool errors; `diagnostic-legibility` population 293,
**71 findings, all effective, 0 waived**.

That last one deserves a sentence: `diagnostic-legibility` is `severity: "error"` and is RED on the real
tree with 71 live findings. This is inherited, not introduced — the legacy side is 100 (reproduced below)
— and the conversion reduces it by 29 while adding 14. It is a pre-existing backlog, but it is a backlog
the conversion grew by 14 rows, and "gates land on a fixed tree" is worth a ruling either way.

## 5 — The §4.6 differentials

### 5a — `diagnostic-legibility` 100 → 71, and the classification. CONFIRMED.

The legacy predicate (`86ce80b6c`) was re-implemented verbatim — `hasPointer`, `terseOkNear`, `unwrap`,
`literalText`, `resolveMessageText`, `messagePropDiags`, `msgTableDiags`, and the
`abs.includes("/tooling/src/verify/gates/") && abs.endsWith(".ts")` filter — and run over the SAME
`getWorkspace` project the final policy ran over, so the two sides share a population by construction:

```
legacy corpus files scanned = 293; legacy findings = 100
final population = 293;        final  findings =  71; toolErrors = 0
LEGACY-ONLY = 43    FINAL-ONLY = 14      (100 - 43 + 14 = 71 ✓)
```

The classification is the load-bearing part, and it holds. Legacy-only rows by the KIND of their
`message:` initializer:

```
TemplateExpression (inline)              36
identifier -> TemplateExpression         4
concat (binary +)                        2
identifier -> concat                     1
                                        ---
                                         43     plain literals: 0
```

**Zero of the 43 is a plain string literal**, which is the structural form of "none of these is a lost
catch of the founding shape". Spot-check of four, reading the interpolated constant each one resolves to:

- `bus-channel-primitive.ts:113` → `` `${MESSAGE} Constructor: ${subject}.` ``; `MESSAGE` (`:38`) carries
  `packages/server/src/transport/` and `transport/trpc/bus-channel.ts`.
- `chrome-registry-completeness.ts:71` → `` `${MESSAGE} ${detail}` ``; `MESSAGE` carries
  `packages/client/src/features/<owner>/lib/<id>-chrome.{ts,tsx}`.
- `content-part-seam.ts:107` → `` `${MESSAGE} Importer: ${subject}.` ``; `MESSAGE` carries
  `domain/chat/substrate/wire-history.ts` and two more paths.
- `form-factory-for-multifield.ts:257` → `` `${MESSAGE} Component …` ``; `MESSAGE` ends
  `D54 §13.4; UI-Primitives-and-Reuse.md §13.4`.

In every case the pointer lives inside the interpolated constant, which legacy's `literalText` returned as
raw `getText()` (`${MESSAGE}` unresolved) and the final `staticSegments` resolves. Legacy false positives,
as classified.

One header inaccuracy fell out of this. `diagnostic-legibility.ts`'s §4.6 note says per-segment judging is
*"strictly stricter"* than the legacy blob. It is not — for the dominant shape (a pointer inside an
interpolated const) it is strictly LOOSER, which is precisely why 43 rows disappeared. The landing commit
message gets this right; the module header does not.

### 5c — the final-only count is 14, not 13. REFUTED.

13 of the 14 carry `token: "unreadableMessage"` and are the declared widening. The 14th is
`tooling/src/verify/gates/no-blanket-suppression.ts:395`, `token: "message"`, and the legacy side has
**zero** rows in that file at all (checked directly, not inferred from the matcher window). Line 395 is:

```ts
ctx.report({ file, line: blanket.line, column: 0, token: blanket.token, message: staged ? INDEX_PREFIX + detail : detail });
```

a **ConditionalExpression** message initializer. Legacy's `literalText` returns `undefined` for it and
skips the site entirely; the final `staticSegments` reads through the conditional and flags it. That is a
**second widening class**, distinct from `unreadableMessage`, and the record names only one. The lane's own
arithmetic betrays it: 100 − 43 + 13 = 70 ≠ 71. With 14 it closes exactly.

### 5b — the split's coverage statement. CONFIRMED.

All 20 legacy `detached-work-traced` example rows (9 `mustFlag` + 11 `mustPass`, taken from the descriptor
at `86ce80b6c` with its imports absolutised into the scratchpad) were replayed through the FINAL
`detached-work-traced-health` policy:

```
mustFlag[0..7]  health findings = 0   (8 rows)
mustFlag[8]     health findings = 1, message "detached-work-traced derived ZERO root-span openers from
                packages/server/src/foundation/ob…"   vs legacy expect {count:1,
                messageIncludes:"derived ZERO root-span openers"}   → 1:1
mustPass[0..10] health findings = 0   (11 rows)
legacy examples that LOAD the health arm = 1
```

Exactly one, reproducing 1:1 on count and message. §4.6's split-vacuity shape stated honestly.

## 6 — `pd-citation-integrity` 2/2 at columns 46/20. REFUTED.

Reported by `SendMessage` mid-run; already ruled into `docs/design/gate-runtime-standardization.md` §4.6 at
`011233309`. Receipts, for the record:

```
FINAL  pd-citation-integrity: population 7155, owner success, toolErrors 0, findings 0
       receipts: pd-registry-documents members 2 · ledger:core-audits-debt resources 2
LEGACY replay (50088b39b reconcilePdCitations, verbatim): 140 registry ids, 0 duplicates, 0 orphans
PLANTED POSITIVE CONTROL (same invocation, PD-17 removed from the id set): 5 orphans
       db/src/schema/chat.ts:619 · users.ts:52 · sessions.ts:90 · rebuild-from-canon.ts:336 · transcript.ts:59
```

Column 46 is `PD-999` at `tooling/src/verify/gates/pd-citation-integrity.ts:152` — inside the module's own
`mustFlag` fixture string, i.e. the differential was taken without the module's own
`notUnder: ["tooling/src/verify/gates/**"]` fence. No occurrence anywhere in the harness corpus at
`ff3eacb44` sits at column 20 (only 46/41/40/105 exist, all four inside that one module), and
`git log ff3eacb44..HEAD` on both registry documents is empty, so the tree did not move under the claim.

Consequence already recorded: the text-citation merge has NO nonzero-legacy-side differential; pd's is a
both-sides-zero receipt.

## Secondary findings

**S1 — "ALL FOUR SHIPPED `authority: ordinary` WITH NO WORKING DOOR" is a historical mischaracterisation.**
No legacy descriptor declares an `authority` field (`git show 86ce80b6c:…` for all four returns nothing on
`authority:`) and `tooling/src/verify/contract/gate.ts` has no `authority` member at all, so no legacy
descriptor "shipped ordinary". Separately, legacy `evaluate-no-scope-capture` reported
`ctx.report(id, { token: id.getText(), offset: 0 })` — an AUTHORED identifier at its own node — so the
"synthetic token" characterisation is true of `audit-client-tests` and `detached-work-traced` (whose
`hit.token` carried `no-assertion`, `async-no-await`, `cancel_2`) and of `diagnostic-legibility` (a
`{file, line, column: 0}` file finding) but not of the fourth. Nothing shipped is wrong; the sentence in
the family test's header and the commit message is.

**S2 — the guard in `assertsWithin` is a NARROWING with no row that dies without it** (see 3a). If the
divergence from legacy is intended, it owes a `mustPass`/`mustFlag` row using `import * as`; if it is not
intended, the alias hop is the fix. Either way the current declared-limit paragraph must stop asserting
that resolution cannot leave the file.

**S3 — population counts in both landing records have already drifted and cannot be re-derived.** The
callback record states 285 / 1101 / 2106 / 1493 for
diagnostic-legibility / evaluate-no-scope-capture / audit-client-tests / detached-work-traced; I measure
**293 / 1110 / 2109 / 1493**. Only `detached-work-traced` reproduces. The drift is tree movement between
the lane's branch tip and `main`, not a defect — but it is another instance of the guide's own rule that a
record's COUNTS rot by construction while its MECHANISM paragraphs bind.

**S4 — no #2030 (ambient-global / package-door) hazard in this wave.** No proof fixture in the eight
modules imports a bare package specifier. The one family that spells ambient globals in its rows is
`evaluate-no-scope-capture`, and those rows are pinned by the module's own `BROWSER_GLOBALS` allowlist
(`evaluate-no-scope-capture.ts:76`, tested at `:283` BEFORE any resolution), which the row at `:463` names
as its falsifier in so many words — so the green is earned by the allowlist, the thing the row claims,
rather than by a fail-closed arm. The secondary clause in the `document` row's `why` at `:455` ("resolve
OUTSIDE the callback's own file (lib.dom.d.ts)") is unverifiable under the conformance virtual project and
is decoration, not the pin.

## What I did NOT cover — this is a limit on the verdict above

- **I did not run `pnpm check:structure`, `pnpm check`, `pnpm verify`, or the three `__g_`-planting suites
  (gate-conformance, gate-ignore-grammar, check-gates)** — forbidden by the brief (three lanes live; those three
  plant fixtures). Two of them were EDITED by the callback lane without being run. **Nothing in this report speaks
  to those three suites, and the callback merge's edits to the check-gates and gate-conformance planters
  (32 and 56 changed lines) are wholly unverified here.** That is where the residual risk sat; all three suites
  were deleted with the legacy runtime on 2026-09-15 (#2176 Phase F), so the risk is closed by retirement.
- **`pnpm gate:contract` was not run** — not in the given floor; the 659 → 619 / 678 → 667 claims are
  unverified.
- **Legacy-side replays**: I drove them for `diagnostic-legibility` (full predicate), `pd-citation-integrity`
  (full predicate), `detached-work-traced`'s A4 arm (all 20 rows), and `audit-client-tests`' assertion
  resolver (the one function). I did **not** replay `evaluate-no-scope-capture`'s legacy side; its
  "1101 = 1101 files, 0/0 findings" is reasoned about from the final side's measured 0 plus a read of the
  legacy `run`, not driven. I also did not drive `audit-client-tests`' legacy side over the real corpus —
  its legacy-0 follows from my measured final-0 plus the measured absence of the one divergent shape, which
  is an argument, not a run.
- **Fail-closed arms**: the four refusals that are pinned (`evaluate-no-scope-capture` ×2,
  `detached-work-traced-health`, `dangling-doc-cite` ×2, `d-citation-integrity` ×3) I exercised by running
  the committed family tests, and I confirmed `diagnostic-legibility`'s `unreadableMessage` widening is
  pinned by a discriminating `token` row and is reached 13× on the real tree. **I did not run the
  replace-the-branch-with-`throw` probe**, because doing so requires writing a sibling module into
  `tooling/src/verify/gates/` on a shared tree with three lanes live, and every such arm in this wave
  surfaces as a `toolError` that the family test asserts by message fragment — a shape that cannot pass
  while unreachable. `d-citation-integrity`'s in-policy `throw` for a non-`empty` text-door refusal is the
  one branch reached by no row; its UNFALSIFIABLE claim rests on a construction the lane says it attempted
  and I did not re-attempt.
- **I did not verify the `@swallowed-ok` / `terse-ok` retirement census** (the claim that `pnpm ast`'s
  swallowed lens is the sole surviving owner with zero site overlap).
- **The 43-row classification was spot-checked at 4 of 43 by reading the resolved constant**; the other 39
  rest on the structural fact that 0 of the 43 is a plain literal and all 43 are interpolated or
  concatenated shapes.
- No probe modified any tracked or untracked file in the checkout. Every probe ran from the session
  scratchpad against absolute paths; `git status --short` was empty before and after.

## Issue summary (paste-ready)

Fresh-context verification of the #1584 conversion wave `ff3eacb44` (text-citation) + `1e81658b4`
(callback-provenance): floor reproduced at both `4f121ffb3` and `011233309` (198 final policies / 2,185
proof rows / 0 failures / 279 modules / 81 legacy; family suites 12 + 12 + 10 + 1; `ledgers-fresh` exit 0).
CONFIRMED by driving, not reading: all four ordinary waiver doors bind on authored text and discriminate in
both directions (per-policy no-marker control, positive triple, dead-position alarm naming the policy);
`detached-work-traced`'s five translated markers all bind on the real tree (raw 5 / effective 0 / waived 5 /
zero own-policy alarms); `audit-client-tests`' `execution: "selected-files"` is correct (scoped verdicts
equal the full-run slice for all six files, including the cross-file-leak and both helper-import shapes);
`diagnostic-legibility`'s differential reproduces exactly at legacy 100 / final 71 / 43 legacy-only, with
0 of the 43 a plain literal and 4 spot-checked as pointer-in-interpolated-const false positives; and
exactly one legacy example loads the `-health` split arm, reproducing 1:1 across all 20 replayed rows.
REFUTED: (a) `pd-citation-integrity`'s "2 findings on both sides at columns 46/20" — the true answer is 0
on both sides with a planted positive control, col 46 being the module's own `mustFlag` fixture measured
without its `notUnder` fence; already ruled into §4.6 at `011233309`; (b) `audit-client-tests`' premise
that `resolveCalleeBody` never leaves the calling file and that legacy behaved the same — a namespace
import (`import * as h; h.expectOk(…)`) resolves across files and legacy FOLLOWED it, so the final policy's
new same-file guard is an unpinned behaviour divergence (blast radius measured ZERO today: 0 such call
sites across 2,108 test files, with a planted control); (c) the final-only count in the
`diagnostic-legibility` differential is 14, not 13 — the 14th is `no-blanket-suppression.ts:395`, a
ConditionalExpression message, a second widening class the record does not name, and 100 − 43 + 13 = 70
proves the published number wrong on its own arithmetic. PARTIALLY REFUTED: the text-citation family's
`hard` justification — the comment-trivia refusal is real and fires verbatim, but
`d-citation-integrity`'s restored core-doc Markdown arm and `pd-citation-integrity`'s duplicate-id arm
report on AUTHORED text and the ordinary door demonstrably WORKS there (a markdown `<!-- @orb-waive -->`
yields waived 1), so both headers state their reason too absolutely. Secondary: no legacy descriptor
declares `authority` at all, so "all four shipped ordinary with no working door" is a mischaracterisation
(and legacy `evaluate-no-scope-capture` already reported an authored token); `diagnostic-legibility` is
error-severity and RED on the tree at 71 live findings, inherited from legacy's 100 but grown by 14 rows
by this conversion; the lane's population counts (285/1101/2106) no longer re-derive (293/1110/2109) from
tree movement. NOT COVERED and the residual risk: `check:structure`, `gate-conformance.repo.int`,
`gate-ignore-grammar.repo.int` and `check-gates.repo.int` were not run per the brief — and the callback
merge EDITED two of them (32 and 56 lines) without running them. `pnpm gate:contract` not run.
