---
kind: review
status: active
updated: 2026-09-12
---

# Verifier — mixed-hook splits groups 1–3 (#1950, #1584), lane `cb-v-mixed-hooks-1-3`

Fresh-context Opus verifier over the three `f-mixed-hooks` commits that landed the §12.6 ruled splits for
groups 1–3. Every number below is run output this lane produced in its own isolated worktree
(`.claude/worktrees/agent-a1ebea23e2b915ebd`) unless it is explicitly labelled as read from a `main`
run slot.

| Commit | Lane / modules | Verdict |
| - | - | - |
| `f1bbc34e7` | `session-channel-boundary` split · `tooling-ops-direct-invocation` | **CONFIRMED with caveat** |
| `e2b183b80` | the tooling front-door PAIR → four policies | **REFUTED** (one real-tree defect, unsuppressible) |
| `6563946a0` | `sub-floor-disclosure` + `query-boundary-reservation` splits, two grammars retired | **CONFIRMED** |

## A. The real-tree delta, per policy

Baseline slot: `main-152313-2026-09-12T02-44-32-393Z` (checkout `main`, complete, corpus **275**, started
`02:44:32Z` — the newest complete pre-`f1bbc34e7` run; the brief's "corpus ≤ 271" is off by four, the
pre-wave corpus is 275). Current slot: `main-2274575-2026-09-12T11-53-23-745Z` (corpus **297**). Both
re-read from the artifacts. RAW = `violations + waived + granted`.

| Policy | pre (275) | post (297) | RAW moved | explained by the commit message? |
| - | - | - | - | - |
| `session-channel-boundary` | legacy, raw 0 | final ordinary/error, raw 0, pop 1319 | 0 → 0 | yes |
| `session-channel-boundary-health` | ABSENT | final hard/error, raw 0, pop 1319 | new, 0 | yes |
| `tooling-ops-direct-invocation` | legacy, raw 0 | final hard/error, raw 0, pop 271 | 0 → 0 | yes (271 ops modules, matches the lane's census) |
| `tooling-front-door` | legacy, raw 0 | final ordinary/error, raw 0, pop 1133 | 0 → 0 | yes |
| `tooling-root-config-import` | ABSENT | final reviewed-grant/error, **granted 1**, raw 1 | new, 1 | yes — the `prodonly-knip` grant |
| `tooling-argv-front-door` | legacy, raw 0 | final reviewed-grant/error, **violations 2** + granted 6, raw 8, `ok: false` | 0 → 8 | **NO — the 2 violations are unexplained and are false positives (D1 below)** |
| `tooling-argv-front-door-health` | ABSENT | final hard/error, raw 0 | new, 0 | yes |
| `sub-floor-disclosure` | legacy, raw 0 | final ordinary/error, **waived 2**, raw 2 | 0 → 2 | yes — the two translated markers, both binding |
| `sub-floor-disclosure-health` | ABSENT | final hard/error, raw 0, pop **1** | new, 0 | yes (population is exactly the variants home) |
| `query-boundary-reservation` | legacy, raw 0 | final ordinary/error, raw 0, pop 1319 | 0 → 0 | yes |
| `query-boundary-reservation-health` | ABSENT | final hard/error, raw 0, pop 1319 | new, 0 | yes |

### My own `check:structure` (worktree, exit 1 = baseline)

Slot `agent-a1ebea23e2b915ebd-2474443-2026-09-12T12-26-27-786Z`, started `12:26:27Z`, finished
`12:32:03Z`, **run COMPLETE**:

```
final policies: 237 ran · raw 2220 = waived 1177 + granted 131 + effective 912 (857 error, 55 warning)
                · 0 alarm(s) · 0 tool error(s) · 0 withheld
single-pass: ran 297/297 active gate(s) (60/60 legacy · 237/237 final) of 297 corpus file(s)
```

**`0 tool error(s)` / `0 withheld` / `0 alarm(s)`.** Every per-policy number in the table above reproduced
byte-for-byte in my run, including the two `tooling-argv-front-door` violations at the same file, line,
column and token. So the defect is not a `main`-slot artefact.

## B. Floors, re-driven in this worktree

All from `reports/test-report.json` slots this lane produced, not from the lane's report.

| Run | Result |
| - | - |
| `pnpm test:scoped` over `session-channel-family` · `tooling-ops-direct-invocation` · `tooling-front-door-family` · `disclosure-reservation-family` · `verify/lib/reviewed-grants` · `_shared/entrypoint.int` | **6 files / 43 tests passed, 0 type errors, exit 0** (slot `…-2430722-2026-09-12T12-20-26-200Z`) |
| `pnpm test:scoped tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts` (alone) | **12/12 passed, exit 0** (slot `…-2445144-2026-09-12T12-21-56-502Z`) |
| `pnpm -s check:policy-conformance` | **237 final policies · 2594 proof rows · 0 failure(s) · 131 grant rows · 0 invalid**, exit 0 |

No worker flags were passed; the shipped defaults were used.

## C. Grants — every new row consumed exactly once

From the authority block of my own run (`reviewedGrantConsumption`):

```
tooling-argv-front-door:shared-entrypoint            1
tooling-argv-front-door:stack-dev-identity-entry     1
tooling-argv-front-door:stack-engines                1
tooling-argv-front-door:stack-engines-ctl            1
tooling-argv-front-door:stack-prod-entry             1
tooling-argv-front-door:verify-config-snapshot-entry 1
tooling-root-config-import:prodonly-knip             1
```

Seven rows added by `e2b183b80`, seven consumed, each exactly once; `authority.alarms` is **empty**, so no
row is stale-on-arrival and none is over-broad. The `granted` counts on the two policies agree (6 and 1).
**C passes.**

## D. Markers — the two retired grammars

Universe: tracked `.ts`/`.tsx`, marker-form (a comment whose CONTENT BEGINS with the opener), excluding
gate self-quotes (`verify/gates/**`, `verify/lib/**`) and the central engine's foreign-grammar fixture list
(`tests/tooling/verify/lib/ordinary-waiver.test.ts`).

| Grammar | legacy at `6563946a0^` | current `@orb-waive <id>` | Verdict |
| - | -: | -: | - |
| `@sub-floor-ok` | 2 (`rpg-beat-row.tsx:179`, `turn-tool-calls-disclosure.tsx:92`) | 2 (`rpg-beat-row.tsx:161`, `turn-tool-calls-disclosure.tsx:92`) | **2 = 2**, no `current < legacy` file |
| `@first-boot-only` | 0 marker-form sites | grammar deleted | clean delete |

**Both surviving markers BIND**: `sub-floor-disclosure` shows `waived: 2 · violations: 0` on the real tree
with **zero authority alarms**, so neither is stale, dead-position or over-broad. The `rpg-beat-row.tsx`
marker MOVED (179 → 161, onto the enclosing return statement) — the lane's stated reason (the central
engine judges a `//` inside a sibling-flanked JSX expression `ambiguous`) is consistent with the binding
result, and the family test pins both placements.

**Kind 9 (§7) — checked and NEGATIVE, with a receipt.** Neither retired grammar has a second PARSER.
`@sub-floor-ok` does have a same-spelling twin, and it is not the grammar:
`tooling/src/ui-audit/lib/checks-a11y.ts:26` holds `const RULED_SUB_FLOOR = "sub-floor-ok"`, which is
compared against `input.ruledTargetFloor` — a **DOM attribute value**
(`data-target-floor="sub-floor-ok"`, stamped at
`packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx:93`, read by the walker at
`census-interactive.ts:320`, pinned by
`tests/client/features/rpg/components/turn-tool-calls-disclosure.ct.tsx:388`). It is a live, separate
vocabulary that shares a spelling with the retired comment grammar; leaving it untouched was correct.
Worth one sentence in the roster row so the next reader does not "finish" the retirement by deleting it.

## E. §4.1 — ten fences re-cut, two per split pair (my own harness)

Method: each patched module written to a **sibling scratch in its own directory** (relative imports
resolve), the anchor asserted to occur **EXACTLY ONCE** in the file (the harness throws otherwise), the
scratch `rmSync`'d in a `finally`, and the policy's own declared rows re-run through `verifyPolicyProofs`.
The real files were never modified. **10/10 ENFORCED.**

| # | Policy DRIVEN | Fence | Replaced with | Direction | Rows that died |
| - | - | - | - | - | - |
| A1 | `session-channel-boundary` | the home skip | dropped | flag-MORE | `mustFlag[0]` (count 1 → 2) |
| A2 | `session-channel-boundary-health` | the home-path restriction in the visitor | dropped | tripwire flag-FEWER | `mustFlag[1]` (the moved home; 1 → 0) |
| B1 | `tooling-front-door` | the `_shared` allowance | dropped | flag-MORE | `mustPass[0]` |
| B2 | `tooling-root-config-import` | `resolved.startsWith(TOOLING_PREFIX)` | dropped | flag-MORE | `mustPass[0]` (2 extra findings) |
| C1 | `tooling-argv-front-door` | the `isToolCli` skip | dropped | flag-MORE | `mustPass[0]` |
| C2 | `tooling-argv-front-door-health` | `isToolCli` in the counter | dropped | tripwire flag-FEWER | `mustFlag[0]` |
| D1 | `sub-floor-disclosure` (the ORDINARY sibling — named, per §4.1's split-family rule) | the tag-name check **in the shared reader** `lib/collapsible-size-vocabulary.ts` | `false` | flag-MORE | `mustPass[2]` (other-tag) |
| D2 | `sub-floor-disclosure-health` | `ShorthandPropertyAssignment` in the visitor kinds | dropped | flag-MORE | `mustPass[1]` |
| E1 | `query-boundary-reservation` | the `reserveKey` short-circuit | dropped | flag-MORE | `mustPass[0]` (keyed) |
| E2 | `query-boundary-reservation-health` | `sites.length < 2` | `< 1` | flag-MORE | `mustPass[0]` (2 findings) |

D1 is the one cut that patches a SHARED reader; per the guide's third false-clean rule I re-imported the
gate as well and state the sibling it was driven against.

## F. §4.2 identity arms and §4.6 coverage

**Identity flip — all four ordinary policies DISCRIMINATE.** Flipping the marker position in a scratch copy
of each module produced, verbatim:

```
AUTHORITY ALARM [ordinary-waiver] ordinary waiver at <file>:1:1 names a dead position for <policy>
```

for `session-channel-boundary` (`BroadcastChannel` → `BroadcastChannelZ`), `tooling-front-door`
(`"../../bb/ops/y.ts"` → `"…/z.ts"`), `sub-floor-disclosure` (`"text"` → `"control"`) and
`query-boundary-reservation` (`fallback` → `fallbackZ`). `tooling-argv-front-door` is reviewed-grant and
owes no §4.2 arm; its grant identity is proven in the family test instead (§4.3, read and re-run).

**§4.6 coverage statements — present and asserted PER ARM in every committed differential**, and every
legacy side EXECUTED (no both-sides-zero replay):

| Family test | Legacy examples | Asserted coverage |
| - | -: | - |
| `session-channel-family.test.ts` | 5 | `OCCURRENCE` 2, `TRIPWIRE` 1 |
| `tooling-ops-direct-invocation.test.ts` | 6 | `findings` 5, `blind` 1 |
| `tooling-front-door-family.test.ts` | 6 + 11 | import arm 3; argv `READ` 3 / `STALE` 6 / `BLIND` 1 |
| `disclosure-reservation-family.test.ts` | 9 + 12 | `{occurrence 3, markerVerdicts 2, markerConsumed 1, tripwire 2}` and `{occurrence 4, markerVerdicts 2, markerConsumed 1, duplicate 2, seam 1}` |

These are counts asserted in the test, not prose — the shape §4.6 asks for.

## G. The two refuted classes from `ac0085c91`

**G-2 (`resolveAuthoredComposite` on a binding with a downstream invoked member): ABSENT.** `ast-grep`
over `tooling/src` (`-l ts`, pattern `resolveAuthoredComposite($$$)`) returns **6 matches in 4 files** —
`lib/registry-definition-field.ts`, `lib/registry-fact.ts`, `gates/design-audit-rule-proof.ts`,
`gates/modal-body-not-placeholder.ts`. That is a working positive control (it finds the known-refuted
module), and **none of this wave's 19 touched `tooling/src` files is among them**.

**G-1 (a module reader reached before ambient globals): the ambient half is CLOSED, an adjacent half is
OPEN.** `lib/process-member-origin.ts:40-46` does call `resolveGlobalMemberOrigin` BEFORE
`resolveModuleMemberOrigin`, so the D1 builtin-globals mechanism does not recur. What recurs is the
sibling failure the same `origin-verdict.ts` header warns about — **fail-closure applied outside a real
candidate set** — and it is defect D1 below. `lib/broadcast-channel-origin.ts` does NOT have it: its
prefilter is `referenceNamesExport(callee, "BroadcastChannel")` on the CALLEE itself, which is the correct
shape, and its real-tree raw count over 1319 files is 0. `tooling-ops-direct-invocation.ts:73` routes
through `classifyProjectHomeOrigin` (the D1 reader) but in the **ACQUITTING** polarity — it asks whether
ANY module-scope call resolves to the guard home — so an unplaceable callee cannot manufacture a finding;
raw 0 over 271 ops modules confirms it.

## REFUTED — `e2b183b80`

### D1. `tooling-argv-front-door` — 2 unsuppressible false positives on the real tree

**Expected:** the ported predicate (a `process.argv` read outside a `cli.ts`), which the legacy descriptor
scored at **0 violations** on this tree, plus six grant-licensed entries. The lane's own §2.1 premise table
says *"the gate is green on the tree"*.

**Actual (my `check:structure`, and `main`'s 11:53Z slot identically):**

```
tooling-argv-front-door: final reviewed-grant/error v=2 w=0 g=6 RAW=8 pop=1133 ok=false
    tooling/src/snap/ops/run-report-index-assert.ts:97:19  token="value[\"argv\"]"
    tooling/src/verify/lib/ct-runner-lock.ts:69:18         token="(parsed as Record<string, unknown>)[\"argv\"]"
```

Both messages are the fail-closed UNREADABLE text: *"a member read spelled like process.argv whose
receiver the shared readers cannot place…"*. **Neither site reads `process` at all.** They are ordinary
JSON-shape probes:

```ts
// tooling/src/snap/ops/run-report-index-assert.ts:97 — value is a `unknown` narrowed by isRecord()
Array.isArray(value["argv"]) &&
// tooling/src/verify/lib/ct-runner-lock.ts:69 — parsed is JSON.parse(...) : unknown
const argv = (parsed as Record<string, unknown>)["argv"];
```

**Mechanism, read off the code and then driven.** `classifyProcessMemberRead`
(`tooling/src/verify/lib/process-member-origin.ts:32-48`) prefilters on the **MEMBER NAME only**:

```ts
const read = readMemberReference(node);
if (read.kind === "unresolved" || read.value.name !== member) { return "other"; }
```

The RECEIVER is never constrained, so the candidate set is *every member access named `argv` in
`@tooling`*. Both resolvers then refuse (the receiver is a parameter / an `as`-expression, not a module or
global member), and `classifyOriginRefusal` fails closed to `unreadable`, which
`tooling-argv-front-door.ts:89-104` reports. `classifyOriginRefusal`'s escape hatch cannot save these two:
`bindsProvenNonModuleDeclaration`'s `leafIdentifier` (`lib/origin-verdict.ts:29-31`) only unwraps a
`PropertyAccessExpression`; for an **ElementAccessExpression** it hands back the access node itself, which
is not an `Identifier`, so the function returns `false` and the site is called `unreadable` rather than
`other`.

That is precisely the failure mode `origin-verdict.ts`'s own header documents — *"applied to every node of
a kind in a population it converts each unreadable node into an accusation… Prefilter on the name, resolve
the identity, and fail closed only inside the candidate set"* — with the name prefiltered being the wrong
one.

**Reproduced in isolation with a positive control** (`runPolicyPass`, in-memory project, scratch spec
deleted afterwards):

| Fixture | Expected | Actual |
| - | - | - |
| `export function readIt(value: Record<string, unknown>): boolean { return Array.isArray(value["argv"]); }` | 0 findings | **1 finding**, token `value["argv"]`, UNREADABLE message |
| `export function readIt(parsed: unknown): unknown { return (parsed as Record<string, unknown>)["argv"]; }` | 0 findings | **1 finding**, token `(parsed as Record<string, unknown>)["argv"]` |
| CONTROL `import process from "node:process"; export const a = process.argv.slice(2);` | 1 finding | 1 finding, token `process.argv` ✓ |

**Why every green stayed green.** The module's `mustFlag[1]` covers element-access **on `process`**, and
`mustPass[3]` covers property-access **on a non-process bag** (`opts.argv[0]`, whose leaf identifier DOES
have a property declaration, so it takes the `other` arm). The missing cell is exactly
`element-access × non-process receiver`, and no fixture occupies it. The committed §4.6 differential
replays only the 11 legacy examples, none of which contains one. The lane's own real-tree census
(§2.1: *"the real-tree `process.argv` reader census: 17 `cli.ts`, the 6 rows, and 4 comment-only
mentions"*) searched for the SPELLING `process.argv`; the converted policy's candidate set is `argv`, so
the census could not see its own subject. `check:structure` — the only instrument that asks — is
explicitly excluded by the lane's stated floor (§0: *"Never `check:structure` (the orchestrator's)"*).

**Severity.** `authority: "reviewed-grant"`, so there is **no ordinary waiver door**: an author cannot
`@orb-waive` these. The only suppression the contract offers is minting two grant rows, which would be
false grants asserting these files read the operator's argv. The policy is `ok: false` on `main` today and
its 2 findings are inside the blocking 857.

**Fix spec.** Classify the refusal against the member read's **RECEIVER**, not the whole member node:

1. In `lib/process-member-origin.ts`, unwrap the receiver (`getExpression()`, through parentheses and
   `as`-expressions) and call `classifyOriginRefusal(module.reason, receiver)` instead of `node`.
   `value` binds a `Parameter` and `parsed` a `VariableDeclaration` — both provably non-module — so both
   answer `other`. The three arms that must stay `unreadable` still do: `mustFlag[3]` (undeclared global
   `process`) has a receiver with zero declarations, and `mustFlag[4]` (a written `let process`) refuses
   with reason `write`, which is in `AMBIGUOUS_REASONS` and short-circuits before the binding test.
   Equivalent alternative, if the fix is preferred in the shared classifier: extend
   `origin-verdict.ts#leafIdentifier` to fall back to the receiver for an `ElementAccessExpression`
   (this also repairs every future element-access consumer, and `origin-verdict.ts` is the one home).
2. Land the missing `mustPass` row on `tooling-argv-front-door` — the `Record<string, unknown>`
   element-access fixture above, verbatim. It is RED today and green after the fix, and it is the shape
   the real tree actually has.
3. Re-run `pnpm -s check:structure` and require `tooling-argv-front-door` at **`v=0 g=6 ok=true`** before
   this module is Done.

`tooling-front-door`, `tooling-root-config-import` and `tooling-argv-front-door-health` in the same commit
are clean on the tree (raw 0 / 1 / 0) and their proofs re-run green; the REFUTED verdict is for the commit,
not for all four policies.

## Caveats that are NOT refutations

### N1. Six new blocking gate findings on the wave's own source files

Attributed by diffing the pre/post slots per gate and keeping only NEW `file:line` rows inside files this
wave created or rewrote. All three gates were already red before the wave (baseline debt), so these are
additions to a red gate, not a new red — but they are the wave's own source violating live policies, and
the lane's floor could not see them because it excluded `check:structure`.

| Gate | New site | Commit |
| - | - | - |
| `no-inline-types` (ordinary/error) | `tooling/src/verify/lib/broadcast-channel-origin.ts:34` | `f1bbc34e7` |
| `no-inline-union-redecl` (ordinary/error) | `tooling/src/verify/lib/broadcast-channel-origin.ts:34` | `f1bbc34e7` |
| `diagnostic-legibility` (ordinary/error) | `tooling/src/verify/gates/session-channel-boundary.ts:81` | `f1bbc34e7` |
| `no-inline-types` | `tooling/src/verify/lib/process-member-origin.ts:29` | `e2b183b80` |
| `no-inline-union-redecl` | `tooling/src/verify/lib/process-member-origin.ts:29` | `e2b183b80` |
| `diagnostic-legibility` | `tooling/src/verify/gates/tooling-argv-front-door.ts:109` | `e2b183b80` |

Both `no-inline-*` pairs are the same line: an exported inline three-member string-literal union type alias
(`export type ProcessMemberVerdict = "reads" | "other" | "unreadable"` and its BroadcastChannel twin). The
`diagnostic-legibility` pair is the UNREADABLE message string, which ends without a doc-path or code-home
pointer while the policy's main MESSAGE carries one. All six are one-line fixes. Note the same shape does
NOT appear in `6563946a0`'s two new readers, which declare no exported union.

### N2. Nine non-discriminating `messageIncludes` rows, caught by the repo's own §5b enforcer

`policy-proof-expectations` (hard/**warning**, `workItem` 1968) went 11 → 50 across the whole corpus; nine
of the new rows are in this wave:

- `session-channel-boundary-health.ts:78, :87, :96` — all three `mustFlag` rows assert
  `messageIncludes: "is BLIND"`, and the module has ONE message source, so the substring matches every
  finding the policy can emit. The rows still pin `count` and `line`; only the *discrimination claim* is
  empty.
- `tooling-argv-front-door-health.ts:78, :87, :96, :106, :115` (five rows, `"blind gate"`) — same shape.
- `tooling-ops-direct-invocation.ts:119` — same shape.

Warnings do not block (`failOnWarnings: false`), so this is debt, not a break. It is worth routing because
three of those `why` strings claim the row proves an identity half (`"Replacing the identity verdict with a
bare reads reds this row"`) — a claim my §4.1 cuts C2 and A2 independently confirmed is TRUE, so the fix is
to drop or sharpen the `messageIncludes`, not to doubt the fence. `sub-floor-disclosure-health` and
`query-boundary-reservation-health` build per-arm messages and were correctly NOT flagged.

### N3. `test-layout` mirror-miss on the three new family tests — a PRE-EXISTING class

`tests/tooling/verify/gates/{session-channel-family,tooling-front-door-family,disclosure-reservation-family}.test.ts`
each raise *"mirror miss — no source for tooling/src/verify/gates/<name>-family.ts"*. This is the standing
collision between the family-test convention (§4.9: one test covers several siblings) and the tooling
mirror rule: eleven `*-family.test.ts` files were already flagged in the pre-wave slot, twenty are flagged
now. Not this wave's defect; the class belongs to whoever owns the mirror rule's family-test exemption.

### N4. `tooling-ops-direct-invocation`'s family name is minted forward

The module declares `family: "tooling-program-entry"` after `35afe3fa8` moved it, and the loader requires a
one-member family to be named by its sole policy id. That constraint is satisfied today only because a
SECOND member (`tooling-process-exit-home`, group 4) has landed. Verified live: `check:policy-conformance`
exits 0 with 237 policies, so the family is legal on today's tree. Recording it because the group-1 commit
message and the design record describe a state that no longer holds — re-derive before quoting either.

## LEDGER ROWS

| module | wave · path:line | defect | class | state | receipt |
| - | - | - | - | - | - |
| `tooling-argv-front-door` | mixed-hooks g2 `e2b183b80` · `tooling/src/verify/lib/process-member-origin.ts:32-48` | member-name-only prefilter admits every `x["argv"]`; the receiver is never constrained, so an element access on a JSON-shape parameter fails closed to `unreadable` and is REPORTED. 2 unsuppressible real-tree errors (reviewed-grant = no waiver door); legacy reported 0 | real-tree false positive / fail-closure outside the candidate set | OPEN | `check:structure` slot `agent-a1ebea23e2b915ebd-2474443-2026-09-12T12-26-27-786Z`: `v=2 g=6 ok=false` at `tooling/src/snap/ops/run-report-index-assert.ts:97:19` and `tooling/src/verify/lib/ct-runner-lock.ts:69:18`; reproduced in an isolated `runPolicyPass` fixture with a passing positive control |
| `origin-verdict` (shared) | mixed-hooks g2 · `tooling/src/verify/lib/origin-verdict.ts:29-31` | `leafIdentifier` unwraps only `PropertyAccessExpression`, so `bindsProvenNonModuleDeclaration` can never acquit an `ElementAccessExpression`; every element-access consumer inherits the false positive above | shared-reader gap | OPEN | same run; the property-access twin `opts.argv[0]` (`tooling-argv-front-door` `mustPass[3]`) passes while `value["argv"]` reports |
| `session-channel-boundary` | mixed-hooks g1 `f1bbc34e7` · `tooling/src/verify/gates/session-channel-boundary.ts:81` | the UNREADABLE message ends without a doc/code pointer — a new `diagnostic-legibility` error | gate-source conformance | OPEN | pre/post slot diff, new row absent at `main-152313` |
| `broadcast-channel-origin` | mixed-hooks g1 `f1bbc34e7` · `tooling/src/verify/lib/broadcast-channel-origin.ts:34` | exported inline 3-member string-literal union type alias outside a type home — new `no-inline-types` AND `no-inline-union-redecl` errors | gate-source conformance | OPEN | pre/post slot diff |
| `process-member-origin` | mixed-hooks g2 `e2b183b80` · `tooling/src/verify/lib/process-member-origin.ts:29` | same exported inline union — new `no-inline-types` AND `no-inline-union-redecl` errors | gate-source conformance | OPEN | pre/post slot diff |
| `tooling-argv-front-door` | mixed-hooks g2 `e2b183b80` · `tooling/src/verify/gates/tooling-argv-front-door.ts:109` | the UNREADABLE message ends without a pointer — a new `diagnostic-legibility` error | gate-source conformance | OPEN | pre/post slot diff |
| `session-channel-boundary-health` | mixed-hooks g1 `f1bbc34e7` · `:78,:87,:96` | all three `mustFlag` rows assert `messageIncludes: "is BLIND"` on a ONE-message module — the discrimination claim is empty | non-discriminating proof row (#1968) | OPEN (warning, non-blocking) | `policy-proof-expectations` 11 → 50 in the pre/post diff |
| `tooling-argv-front-door-health` | mixed-hooks g2 `e2b183b80` · `:78,:87,:96,:106,:115` | five `mustFlag` rows assert `messageIncludes: "blind gate"` on a ONE-message module | non-discriminating proof row (#1968) | OPEN (warning) | same |
| `tooling-ops-direct-invocation` | mixed-hooks g1 `f1bbc34e7` · `:119` | one `mustFlag` row with a whole-message `messageIncludes` | non-discriminating proof row (#1968) | OPEN (warning) | same |
| `sub-floor-disclosure` | mixed-hooks g3 `6563946a0` · roster row `Core-Enforcement-Active-Gates.md:284` | the row says the `@sub-floor-ok` grammar "RETIRED" without noting the live same-spelling DOM token `data-target-floor="sub-floor-ok"` (`ui-audit/lib/checks-a11y.ts:26`), inviting a future reader to delete a live vocabulary | roster legibility | OPEN (advisory) | `checks-a11y.ts:26`, `census-interactive.ts:320`, CT pin `turn-tool-calls-disclosure.ct.tsx:388` |

## WHAT I DID NOT COVER

Load-bearing, per §5b — a CONFIRMED verdict covers only what this report says it measured.

- **Catch parity at the FIXTURE level for arms with zero legacy coverage.** I read and re-ran the four
  committed differentials and verified their per-arm coverage counts; I did **not** independently re-derive
  a differential from the legacy SHAs myself. If a committed differential is itself mis-driven (the
  `pd-citation-integrity` class — a replay that does not apply the policy's own population), my check would
  not see it. What I can say is that no side is zero in any of the four.
- **`pnpm check:structure` timing.** My run started `12:26:27Z`, i.e. BEFORE the orchestrator's serialize-
  structure-runs instruction reached me; two other structure runs were in flight on `main` in that window
  (`06:22Z`/`06:26Z`/`06:30Z` slots exist). My run reports `complete: true`, `0 tool error(s)` and
  `concurrent: []`, and its per-policy numbers match `main`'s independent 11:53Z slot exactly, so I treat it
  as a verdict — but it was not taken on a quiet box.
- **The 40 OTHER new `policy-proof-expectations` rows and the +654 `tooling-instrument-proof` explosion**
  belong to sibling waves (`ac0085c91`, already REFUTED) and I did not run them down.
- **`no-hardcoded-model-prose` (+15), `dangling-refs` (+10), `test-layout` (+15 total), `suppressions`
  (+6), `gate-ignore-inventory` (+4), `integer-line-boxes` (+4), `tooling-size` (+2), `no-inline-union-redecl`
  (+4 beyond the two I attributed)** — I attributed only the rows landing in this wave's own files and did
  not chase the remainder to their commits.
- **The `-health` siblings' real-tree arms are all at raw 0**, which means no live run has ever exercised
  their reporting branch on the tree. Their arms are proven only by fixtures plus my §4.1 cuts. That is the
  correct state for a tripwire, but it is not real-tree evidence.
- **`check-gates.repo.int`, `gate-ignore-grammar.repo.int` and `gate-conformance.repo.int` were not run**
  (orchestrator-only). `6563946a0` deleted two `__g_` fixture blocks from `check-gates.repo.int.test.ts`;
  whether that suite is green is unmeasured by me.
- **Group 4/5/6 of #1950** are outside this lane.
