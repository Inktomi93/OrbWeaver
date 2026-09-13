---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-policing-additions — the forge's policing additions (#2274, #2187, #2155)

Lane `cb-x-policing-additions` (claude-b), worktree `.claude/worktrees/agent-a935e9a8dfb75eb79`, branch
`wt/agent-a935e9a8dfb75eb79`. A RELAUNCH: the first run was interrupted mid-build and left a `+244/−39`
uncommitted draft of `policy-refusal-coverage.ts`, which this run audited rather than trusted.

## Outcome

| Row | What now holds | The number |
| - | - | - |
| #2274 | `policy-refusal-coverage`'s family-test half RECOGNISES the production dispatcher | real tree 60 → 17 (43 discharged, 0 newly accused) |
| #2187 | `policy-family-readers` exists and reds the members that share no reader | 11 isolated members across 6 families |
| #2155 | every dispatcher refusal literal composes from the table; the envelope's completeness is a census | 11 sites composed, 1 new key, 5 → 7 doors, 32 declared invariants |

Four commits on the rebased branch (three rows plus one repair of my own rebase defect):

| SHA | Row |
| - | - |
| `1e2b60fae` | #2274 — the dead recognizer |
| `8d22e8e20` | #2187 — `policy-family-readers` |
| `9568d86f1` | #2155 item 2 + forge recommendation #4 |
| `cac643eff` | the rebase-resolution repair (my defect, caught by `ledgers:fresh`) |

---

## Row 1 — #2274, the recognizer that read a signature the dispatcher never had

### The audit of the surviving draft

The draft's recognizer was sound in shape and I kept it. Three things in it were not, and each was cut:

1. **A raw NUL byte** (U+0000) sat inside a template literal at `callKey` — the Write-tool hazard the memory
   index names (`write-tool-nul-byte-in-template-literal.md`). `file` reported the module as text but
   `/usr/bin/grep` reported "binary file matches"; there is a `no-nul-bytes-in-source` gate on this tree that
   would have red at the barrier. Replaced with the six-character escape sequence for U+0000.
2. **A `_proof/` id fence** with a JSDoc claiming `_proof/policy-soundness.ts` → `policy-soundness`. FALSE:
   `policyIdOfPath` (`lib/policy-descriptor-read.ts:663`) slices the whole corpus-relative remainder, so a
   fixture module reads `_proof/<name>` and an id carrying a slash equals no policy id that exists. Cut in both
   directions — proof rows stayed green AND the real-tree count stayed 17 — and REMOVED, with the measurement
   recorded in its place.
3. **An alias-to-non-array hop** in `collectDriven`. Same treatment, same result: unfalsifiable by any row and
   dead on the real tree, because `resolveModuleMemberOrigin` already resolves an alias chain to its module
   export before the walk sees a terminal. Removed.

### Red-first, both directions, on the UNMODIFIED source

Taken at `80b0693cb` with `git show HEAD:<path> > <path>` (restored by `cp` from a scratchpad backup; one
command per call, `git status --short` verified after):

| Probe | OLD recognizer | Reading |
| - | -: | - |
| no probe | **60** | the baseline |
| scratch family test at the RETIRED shape `runPolicyPass(testLayout, {})` | **59** | credits a signature that exists nowhere; `test-layout` dropped |
| the SAME test at the PRODUCTION shape `runPolicyPass({ policies: [testLayout], … })` | **60** | the real shape credits NOTHING — the half was dead |

`tests/tooling/verify/gates/mirror-index-family.test.ts` carries fifteen refusal pins over all three mirror
gates, and all three sat in the accused list.

### After

With the repaired recognizer and no probe: **17**, with **43 discharged and 0 newly accused** (`comm` over the
two sorted accused lists). Spot-checked four of the discharged against their real drives
(`motion-token-purity.test.ts:36`, `text-citation-family.test.ts:57`, `integer-line-boxes.int.test.ts`,
`resource-layout-wave-1.test.ts`). The drop is a READER fix, not a burn-down, and the header says so.

### The proof set, and the §4.1 cut per fence

13 rows, `verifyPolicyProofs` 0 failures. Seven cuts, each naming the row that dies:

| Cut | Rows that die |
| - | - |
| accept a positional first argument | the RETIRED-shape `mustFlag` (#2274 landed as an assertion, not an absence) |
| `DRIVEN_FIELD` → `knownPolicies` | the `knownPolicies`-is-not-the-driven-set `mustFlag` |
| parameter hop → no-op | the helper-shape `mustPass` |
| loop hop → no-op | the loop-shape `mustPass` |
| drop the spread unwrap | the alias-and-spread `mustPass` |
| drop the array-literal branch | 4 rows |
| `resolveModuleMemberOrigin` → always unresolved | 4 rows |

The `knownPolicies` row was REPAIRED during this audit: as drafted its fixture put the SIBLING in
`knownPolicies`, so the cut left it green — it flagged for the same reason the founding row does. Its fixture
now puts the JUDGED module there, and the cut kills it.

### The coupled site the repair broke, and why the fix is not a weakening

`policy-soundness-family.repo.int.test.ts:350`'s second opinion for this policy asserted ONE-SIDED containment
("every module whose text owes a pin is accused") and its own comment explained that the reverse could not be
asserted "because no text predicate over the gate corpus can see the pin half". That arm was **green for the
wrong reason for a week**: nothing could ever be discharged, so containment held trivially. Repairing the
reader turned it red — correctly.

It is now TWO-SIDED, with the pin half computed by a predicate the test owns: over the family-test tree, a file
mentioning the dispatcher NAME pins the gate modules its IMPORT SPECIFIERS name; where a file names exactly
ONE, the attribution is exact and that module MUST be discharged. Specifiers, never the module graph — the arm
it judges walks the graph. **Planted-break receipt:** with the pre-#2274 reader restored, the new NOT-DEAD
assertion is the one that reds (`:392`), and only it.

Bounded honestly: the coarse side (`pinnedByText`) can be widened by a fixture STRING inside a test file that
spells a gate path. Every such string on this tree names a phantom (`probe`, `elsewhere`, `sibling`), so the
over-credit is empty today; the exact side (`pinnedUnambiguously`) is where the bite is.

### Deviation from the brief's letter

The brief said the invented-dispatcher fixture "becomes a `mustPass` the OLD recognizer would have wrongly
credited". It had to become a **`mustFlag`**: a retired-shape call credits NOTHING, so the module stays
accused and a `mustPass` would assert the opposite of the repair. Confirmed by the orchestrator mid-run.

---

## Row 2 — #2187, `policy-family-readers`

### The re-measurement, and the fork it produced

The brief required re-measuring before building. On this tree: **250 final policies in 154 families, 47 of them
multi-member**.

| Reading | Count |
| - | -: |
| the audit's INTERSECTION reading (no `lib/` module imported by ALL members), pre-#2096 | 14 families |
| the same reading, re-measured today | **9 families** |
| the reading this module implements (a member sharing no `lib/` import with any sibling) | **11 members across 6 families** |

**The intersection reading cannot be what a policy enforces, and its own worst case is this policy's family.**
`policy-soundness` has nine members; eight import `lib/policy-descriptor-read.ts`; the ninth
(`policy-fixture-substrate`) reads `lib/reference-fact.ts` with three siblings instead. Under intersection the
family has no common module and ALL NINE are accused — eight of them for a fact about a module they do not
contain. That is precisely the false-accusation shape row 1 was paid for. The enforced predicate is therefore
per MEMBER: *a `lib/` module is COMMON to a family when at least TWO members import it; a member of a
multi-member family importing no COMMON module is reported at its own `family` property.* Both numbers are
recorded in the module header and the roster row so a later lane comparing against the audit's 14 knows it is
comparing two different questions.

### Shape

`ordinary`/`warning` + `workItem: 2187`, `entire-population`, `analysis: "types"`, population = the gate corpus
minus `_proof/**`. NOT flipped to `hard`/`error`: the re-measured count is 11, not zero, and the #2184
transitional ruling makes the flip the commit that takes the count to zero. Doors are RESOLVED
(`getModuleSpecifierSourceFile`), so `../lib/x.ts` and `../../verify/lib/x.ts` are one reader. A singleton is
out of population by construction. `policy-legacy-imports` ARM B keeps its forbidden-home verdict; this module
does not re-spell it.

### Proofs and cuts

6 rows, `verifyPolicyProofs` 0 failures. Four cuts, each naming the row that dies:

| Cut | Row that dies |
| - | - |
| admit any resolved relative door, not only `lib/` | founding `mustFlag` (both members import `../contract/policy.ts`) |
| COMMON at ≥ 1 importer | the three-member outlier `mustFlag` |
| judge families of one | the singleton `mustPass` |
| key the census on the specifier text | the parent-directory-spelling `mustPass` |

**Second opinion, EQUALITY not containment:** the family test computes the same set from the declared `family`
line and the import SPECIFIERS (the arm resolves each door to its target MODULE), and asserts set equality
against the arm's live findings. It agreed at 11 on the first run — two methods, one number.

### Two measurements the code carries because they cost a red

- **The §4.2 identity fixture needs THREE members.** In a PAIR both members are accused (sharing is symmetric),
  so a marker in one file leaves the sibling's finding standing and the row reds for a reason that has nothing
  to do with waiver identity.
- **The receipt counts FINAL MODULES READ, not family-carrying members.** The family's self-anchor arm plants a
  canonical descriptor with no `family` key; a receipt over the members resolves zero and `#1966` turns that
  into a receipt REFUSAL over a legitimate corpus. Same trap `policy-refusal-coverage` records one file over.
- The BLINDNESS tripwire fires on `finalDescriptorOf` returning nothing, NOT on a missing `family` — a missing
  required field is the loader validator's refusal, and conflating them red the self-anchor arm.

### Coupled sites

Module · CEAG roster row + registered-gate count · the family test (`FAMILY`, `openWithOpinion`, the equality
second opinion, the §4.2 dead-position discrimination arm) · guide §5b criterion 4 · the read-first SIZE column.

---

## Row 3 — #2155 item 2 + forge recommendation #4

Three findings, all reproduced before fixing:

1. `tooling/src/verify/contract/policy-pass.ts`'s header named `lib/policy-pass-context.ts` among the emitters
   that compose from `POLICY_PASS_REFUSALS`; that file held **zero** references to it.
2. Eleven refusal sentences were literals across the pair, one of them (`source file is outside the policy
   root`) with **no table key** and a **twin** at `lib/policy-pass.ts:150`.
3. The two-sided pin drove FIVE doors; `sourceOutsidePopulation`, `factFailed` and `factAbsent` were unpinned.

### What landed

All eleven compose, **byte-identically** (each key's value plus the same separators), which is why every suite
asserting the old text still passes. `sourceOutsidePolicyRoot` is a new key and BOTH emitters read it. Both
headers now state what is true and name the pin that holds it instead of making the claim themselves.

**Seven doors**, every one reachable through `runPolicyPass`. The two new ones needed constructed fixtures:

- `sourceOutsidePopulation` is reachable ONLY through the #1976 widening shape — a shared provider's population
  is the UNION of its consumers', so a `@authored` fact hands a `@server` SourceFile to a `@client` policy and
  `ctx.relativePath` refuses with the widening diagnosis appended (hence containment, not equality).
- `factFailed` needs a provider whose `finish` throws.
- `factAbsent` is a **DECLARED LIMIT** with its mechanism: `resolveFactRuns` (`lib/policy-pass.ts:451`) sets a
  `pending` value for every fact of every selected policy before any context exists, so no caller can produce
  it. It is covered by the census below as a composed site instead.

**The completeness census** (forge recommendation #4): every `throw new Error(...)` in the dispatcher pair is
either COMPOSED from the table or one of **32 declared INVARIANT refusals**, held two-sided so a new literal
and a deleted invariant both red, with a planted literal in the same invocation as the positive control.

### Deviation from the letter of recommendation #4, with the reason

The recommendation says every throw text should be an envelope MEMBER. Making a caller error
(`runPolicyPass owner plans must be a Map`) an envelope member would refuse `mustRefuse` rows naming text the
runtime can never show a policy author — the conformance runner never reaches an owner. The COMPLETENESS the
recommendation asks for is delivered (nothing in either file is unaccounted); the vocabulary stays the
owner-refusal vocabulary, and the invariants are declared and censused instead.

---

## The lane's own defect, and the instrument that caught it

Rebasing onto main hit a whole-table conflict in `Core-Enforcement-Active-Gates.md` (main had reformatted it —
the documented hazard). My hand resolution of the marker span left BOTH sides in the file: 779 lines against
main's 467, `policy-refusal-coverage` twice, and a registered-gate count derived from a doubled table.

Nothing in the normal floor names that. The table still parsed; `check:docs` was already red at HEAD; the
parity suite compares the DECLARED count against the discovered roster, not against the row count. What named
it was **`pnpm check:ledgers-fresh`**: the read-first SIZE column re-derives that file's size AND row count and
printed `755 KB · 609 rows`. Repaired at `cac643eff` by rebuilding from `git show main:` and re-applying
exactly the two edits this lane owns — five changed lines against main.

## Deviations and refusals

- **`check:docs` is left red on two files, deliberately.** `Core-Enforcement-Active-Gates.md` and
  `gate-runtime-standardization.md` are BOTH unformatted at HEAD already (proved by running
  `doc-catalog format --check` against `git show HEAD:` copies in the scratchpad, exit 1 for each).
  `pnpm format:docs` on the roster rewrites 20 rows this lane does not own (escaped `\~`, `INSTRUMENT\_TOOLS`),
  which is the documented rebase hazard. Orchestrator-ruled: leave it to the barrier.
- **The family test's second-opinion arm was rewritten beyond "membership only"** (my fence said membership).
  Reported mid-run with receipts; orchestrator-ruled that the arm stays with this lane and is correct.
- **`gate:contract` is red corpus-wide (339 findings across 306 modules) and ZERO for both of my modules.** That
  red is the #1584 baseline.

## Floor (all on the rebased tree, tip `cac643eff`, rebased twice — last onto main `183e49714`)

| Check | Result |
| - | - |
| `verifyPolicyProofs` per module | `policy-refusal-coverage` 0 · `policy-family-readers` 0 |
| §4.1 cuts | 7 + 4, each naming the row that dies |
| real-tree `runPolicyPass` drives | refusal-coverage 60 → **17** · family-readers **11** |
| `pnpm check:policy-conformance` | exit 0 — 262 policies · 3107 rows · 16 refusal rows · 0 failures · 306 modules |
| `pnpm gate:contract` | 339 corpus-wide (baseline), **0 for either of my modules** |
| `pnpm test:scoped` ×6 suites | **63 passed** (policy-soundness-family.repo.int, policy-refusal-envelope, enforcement-registry-parity.int, schema-fact-parity, bus-fact-relay, registry-fact) |
| `pnpm check:ledgers-fresh` | exit 0 |
| `pnpm exec biome check <8 files> --diagnostic-level=error` | exit 0 |
| `pnpm exec eslint <8 files>` | exit 0 |
| `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | PASS / PASS |
| id sweep of `tests/tooling/**` for each touched gate id | `policy-soundness-family.repo.int.test.ts` only; run |
| `mirror-index-family.test.ts` (main's `183e49714` pin: `test-layout`'s 57-path population, exact set equality) | 17/17 GREEN — this lane added a gate MODULE and no new `*-family.test.ts`, so the enumerated test population is unchanged |

## Proposed lessons

- **A proof fixture that INVENTS the shape it proves against tests the fixture.** `policy-refusal-coverage`'s
  `mustPass` was green for a week over a `declare`d two-positional `runPolicyPass` that exists nowhere. When a
  fixture `declare`s a production symbol, the DECLARATION is a claim about production and owes the same
  re-derivation as any other cited mechanism.
- **A one-sided containment arm over a half that can never discharge is green for the wrong reason.** The
  second opinion held trivially precisely because the reader it judged was dead. Any "every X must be accused"
  arm needs the other direction, computed independently, or it certifies the blindness it was meant to catch.
- **A whole-population rule read at family level accuses the innocent majority; read it where the fix lives.**
  Intersection over a 9-member family accuses 8 for one outlier's import.
- **`ledgers:fresh` catches a CONTENT duplication a merge resolution produced**, because the read-first SIZE
  column derives size and row count. After any hand-resolved conflict in a ledgered doc, run it before you
  report — it is the only check on this tree that would have named a doubled table.
- **The receipt of an `entire-population` census counts what was SCANNED, not what was matched** — a receipt
  over the matched subset turns a legitimate corpus state into a `#1966` receipt refusal.

## LEDGER ROWS (3 rows)

| # | Module / site | Class | What is wrong | Evidence | State |
| -: | - | - | - | - | - |
| 1 | `tooling/src/verify/gates/policy-refusal-coverage.ts` (recognizer) + `tests/tooling/verify/gates/policy-soundness-family.repo.int.test.ts:350` | dead arm / green-for-the-wrong-reason | The family-test half required a first POSITIONAL argument the dispatcher never had, so no real pin could be recognised; its `mustPass` was green over an invented signature, and the family test's one-sided second opinion held trivially because nothing could discharge. Two dead branches (`_proof` id fence, alias-to-non-array hop) were unfalsifiable by any row. | Red-first at `80b0693cb`: invented shape 60 → 59, production shape 60 → 60; after 60 → 17 (43 discharged, 0 added). Both dead branches cut in both directions with no row and no tree change. | **OPEN** (fixed at `1e2b60fae`; row for the record) |
| 2 | `docs/reviews/gate-runtime/policing-surface-audit-2026-09-12.md` §RECOMMENDED ADDITIONS #5 | census reading | The ordering census counts SPLIT FAMILIES under an intersection reading. Enforced literally it accuses eight `policy-soundness` members for one sibling's different shared module. The enforceable reading is per member. | 250 policies / 154 families / 47 multi-member; 9 families under intersection, 11 members under the member reading, both measured on `3b68aa44e`. | **OPEN** (implemented per member at `8d22e8e20`; the audit's number is not wrong, it answers a different question) |
| 3 | `tooling/src/verify/contract/policy-pass.ts` header + `tooling/src/verify/lib/policy-pass-context.ts` | header claim outran the file | The contract named `policy-pass-context.ts` as an emitter composing from `POLICY_PASS_REFUSALS` while that file held zero references; eleven sentences were literals and one had no key. The envelope was complete over the TABLE and blind to the EMITTERS. | `grep -c POLICY_PASS_REFUSALS` = 0 before, 11 after; five of eight reachable doors pinned before, seven of seven after; 32 invariants censused two-sided with a planted control. | **OPEN** (fixed at `9568d86f1`; row for the record) |
