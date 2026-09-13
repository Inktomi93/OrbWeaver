---
kind: review
status: active
updated: 2026-09-13
---

# cb-x-legacy-replay — the real-tmpdir §4.6 differential, and the derived replay backlog (#2319)

**Lane:** `cb-x-legacy-replay`, worktree `.claude/worktrees/agent-a2913d5f5cb4656c2`, based on `204607e84`.
**Outcome:** the `grant-liveness` config pair's non-vacuous §4.6 arm — the residual root's comment
(id `5652243044`) named as the first bounded target — is BUILT, EXECUTED and COMMITTED. The dated
"237 of 248" figure in the row body is not reproducible against this tree and is superseded by the
derivation in §3.

## 1. What was owed, and why the shared harness could not pay it

`biome-grant-liveness` and `tsconfig-entry-liveness` landed §4.6 records at #2273 (`158dbdd96`,
`8117e9274`) classified **category 5 with a ZERO legacy side** — real-tree liveness-and-outcome receipts
that explicitly disclaim catch parity. Guide §4.6 names exactly one method that reaches catch parity:
replay each legacy `GateExample` file map through the frozen descriptor and the final policies **over the
same bytes**. `tests/support/legacy-differential.ts` replays IN-MEMORY and `frozenLegacyGate` REFUSES a
filesystem-reading descriptor (#2119); both frozen blobs at `c97de9d2f` read disk. §4.6's own instruction
for that class is *"replay a filesystem-reading legacy gate on a REAL TMPDIR, never a virtual root."*

**The refusal was BUILT AROUND, never relaxed.** `filesystemReach` is untouched; the in-memory door still
throws on both blobs, and that arm stays where it was, with its two-way controls, in
`grant-liveness-family.test.ts:96`. The new door carries the OPPOSITE fence.

## 2. The real-tmpdir door — design, and the refusals it preserves

**`tests/support/legacy-differential.ts`** (additions):

- `frozenFilesystemLegacyGate(scratch, base, path)` — loads the frozen blob through the same
  line-anchored `shimHeaderImports`, with no in-memory refusal. It refuses the OPPOSITE mistake: a
  descriptor with **no** filesystem reach belongs on the cheaper in-memory substrate.
- `assertReplayRootIsScratch(root)` — **THE PRESERVED ANTI-LIVE-TREE REFUSAL, and the reason this door is
  safe.** Every replay root is `realpathSync`'d and must lie outside the realpath'd checkout. A frozen
  `existsSync`/`readdirSync` arm pointed at the live tree answers about *this repository* rather than
  about the fixture — the #2119 failure one direction over. Pinned BOTH ways in
  `grant-liveness-legacy-replay.test.ts`: a `mkdtemp` root passes, `process.cwd()` and
  `join(cwd, "tooling")` both throw.
- `createTmpdirDifferential(classifyToolError)` — the two engines over one real tmpdir repository per
  replay. It mirrors the SHIPPED substrates rather than inventing a third: the legacy leg is
  `ops/conformance.ts` `runFsBackedExample` (mkdtemp → `git init` → write → real-fs `Project` → `runPass`);
  the final leg is `ops/policy-conformance.ts` `runResourceExample` (+ `git add --all`, the authored
  overlay and its `parseSource` seam → `runPolicyPass`). It refuses a fixture path carrying a
  non-authored segment rather than carrying an unexercised copy of that filter.
- `TmpdirReplay` reports all three §4.6 axes plus the two the authority engine added: **effective**
  findings, **raw** findings, consumed **grants**, source **population**, resource **subjects**, tool
  errors, and any throw.
- `TmpdirScenario.successor` — §4.6's *"a retired or merged arm needs a successor proof"* as a FIELD. A
  substring that must occur in a final finding or tool error, or `null` + `retiredWhy`.
  `DifferentialClass` is a closed union dispatched through a mapped `Record`, so a new category is a
  `tsc` error, and the two labels that can LIE (`identical`, `vacuous-both-zero`) are decided
  arithmetically.

### 2a. THE SUBSTRATE PORT, MEASURED

The two shipped substrates differ in exactly one thing: the legacy runner does **not** `git add`. One root
serves both engines here, so it carries the index. `runScenarios` therefore re-runs the **legacy** side on
an UNINDEXED root for every one of the 25 examples and asserts the verdict did not move — declared, not
assumed. It holds: both legacy descriptors gate their `git ls-files` half behind an `existsSync` on their
own module path, which no fixture plants.

### 2b. TWO HARNESS DEFECTS THE FIRST REAL REPLAY FOUND

Both were invisible to the in-memory door because every blob it replays is a pure AST reader. Both are
fixed in `shimHeaderImports`, and both are the same shape: **the substrate decided which bug could exist.**

1. **A node builtin was rewritten into `file:///node:fs`.** `createRequire.resolve("node:fs")` returns the
   specifier unchanged and the old code fed that to `pathToFileURL`. `resolveSpecifier` now returns `null`
   for a `node:` specifier and the line is carried verbatim.
2. **A MULTI-LINE named import was left unshimmed.** The single-line matcher saw the opening brace as the
   first line of the BODY, so `} from "../lib/grant-liveness.ts";` never got rewritten and the frozen
   module died at import. `tsconfig-entry-liveness` imports seven names from `lib/grant-liveness.ts` —
   exactly wide enough for the formatter to wrap it.

## 3. The derived replay-owed population (both counts, both methods)

Re-derived on `204607e84`; the row body's "237 of 248" describes no roster on this tree.

| Measurement | Method | Count |
| - | - | -: |
| final policy modules | `ast-grep run --pattern 'defineGate($$$)' --lang ts` over `tooling/src/verify/gates` | **267** |
| final policy modules | `rg "defineGate\(\{"` literal | **300** |
| ports of a legacy descriptor (= replay-owed) | `POPULATION PORT` header | **199** |
| coverage, LOWER bound | module header records a `§4.6 DIFFERENTIAL` | **16** |
| coverage, corroborating | module cites a frozen blob `git show <sha>:tooling/src/verify/gates/` | **9** |
| coverage, UPPER bound | module id named by a file that calls a replay harness | **69** |
| **REMAINING** | 199 − upper-bound coverage | **130** |
| **REMAINING** | 199 − lower-bound coverage | **183** |

**The two module counts disagree by 33 and the ast-grep one is right.** The literal overcounts because
gate modules embed `defineGate({` inside FIXTURE STRINGS (`policy-soundness`, `gate-modernization`). This
is the read-first doc's "a bare `defineGate` grep overcounts" lesson, measured at 33 rather than 2.

**The 69 is an UPPER bound and must not be read as coverage.** A file NAMING a module is the weakest rung:
`grant-liveness-family.test.ts` imports seven gates and, before this lane, replayed zero. The honest
statement is **the backlog is between 130 and 183 modules**, and closing the gap needs a per-file read of
the 26 harness-calling test files — which is itself a dispatchable job and is NOT done here.

**The 68 non-port final modules** are split siblings with no descriptor of their own (both `-health`
modules in this family), genuinely new policies, and any port that spelled its header differently. That
last class is a known blind spot of this derivation: the census keys on the `POPULATION PORT` spelling.

### 3a. The uncovered ports, grouped by their DECLARED `family` — the dispatch plan

74 families. The heads, which are where a lane's cold read amortises best:

| Family | N | Members |
| - | -: | - |
| `policy-soundness` | 10 | diagnostic-legibility · policy-binding-resolution · policy-family-readers · policy-fixture-substrate · policy-legacy-imports · policy-proof-expectations · policy-refusal-coverage · policy-soundness · policy-waiver-identity · policy-waiver-spelling |
| `registry-definitions` | 8 | chrome-registry-completeness · config-group-completeness · home-tile-registry-completeness · modal-registry-completeness · no-parallel-section-map · placeholder-copy-registry · section-factory-contribution-bundle · section-registry-completeness |
| `baseui-read` | 6 | baseui-anatomy-completeness · baseui-derives-not-respells(-health) · baseui-portal-container-seam · baseui-state-data-attributes · baseui-surface-manifest |
| `css-hook-provenance` | 5 | css-family-direct-client-mechanism · css-family-ownership(-health) · css-selector-has-a-writer(-health) |
| `id-brand-flow` | 5 | brand-in-name-position · no-fake-disabled-id · no-loose-id-cast · no-mint-via-cast · no-raw-id |
| `react-origin` | 5 | no-context-provider · no-effect-on-shared-selection · no-forward-ref · no-use-context · registry-context-via-mint |
| `tenancy-scope` | 4 | owner-scoped-reads · owner-scoped-upserts · owner-scoped-writes · table-scoping-class |

The full 74-row grouping is reproducible with the derivation script recorded in §6.

**`policy-soundness` and `registry-definitions` are the two whose legacy descriptors are most likely to
need the REAL-TMPDIR door** (they read the gate corpus and committed registries off disk), so they inherit
this lane's harness directly. **`id-brand-flow`, `react-origin` and `tenancy-scope` are pure AST readers**
and belong on the cheaper in-memory `createDifferential` — the wrong-door refusal added here will say so
out loud if a lane routes one to the tmpdir door by mistake.

## 4. The family-1 table — 25 examples, both engines, every axis

`tests/tooling/verify/gates/grant-liveness-legacy-replay.test.ts`. Populations are `0` source on BOTH
sides for every row (the legacy `scanRoot` was `() => false`, the final declares `{ of: "none" }`), so the
population axis is carried by the SUBJECT column: the legacy `ctx.scan` declaration against the final
`effectiveResourcePaths`. Tool errors are 0 both sides except where named.

### 4a. `biome-grant-liveness` (14 legacy examples)

| # | Legacy example | Legacy | Final (eff / raw) | Subjects L → F | Class | Successor / port |
| -: | - | -: | -: | - | - | - |
| 0 | founding dead file-exact grant | 1 | 1 / 1 | `candidates=1 scanned=1` → `biome.json` | **identical** | `packages/client/src/gone.ts` — CATCH PARITY |
| 1 | exact/glob classifier | 1 | 2 / 2 | `candidates=3 scanned=2` → 2 paths | stronger-reader | catch carried; `packages/ui/**` newly flagged |
| 2 | MISSING-CONFIG | 1 | 0 / 0 | `candidates=0 scanned=0` → ∅ | runtime-refusal | **4 tool errors** `json:biome MISSING` |
| 3 | UNPARSEABLE-CONFIG | 1 | 0 / 0 | `candidates=0 scanned=0` → ∅ | runtime-refusal | **4 tool errors** `json:biome UNPARSEABLE` |
| 4 | NO-ROWS tripwire | 1 | 31 / 31 | `candidates=30 scanned=0` → `biome.json` | **split** | `biome-grant-liveness-health` fires; anchor 0 → 1 |
| 5 | STALE-EXEMPT | 1 | 29 / 29 | `candidates=30 scanned=1` → 2 paths | **retired-arm** | none: central zero-consumption staleness is a whole-run fact |
| 6 | DEAD-CITE | 1 | 30 / 30 | `candidates=31 scanned=1` → 2 paths | **retired-arm** | **none at all** — confirms the module's own #2124 header |
| 7 | pattern-half declared limit | 0 | 1 / 1 | `candidates=1 scanned=0` → `biome.json` | stronger-reader | glob arm no longer anchor-gated |
| 8 | live file-exact grant | 0 | 0 / 0 | `candidates=1 scanned=1` → 2 paths | vacuous-both-zero | — |
| 9 | exemption HONOURED | 0 | **29 / 30** | `candidates=31 scanned=1` → 3 paths | **exemption-mechanism-move** | PORT DECLARED: raw 30 → grant `biome-grant-liveness:catalog-tmp` ×1 → effective 29 |
| 10 | every glob spelling | 0 | 4 / 4 | `candidates=4 scanned=0` → `biome.json` | stronger-reader | 4 declared skips are live findings |
| 11 | negated entry | 0 | 0 / 0 | `candidates=2 scanned=1` → 2 paths | vacuous-both-zero | fence survived byte-for-byte |
| 12 | RULE-liveness declared limit | 0 | 0 / 0 | `candidates=1 scanned=1` → 2 paths | vacuous-both-zero | arm six left the policy (#2074) |
| 13 | anchor-sized rule-list variant | 0 | **29 / 30** | `candidates=31 scanned=1` → 3 paths | **exemption-mechanism-move** | PORT DECLARED: same grant, consumed exactly once |

### 4b. `tsconfig-entry-liveness` (11 legacy examples)

| # | Legacy example | Legacy | Final (eff / raw) | Subjects L → F | Class | Successor / port |
| -: | - | -: | -: | - | - | - |
| 0 | founding dead file-exact exclude | 1 | 1 / 1 | `candidates=1 scanned=1` → `tsconfig.json` | **identical** | `packages/client/src/gone.ts` — CATCH PARITY |
| 1 | exact/glob classifier | 1 | 1 / 1 | `candidates=3 scanned=2` → 2 paths | **identical** | same token AND same line — the `readCompilerConfigEntries` port's riskiest arm |
| 2 | MISSING-CONFIG | 1 | 0 / 0 | `candidates=0 scanned=0` → `not-tsconfig.json` | runtime-refusal | **4 tool errors** `tsconfig ROSTER EMPTY` |
| 3 | UNPARSEABLE | 1 | 1 / 1 | `candidates=0 scanned=0` → `tsconfig.json` | **split** | `-health` fires; **ANCHOR MOVED** line 0 file-level → line 1 with the config as token |
| 4 | NO-ROWS tripwire | 1 | 31 / 31 | `candidates=30 scanned=0` → `tsconfig.json` | **split** | `-health` fires beside 30 newly live globs |
| 5 | STALE-EXEMPT | 1 | 29 / 29 | `candidates=30 scanned=1` → 2 paths | **retired-arm** | none: central staleness is a whole-run fact |
| 6 | DEAD-CITE | 1 | 30 / 30 | `candidates=30 scanned=1` → `tsconfig.json` | **retired-arm** | **none at all** — same gap as its sibling |
| 7 | pattern-half declared limit | 0 | 1 / 1 | `candidates=1 scanned=0` → `tsconfig.json` | stronger-reader | glob arm no longer anchor-gated |
| 8 | live file-exact exclude | 0 | 0 / 0 | `candidates=1 scanned=1` → 2 paths | vacuous-both-zero | — |
| 9 | glob + `configDir` declared skips | 0 | 3 / 3 | `candidates=3 scanned=0` → `tsconfig.json` | stronger-reader | both globs live; the template reports as IRREDUCIBLE |
| 10 | exemption HONOURED | 0 | **29 / 30** | `candidates=30 scanned=1` → 2 paths | **exemption-mechanism-move** | PORT DECLARED: raw 30 → grant `tsconfig-entry-liveness:st-goldens-runtime` ×1 → effective 29 |

### 4c. What the table settles

- **Catch parity is REAL and now proven** for the founding file-exact arm of both gates (3 `identical`
  rows). That is the claim both #2273 records explicitly declined to make.
- **Every split arm has a MEASURED successor.** §4.6's sharpest warning is that a split's differential is
  weakest exactly where it feels strongest, because the carved-out arms are the ones nobody wrote proof
  rows for. Here all three carved arms (`biome …-health` NO-ROWS; `tsconfig …-health` UNPARSEABLE and
  NO-ROWS) fire on the legacy example that used to produce them.
- **One ANCHOR MOVE, receipted rather than bucketed** (§4.6 category 6): tsconfig #3 moved from a
  file-level line-0 finding to line 1 with the config path as its token. No positioned waiver binds to
  either module (both are `reviewed-grant`/`hard`, no `@orb-waive` surface), so nothing was orphaned.
- **Category 5's falsifier is answered per fixture, three times**, with the SHIPPED reviewed-grant rows
  rather than proof-local twins: each hidden site became exactly ONE reported row consumed by exactly ONE
  grant.
- **Two arms are genuinely RETIRED with no successor**, and one of them is a standing gap the codebase
  already knew about: a reviewed grant whose cited justification MOVED is caught by nothing.
  `biome-grant-liveness.ts`'s header states this after #2124 corrected an earlier claim that
  `dangling-refs` covered it. This lane MEASURED it, and it is true of BOTH members of the pair.

## 5. Floor executed

| Check | Command | Result |
| - | - | - |
| the new differential | `pnpm test:scoped tests/tooling/verify/gates/grant-liveness-legacy-replay.test.ts` | **4 passed** |
| every suite importing the shared harness | `pnpm test:scoped grant-liveness-family · no-color-literals-parity · port-parity-tier3 · schema-fact-parity · grant-liveness-legacy-replay` | **5 files / 24 tests passed** |
| the family's policies on the REAL tree | `pnpm check:structure --check biome-grant-liveness --check biome-grant-liveness-health --check tsconfig-entry-liveness --check tsconfig-entry-liveness-health` | **exit 0**, `raw 9 = granted 9 + effective 0`, 0 alarms, 0 tool errors — tree unchanged |
| the gates that READ gate-module source | `pnpm check:structure --check dangling-refs --check gate-modernization --check policy-soundness --check pd-citation-integrity` | exit 1 on **`gate-modernization` → `vector-scope-derived.ts:42 IMPORT_SANCTIONED`**, a file this lane never touched — PRE-EXISTING on `204607e84`, reported not fixed |
| biome | `pnpm exec biome check <4 files> --diagnostic-level=error` | clean |
| eslint | `pnpm exec eslint <4 files>` | exit 0 |
| types | `pnpm typecheck --config tsconfig.json` | `PASS tsconfig.json` |

### 5a. Planted positive controls — the table BITES

A differential that agrees with itself proves nothing, so both halves of the contract were broken and
re-run (probe by `cp f f.bak` → mutate → `mv f.bak f`; `git status --short` verified clean after each).

1. **Count control.** `fillerGlobs(bFinal, 2, 30, …)` → `29` on biome #4. RED:
   `#4 … — FINAL effective findings: expected [31 items] to deeply equal [30 items]`.
2. **Successor control.** `successor: BH` → `"a-successor-nothing-carries"` on biome #4, leaving every
   number correct. RED: `the declared SUCCESSOR "a-successor-nothing-carries" appears in no final finding
   or tool error`. **This is the important one** — it proves the successor proof is an independent check
   and not a decoration on top of the count assertions.

## 6. Reproducing the §3 derivation

```
ast-grep run --pattern 'defineGate($$$)' --lang ts --json tooling/src/verify/gates   # 267 modules
rg --files-with-matches "POPULATION PORT" tooling/src/verify/gates --glob '*.ts'      # 199 ports
rg --files-with-matches "§4\.6 DIFFERENTIAL" tooling/src/verify/gates --glob '*.ts'   # 16 records
rg --files-with-matches "createDifferential|createTmpdirDifferential|frozenLegacyGate|frozenFilesystemLegacyGate" tests --glob '*.ts'
```

The family grouping joins the third and fourth by gate id against each module's declared `family:`.

## LEDGER ROWS (2 rows)

| id | class | module | what | state |
| - | - | - | - | - |
| `LD-2319-1` | instrument-blind | `tests/support/legacy-differential.ts` | `shimHeaderImports` rewrote a NODE BUILTIN specifier into `file:///node:fs` (`createRequire.resolve` returns `node:fs` unchanged), so any frozen descriptor importing `node:*` died at import. Unreachable through the in-memory door, which refuses every disk-reading blob — the refusal hid a defect in the code path the refusal made unreachable. | **FIXED** this commit; `resolveSpecifier` returns `null` for a `node:` specifier |
| `LD-2319-2` | instrument-blind | `tests/support/legacy-differential.ts` | `shimHeaderImports` treated a MULTI-LINE named import's opening brace as the first BODY line, so the `} from "…"` carrying the specifier was never shimmed and the frozen module failed to resolve. Any wrapped import block (7+ names) hits it. | **FIXED** this commit; `IMPORT_BLOCK_OPEN`/`IMPORT_BLOCK_CLOSE` |

**ledger rows OWED: 0** — both defects are this lane's own instrument, found and fixed in the same commit
with the executed receipt above. The `gate-modernization` finding in §5 is pre-existing and belongs to
whoever owns `vector-scope-derived.ts`; it is reported, not claimed.

## Proposed lessons (report text — the orchestrator owns the memory write)

- **`a refusal hides defects in the path it makes unreachable`** — #2119's in-memory refusal was correct
  AND it kept two real `shimHeaderImports` bugs (node-builtin specifier, wrapped import block) unreachable
  for as long as it stood. The first caller through a newly opened door pays for every latent defect
  behind it, so budget the door itself as work, not just the table it enables.
- **`a file naming a gate is not a replay pin`** — the replay-coverage census swings 16 → 69 depending on
  which rung of the evidence ladder you count. `grant-liveness-family.test.ts` imports seven gates and
  replayed zero. Any "N of M converted" coverage claim about §4.6 owes both bounds.
- **`defineGate greps overcount by the fixture strings`** — measured 300 literal vs 267 real call sites
  (33, not the read-first doc's 2), because `policy-soundness` and `gate-modernization` embed
  `defineGate({` in authored fixture source.
- **`the substrate decides which bug can exist`** — already §4.6 law for verdicts; it is also true of the
  HARNESS. Both defects above are the in-memory substrate's shadow.
