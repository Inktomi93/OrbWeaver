---
kind: law
status: active
updated: 2026-08-02
---

# Authoring a structural gate

> THE law for `scripts/check/gates/**`. Read this IN FULL before adding, editing, renaming, or deleting a
> gate. It is the amnesiac-agent transfer of lessons that were paid for in silent-green gates, dead
> allowlists, and red conformance runs — every rule below is a defect that already happened.
> Indexed from `docs/architecture/core/AGENTS.md` §7. Supersedes `UI-Gates-and-Lessons.md` §12 (that
> section is the short form; where they differ, this doc wins). The gate catalog itself is
> `docs/architecture/core/Core-Enforcement-Active-Gates.md`.

## 0. The one-screen version

| Step | Do |
| - | - |
| scaffold | `pnpm gate:new <kebab-name>` — writes the gate + prints every coupled site |
| write | fill the descriptor; ≥1 `mustFlag`, ≥1 `mustPass`, each with a `why` |
| couple | Core-Enforcement row · the `(N registered gates)` count · `check-gates.int` fixture OR `UNFIXTURABLE_GATES` |
| exempt | typed `ExemptionRow` (`why` mandatory) + a STALE arm + a real-tree anchor. Never a comment marker without a stale arm |
| prove | `pnpm exec tsx scripts/check/report.ts` on a REAL planted violation — conformance passing proves nothing about `scanRoot` |
| fix | violations found at landing get FIXED in the same lane. Allowlists are for PERMANENT deliberate exemptions only |

## 1. The descriptor contract

`scripts/check/contract.ts` is the whole interface. A gate never walks anything itself: it declares the
SyntaxKinds it wants and the runner (`pass.ts`) feeds it from ONE shared walk over the shared workspace
(`scripts/ts-workspace.ts` `harnessGlobs` — `packages/*/src`, `tests/`, and `scripts/check/gates/`).

| Field | Required | Meaning / trap |
| - | - | - |
| `name` | yes | kebab, MUST equal the filename — loader-enforced, hard error at load |
| `docRow` | yes | the `Core-Enforcement-Active-Gates.md` citation. `dangling-refs` resolves its `*.md`; `gate-modernization` resolves its `§` anchors |
| `status` | yes | `active` \| `dormant`. `runPass` filters to `active`; a dormant gate still runs its own conformance proof |
| `scopeSafety` | yes | `incremental-safe` (per-file verdicts) \| `whole-project`. LOAD-BEARING: a cross-file / registry / coverage gate marked `incremental-safe` FALSE-GREENS on scoped runs |
| `message` | yes | the reason, written ONCE. Printed as the group header; a `Finding` never repeats it |
| `fix` | no | how to correct it, printed once under the header |
| `scanRoot` | no | which files this gate reads AT ALL. See §3 — the #1 silent-green source |
| `kinds` + `visit` | one of | per-node subscription. `visit` MUST be read-only; accumulate into module state for `finalize` |
| `visitFile` | one of | per-file hook (line scans, per-file setup) |
| `run` | one of | whole-project pass over the SAME shared project — never `new Project(` |
| `fsBacked` | no | true when hooks read the real filesystem. Conformance then materializes examples into a real temp dir instead of an in-memory project |
| `begin` / `finalize` | no | reset accumulators / judge them. Ratchet + stale arms live in `finalize` |
| `mustFlag` / `mustPass` | yes | ≥1 each. The loader REFUSES an un-proven gate — this is fail-closed, not advisory |

**The loader IS the registry.** `loader.ts` globs `scripts/check/gates/*.ts`, imports each in sorted order,
and validates the exported `gate`. There is no registration list to edit. Consequences:

- A gate-dir module that exports **no** `gate` is silently skipped by the loader (`mod.gate === undefined
  ⇒ continue`). That hole is closed by `gate-modernization` arm A — a gate file that registers nothing is RED.
- An INVALID descriptor is a hard load error attributed to its file, aborting the whole run. Never
  "temporarily" ship a half-descriptor.
- A duplicate `name` is a hard error.

**Reporting.** `ctx.report` has three shapes and they are NOT equivalent:

| Call | Anchors at | Honors `@orb-gate-ignore` |
| - | - | - |
| `report(node)` | the node | YES |
| `report(node, { token, offset })` | the token inside the node | YES |
| `report(finding)` | whatever the Finding says | **NO** |

The explicit-`Finding` overload bypasses `hasGateIgnore` (suppression needs a node to read leading comments
from). A gate that reports node-anchored findings through the Finding overload silently defeats every
`@orb-gate-ignore` on its diagnostics — this regressed `no-inline-types` once. RULE: node-anchored and
suppressible ⇒ the NODE overload; reserve the Finding overload for genuinely file-level findings and for
stale/ratchet arms (which anchor on the gate file itself).

## 2. The COMPLETE coupled-sites list

Arming a gate touches these. Miss one and either `enforcement-registry-parity`, `check-gates.int`, or
nothing-at-all (the worst case) fires.

| # | Site | What |
| - | - | - |
| 1 | `scripts/check/gates/<name>.ts` | the descriptor, with `mustFlag` + `mustPass` (each with a `why`) |
| 2 | `tests/tooling/check-gates.int.test.ts` `writeFixtures()` | a `__g_` fixture: a minimal REAL-tree violation at the gate's anchor path |
| 2b | `tests/tooling/check-gates.int.test.ts` `UNFIXTURABLE_GATES` | INSTEAD of 2, with a comment stating WHY no fixture can drive it (whole-corpus ratchets, real-manifest parity). Never fake a fixture |
| 3 | `docs/architecture/core/Core-Enforcement-Active-Gates.md` | the Layer-3 table row (`\| \`name\` \| what it enforces \|`) |
| 4 | same doc, the `(N registered gates)` count line | bump it — `enforcement-registry-parity` reds until doc and loader agree |
| 5 | `package.json` + `scripts/verify/registry.ts` | ONLY if the gate gets its OWN script/tier (like `check:orphan-ratchet`). A normal gate rides `structure:full` and needs neither |
| 6 | `scripts/check/gates/<name>.baseline.json` + a `gen-*-baseline.ts` | ONLY for a ratchet gate. The generator is the single writer; the baseline is committed |

Sites 3+4 are what a "the gate works, why is check red?" question is 90% of the time.

## 3. `scanRoot` — path formats and the complex-predicate warning

**The two path forms are different and NOT interchangeable:**

| Where | Format | Match with |
| - | - | - |
| `scanRoot: (p) => …` | bare repo-relative, NO leading slash | `p.startsWith("packages/client/src/")` |
| `sf.getFilePath()` inside a hook | absolute `/…/packages/…` | `path.includes("/packages/client/src/")` |

Using the absolute form in a `scanRoot` makes the gate **never fire and stay GREEN** — a silent
false-negative, not an error. Synthetic `mustFlag`/`mustPass` examples use VIRTUAL paths, so **conformance
never catches this class.** Cross-check a sibling gate's path form, then prove the bite on the real tree.

Defensive middle ground (used by `density-tier`, `no-hover-display-swap`): `(p) => p.includes("packages/client/src/")`
makes no assumption about a leading slash at all.

**A complex `scanRoot` predicate is a coverage decision, and it is unreviewable by inspection.** ~16 gates
carry multi-clause predicates (unions of roots, negated segments, regex tests). Every clause is a claim that
the excluded files cannot violate the rule. Before writing one, run the predicate over the real file list and
READ what it drops. Two specific rules:

- **Scan-and-allowlist beats scanRoot-exclusion for sanctioned homes.** A sanctioned home scoped OUT of
  `scanRoot` carries its exemption silently through a rename or a move. The same home SCANNED plus a cited
  allowlist row goes RED at its new path (`macro-resolution-home`, `own-tables-only`, `no-hover-display-swap`
  are the precedents; `scrubber-home`'s exclusion shape is the anti-pattern). Add a rename tripwire in
  `finalize` (one finding per allowlist entry point missing from the tree).
- **A hard-coded FILE path constant dies on rename.** `const FACTORY_FILE = "…/create-x-form.ts"` that the
  gate DISPATCHES on goes silently green the day that file moves; tsc cannot see it and an import sweep
  misses it. Prefer deriving the target from a structural fact (an import specifier, a descriptor field, a
  schema export). When a path constant is unavoidable, pair it with a tripwire that REDS when the path stops
  resolving. Three gates went dead-green at once on one `index.ts` split; escaped-regex spellings
  (`chat\/index\.ts`) need sweeping too, not just plain strings.

## 4. The exemption grammar (LAW)

An exemption is a promise. This is how the promise is written.

1. **TYPED ROWS, NOT COMMENT MARKERS.** The house shape is `Record<key, ExemptionRow>` from `contract.ts` —
   `ExemptionRow` makes `why` mandatory at the type level. Widen by intersection
   (`ExemptionRow & { readonly owners: readonly string[] }`), never by re-declaring a parallel `{…, why}`
   shape. A `Record<string, string>` "path → reason" table is the legacy spelling; migrate it when you touch
   the gate.
2. **THE REASON IS MANDATORY AND CARRIES THE END CONDITION.** An exemption that cannot say what would end it
   is a permanent one. Write both: why it is granted, and what makes it deletable.
3. **COMMENT MARKERS, when a table cannot express the site** (`// allow-skip:`, `// terse-ok:`,
   `// FABRICATION-OK:`, `// @swallowed-ok:`, `// @typeonly-ok:`, `// @server-only:`): the house grammar is
   `marker:\s*\S` — **the reason after the colon is REQUIRED**, and a bare marker must exempt NOTHING. A
   bare-marker-exempts rule is a rubber stamp.
4. **EVERY EXEMPTION VOCABULARY IS TWO-SIDED FROM BIRTH.** A row / marker / baseline entry that no longer
   matches a live violation MUST be RED ("stale entry — delete it"), never silence. One-sided exemptions rot
   into lies, and a stale marker is a LOADED GUN: the next violation written on that line inherits an
   exemption nobody granted it. In-tree gold standards: `own-tables-only.ts` (four stale arms),
   `no-hover-display-swap.ts` (`STALE_ENTRY_MESSAGE_PREFIX`), `monotonic-tests.ts` tooth 3 (the two-sided
   `allow-skip` marker), `bus-coverage.ts` (`STALE_MESSAGE`), `dialog-via-composite.ts`,
   `firehose-import-allowlist.ts`.
5. **A STALE ARM NEEDS A REAL-TREE ANCHOR, NOT A `scope.kind` CHECK.** `ctx.scope.kind === "project"` is
   TRUE inside gate-conformance's synthetic mini-projects too, so a scope-guarded stale arm fires there and
   reds the gate's own self-proof. Guard on a real-tree ANCHOR instead, and keep the gate's examples off the
   anchor's path. Both shapes are VALID:
   - `fileLoaded(ctx, "packages/db/src/schema/index.ts")` (`pass.ts`) — an anchor file present on every real
     run and never needed by an example (`own-tables-only`);
   - `existsSync(join(root, BASELINE_REL))` / a real-manifest guard (`verify-registry-parity`'s `"verify" in
     scripts` idiom, `density-tier`'s absent-baseline-in-temp-dir behavior) — the ALTERNATE anchor shape,
     equally sanctioned.
6. **A GATE KEYED ON AN EXACT NAME MUST DETECT ITS OWN BLINDNESS.** If the gate looks up a symbol/file/table
   BY NAME, add the tripwire: when that name resolves to nothing on the real tree, RED. Otherwise a rename
   turns the whole gate into a no-op that reports ✓ forever (`firehose-import-allowlist`, `knob-wire-coverage`'s
   paired-anchor tripwire).
7. **FIX AT LANDING; DO NOT PARK (owner law).** A new gate's live violations get FIXED in the authoring lane.
   Allowlist/baseline rows are for genuinely PERMANENT deliberate exemptions — each with a reason and a stale
   arm — never temporary debt parking. A violation genuinely out of your lane's scope is an escalation with a
   stated default, not a silent row. A gate that ships with parked violations teaches the tree that red is
   negotiable.
8. **A BASELINE RATCHET is the ONE sanctioned handoff shape**, and only when the burn-down is another lane's
   named work. It is derived by a committed `gen-*-baseline.ts` (the single writer), it only ever SHRINKS,
   and it is two-sided: a row whose site no longer violates is RED ("regenerate and commit the shrink").
   Terminal state is `{}` + delete both the baseline and its generator. Precedents: `density-tier`,
   `no-test-fabrication`, `suppressions`, `gate-modernization`.

**BASELINES LIE WHEN THE MATCHER HAS BLIND SPOTS.** `ui-size-via-variant` declared its debt baseline terminal
while 14 hits of its own incident class sat invisible — the matcher never stripped Tailwind's `!` important
modifier (both spellings: `!size-6` AND `size-6!`). When a ratchet reaches zero, RE-DERIVE the matcher's blind
spots (escape hatches, modifier prefixes, alternate spellings, wrapper expressions) before trusting the zero.
Probe the engine/tool directly for spelling variants; docs under-report.

## 5. The self-proof: `mustFlag` / `mustPass`

`conformance.ts` runs every example through the SAME dispatcher as the real run. A failure is a TOOL error
(exit 2), not a violation.

- `files` is either a code string (one virtual file at `at`, or a `scanRoot`-derived default path) or a
  path→source MAP (a mini-project — required whenever the gate's bite depends on another file).
- `expect: { count, line, messageIncludes }` — use `count` whenever per-occurrence granularity is the point.
- `why` is effectively mandatory: it is what a conformance failure prints. "the founding shape — the real
  defect this gate was minted from" is the useful register.
- A `mustPass` row is how a DECLARED LIMIT becomes a written baseline instead of an assumption. Write one per
  known blind spot (`own-tables-only`'s namespace-import row; `no-hover-display-swap`'s `@media (hover:hover)` row).

**LITERAL-SHAPE BLINDNESS — the lying-proof class.** A reader that extracts a value via a narrow node check
(only `StringLiteral`, a bare `Identifier.getText()`) returns undefined on `x as never`, `satisfies`,
parenthesized, and `NoSubstitutionTemplateLiteral` shapes — and SILENTLY PASSES the violation. Rules:

- Read authored values through `scripts/check/ast-read.ts` (`unwrapExpression` / `readStringValue`), never a
  hand-rolled `Node.isStringLiteral(x) ? … : undefined`.
- A gate that SUBSCRIBES to the literal node KIND is wrapping-immune; the blindness lives in property/arg
  reads via narrow type guards.
- Every fixture must use the EXACT literal shape the reader parses. A probe the gate cannot read is a LYING
  PROOF.
- Cover every syntactic FORM of the banned shape (object vs array vs bare list; self-closing vs PAIRED JSX
  tags — a self-closing-only fixture set once shipped a confident false-positive factory; `.map()` vs
  `renderItem`; annotated vs inferred).
- Some gates match COMMENTS too — never spell a gate's trigger literally in prose near its scan root.
- A gate scanning STRING CONTENT must evaluate the initializer into its ORDERED runtime value first (follow
  identifier→const, join `+`-concats in order, gap `${…}` interpolations) and tokenize the WHOLE value.
  `.md` tokens routinely straddle a `+` boundary; `dangling-refs.ts` `evalString` is the precedent.

**A CARRIER FENCE IS A COVERAGE DECISION, NOT A STYLE ONE.** Copying another gate's `className=`/`cn()`
ancestry fence loses every class string that reaches an element through a VARIABLE. Inherit a fence only when
the token shape is ambiguous English that sentences can carry (`shadow`, `rounded-lg`); a SELF-IDENTIFYING
shape (a `group-hover:` variant prefix) scans UNFENCED — strictly wider, no false positives. Probe the fence
against the real tree before inheriting it, and expect "already migrated" claims to be wrong.

## 6. Harness mechanics

| Thing | Behavior |
| - | - |
| discovery | glob `scripts/check/gates/*.ts`, sorted, sequential import (deterministic per-file error attribution) |
| dispatch | ONE `forEachDescendant` per file; each node goes only to gates subscribed to its kind AND in `scanRoot` |
| phases | `begin` (all gates) → per-file `visitFile` + node walk → `run` (all) → `finalize` (all) |
| isolation | every hook is guarded; a throw becomes a `ToolError` attributed to gate+phase and does NOT abort siblings |
| ordering | findings canonical-sorted by (file, line, column, token, message) |
| DORMANT | `status:"dormant"` ⇒ `runPass` skips it, `report.ts` never prints it, `check-gates.int`'s `DORMANT_GATES` must list it. Conformance still runs it as-active. The descriptor's `status` is ground truth; the doc table and the test set are MIRRORS |
| probe artifacts | findings on `__g_*` / `__dc_*` paths are stripped at the real-tree entrypoints (`report.ts`, `scoped.ts`) so a concurrent battery's transient fixtures can't red an independent run. `check-gates.int` opts out with `ORB_GATE_FIXTURES=1`. A gate whose fixture must live at a `__g_` path therefore CANNOT be fixture-driven — mark it `UNFIXTURABLE` |
| conformance substrate | pure-AST ⇒ in-memory Project rooted at `/repo`; `fsBacked:true` ⇒ a real auto-cleaned temp dir |
| scoped runs | `scoped.ts` runs only `incremental-safe` gates over the changed set — hence the `scopeSafety` trap in §1 |

## 7. Size, style, and the house patterns

- **File header ≤5 lines** for gates (the sanctioned widening of Documentation-Law's ≤3). A gate's header IS
  its contract: what it enforces, the arms, and the DECLARED LIMITS. Load-bearing warnings may be verbose —
  the `own-tables-only` / `no-hover-display-swap` headers are the register.
- **`component-size` counts comment lines.** A gate file near the cap cannot absorb a doc-comment expansion;
  gate files are exempt from the client cap but the general lesson stands — prose is not free.
- **Single-arm dispatch: `Record`, not `switch`.** A `switch` over a single-arm union trips biome
  `noUnnecessaryConditions` on the unreachable `default`, which forces a suppression, which overflows the
  suppressions baseline. Use a mapped-type `Record<Kind, Handler>` — one entry today, tsc requires the entry
  for any future arm. (MULTI-arm snake_case unions invert this: a Record object literal trips
  `useNamingConvention`, so an annotated `switch` is correct there.)
- **No `biome-ignore` unless it is a genuine false positive**, with a cited reason, IMMEDIATELY above the
  flagged line. Suppressions are ratcheted tree-wide.
- **Never `biome check --write` / `format` / any fix-all** while working on gates.

## 8. Verification — a green conformance run proves NOTHING about the real tree

Run all of these before calling a gate done:

1. `pnpm exec tsx scripts/check/report.ts` — the live pass. READ the full output.
2. **Plant a REAL violation of the REAL shape** at a real path, watch it RED, remove it. Not a strawman: the
   machine proves the gate self-CONSISTENT, it cannot prove the examples are HONEST. A `mustFlag` that bites
   a toy while the real shape slips through is the failure mode.
3. `pnpm vitest run tests/tooling/check-gates.int.test.ts tests/tooling/gate-conformance.int.test.ts`.
4. `pnpm check:structure` — and re-read it after any allowlist edit (stale arms only fire at project scope).
5. Never git-revert-probe. Never `git stash` / `git checkout <path>` / `git restore`.

## 9. Renames, deletions, and refactors that KILL gates silently

Every one of these has happened.

| Change | What dies | Sweep |
| - | - | - |
| a file rename/move | gates dispatching on a hard-coded path constant; escaped-regex path spellings | grep gates for the old basename AND its `\/`-escaped form; live-probe each |
| a barrel/front-door split (`index.ts` → re-exports) | `getVariableDeclaration` lookups (a re-export is NOT a declaration) — three gates died at once, one security-relevant | re-point at the DECLARING module; re-prove the bite |
| a shape refactor (arrow body → discriminated union) | arms keyed on the OLD shape match nothing; dead-green for six stages | the gate edit belongs IN the refactor stage; rewrite the `mustFlag` fixture in the NEW shape or it proves nothing |
| a union/tuple widening | derived-type consumers (`Extract<>` collapsing to `never`); registry-keyed arms | `pnpm ast` the DERIVED-TYPE consumers, not just the tuple name |
| deleting the last importer of an export | "de-export to satisfy knip" is usually the WRONG HALF — an unused export beside a "ONE derivation" claim is evidence the other call site still re-spells the rule inline. Wire the re-speller through the export | de-export only when nothing ever claimed an external consumer |
| branding a re-export | every consumer using `typeof <thatExport>` as an "any X" stand-in breaks | sweep `typeof <Name>` repo-wide BEFORE branding; prefer the library's real type |

## 10. When NOT to write a gate

- **Never mirror an enabled native lint rule.** Biome/ESLint already own it; a mirror gate is pure maintenance.
  The GritQL layer is RETIRED — do not add a grit plugin, add a Layer-3 gate.
- **Never gate a shape that is still settling.** A gate OSSIFIES. Document it instead until the shape is law.
- **Prefer keying off a LIVE single source of truth** (a registry, a closed `as const` tuple, a schema
  export, the auth matrix) over a path list. The best gate makes a defect class UNREPRESENTABLE rather than
  catching one instance.
- **But DO ask for one.** Every audit/review must answer, per structural rule it lands on: already enforced,
  assumed-but-unenforced, or unenforceable — and what gate makes the whole CLASS unrepresentable? A finding
  fixed by hand REGRESSES.

## 11. Exemplars — read these before writing anything

| Read | For |
| - | - |
| `gates/own-tables-only.ts` | the maximal shape: a DERIVED ownership map (not hand-written), two arms of differing strictness, three exemption tables + four stale arms, a real-tree anchor guard, and mustPass rows that write down every declared limit |
| `gates/no-hover-display-swap.ts` | a per-TOKEN literal scanner, the UNFENCED-carrier decision with its measurement, an empty-but-armed allowlist, and mustFlag rows covering every spelling of the banned shape |
| `gates/monotonic-tests.ts` | the two-sided COMMENT marker: reason required, and a marker guarding no skip is itself a violation. One shared definition of "a skip" read by both teeth |
| `gates/diagnostic-legibility.ts` | reading the gate corpus itself from the shared project via `scanRoot`, and resolving a value one level through a same-file const |
| `gates/dangling-refs.ts` | `fsBacked`, the ordered string evaluator (`evalString`), and SELF-CONTAINED conformance examples (every doc a passing example cites is PLANTED in the same mini-project) |
| `gates/density-tier.ts` | a baseline ratchet: per-file budget, excess-only reporting, generator as single writer, stale-row arm |
| `gates/gate-modernization.ts` | the meta-gate — the machine half of this document |
