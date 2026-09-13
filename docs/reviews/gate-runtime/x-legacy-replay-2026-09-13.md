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

### 4b-bis. The classification tally, DERIVED not hand-kept

```
rg --only-matching 'classification: "([a-z-]+)"' --replace '$1' \
   tests/tooling/verify/gates/grant-liveness-legacy-replay.test.ts | sort | uniq -c
```

**5 stronger-reader · 4 vacuous-both-zero · 4 retired-arm · 3 split · 3 runtime-refusal · 3 identical ·
3 exemption-mechanism-move = 25.** Stated as the COMMAND rather than as a number, because a hand-kept
census beside an executable table is the thing that rots: the test module's own header prose says
*"(7 rows)"* for stronger-reader and *"two exemption-HONOURED examples … (3 rows)"* for category 5, both
of which the derivation above refutes (5 and 3-from-3). Independently confirmed by codex's review of
`df2cda4c8` and re-derived here from the executable rows rather than copied. **The header correction is
routed to codex on integration and is deliberately NOT taken in this lane's commits**, which do not touch
that file — two edits to one header across two accounts is the conflict the routing rule exists to avoid.

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

## 5b. FAMILY 2 — `policy-soundness`, which is ONE replayable module and NINE refusals

`tests/tooling/verify/gates/policy-soundness-legacy-replay.test.ts`.

### 5b.1 THE PRE-CHECK, now standard for every family (orchestrator ruling, 2026-09-13)

Before any replay, ask whether a legacy descriptor ever existed:

```
git log --oneline -S "gate: GateDescriptor" -- <the family's module paths>
git log --oneline -S "gate: GateDescriptor" -- <a KNOWN conversion>   # the positive control
```

For `policy-soundness` the answer is **NINE of ten were BORN FINAL**. Every one was ADDED as
`export const gate = defineGate` (`fe8c9cc84` ×4 · `575e48d5a` ×2 · `6eadf5d3a` · `d334dd5ca` ·
`b2c6a8553`, all 2026-09-11/12) and no commit in history ever introduced or removed a
`gate: GateDescriptor` at any of their paths. **The control fires in the same query shape** — the same
search over `diagnostic-legibility.ts` + `biome-grant-liveness.ts` returns four commits — so the zero is
an absence, not a broken search. Both halves are a COMMITTED arm in the test, not prose.

**A §4.6 differential over those nine is structurally impossible, not merely unwritten.** That is the
deliverable for them; recording it is the work.

### 5b.2 The one conversion, and why it is NOT on the tmpdir door

`diagnostic-legibility`, converted at `1e81658b4`, legacy base `d07338082`. Its frozen descriptor carries
ZERO filesystem-reach spellings and no `fsBacked` — a pure AST reader — so it goes through the
PRE-EXISTING in-memory `frozenLegacyGate` + `createDifferential`, and the tmpdir door's wrong-door refusal
would correctly turn it away. **Routing is a measured property of the BLOB, never of the family.**

**Self-scanning immunity, stated per row rather than assumed:** this gate's `scanRoot` IS
`tooling/src/verify/gates/` — the `pd-citation-integrity` shape §4.6 warns about, and the same family that
holds the 33 `defineGate({` fixture strings. The fixture-level method is immune BY CONSTRUCTION: each
example's file map lands on its own virtual root, so the real corpus is never in scope. **The receipt is
the population column — 1 on both sides for every row, the single file the example plants.** An unfenced
real-corpus replay would have read 319.

### 5b.3 The table — 6 legacy examples, both engines

Populations are 1 source on both sides for every row; tool errors 0 both sides throughout (the classifier
THROWS on any shape, so a refusal could not be silently absorbed).

| # | Legacy example | Legacy | Final | Class | Successor (matched) |
| -: | - | -: | -: | - | - |
| 0 | bare `message:` with no pointer | 1 @ `x.ts:1` token `-` | 1 @ `x.ts:1` token `message` | **anchor-move** | `x.ts:1 \| message` |
| 1 | `message:` through a same-file const | 1 @ `x.ts:2` token `-` | 1 @ `x.ts:2` token `message` | **anchor-move** | `x.ts:2 \| message` |
| 2 | pointerless `const MSG` table value | 1 @ `x.ts:1` token `-` | 1 @ `x.ts:1` token `verb` | **anchor-move** | `x.ts:1 \| verb` |
| 3 | a concrete code-home pointer | 0 | 0 | vacuous-both-zero | — |
| 4 | the `// terse-ok:` escape | 0 | **1 raw → 0 ported** | **stronger-reader** (marker port) | `terse.ts:3 \| message`, ported twin silent |
| 5 | `tooling/` IS a code home | 0 | 0 | vacuous-both-zero | — |

### 5b.4 What the table settles

- **THREE ANCHOR MOVES (§4.6 category 6), receipted rather than bucketed.** Same file, same line, same
  catch — the finding GAINED its position token. The module's header records why: the legacy finding was a
  synthetic `{file, line, column: 0}` that `locateFinding` (`lib/ordinary-waiver.ts:394`) could not bind,
  so **the legacy gate had no working waiver door at all**, and the final re-anchors on the property
  assignment. **Nothing was orphaned by the move because nothing could bind to the old anchor** — which is
  exactly the receipt category 6 owes and could not be given without running both engines.
- **ONE MARKER VOCABULARY PORT (§4.6 category 3), declared with BOTH numbers.** The private `// terse-ok:`
  grammar is retired under §12.5. The legacy `mustPass` fixture carrying it now REPORTS (raw 1) and the
  PORTED twin — the same bytes plus `// @orb-waive diagnostic-legibility(message): …` — is silent (0).
  `runScenarios` proves the port is INERT on the legacy side, so the twin is the same example and not a
  different one. A second test drives the raw/ported pair directly, so the port is visible without reading
  the scenario table. Never a silent port.
- **The header's own census holds:** zero live `terse-ok` sites on the tree at conversion, so no product
  file was left behind by the retirement.

### 5b.5 Floor executed (family 2)

| Check | Result |
| - | - |
| `pnpm test:scoped tests/tooling/verify/gates/policy-soundness-legacy-replay.test.ts` | **3 passed** |
| both replays + every suite importing the shared harness (6 files) | **27 tests passed** |
| `pnpm check:structure --check diagnostic-legibility --check policy-soundness --check policy-waiver-identity --check policy-waiver-spelling` | exit 1: `diagnostic-legibility` reports **92** pre-existing findings on the real tree. **ZERO of the 92 are in a file this lane touched** (measured: 92 total finding lines, 0 matching `biome-grant-liveness.ts` / `tsconfig-entry-liveness.ts` / `legacy-differential`, with `bus-belt-total.ts` as the control returning 2). Whole-tree debt, red by construction under the #1584 posture; reported, not claimed. The other three are clean. |
| `pnpm exec biome check` · `pnpm exec eslint` on the two touched files | clean · exit 0 |
| `pnpm typecheck --config tsconfig.json` | `PASS tsconfig.json` |

**Planted positive controls, three, all RED and restored via `cp`/`mv`:**

1. **Anchor-token control** — row 2's expected token `verb` → `message`. RED:
   `#2 … — FINAL findings: expected [… | verb | …] to deeply equal [… | message | …]`. This is the one
   that matters here: it proves the table measures the ANCHOR, which is what three of six rows claim moved.
2. **Successor control** — row 4's `successor` → `"a-successor-nothing-carries"`, numbers untouched. RED:
   `#4 the declared SUCCESSOR "a-successor-nothing-carries" appears in no final finding or tool error`.
3. **Born-final control** — `biome-grant-liveness.ts` added to the nine-path list. RED:
   `expected [ '97e68be91', '05e4ae30c' ] to deeply equal []`. The refusal arm cannot pass by looking in
   the wrong place.

### 5b.6 The §3 correction this family forces

**§3's "199 ports" is an UPPER BOUND with a newly measured error class.** The census keys on the
`POPULATION PORT` header spelling, which matches even when the line reads *"POPULATION PORT: **NONE** — no
legacy population exists to port, because this module was BORN FINAL."* Family 2 shrinks **10 → 1**, a 90%
over-count in this family alone. The §3a family table is therefore a DISPATCH plan, never a work estimate,
and every family's report now opens with the `git log -S` pre-check above. The whole §3 band should be
re-derived with that pre-check once the families drain; the real backlog is likely well under 130.

## 5c. FAMILY 3 — `registry-definitions`, the PRE-CHECK only (no replay yet)

Run before any replay, per the standard established in §5b.1. **The corrected count is 9 members and
NINE of nine are real conversions — zero refusals.** This family is the opposite of family 2.

**Membership is 9, not the 8 in §3a.** `rg 'family: "registry-definitions"'` returns nine files;
`modal-body-not-placeholder` is absent from §3a only because a replay-harness file NAMES it, which §3
already flags as the weakest evidence rung. The dispatch count was low by one for that reason, in the
opposite direction from family 2's over-count by nine — **the §3a numbers err both ways.**

| Module | Conversion | Legacy base | Legacy examples (approx) | Filesystem reach → door |
| - | - | - | -: | - |
| `chrome-registry-completeness` | `f16cde889` | `577d03d63` | ~15 | NONE → in-memory |
| `config-group-completeness` | `58370d705` **(SPLIT)** | `dd862e988` | ~30 | NONE → in-memory |
| `home-tile-registry-completeness` | `2241d52b8` | `614b2cb55` | ~9 | NONE → in-memory |
| `modal-body-not-placeholder` | `577d03d63` | `f5b222e10` | ~6 | NONE → in-memory |
| `modal-registry-completeness` | `577d03d63` | `f5b222e10` | ~13 | NONE → in-memory |
| `no-parallel-section-map` | `2241d52b8` | `614b2cb55` | ~21 | NONE → in-memory |
| `placeholder-copy-registry` | `577d03d63` | `f5b222e10` | ~8 | NONE → in-memory |
| `section-factory-contribution-bundle` | `ef18f3a14` | `f16cde889` | ~15 | NONE → in-memory |
| `section-registry-completeness` | `dd862e988` **(SPLIT)** | `e18bce01e` | ~16 | NONE → in-memory |

Every member held `gate: GateDescriptor` at its base (8 of 9 back to `68c8f42d6`, the 2026-08-21 tooling
move; `config-group-completeness` was minted legacy at `0040bebae`). Every frozen blob has ZERO
filesystem-reach spellings, so **the whole family routes to the in-memory door** — the tmpdir door built
for family 1 is not used here, and its wrong-door refusal would say so.

**THE RISK THIS FAMILY CARRIES, named before the work starts.** Two of the six conversion commits are
SPLITS by their own subject lines (`58370d705` "split config-group-completeness", `dd862e988` "split
section-registry-completeness"), and `577d03d63` converted three modules at once. §4.6 is explicit that a
split's differential is **weakest exactly where it feels strongest**, because the arms carved into a
sibling are the awkward ones nobody wrote proof rows for — so a clean replay over the parent's examples
can exercise the moved arm ZERO times and come back green whatever the split did to it. The successor
field this lane added is the mechanism for catching that: a split row must MATCH its sibling's output,
and where a moved arm has no legacy coverage the row says so per example rather than in prose.

**Scale:** ~133 legacy examples across 9 modules and 6 distinct base SHAs — more than families 1 and 2
combined. The RUN itself is not the expensive half (all in-memory; families 1 and 2 replayed 31 examples
in ~1.5s of engine time); the per-row declaration is.

## 6. Reproducing the §3 derivation

```
ast-grep run --pattern 'defineGate($$$)' --lang ts --json tooling/src/verify/gates   # 267 modules
rg --files-with-matches "POPULATION PORT" tooling/src/verify/gates --glob '*.ts'      # 199 ports
rg --files-with-matches "§4\.6 DIFFERENTIAL" tooling/src/verify/gates --glob '*.ts'   # 16 records
rg --files-with-matches "createDifferential|createTmpdirDifferential|frozenLegacyGate|frozenFilesystemLegacyGate" tests --glob '*.ts'
```

The family grouping joins the third and fourth by gate id against each module's declared `family:`.

## 7. Boundary repair — the shared write site (cb-x-replay-boundary)

**Lane:** `cb-x-replay-boundary`, same worktree, on top of `57349c1dc`. **Numbered 7 rather than the
briefed 6 because §6 is taken** (the §3 derivation, cited by name from §3a); renumbering §6 would break
that reference.

**Outcome:** the two shared WRITE boundaries codex's security review of `df2cda4c8` held the commit for
are CLOSED, and the frozen-closure extraction that arm (a) added at `57349c1dc` is folded into the same
guarded path. `tests/support/legacy-differential.ts` now has exactly ONE `writeFileSync` and ONE
`mkdirSync`, both inside `writeStagedReplayFile`.

### 7.1 The two mechanisms

**F1 — a fixture key escaped the owned root.** `materialize` read every key through
`NON_AUTHORED_SEGMENT_RE` and nothing else; that expression rejects `node_modules`/`.git`/`dist`/`.cache`
and admits `../escaped.txt`. Repair: **every key is judged before the root exists** — the strict
repo-relative POSIX grammar is IMPORTED (`lib/policy-repo-inventory.ts#assertPolicyRepoPath`, the rule the
final runtime already applies to every policy scope path) rather than re-spelled as a fourth copy, and the
non-authored refusal survives beside it as the separate SEMANTIC fence it always was. Then every write
resolves through `stagedReplayTarget`, and a throw anywhere between the `mkdtemp` and the last write reaps
its own root (the callers' `finally` cannot: it only exists once `materialize` has RETURNED a root).

**F2 — the loader's staging write was unguarded.** `assertReplayRootIsScratch` had exactly one caller,
inside `materialize`, on a root that function had just created itself; the door that takes a staging
directory from a CALLER never called it. Repair: the guard binds at the top of `loadFrozenGate` (before
`git show`, before the first byte), and again inside `stagedReplayTarget`, which is what every staged
write goes through — plus a containment check on the entry module immediately before `import()`, the one
call that hands frozen bytes to the runtime.

**Containment is two independent tests, deliberately.** The grammar is a claim about a STRING; the second
is a claim about the COMPUTED TARGET (`containedIn(canonicalRoot, resolved)`), and each existing path
segment is `lstat`ed so a SYMLINK is resolved and re-contained before it is crossed — `writeFileSync`
follows a link and `mkdirSync` materializes a subtree behind one, so a lexical check alone is not
containment. This is the same two-test argument `ops/resource-path.ts` makes for the read side.

| Site | Name | Callers routed through it |
| - | - | - |
| pure resolver (exported, no I/O) | `stagedReplayTarget(root, relativePath)` | `writeStagedReplayFile`; `extractFrozenClosure` (target computed BEFORE the cycle map records it); the controls' red side |
| THE ONE WRITE SITE | `writeStagedReplayFile(root, relativePath, contents)` | `materialize` (every fixture key) · `extractFrozenClosure` (every frozen blob in the closure) |
| anti-live-tree refusal | `assertReplayRootIsScratch(root)` | `stagedReplayTarget` (so: every write) · `loadFrozenGate` head · `materialize` |

### 7.2 Red-first, and why no arm can perform the write it refuses

The pre-fix primitives were reproduced **in a throwaway parent this lane owned**, never against the
repository: with `df2cda4c8`/`57349c1dc`'s `materialize` key handling, `../sentinel.txt` was admitted by
the non-authored filter, resolved outside the owned root, OVERWROTE the sentinel with `escape-control`, and
the sentinel SURVIVED `rmSync(root)`; with `57349c1dc`'s `extractFrozenClosure`, the frozen entry module
was written into an arbitrary caller-supplied root with no guard between the blob read and the write.

Every committed control's red side is unwriteable by construction, which is the condition the review set:

- the traversal / grammar / symlink arms drive the **pure** resolver, which creates nothing (asserted:
  `readdirSync(root)` is `[]` after eleven refusals);
- the two-leg fixture-key arm drives the real `legacyReplay` and `finalReplay`, whose refusal precedes
  their own `mkdtemp`;
- the loader-binding arm hands the MUTATOR a root inside the checkout that is a regular FILE
  (`package.json`) and a symlink to one, so a regression that dropped the guard fails with `ENOTDIR`
  instead of planting a frozen module in the tree.

**Planted breaks, both restored via `cp`/`mv` (`git status --short` clean after each):**

1. `assertStagedRelativePath` neutered → `staged write target REFUSES every escaping path` and
   `BOTH tmpdir replay legs refuse…` go RED, **and the second mechanism still refused the write** —
   `the replay harness refuses to write "../escaped.txt": it resolves to /tmp/orb-tool-…/escaped.txt,
   OUTSIDE the staging root`. Defense in depth, measured rather than asserted.
2. `assertReplayRootIsScratch` neutered → the loader-binding arm goes RED with
   `expected … 'must live OUTSIDE the running checkout' but got 'ENOTDIR: not a directory, lstat
   '<checkout>/package.json/c97de9d2--tooling__src__verify__gates__biome-grant-liveness.ts''`. That
   message is the proof of BOTH halves: the arm reaches the mutator's real staging write, and the write it
   would have performed cannot land.

**Nothing survived.** `find /tmp -maxdepth 1` after the controls and both probes:
`orb-legacy-differential-*` **0**, `orb-replay-boundary-sentinel-*` **0**, `escaped.txt` **0**, and no
`staging` / `linked-staging` / `link-into-checkout` / `c97de9d2--*` anywhere under `/tmp` (**0**). No
`c97de9d2--*` or `planted.ts` in either checkout. (78 stale `orb-tool-*` scratch dirs predate this lane —
oldest 2026-08-31 — and two are another suite's `bin/gh` fixture; none is a replay root.)

### 7.3 The arm (a) fold — the frozen closure now writes through the guard

`extractFrozenClosure` keeps its design (flat `${base}--${path with / → __}` names, so no extracted name
carries a separator and no nested directory is created; the cycle map records the target BEFORE recursing;
only `./` and `../` specifiers are era-matched, everything else keeps today's resolution so `ts-morph`
stays ONE instance). What changed is that its target is now `stagedReplayTarget(scratch, name)` and its
write is `writeStagedReplayFile` — so the flat-name containment property is CHECKED rather than merely
true, and the `git show` output, which is written as a file the harness then imports, lands only at a path
the guard has cleared. Both committed closure controls stay green: `placeholder-copy-registry@f5b222e10`'s
`../lib/section-defs.ts` (present at that SHA, absent today) in `closure.extracted` with `depth > 0`, and
the loud `does not exist at that SHA either` refusal.

### 7.4 Floor executed (boundary repair)

| Check | Command | Result |
| - | - | - |
| the seven suites importing the shared harness | `pnpm test:scoped` on `grant-liveness-legacy-replay` · `policy-soundness-legacy-replay` · `registry-definitions-legacy-replay` · `grant-liveness-family` · `no-color-literals-parity` · `port-parity-tier3` · `schema-fact-parity` | **7 files / 35 tests passed** |
| families 1+2 through the guarded write path | same run | family 1 **8 tests** (4 table/refusal + 4 new containment controls), family 2 **3 tests**, family-3 pre-check **4 tests**; the pre-existing set is **31 → 35**, the delta being exactly this lane's four controls. Every declared number is unchanged, and these tables assert exact finding lists, populations, subjects and tool errors, so green IS unchanged |
| biome | `pnpm exec biome check <2 files> --diagnostic-level=error` | clean (one scoped `--write` for formatting; `noShadow` on a `relative` import avoided by spelling containment as the module's existing `${root}${sep}` prefix test) |
| eslint | `pnpm exec eslint <2 files>` | exit 0 |
| types | `pnpm typecheck --config tooling/tsconfig.json --config tsconfig.json` | `PASS tooling/tsconfig.json` · `PASS tsconfig.json` (2 runnable of 11 discovered) |
| docs | `pnpm check:docs docs/reviews/gate-runtime/x-legacy-replay-2026-09-13.md` | exit 0 |

### 7.5 The §3a band's error class has a THIRD direction

§5b.6 recorded the band over-counting (family 2: ten dispatched, one real — `POPULATION PORT` matches
`POPULATION PORT: NONE`), and §5c recorded it under-counting (family 3: nine members, eight listed,
because a replay-harness file NAMING a module demotes it). `LD-2319-5` adds a third, orthogonal to both:
a row can be CORRECTLY counted, a genuine port, and still have been **unreplayable** — before the closure
fix a frozen descriptor whose `lib/` dependency had since been deleted or renamed failed at
`Cannot find module`, and which modules those were was decided by unrelated post-conversion churn, so the
reachable backlog shrank every time the program consolidated a reader. The first two directions are census
errors about MEMBERSHIP; this one is about REACHABILITY, it was invisible to any header grep, and it is the
only one of the three that is now CLOSED rather than mitigated.

## LEDGER ROWS (7 rows)

| id | class | module | what | state |
| - | - | - | - | - |
| `LD-2319-1` | instrument-blind | `tests/support/legacy-differential.ts` | `shimHeaderImports` rewrote a NODE BUILTIN specifier into `file:///node:fs` (`createRequire.resolve` returns `node:fs` unchanged), so any frozen descriptor importing `node:*` died at import. Unreachable through the in-memory door, which refuses every disk-reading blob — the refusal hid a defect in the code path the refusal made unreachable. | **FIXED** in `df2cda4c8`; `resolveSpecifier` returns `null` for a `node:` specifier |
| `LD-2319-2` | instrument-blind | `tests/support/legacy-differential.ts` | `shimHeaderImports` treated a MULTI-LINE named import's opening brace as the first BODY line, so the `} from "…"` carrying the specifier was never shimmed and the frozen module failed to resolve. Any wrapped import block (7+ names) hits it. | **FIXED** in `df2cda4c8`; `IMPORT_BLOCK_OPEN`/`IMPORT_BLOCK_CLOSE` |
| `LD-2319-3` | drifted-count | `tooling/src/verify/gates/diagnostic-legibility.ts:31` | The header reads *"CONVERSION rather than a module born final; **the other eight** have no legacy population and say so."* The tree says **NINE**: the `policy-soundness` family has ten members and nine are born final (`rg 'family: "policy-soundness"'` → 10 files; the `git log -S` receipt in §5b.1). A tenth member joined after the sentence was written. | **OPEN** — one-line header fix, deliberately NOT taken by this lane (orchestrator ruling 2026-09-13: the row is the deliverable, the fix is a routed follow-up) |
| `LD-2319-4` | census-blind | this report §3 | The replay-owed census keys on the `POPULATION PORT` header spelling, which MATCHES a module whose line reads *"POPULATION PORT: NONE — BORN FINAL"*. So "199 ports" counts born-final modules as replay-owed. Measured in family 2: 10 → 1, a 90% over-count in one family. | **OPEN, MITIGATED** — every family report now opens with the `git log -S "gate: GateDescriptor"` pre-check + positive control (§5b.1), and §5b.6 states the band is an upper bound. A full re-derivation of §3 with the pre-check is owed once the families drain. |
| `LD-2319-5` | instrument-blind | `tests/support/legacy-differential.ts` | `resolveSpecifier` sent a frozen module's RELATIVE imports to TODAY's tree, so a descriptor whose `lib/` dependency was later deleted or renamed could not be LOADED AT ALL — and it failed as `Cannot find module`, which reads as a broken test rather than as a missing capability. WHICH modules were replayable was therefore decided by an accident of which `lib/` refactors happened AFTER each conversion, and the backlog shrank silently every time the program consolidated a reader. Measured on `placeholder-copy-registry` at `f5b222e10`, whose `../lib/section-defs.ts` exists at that SHA and is gone today. | **FIXED** in `57349c1dc`; `extractFrozenClosure` fetches the whole relative-import closure at the SAME frozen SHA, memoised so a cycle or diamond terminates, and refuses loudly when a dep is absent at the SHA too. Receipts: the `section-defs` row asserted in `closure.extracted` with `depth > 0`, and the `does not exist at that SHA either` refusal, both in `registry-definitions-legacy-replay.test.ts`. Its writes were folded into the guarded write site by `cb-x-replay-boundary` (below) |
| `LD-2319-6` | boundary-open | `tests/support/legacy-differential.ts` `materialize` | A fixture KEY is an unvalidated path. `materialize` filtered keys for four non-authored segment names and nothing else, so `{ "../escaped.txt": … }` — a syntactically valid `GateExample` map, and `Files` refines nothing — normalized to a SIBLING of the mkdtemp root and was written there, outside everything the `finally` reaps. The ResourceHost's own refusal fires later, on the overlay, after the bytes have landed. Measured in a throwaway parent before the repair: the escaping key OVERWROTE a sentinel with `escape-control` and the sentinel SURVIVED removal of the root. Found by codex's security review of `df2cda4c8` (F1, HIGH host-integrity). | **OPEN** — repaired by `cb-x-replay-boundary` on branch `wt/agent-a2913d5f5cb4656c2`: every key is judged by the imported strict repo-relative POSIX grammar (`lib/policy-repo-inventory.ts#assertPolicyRepoPath`) BEFORE the mkdtemp, every write resolves through `stagedReplayTarget`, and a partial materialize reaps its own root. Pinned by four controls in `grant-liveness-legacy-replay.test.ts`. Integrator flips this row with the landing sha |
| `LD-2319-7` | boundary-open | `tests/support/legacy-differential.ts` `loadFrozenGate` | The frozen loader wrote the extracted module into whatever staging directory a CALLER handed it, and `assertReplayRootIsScratch` — the door's own advertised anti-live-tree refusal — was bound to nothing: it had exactly one caller, inside `materialize`, on a root that function had just made itself. `frozenFilesystemLegacyGate(process.cwd(), …)` would have written a frozen `.ts` module into the CHECKOUT; a `scratch` symlink resolving into the checkout does the same. Only every current caller's choice to pass Vitest's `scratch` kept the tree clean. Found by codex's security review of `df2cda4c8` (F2, MEDIUM host-integrity). | **OPEN** — repaired by `cb-x-replay-boundary`: the guard is bound at the top of `loadFrozenGate` (before `git show`, before the first byte) AND inside `stagedReplayTarget`, which every staged write and the pre-`import()` containment check go through. Pinned by a mutator arm whose red side is structurally unwriteable (a root that is a regular FILE ⇒ ENOTDIR, measured). Integrator flips this row with the landing sha |

**ledger rows OWED: 0.** Rows 1-2 and 5 are this instrument's own defects, found and fixed with executed
receipts. Row 3 is a drifted count this lane MEASURED and is routed rather than fixed, per the
orchestrator's ruling. Row 4 is this report's own census, mitigated in the same commit that found it.
**Rows 6-7 are written OPEN on purpose**: both are repaired and pinned on this branch, but the fixing sha
is the INTEGRATOR's to name, so the state cell says who repaired it and what the pins are rather than
claiming a closure the row cannot yet cite (`closure SHA ≠ fix`). Two findings are reported and NOT
claimed because they belong to other owners: the `gate-modernization` red on `vector-scope-derived.ts:42`
(§5) and `diagnostic-legibility`'s 92 real-tree findings (§5b.5), neither of which touches a file this
lane wrote.

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
- **`ask whether a legacy descriptor EVER existed before scoping a replay`** — the standard pre-check is
  `git log -S "gate: GateDescriptor" -- <the family's paths>` WITH a known-conversion positive control.
  Family 2 was dispatched as ten modules and is one: nine were born final, and a §4.6 differential over a
  born-final module is structurally impossible rather than unwritten. A header-word census cannot tell the
  two apart — `POPULATION PORT: NONE` matches a `POPULATION PORT` grep.
- **`a differential can only measure an anchor if it compares the anchor`** — three of family 2's six rows
  are pure anchor moves: same file, same line, same catch, a token where there was none. A count-only
  table calls all three "identical" and misses that the legacy gate had no bindable waiver position at all.
- **`the substrate decides which bug can exist`** — already §4.6 law for verdicts; it is also true of the
  HARNESS. Both defects above are the in-memory substrate's shadow.
