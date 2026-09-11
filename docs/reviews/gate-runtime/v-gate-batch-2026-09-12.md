---
kind: review
status: active
updated: 2026-09-11
---

# v-gate-batch — adversarial verification of the four exemplar gate-runtime lanes (#1584)

Read-only verifier pass over `5c17068b7~1..e35c5bb13` in an isolated worktree at `e35c5bb13`, covering the
key-set reader lane (`5c17068b7`), the caught-failure conversion (`a4206c511`), the second ResourceHost
wave (`899ec74a7`) and the provider-receipt lane (`f344eaf48`, `268f62e48`). Every number below is from a
run produced in this session; nothing is quoted from a lane report. Probes used `cp`/`mv` only, all inside
this worktree, and `git status --short` was EMPTY after each.

## Verdicts

| Lane | Verdict |
| - | - |
| `p-keyset` (`5c17068b7`) | **REFUTED** — the conversion itself is sound and every headline number reproduces, but it left its ratified coupled site undone (the enforcement roster is RED, with the gate naming the missing `-health` row) and it ships one §4.1 UNENFORCED NARROWING |
| `p-caught-failure` (`a4206c511`) | **REFUTED** — 596/572/24/0 reproduces exactly, all 15 sampled marker positions bind through the production engine, and the three claimed §4.1 repairs all bite; but ONE live legacy marker was DELETED rather than translated, and the module ships a fourth §4.1 UNENFORCED NARROWING that its own `message` asserts |
| `p-capability-2` (`899ec74a7`) | **CONFIRMED** — seven doors, each reading exactly its declaration; the new validation REFUSES loudly in both directions under a planted control; the `resource-installed.ts` edit is in scope |
| `p-provider-receipts` (`f344eaf48`, `268f62e48`) | **CONFIRMED** — all four receipts are the WALKED denominator, `unresolved` is correctly withheld in all four, the fail-open pin discriminates under a planted break, and `mustFlag[3]` bites under the exact reversion its `why` names |

## Reproduced numbers, beside the claimed ones

| Claim | Reproduced | Instrument |
| - | - | - |
| `check:policy-conformance` 271 modules · 167 final · 104 legacy · 1,659 rows · 0 failures · exit 0 | **IDENTICAL** — `167 final policies · 1659 proof rows · 0 failure(s) · 105 grant rows (whole table) · 0 invalid · 11899ms (corpus: 271 module(s), 104 legacy proven by gate-conformance)`, exit 0 | `pnpm check:policy-conformance` |
| `gate:contract` total must not RISE | **762** findings across 271 modules (vs 781 claimed at `899ec74a7`, 801 before the batch) — fell, did not rise. Exit 1 is the legacy-descriptor corpus, as expected | `pnpm gate:contract` |
| `gate:contract` ZERO for each converted module | **0** for `caught-failure-ownership`, `freeze-provenance-write-pairing`, `freeze-provenance-write-pairing-health` | same log, per-module grep |
| caught-failure 596 findings / 572 waived / 24 effective / 0 alarms | **IDENTICAL** — `596 sites`, `deliberate-absorb 572`, `unproven 24`; and the repo pin drove it through `runPolicyPass` and asserted `authorityAlarms === []` and `waiverCarrierRefusals === []` | `pnpm check:ledgers-fresh` (fresh re-derivation, exit 0) + `caught-failure-ownership.repo.int.test.ts` (3/3 PASSED, 27.5 s + 25.4 s) |
| both line-coupled ledgers fresh | exit 0 — `fresh docs/test-baseline/manifest.json (2616 derived)`, `fresh docs/reviews/caught-failure-ownership/population.json (596 derived)`, `fresh .claude/skills/snap-driving/reference/flags.md (123 derived)`, `fresh generated TypeScript configs (13 derived)` | `pnpm check:ledgers-fresh` |
| biome on every touched tooling/tests file | exit 0, `Checked 178 files in 3s` (the 179th touched path is `TS-MORPH-CAPABILITIES.md`, not a biome input — no silent ignore) | `pnpm exec biome check <178 files> --diagnostic-level=error` |
| typecheck | exit 0 — `11 discovered, 2 runnable`, `PASS tooling/tsconfig.json`, `PASS tsconfig.json` | `pnpm typecheck --config tsconfig.json --config tooling/tsconfig.json` (run AFTER biome) |
| `pnpm test:scoped tests/tooling/verify/` | 1,528 tests, 1,516 passed, **12 failed** — see the red triage below | `pnpm test:scoped tests/tooling/verify/` |

**One brief premise is wrong on the tree's evidence:** the brief says "569 private markers translated". The
commit message and `caught-failure-ownership.ts:36` both say **574** live markers across **335** files, and
the derived census carries **572** consumed waivers. 569 appears nowhere. Immaterial to the verdict; stated
so the number does not propagate.

## DEFECTS

### D1 — `p-caught-failure` DELETED a live legacy marker instead of translating it (HIGH)

`tooling/src/stack/ops/engines-ctl.ts` — `safeUsername()`.

At `a4206c511~1` the function carried, at line 101:

```
// @orb-gate-ignore caught-failure-ownership(default:catch): an unreadable OS user identity falls back to a fixed label ("unknown") for a HUMAN-READABLE receipt on a marker file, never an authorization decision. Ends if the fallback ever gates a signal.
```

`git show a4206c511 -- tooling/src/stack/ops/engines-ctl.ts` shows the sibling marker at `healthOk` was
translated to `@orb-waive caught-failure-ownership(catch)` with its reason verbatim, and this one was
removed with no successor. The site is now one of the 24 effective findings:
`tooling/src/stack/ops/engines-ctl.ts:103:5`, arm `empty`, position `catch`, `verdict: "unproven"`,
`markerLine: null`.

It is not unwaivable. Reproduction (run in this worktree, restored after):

1. `cp tooling/src/stack/ops/engines-ctl.ts{,.bak}`
2. insert `// @orb-waive caught-failure-ownership(catch): <the legacy reason, verbatim>` on the line above
   `try {` in `safeUsername`
3. `pnpm exec node tooling/src/verify/cli.ts baseline caught-failure-population`
4. `mv tooling/src/stack/ops/engines-ctl.ts{.bak,}`

Result: `wrote 596 sites (23 unproven)`, `byVerdict {deliberate-absorb: 573, unproven: 23}`, and the row at
line 104 becomes `deliberate-absorb markerLine=101` — the marker BINDS through the production
`createOrdinaryWaiverEngine`, at exactly the position the converted policy reports.

Consequence for the record: the landing commit's "24 effective (23 pre-existing debt + 1 newly unwaivable)"
is wrong by one. The true split is **22 pre-existing + 1 newly unwaivable (`heap-capture.ts:79`, honestly
documented in place) + 1 LOST SUPPRESSION**.

### D2 — `p-keyset` did not do the enforcement-roster coupled site (HIGH)

The design guide's own routing table calls `Core-Enforcement-Active-Gates.md` a COUPLED SITE: *"a conversion
rewrites its row, a split adds and removes them."* `git show 5c17068b7 --stat` shows the lane touched 7
files and none of them is that doc.

`tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts` real-tree arm is RED with exactly two
findings, both naming this batch:

```
docs/architecture/core/Core-Enforcement-Active-Gates.md declares "270 registered gates" but there are 271
active gate modules (104 status:"active" legacy descriptors + 167 final defineGate policies, …)

active gate "freeze-provenance-write-pairing-health" (a final defineGate policy, which is always active)
has no row in …'s Layer-3 ACTIVE table — add it
```

Count line: `docs/architecture/core/Core-Enforcement-Active-Gates.md:348`.
Reproduction: `pnpm test:scoped tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts`.

**And the surviving row is stale prose.** `docs/architecture/core/Core-Enforcement-Active-Gates.md:328`
still describes the LEGACY implementation verbatim: "a corpus-wide alias/builder derivation run in
`begin`", "DERIVED from the live `messageVariants` declaration in packages/db/src/schema/chat.ts", "the
shared node-anchored `@orb-gate-ignore <gate>(<method>)` marker that `gate-ignore-inventory` already
polices", "`tests/**` is out of scanRoot". Every one of those was retired by `5c17068b7`. This is a §5b.5
failure on the ONE document the guide tells the next conversion lane to read before converting. For
contrast, `p-caught-failure` DID rewrite its row (line 191 names `@orb-waive` and records the retired
`@swallowed-ok` arm) — so the standard is met elsewhere in the same batch.

### D3 — `p-keyset` §4.1 UNENFORCED NARROWING: `memberPath.length === 0`

`tooling/src/verify/gates/freeze-provenance-write-pairing.ts:108`

```ts
return memberPath.length === 0 && canonical.exportedName === GUARDED_TABLE && home ? "ours" : "other";
```

The `memberPath.length === 0` clause makes the policy flag LESS (a MEMBER of the table binding —
`db.update(messageVariants.id)` — is not "ours"). Cut it and re-run the module's rows:

```
### FP5-memberpath exit=0
policy-conformance: 167 final policies · 1659 proof rows · 0 failure(s) · … exit 0
```

Every row in the corpus stays green. Per §4.1 the fix is a `mustPass` row putting a member expression at the
table argument. Not fixed here.

**The other four narrowings in this module ARE enforced** (each cut killed exactly the row whose `why`
claims it):

| Cut | Row that died |
| - | - |
| drop `&& home` from `guardedTableVerdict` (`:108`) | `mustPass[7]` "THE DOOR HALF OF IDENTITY, and the row that dies without it" |
| `importers.has(candidate.sourceFile)` → `true` (`:229`) | `mustPass[12]` "COMMENT POSTURE … ARM 5's relevance test is now an IMPORT" |
| `WRITE_POPULATION` `@packages` → `@authored` (`:58`) | `mustPass[5]` "THE POPULATION FENCE, and the row that dies without it" |
| drop `kind === "update"` from `pairingFinding` (`:175`) | `mustPass[4]` (insert omitting both) **and** `mustPass[9]` (the healthy upsert) |

And the `-health` sibling's real-tree anchor guard is enforced in BOTH directions: replacing `onRealTree`
with `true` killed `mustPass[1]` and `mustPass[2]` together.

### D4 — `p-caught-failure` §4.1 UNENFORCED NARROWING: the `finally`-block owner clause

`tooling/src/verify/lib/caught-failure.ts:943-944`, inside `unownedCatch`:

```ts
const finallyBlock = clause.getParentIfKind(SyntaxKind.TryStatement)?.getFinallyBlock();
return finallyBlock === undefined || !hasExplicitOwner(finallyBlock, errorBinding);
```

Replace the whole pair with `return true;` (i.e. a `finally` that owns no longer suppresses):

```
### CF4-finallyowner exit=0
policy-conformance: 167 final policies · 1659 proof rows · 0 failure(s) · … exit 0
```

Nothing notices. This one is worse than a bare unenforced narrowing because the module's own message
ASSERTS it: `ARM_MESSAGE.empty` (`caught-failure-ownership.ts:105`) reads *"a catch block (and its finally)
that names no owner at all"*. §5b.2 says every context clause in a `message` is a claim; this clause is a
claim nothing proves. The existing `notice-laundering` `mustFlag` row exercises the NEGATIVE direction (a
`finally` whose notice does not own still flags); no row exercises the positive one. Fix per §4.1: a
`mustPass` with an empty catch beside a `finally` carrying a governed owner for the caught binding.

**The three narrowings the lane claimed to have found and repaired are all REAL and all now enforced** —
confirmed independently, one cut each:

| Cut | Row that died |
| - | - |
| `hasFrameworkOwner(tryBlock)` guard → `false` (`caught-failure.ts:1487-1489`) | `mustPass[11]` "THE CATCH ARM'S FRAMEWORK NARROWING, which §4.1 proved nothing enforced" |
| `isZodSchemaExpression` → always `false` (`caught-failure.ts:1166`) | `mustPass[13]` "Zod catch combinators … the §4.1 repair" |
| delete the `silentDefault` arm-precedence branch (`caught-failure.ts:1481-1483`) | `mustFlag[61]` "`messageIncludes` pins the ARM PRECEDENCE" |
| widen `population` to `["@authored","@showcase"]` (`caught-failure-ownership.ts:127`) | `mustPass[10]` "THE POPULATION FENCE, all four declared limits in one row" |

So the lane's count of 3 is CONFIRMED as a count of what it FOUND; it is not the complete set — D4 is a
fourth it did not find.

### D5 — orphan export left behind by the retired `@swallowed-ok` arm

`tooling/src/verify/gates/detached-work-traced.ts:479` — `export function hasLiveDetachedSwallowOwner`.

Two independent methods, both negative:

- `pnpm ast refs hasLiveDetachedSwallowOwner` → `scanned=7416`, `matches=1`, and the single hit is the
  declaration itself (`[def]`).
- `grep -rn --include=*.ts --include=*.tsx --exclude-dir=node_modules` → two hits: the declaration, and a
  PROSE mention in `caught-failure-ownership.ts:49` explaining the retirement.

CONFIRMED orphan. `knip` will not see it (entry glob). Not a correctness defect; it is dead weight the
conversion created and did not sweep.

### D6 — a new shared reader with one consumer and no pin (PRISTINE §5b.7)

`tooling/src/verify/lib/drizzle-write-target.ts` (123 lines, `readDrizzleWriteTable`) has exactly one
consumer — `freeze-provenance-write-pairing.ts:114` — and **no test file**. Its sibling
`lib/authored-key-set.ts`, landed in the same commit, got `tests/tooling/verify/lib/authored-key-set.test.ts`
(18 tests, both directions). §5b.7's words are *"none smuggled into a `lib/` helper that only this module
calls. A private reader wearing a shared reader's clothes is the same rot with a better address."*

I am NOT calling the reader private — its header argues a real general question and its three-answer
`resolved(node) | resolved(null) | unresolved` shape is exactly the boundary the rule wants. But the
combination *one consumer + no independent pin* is the shape a copying lane will read as permission, and it
is asymmetric with its own sibling in the same commit. Its behaviour today is covered only transitively,
through the gate's 12 `mustFlag` + 14 `mustPass` rows.

### D7 — `@showcase` was added as a root but not to `@authored` (batch-wide)

`tooling/src/verify/contract/population.ts` adds `"@showcase": ["packages/showcase-plugins/src/"]`, and its
header explains at length why it is NOT folded into `@packages`. It says nothing about `@authored`, which is
spelled as a literal nine-root list and therefore now EXCLUDES an authored workspace package.

19 policies declare `@authored` (`grep -rln '"@authored"' tooling/src/verify/gates/`), and one of them
carries a comment that is now false:

`tooling/src/verify/gates/member-card-clamped.ts:59` — *"which is exactly the `@authored` population
(packages/\*/src, tests/, tooling/src, scripts/ …)"*.

Either `@authored` should include `@showcase`, or the exclusion owes a sentence in `population.ts`'s header
and that comment owes a correction. As it stands the next lane reading `@authored` gets the wrong mental
model, and `packages/showcase-plugins/src` is silently outside 19 policies.

**The population PORT itself is correct** and I verified it independently: the repo has exactly seven
`packages/*` members and all seven have a `src/`, so legacy's
`/^packages\/[^/]+\/src\//.test(path) || path.startsWith("tooling/src/")` equals
`["@packages", "@showcase", "@tooling"]` exactly — the `@showcase` root RESTORES what `@packages` alone
would have dropped rather than widening anything. The census's four live `packages/showcase-plugins/src/`
sites are all `deliberate-absorb`, so without the root four markers would have been dead-lettered.

## Red triage — `pnpm test:scoped tests/tooling/verify/` (12 failures)

A scoped suite red is never baseline, so each was dated or reproduced on a quiet box.

**Caused by this batch (1 test, 2 findings):** `enforcement-registry-parity.int.test.ts` real-tree arm →
**D2**.

**Contention, NOT regressions (5 tests).** `structure.int.test.ts` (4 tests) and
`grant-liveness-family.test.ts` (1 test) failed with file-level `STACK_TRACE_ERROR`s at \~5,000 ms each — the
5 s per-test default under load. Re-run ALONE
(`pnpm test:scoped tests/tooling/verify/ops/structure.int.test.ts tests/tooling/verify/gates/grant-liveness-family.test.ts tests/tooling/verify/ops/conformance.int.test.ts`):
both files PASS. A second vitest was live on the MAIN checkout during my run
(`vitest.mjs run tests/tooling/static-class-consumers.int.test.ts`, pid 2759255, main's reports dir), which
is the load.

**Pre-existing and NOT this batch (6 tests), but real and unfixed on `main`:**

1. `tests/tooling/verify/ops/conformance.int.test.ts:343` — `expected 749 to be greater than 1000`.
   REPRODUCES on the quiet re-run, so it is not contention. `compared` counts LEGACY in-memory examples and
   shrinks with every conversion. This batch removed 117 of them (`caught-failure-ownership` carried 91
   `why:` rows at `a4206c511~1`, `freeze-provenance-write-pairing` 26 at `5c17068b7~1`); crediting all 117
   back gives 866, still under the floor — so the floor was already breached before the batch. It is a
   hard-coded legacy denominator that every remaining conversion pushes further down, and it will keep
   reading as a fresh red on each lane's verifier until it is re-expressed against the MIXED corpus.
2. `tests/tooling/verify/ops/policy-conformance-stage.int.test.ts:61` and `:109` — hard-coded
   `"8 proof rows"` / `"10 proof rows"` against a planted corpus that shims the REAL
   `baseui-render-prop-composition` policy, which now carries 9 rows. Dated: that policy's last row landed at
   `9e362ff00` (#1952, 2026-09-11), which `git merge-base --is-ancestor 9e362ff00 5c17068b7~1` confirms is an
   ancestor of this batch's base.
3. `tests/tooling/verify/gates/dangling-refs.repo.int.test.ts` (3 tests) — three phantom cites in
   `docs/architecture/core/Core-Enforcement-Active-Gates.md` at lines 143 (`BELT_EXEMPT`), 146
   (`SERVER_INTERNAL_REACH`) and 194 (`@orb/contracts/sessions`). All three are byte-identical at
   `5c17068b7~1`, so pre-batch. I checked the gate is not lying: `BELT_EXEMPT` and `SERVER_INTERNAL_REACH`
   appear on the tree ONLY inside comments describing their own retirement, and
   `packages/contracts/src/sessions` does not exist. The findings are correct.

## Lane 3 — the seven doors, read in full

Every door's OP reads exactly what its contract declares, and each publishes `members` as the WALKED
denominator with a comment saying so.

| Door | Declaration promises | What the op reads | Verdict |
| - | - | - | - |
| `mirror-index` | membership sets over two bounded spaces, derived from `authoredTree` facts, never a second walk | `loadAuthoredTree` ×2, filtered by `sourceRoot`/`testRoot`; `members` = both spaces' file count | matches |
| `documents` | the `docs/` corpus; a refused member is a ROW, a failed CATALOG refuses the fact | `tree("docs")` + per-member `read` into `documents`/`refusals`; catalog failure returns before any row; `members = documents + refusals` | matches |
| `ledger` | an IDENTITY; an absent member REFUSES | `ledgerMarkdown` returns on the first non-ready member; `ledgerJson` additionally refuses a zero-member discovery | matches, incl. the `missing` vs `unresolved` split the header promises |
| `exact-file` | every demanded id resolves or the WHOLE fact refuses; one declaration per id | `loadExactFiles` refuses unknown ids and the first unreadable path; `bindPolicyResources.fencedExactFiles` checks EVERY demanded id against the declared set before acquiring | matches; the list-vs-per-id fence is real and is the sharpest thing in the wave |
| `vendor-css-surface` | ONE composite; every member required incl. the mirror index | mirror + `base-ui` metadata + `*CssVars.d.ts` + streamdown `dist/**.js`; any non-ready side refuses the whole fact; the absent-INDEX case returns `missing` with the right reason | matches |
| `token-contract` | seven texts, fail-closed | total loop over `TOKEN_CONTRACT_FIELDS`, returns on the first unreadable; `members = 7` | matches |
| `devtools-closure` | every regular file hashed, the three control texts, exact census | `tree` + `snapshot`, refuses on a symlink member, then the three controls; `members` = hashed file count | matches |

**`policy-validation.ts` REFUSES, and is not advisory.** Planted control (`freeze-provenance-write-pairing-health`,
`resources: [{ kind: "ledger", id: "no-such-ledger" } as never]`):

```
TOOL ERROR (thrown): … Invalid gate policy: descriptor.resources[0].id is unknown for ledger
  at assertPolicyModuleExport (tooling/src/verify/lib/policy-module.ts:51)
[ELIFECYCLE] Command failed with exit code 2.
```

Positive control in the same shape (`{ kind: "exact-file", id: "ct-boot" }` — a VALID id) is admitted by the
id vocabulary and then refused by a DIFFERENT, correct rule
(`descriptor.resources must be empty unless analysis is resource`), which proves the first refusal was about
the ID and not a blanket rejection. Both directions.

**`resource-installed.ts` (12 lines) was in scope.** It exports `installedPackageDirectory` — the ONE home
for "where is this installed package", which `vendorCssSurface` needs and which did not exist — plus the
`directoryAnchor` escape, with the measurement recorded in the contract
(`streamdown` exports only `.` and `./styles.css`, so both the manifest resolve and a bare CJS resolve throw
`ERR_PACKAGE_PATH_NOT_EXPORTED`). A second `createRequire` base inside the vendor op would have been a second
answer to the same question. Correct call, correctly documented.

**`servesOwnPolicy` does not apply.** The brief flags it as a known coupled site for routed documents; on
this tree it exists only at `packages/server/src/entry/http/security-headers.ts:113,237` and its test — a
CSP-header exemption for server-served paths, unrelated to `resource-document.ts`. Premise not applicable;
no coupled site owed.

## Lane 4 — the phase asymmetry, checked against `policy-pass.ts`

Confirmed from the source I read in full (`tooling/src/verify/lib/policy-pass.ts`, 879 lines):
`receiptFailures` (`:636-647`) refuses `count === 0` and `unresolved > 0`; `factReceiptFailures` (`:649`);
`finishFactRuns` (`:668-686`) judges a FACT receipt inside the same loop that produced it;
`withholdFactDependents` (`:687`) drops consumers; `evaluateRuns` (`:721-734`) runs `evaluate` FIRST, then
collects receipts, then judges. Ordering at `:827-830`. A provider receipting its census can only preempt its
own accuser; a consumer can report and then refuse. The asymmetry is exactly as the brief and the module
headers state.

**All four providers receipt the WALKED denominator.** Each now files `members: ctx.files.length`, and
`ctx.files` for a fact run is `run.files`, built in `resolveFactRuns` (`:469-475`) from the fact's own
resolved `declaredSourcePaths`. That is the admitted authored population — the denominator walked, not the
census found. Sources renamed to say so: `drizzle-schema-sources`, `static-class-sources`,
`tuple-vocabulary-sources`, `<kind>-sources`.

**None publishes `unresolved`, and that is correct in all four** — measured against the stated rule
(receipt `unresolved` = "I could not complete my MEASUREMENT"; "some members have shapes I cannot parse" is
corpus data for `facts.unresolved`):

| Provider | Why withholding `unresolved` is right, not over-applied |
| - | - |
| `drizzleSchemaFact` | an unreadable schema becomes `status: "unresolved"` on the fact VALUE, and all 18 consumers route it into `recordReadySchemaFact`'s fail-closed throw. The "could not look" case still refuses ONE PHASE EARLIER, at the population phase: `resolveFactRuns` throws `fact … resolved an empty declared population` on zero admitted paths. Nothing was weakened |
| `staticClassFact` | its own steady state is `unresolved > 0` (one mutated-alias `className` anywhere in `@client`/`@ui`). Publishing it would have withheld every consumer forever — the exact failure mode §12.3 names. The pin `UNREADABLE authored syntax is DELIVERED as corpus data, never receipted as a broken instrument` passed in my run |
| `tupleVocabularyFact` | it KEPT a narrower, honest refusal (`indexed === 0` throws) which is "this collector indexed nothing at all", not "this vocabulary is empty"; per-name emptiness rides `read(name) → absent` and each consumer's own `tupleVocabularyReceipt` |
| `registryDefinitionFact` | the header records the discriminator measurement — no gate module reads `view.target`, so §12.3's rule ("if no consumer expresses its dependency through the provider's `unresolved`, the provider must not publish one") applies exactly, and the rename tripwire survives per-consumer because `factsFor` admits a definition only through a RESOLVED target |

**The fail-open pin DISCRIMINATES** (`tests/tooling/verify/lib/schema-fact.test.ts:113`, "THE FAIL-OPEN
SHAPE"). Run as committed: exit 0. Broken in place by making the silent probe file a receipt
(`ctx.receipt({ kind: "population", source: "schema-silent-consumer-probe", members: seen.status === "ready" ? 1 : 0 })`),
the pin goes red at its `toolErrors` assertion:

```
AssertionError: expected [ { policyId: 'schema-silent-consumer-probe', phase: 'receipt',
  message: 'policy receipt refused: population "schema-silent-consumer-probe" resolved zero members' } ]
  to deeply equal []
```

Restored with `mv`; tree clean. The pin pins what it says it pins, and #1966 is correctly scoped as a
runtime GAP rather than a broken pin.

**`mustFlag[3]` (blindness mode B) BITES, and it is NEW, not carried.** The legacy descriptor at
`5c17068b7~1` had three blindness rows (mode B "schema home gone", rename, subject loss); those three are
carried onto the `-health` sibling's `mustFlag[0..2]`. `mustFlag[3]` is the invented row, so §4.7 owes a
planted-break receipt. Reproduced: reverting `lib/schema-fact.ts`'s receipt to the pre-`f344eaf48` census
shape killed exactly the two rows the `why` names:

```
✗ freeze-provenance-write-pairing-health · mustFlag[3] · BLINDNESS MODE B … It dies if `lib/schema-fact.ts`
  goes back to receipting what it FOUND
✗ freeze-provenance-write-pairing-health · mustPass[2] · THE ANCHOR SELF-GUARD FOR MODE B …
```

## Marker-translation sampling — proven by the gate's own output, not by eye

The census's `markerLine` field is written only when the production `createOrdinaryWaiverEngine` MATCHED the
marker to that finding (carrier containment, then exact `finding.token === marker.position`). 15 waived rows
sampled across four directory classes, every one carrying a bound `markerLine`:

| Site | Position reported | markerLine |
| - | - | - |
| `packages/client/src/features/plugin/components/plugin-install-card.tsx:123` | `previewFromUrl.mutateAsync` | 120 |
| `packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx:173` | `startChat` | 170 |
| `packages/client/src/features/plugin/components/plugin-row-leaves.tsx:92` | `upgrade.mutateAsync` | 89 |
| `packages/client/src/features/rpg/components/rpg-populate-control.tsx:66` | `catch` | 59 |
| `tooling/src/_shared/artifacts.ts:229` | `catch` | 222 |
| `tooling/src/_shared/browser-diagnostics.ts:318` | `error` | 315 |
| `tooling/src/stack/ops/served-probe.ts:70` | `catch` | 67 |
| `tooling/src/snap/ops/design-audit-walk.ts:231` | `error` | 223 |
| `packages/showcase-plugins/src/index.ts:95 / :118 / :147 / :184` | `catch` ×4 | 90 / 113 / 142 / 179 |
| `packages/server/src/domain/chat/memory/build/digests.ts:104` | `err` | 98 |
| `packages/server/src/entry/compose/rpg.ts:1059` | `catch` | 1054 |
| `packages/server/src/infra/providers/vllm/engine/client.ts:97` | `res.text` | 96 |

Three read back in source: `res.text` is the WORK's callee chain in `await res.text().catch(() => "")` (not
the plumbing `catch`), `previewFromUrl.mutateAsync` is the member chain, `catch` is the bindingless keyword.
The positions follow the anchor rule stated in `lib/caught-failure.ts`'s header, and the reasons are the
legacy reasons verbatim (spot-checked against `a4206c511`'s diff for `ui-audit/ops/hover.ts` `empty:e → e`
and `gates/bus-payload-allowlist.ts` `empty:catch → catch`).

**The 5 retired `@swallowed-ok` sites.** The acceptance arm is genuinely GONE (no
`hasLiveDetachedSwallowOwner` call survives — D5), every `@swallowed-ok` comment is left in place for its own
owner, and the conversion carries three `mustFlag` rows pinning that a well-formed, live, exact-position
`@swallowed-ok` now suppresses NOTHING here (`repeated-detached-position`, `live-detached-bracket-owner`,
`held-detached-marker`). The `heap-capture.ts` site is the one that could not take an `@orb-waive` — and the
lane replaced the marker with a 10-line comment stating four MEASURED placements and why each is
`over-broad`, leaving the site a reported row. That is the honest handling §7 asks for.

**The `@showcase` root does not widen.** Verified above (D7).

## PRISTINE per converted module (§5b, seven criteria)

### `freeze-provenance-write-pairing` — PRISTINE except items 5 and 6

1. Smallest complete contract — **PASS.** `facts: []`, `resources: []`, `execution: "selected-files"`,
   `analysis: "types"` is honest (the shared identity readers resolve symbols; `syntax` would be a lie about
   the tier per #1958) and the header says exactly that.
2. `message` true of what it flags — **PASS.** Three arms, each clause matched to a reported shape; the
   separate `UNREADABLE_PAYLOAD` / `UNREADABLE_TABLE` messages keep the fail-closed arms from riding a
   message that does not describe them.
3. `fix` names the exact waiver spelling — **PASS.** `@orb-waive freeze-provenance-write-pairing(set)` with
   `(values)` / `(onConflictDoUpdate)` and the "one marker consumes one occurrence, a chained `.values` plus
   `.onConflictDoUpdate` are two positions" note.
4. Family is a real shared `lib/` reader — **PASS on the letter** (`readDrizzleWriteTable` +
   `readAuthoredKeySet`, both named in the header) with the caveat in **D6**.
5. Header records the decisions — **PARTIAL.** The module header is excellent (family, port, five numbered
   port corrections). The COUPLED DOC is not (**D2**).
6. Proofs meet §4 in full — **FAIL on one clause.** Legacy rows carried (12/12 occurrence rows, verified
   against `5639ba677`, which I proved byte-identical to `5c17068b7~1`); `expect` on every `mustFlag`;
   identity arm present (`mustPass[13]`) and the family test additionally drives the off-by-one ALARM
   control; four of five narrowings die without their row — but **D3**.
7. Nothing forbidden behind the contract — **PASS.** No `getSourceFiles`, no private cache, no marker
   parser, no exemption table, no fs read; all state in `create`; both anchors inside the population.

### `freeze-provenance-write-pairing-health` — PRISTINE

Identical `family` string (`freeze-provenance`, verified at both `:180` and `:58`), `authority: "hard"`, no
`fix`, no waiver path, `execution: "entire-population"` justified by the header, `facts: [drizzleSchemaFact]`
read UNCONDITIONALLY (a declared-but-unread fact is a receipt refusal, and the header says so). The split did
NOT move an arm's authority: legacy reported all three blindness verdicts through the unwaivable `Finding`
overload, so `hard` preserves it rather than inventing it. Anchor `packages/db/src/schema/index.ts` is inside
`@packages`. Every legacy blindness row carried; the one INVENTED row has its planted-break receipt
reproduced above. `severity: "error"`, `workItem` correctly absent.

### `caught-failure-ownership` — PRISTINE except items 2 and 6

1. Smallest complete contract — **PASS.** One id for three same-authority/same-severity arms is the correct
   read of §12.1, and the header prices the alternative (a split would have multiplied 574 translations).
   `facts: []`, `resources: []` explicit.
2. `message` true — **FAIL on one clause.** `ARM_MESSAGE.empty` claims "(and its finally)" and nothing
   proves it (**D4**). Everything else in the three arm messages matches the reported shape.
3. `fix` names the spelling — **PASS, and it is the best example in the batch.** It states the position rule
   per arm and gives worked spellings (`save` / `a.save` / `p`), which is what an unguessable position owes.
4. Family is a real shared reader — **PASS, and it is the strongest case in the batch:** `lib/caught-failure.ts`
   has TWO genuine consumers (the policy and `ops/gen/caught-failure-population.ts`), which is exactly the
   census blocker the conversion was dispatched to answer.
5. Header records the decisions — **PASS.** Family, population port with the `@showcase` reasoning, the
   marker census with its self-match correction (576 raw − 2 prose = 574), the retired vocabulary and its
   re-derivation rule, the retired `@swallowed-ok` arm with its four disqualifications, five declared limits
   each audited against the module. The roster row was updated.
6. Proofs meet §4 — **FAIL on one clause (D4)**, and one marker LOST (**D1**). Otherwise: legacy rows
   carried, `expect` on the `mustFlag` rows, two positive identity arms (catch and promise), the
   `repeated-position` successor for the retired `promise:save_2` suffix.
7. Nothing forbidden — **PASS.** The gate module is 940 lines of which \~810 are proof rows; its `create` is
   two visitors delegating to the shared reader. No Project, no cache, no marker parser, no fs.

### Lane 3's contracts and ops — PRISTINE

No policy consumes the seven doors yet, so §5b items 2/3/5/6 do not bind. Items 1, 4 and 7 hold: each
contract file states what it refuses to own and why, each op's `members` comment names the walked
denominator, and each door has a committed pin under `tests/tooling/verify/{ops,lib}/`.

### Lane 4's providers — PRISTINE, with one pre-existing inert shape carried

Each receipt change carries a header paragraph naming the mechanism (`policy-pass.ts` line numbers), the
`evaluateRuns`-vs-`finishFactRuns` ordering, what still bites and where. Two touched providers keep the
INERT `ext: ["ts","tsx"]` (`schema-fact.ts:519`, `tuple-vocabulary-fact.ts:137`) — that is #1959, pre-existing
and not introduced here, but these are exemplar files and a copying lane will copy it.

## What I did NOT cover

- **I did not run `pnpm check:structure`.** The whole-tree mixed front door is the only instrument that would
  show the batch's finding delta on the real tree end to end. I judged the caught-failure numbers from
  `ledgers-fresh` + the committed repo pin (both of which drive the production
  `createOrdinaryWaiverEngine` / `runPolicyPass` over the real tree) and did not spend a 4-minute 6.5 GB
  whole-tree run on top. The freeze-provenance family's real-tree finding delta is therefore UNMEASURED by me.
- **I did not replay the LEGACY `caught-failure-ownership` descriptor over the real tree.** So for the 22
  effective findings other than `engines-ctl.ts:103` and `heap-capture.ts:79`, I confirmed only that their
  files carried ZERO legacy markers (so none lost a suppression) — NOT that each was also a finding under the
  legacy classifier. Some may be new findings from the stronger reader. The lane has no committed differential
  for this gate (unlike `freeze-provenance-conversion.test.ts`), and that gap is worth a row.
- **I did not exercise the seven new doors through a consuming POLICY.** There is none yet. I read every
  contract and op in full and ran their committed pins as part of the directory suite; I did not plant a
  synthetic consumer for each door.
- **I did not audit the remaining \~340 marker translations** beyond the 15-row sample plus the two
  file-level count comparisons that found D1. The per-file legacy-vs-current marker census I ran covered only
  the 11 files carrying the 24 effective findings. **A full census — every file's legacy marker count vs its
  translated count — is the sweep that would find a second D1, and it is the single highest-value follow-up.**
- **I did not run CT, e2e, or any product suite.** Out of scope for this batch.
- `tests/tooling/check-gates.repo.int.test.ts` was not run (orchestrator-only during a train, per the brief).

## Proposed memory lessons (orchestrator owns the write)

**Index line:** `- [marker translation drops are file-count-visible](marker-translation-drop-is-a-file-count.md) — a per-file legacy-marker-count vs translated-count diff finds the deletion a spot-check never will`

Body: A bulk marker translation's failure mode is a DELETED marker, not a mistyped position — a wrong
position ALARMS loudly through the central engine, but a deleted one is silent in both directions and simply
reappears as "pre-existing debt" in the effective count. The cheap detector is arithmetic, per file:
`git show <pre>:<f> | grep -c '<legacy grammar>'` vs `grep -c '<new grammar>' <f>`. A file where the counts
differ is either a documented dead-marker deletion or a lost suppression, and the lane's own "N pre-existing
debt" line will not distinguish them. Found `tooling/src/stack/ops/engines-ctl.ts` this way in one command
(2→1) after a 15-row position sample had come back perfectly clean.

**Index line:** `- [a conversion's roster row is a coupled site the gate itself names](conversion-owes-the-enforcement-roster-row.md) — enforcement-registry-parity's real-tree arm is the receipt, and a SPLIT owes two edits`

Body: `docs/architecture/core/Core-Enforcement-Active-Gates.md` is enforced by
`enforcement-registry-parity`'s real-tree arm in `tests/tooling/verify/gates/enforcement-registry-parity.int.test.ts`,
which checks both the count line AND one row per active module. A conversion REWRITES its row; a SPLIT adds
the `-health` row and bumps the count. Running that one scoped test is the whole receipt, costs \~30 s, and a
lane that skips it lands a red that reads like ambient migration noise — while the stale row it left behind
is the document the NEXT conversion lane is instructed to read first.

## Floor run in this session

`pnpm check:policy-conformance` (exit 0) · `pnpm gate:contract` (762/271, exit 1 = legacy corpus) ·
`pnpm check:ledgers-fresh` (exit 0) · `pnpm test:scoped tests/tooling/verify/` (1516/1528, 12 triaged above) ·
quiet re-run of `structure.int` + `grant-liveness-family` + `conformance.int` ·
`pnpm exec biome check <178 touched files> --diagnostic-level=error` (exit 0) ·
`pnpm typecheck --config tsconfig.json --config tooling/tsconfig.json` (exit 0) · `pnpm check:docs` ·
12 `cp`/`mv` narrowing and control probes, each restored, `git status --short` EMPTY after every one.

## Issue summary for #1584

A fresh-context verifier re-ran the four exemplar lanes end to end and reproduced every headline number
exactly — `check:policy-conformance` 271 modules / 167 final / 104 legacy / 1,659 rows / 0 failures / exit 0;
`gate:contract` 762 findings (down from 801 pre-batch, zero for all three converted modules);
caught-failure 596 sites / 572 waived / 24 effective / 0 authority alarms, confirmed through the production
`runPolicyPass` by `caught-failure-ownership.repo.int.test.ts` (3/3) and an independent `ledgers-fresh`
re-derivation; biome and typecheck green on all 178 touched code files. **`p-capability-2` and
`p-provider-receipts` are CONFIRMED** — the seven doors each read exactly their declaration, the new
`policy-validation` id vocabulary refuses a bad ledger id with exit 2 and admits a good exact-file id under a
planted two-direction control, all four fact receipts are the WALKED denominator with `unresolved` correctly
withheld in each, the `THE FAIL-OPEN SHAPE` pin dies when the probe consumer files a receipt, and
`freeze-provenance-write-pairing-health`'s invented `mustFlag[3]` dies when `schema-fact.ts` reverts to
receipting its census. **`p-keyset` and `p-caught-failure` are REFUTED on four defects:** (1)
`tooling/src/stack/ops/engines-ctl.ts` `safeUsername()` had a LIVE legacy marker DELETED rather than
translated — re-planting it at position `catch` takes the census to 596/573/**23**, so the commit's
"23 pre-existing debt + 1 newly unwaivable" is wrong by one and a real suppression was lost; (2) `p-keyset`
never touched `Core-Enforcement-Active-Gates.md`, so `enforcement-registry-parity`'s real-tree arm is RED
("declares 270 registered gates but there are 271" + "`freeze-provenance-write-pairing-health` has no row"),
and the surviving `freeze-provenance-write-pairing` row at `:328` still describes the retired legacy
implementation (`begin` corpus derivation, `chat.ts`, `@orb-gate-ignore`, `scanRoot`) in the one document the
next conversion lane is told to read first; (3) §4.1 UNENFORCED NARROWING at
`freeze-provenance-write-pairing.ts:108` (`memberPath.length === 0` — cut it and all 1,659 rows stay green);
(4) §4.1 UNENFORCED NARROWING at `lib/caught-failure.ts:943-944` (the `finally`-owner clause), which the
module's own `ARM_MESSAGE.empty` asserts in prose. The caught-failure lane's claim of "3 unenforced
narrowings found" is independently CONFIRMED as a count of what it found — each of the three repairs dies
under its own cut — but D4 is a fourth it missed. Also filed: `hasLiveDetachedSwallowOwner`
(`detached-work-traced.ts:479`) is now an orphan export; `lib/drizzle-write-target.ts` is a new shared reader
with one consumer and no test of its own while its same-commit sibling got a full suite; and `@showcase` was
added as a population root without being added to `@authored`, which 19 policies declare and which
`member-card-clamped.ts:59` describes in a now-false comment. Separately triaged as NOT this batch: the
`conformance.int.test.ts` `compared > 1000` floor (a hard-coded LEGACY-corpus denominator that every
conversion pushes down — 749 now, and already under the floor before this batch), two stale hard-coded row
counts in `policy-conformance-stage.int.test.ts` dated to `9e362ff00` (#1952), and three phantom cites in
`Core-Enforcement-Active-Gates.md:143,146,194` that are byte-identical pre-batch. Five further failures in
`structure.int.test.ts` and `grant-liveness-family.test.ts` were 5 s contention timeouts and PASS on a quiet
re-run. Highest-value follow-up: a full per-file legacy-marker-count vs translated-count diff across all 335
files, which is the only sweep that would find a second dropped marker.
