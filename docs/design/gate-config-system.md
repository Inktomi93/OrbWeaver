---
kind: design
status: superseded
updated: 2026-09-04
---

# Gate configuration — the dispatch fence

> SUPERSEDED 2026-09-05 by [gate-runtime-standardization.md](gate-runtime-standardization.md). Its measurements and rejected designs remain evidence; the owner has now ruled a fleet-wide standardized ts-morph runtime rather than a dispatch-only slice.

> PROPOSED (not built). Answers owner complaints #1 (`pnpm check` duration) and #2 (scope lives in 187 hand-written closures). It answers #2 for the walk half of the fleet and does NOT answer #1 — §1 states both limits before anything else. Supersedes nothing; the gate contract is `tooling/src/verify/contract/gate.ts` and the authoring law is `tooling/src/verify/gates/GATE-AUTHORING.md`, which stay the homes for everything this document does not move.

## 1. The two complaints, and where this does not help

| complaint | what this design does | where it does NOT help |
| - | - | - |
| #1 `pnpm check` is stupid long | Nothing measurable. Compiling 187 closures into resolved matchers saves \~44ms (\~0.03% of the stage); the program ADDS two gates and a 254-module descriptor load at static tier, so its net effect on duration is NEGATIVE by a few seconds. | Everything. 52-56% of gate time is the `run` phase, which no fence reaches (`lib/pass.ts` fires `begin`/`run`/`finalize` unconditionally). With gates entirely FREE, `pnpm check` still costs \~149s of \~314s. #1 is answered by the four measured code fixes in §7.4, which are independent of this design and larger than its whole lever. |
| #2 re-targeting gates at a tree means editing every gate | Makes breadth a named VALUE on the descriptor, makes its ABSENCE illegal for walk gates, and derives the "which gates reach tree X" answer instead of restating it. Collapses \~26 effective scopes written in 5 incompatible dialects to one \~16-member vocabulary. | The literal ask. `tooling/src/snap/cli.ts` is admitted by 94 gates: 61 are walk-less and a fence cannot govern them, 15 are half-governed, 18 are fence-controllable. Of those 18, four are genuine wins (they declare nothing today), one is tooling-specific by design, and eleven are complements that would all name `@authored` — so re-pointing them off tooling stays eleven descriptor edits, exactly today's count. |

**The honest promise:** the DISPATCH of 168 walk gates becomes a named value with one home; the 86 walk-less gates and the 53 `fsBacked` gates stay undeclared and unanswerable. Anything stronger requires handing unfenced hooks a filtered corpus, which is a reader-layer rewrite this design refuses (§6).

**Demand is one instance.** Across 300 commits touching `tooling/src/verify/gates/` since 2026-07-01, `scanRoot` lines were ADDED 218 times and REMOVED 28, and 21 of those 28 came from ONE commit — `a61b267bb`, the sanctioned-home sweep, an EXCLUSION migration solved by a shared lib module and the one class this grammar deliberately refuses to express. The scope corpus grows; it is almost never re-targeted. §8 gates the migration on the owner naming a second re-target.

## 2. The axis model

`scanRoot` multiplexes five roles. A config that models only breadth silently reinterprets the other four.

| axis | home | enforcer that REDs a violation |
| - | - | - |
| BREADTH — which project files may reach `visit`/`visitFile` | `fence: FenceExpr` on the descriptor | tsc (`FenceRef` is a derived literal union — a bad name in the DESCRIPTOR position already errors today, verified with a planted control) + `lib/loader.ts` `assertMeta` hard throw, the tier that actually fires since tsx runs type-stripped |
| ABSENCE of a breadth declaration | illegal for a walk gate | loader throw. `inRoot` reads `scanRoot === undefined` as admit-all, so 67 silences are today indistinguishable from 67 decisions |
| WALK PARTICIPATION — "I read no project file" | `fence: { of: "@none", why }`, legal ONLY on a walk-less gate | loader (a `@none` gate declaring `visit`/`visitFile` throws; it must call `ctx.scan`). RESTORED after v2 tried to delete it — see the ruling below |
| SCAN DENOMINATOR — the zero-scan alarm's input | the per-file tally, unchanged | `zeroScanGates` / `isBlindScan` at the `ops/structure.ts` entrypoint. The resolved fence MUST keep driving `run.scan.scanned` at the same site; a fence resolved statically at load and skipped per file deletes the only tripwire on a stale scope |
| SUBJECT / POPULATION — the set being judged | stays in CODE, unmoved | `ctx.scan({population})` + the entrypoint population alarms. `contract/gate.ts` bans the descriptor form in its own words: a stored flag beside the call that produces the number is two facts that can disagree |
| EXCLUSION INSIDE THE SCOPE — a sanctioned home | `lib/sanctioned-home.ts` (24 gate consumers), never the fence | mandatory `ExemptionRow.why` at the type level + `reportUnresolvedHomes`'s rename tripwire + `gate-modernization` arm B. `FenceExpr` has no path-literal subtraction, so the anti-pattern stays unspellable |
| SELF-PROOF REGISTER — matcher proof vs declared limit | `register: "scope-boundary"` on a `mustPass` row, with mandatory `why` | static arms A-C at `ops/structure.ts` (§7.1) for what descriptor data can decide, plus a conformance measurement arm for the rest |
| SUBSTRATE — project vs real disk | NOT claimed. `ext` is typed to what the harness can load; the disk corpus is declared UNGOVERNED | loader refusal on an unloadable `ext`. This is the axis four research lanes and two attack passes missed: `harnessGlobs` admits only `.ts`/`.tsx`, yet 154 live predicates return true for a `.css` path and 133 for `tokens.json` — clauses answering a question the dispatcher never asks |

### Rulings that reversed the prior draft

**`@none` is restored.** The prior draft made the fence a biconditional (required iff a walk hook, REFUSED otherwise) and deleted `@none` as redundant with the hook profile. Measured, that is a false-green machine: `runFilePhase`'s in-scope loop runs over ALL active gates, not walk gates, so deleting `scanRoot: () => false` moves those six gates from `scanned 0` to `scanned = candidates`, and `isBlindScan` — which requires `scanned === 0` — becomes structurally unreachable for them forever. Two of the six depend on that alarm IN WRITING: `biome-grant-liveness` ("The TOTAL-EMPTY case … derives zero units, so the harness's own SCANNED-ZERO alarm refuses the verdict (exit 2) without this gate guessing") and `over-art-plate-arm` ("admitting a TS file here would report a denominator this gate never read (the blind-gate false-clean shape)"). The occupants are `biome-grant-liveness`, `depcruise-grant-liveness`, `eslint-grant-liveness`, `over-art-plate-arm`, `runner-config-path-liveness`, `tsconfig-entry-liveness`. Keeping `@none` preserves the alarm's semantics exactly; the biconditional survives only as "a walk gate MUST declare a fence".

**The `caught-failure-ownership` ledger coupling is NOT severed.** An earlier pass proposed that `ops/gen/caught-failure-population.ts` stop reading the gate's scope and declare its own corpus. Refused: `tests/tooling/verify/gates/caught-failure-ownership.int.test.ts` asserts `expect(live).toEqual(unproven)` — a committed bijection between the gate's live findings and the census rows — and the generator's own header states the invariant a sever would break ("ONE producer … so the artifact and the gate can never disagree about what a site is"). The generator reads the declared `fence` exactly as it reads `scanRoot`. The real risk (a narrowing plus a regeneration goes green with a smaller census, because `ledgers:fresh` proves freshness, not monotonicity) is answered by a shrink arm on `census.totals` in the `_shared/ratchet-rows.ts` shape — a drop owes `why` + a resolving `cite` — which protects the census against EVERY door, the fence included.

**The narrowing detector is keyed on the resolved fence, not on admitted counts.** A per-gate `{gate, admitted, corpus}` census cannot ratchet (both sides derive from the same input, and `ledgers:fresh`'s printed remedy for any drift is "regenerate and commit") and reds on ordinary file churn. Instead commit `docs/reviews/gate-corpus/fence-resolution.json` = `{gate, fenceHash}`, where `fenceHash` is a stable hash of the RESOLVED fence expression. File churn cannot move it; a one-line vocabulary edit changes the hash of every gate naming that member, so the regeneration diff NAMES the \~35 gates the edit re-targeted. It is a blast-radius surface, not a ratchet, and this document does not claim otherwise.

## 3. The config shape

Types and the table in `tooling/src/verify/contract/scopes.ts` (\~120 lines; `contract/css-family.ts` is already a path vocabulary in that slot, and `tooling-size` caps `tooling/src` at 450 lines while carving only `verify/gates/`). The resolver is pure logic and goes in `lib/fence.ts` per the five-slot law.

```ts
export const FENCE_ROOTS = {
  "@client": ["packages/client/src/"],
  "@client/features": ["packages/client/src/features/"],
  "@client/state": ["packages/client/src/state/"],
  "@ui": ["packages/ui/src/"],
  "@server": ["packages/server/src/"],
  "@server/domain": ["packages/server/src/domain/"],
  "@server/infra": ["packages/server/src/infra/"],
  "@server/transport": ["packages/server/src/transport/"],
  "@db": ["packages/db/src/"],
  "@db/schema": ["packages/db/src/schema/"],
  "@contracts": ["packages/contracts/src/"],
  "@kit": ["packages/kit/src/"],
  "@tooling": ["tooling/src/"],
  "@gates": ["tooling/src/verify/gates/"],
  "@tests": ["tests/"],
  "@scripts": ["scripts/"],
} as const satisfies Readonly<Record<`@${string}`, readonly string[]>>;
export type FenceRoot = keyof typeof FENCE_ROOTS;

/** Composites take ROOTS ONLY — no set-of-set. Verified: typing the value side as
 *  `readonly (FenceRoot | \`@${string}\`)[]` makes the member constraint VACUOUS (the template
 *  pattern absorbs the union), so a typo, a non-existent member and a definition CYCLE all
 *  typecheck. Roots-only restores real name checking and makes a cycle unrepresentable. */
export const FENCE_SETS = {
  "@frontend": ["@client", "@ui"],
  "@backend": ["@server", "@db", "@contracts"],
  "@packages": ["@client", "@ui", "@server", "@db", "@contracts", "@kit"],
  "@authored": ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@tooling", "@tests", "@scripts"],
} as const satisfies Readonly<Record<`@${string}`, readonly FenceRoot[]>>;
export type FenceRef = FenceRoot | keyof typeof FENCE_SETS;

/** Extensions the harness can actually load. `harnessGlobs` admits `.ts`/`.tsx` ONLY, so a
 *  `css`/`md`/`json` member would mint a fence that governs nothing. `ext` matches the FINAL
 *  suffix as a partition — multi-dot conventions are `named` globs, never `ext` members. */
export type LoadableExt = "ts" | "tsx";

export type FenceExpr =
  | FenceRef
  | readonly [FenceRef, ...FenceRef[]]
  | {
      readonly in: readonly FenceRef[];
      /** ZONE subtraction, NAMED MEMBERS ONLY — never a path literal. */
      readonly not?: readonly FenceRef[];
      /** CONVENTION dialects a tree vocabulary cannot express: `**\/verbs\/**`, `*.ct.tsx`,
       *  `*-selection-store.ts`. The negative halves are required: 15 live predicates subtract a
       *  FILENAME convention (`.test.`, `.spec.`, `.test-d.`) with no tree component. */
      readonly under?: readonly string[];
      readonly named?: readonly string[];
      readonly notNamed?: readonly string[];
      readonly ext?: readonly LoadableExt[];
      readonly notExt?: readonly LoadableExt[];
      /** DIRECT children only — `state-files` depends on non-recursive matching. */
      readonly depth?: "flat";
    }
  /** `@all`/`@none` are the object form ONLY, so `why` is mandatory at the TYPE level — the
   *  argument `ExemptionRow.why` already makes. Loader additionally rejects an empty string. */
  | { readonly of: "@all" | "@none"; readonly why: string };
```

Descriptor delta — one renamed field, one row type:

```ts
- readonly scanRoot?: (repoRelPath: string) => boolean;
+ /** THE DISPATCH FENCE — which files of the shared TS/TSX project may reach this gate's
+  *  `visit`/`visitFile`. DELIBERATELY NOT NAMED `scope`: it does not govern what the gate READS.
+  *  `begin`/`run`/`finalize` fire unconditionally and 36 gates call `ctx.project.getSourceFiles()`
+  *  against 22 that reference `ctx.files`. REQUIRED on a walk gate; on a walk-less gate the only
+  *  legal value is `{ of: "@none", why }`, which keeps the zero-scan alarm reachable. */
+ readonly fence: FenceExpr;

  export interface GateExample { files; at?; expect?; why?; }
+ /** A `mustPass` proving a DECLARED LIMIT (GATE-AUTHORING §5) rather than a matcher decline.
+  *  A mustPass-only union member so TSC — not the loader — refuses it on a `mustFlag`:
+  *  `expect` is documented mustFlag-only and zero mustPass rows carry one today. */
+ export interface GateBoundaryExample extends GateExample {
+   readonly register: "scope-boundary";
+   readonly why: string;
+ }
- readonly mustPass: readonly GateExample[];
+ readonly mustPass: readonly (GateExample | GateBoundaryExample)[];
```

Call sites:

| today | after |
| - | - |
| `(p) => p.includes("packages/client/src/") \|\| p.includes("packages/ui/src/")` (8 gates, byte-identical) | `fence: "@frontend"` |
| `(p) => p.includes("packages/client/src/features/") && p.endsWith(".tsx")` (5 gates) | `fence: { in: ["@client/features"], ext: ["tsx"] }` |
| `scanRoot: () => false` (6 gates) | `fence: { of: "@none", why: "judges biome.json grant ROWS, not files; declares its own units via ctx.scan" }` |
| `(p) => !EXEMPT_TEST.test(p)` where `EXEMPT_TEST = /\.test\.tsx?$/u` | `fence: { in: ["@authored"], notNamed: ["*.test.ts", "*.test.tsx"] }` |
| `BUS_FILES.has(p)` (population, not breadth) | `fence: "@contracts"` — the `ReadonlySet` stays in the gate, untouched |

The report replaces the table nobody could keep fresh. It prints three columns and refuses a single number, because a single number is false for the 99 gates carrying a `run` hook:

```text
$ pnpm check:scope --tree tooling/src
  FENCED    the fence governs dispatch          18
  UNFENCED  selects its own corpus in run/begin  61   (36 via ctx.project.getSourceFiles())
  FS-BACKED reads real disk; no fence applies    15
```

## 4. Scope taxonomy, with counts

Hook profile over all 254 live descriptors: **77 fenced-only · 91 both · 86 unfenced-only · 0 neither**. 187 carry a `scanRoot`, 67 do not; of those 67, 59 are walk-less (a fence would govern nothing) and **8 are genuinely undeclared walkers** — `css-family-ownership`, `css-selector-has-a-writer`, `member-card-clamped`, `no-context-provider`, `no-forward-ref`, `no-legacy-react-api`, `no-raw-id`, `no-use-context`. With the 7 `() => true` gates that is **15 gates whose full-corpus reach is undeclared**, not the 67 an earlier pass claimed.

| class | n | destination |
| - | - | - |
| T-TREE pure package/dir breadth | 117 | `fence`, wholly |
| TC-TREECONV tree AND naming convention | 15 | `fence` via `under`/`named`/`ext` |
| H-HOMEOUT breadth minus a named home or foreign corpus | 15 | SPLITS: \~7 foreign-corpus become `not`/`notNamed`; \~8 sanctioned homes become `ExemptionTable` rows with the rename tripwire — a REWRITE, not a translation |
| N-NEG pure complement | 8 | `fence` only where the subtraction is a named member or a convention (§ below) |
| B0-NONE no breadth (`() => true`) | 7 | `{ of: "@all", why }` |
| A-ANCHOR breadth UNION a named subject file | 6 | breadth to `fence`; the anchor stays in code with `fileLoaded` |
| C-CONV convention-only | 6 | `fence` via `named`/`ext` |
| X-OPTOUT `() => false` | 6 | `{ of: "@none", why }` |
| SELF-FENCE the gate corpus excluded | 3 | `not: ["@gates"]` |
| SELF-SUBJ the gate corpus IS the subject | 2 | stays code |
| P-POP the predicate IS the population | 2 | stays code |

**Effective scopes: 26 distinct** across the 168 walk gates, with the top six covering 107 and only 9 singletons. The redundancy is measured, not asserted: 35 client-only gates carry 21 distinct predicate texts expressing 5 real scopes, and `UI_SRC = "packages/ui/src/"` is declared twice today (`lib/baseui-read.ts` and `lib/variant-axis-stamp.ts`). Dialects: 45 startsWith-only, 69 includes-only, 42 regex-only, 5 both, 26 opaque. `GATE-AUTHORING.md` claims "\~16 gates carry multi-clause predicates"; the real count is **68 of 187**, so its "unreviewable by inspection" warning is 4x more true than written.

**The negation class is 28 predicates and only 3 are named-member subtractions.** 15 subtract a FILENAME convention (`.test.`, `.spec.`, `.test-d.`) with no tree component — `not: ["@tests"]` would be WRONG for them, since several deliberately still scan `tests/**/*.ct.tsx`. That is why `notNamed`/`notExt` exist. 6 subtract a SINGLE FILE (`p !== HOOK_HOME`, `p !== SEAM_FILE`, `p !== MINT_HOME`, and `isSchemaFile`'s `!== SCHEMA_BARREL` across three gates); those are sanctioned homes and their conversion costs a new `ExemptionTable`, a stale arm and a §4.4a mode-(B) `mustFlag` per gate. **They are behaviour changes and must not be counted as config translation.** 2 subtract a mid-path segment. Net: \~150 predicates move wholly, \~21 split, \~10 stay entirely in code — down from the \~156 an earlier pass claimed, and the honest number is unknown until §7.2's diff runs.

**Anchors stay in code.** A §4.5 real-tree anchor is a run-VALIDITY predicate, deliberately outside the gate's own fence ("a gate must NOT anchor this sweep on a file inside its own home — the home dying would take the guard with it"). 75 gate files call `fileLoaded` with their own module constant, and a declared `anchors: string[]` beside that constant is the same two-facts-that-can-disagree shape this design rejects everywhere else. It also cannot express §4.5's non-file anchor forms (`existsSync` on a baseline, `"verify" in scripts`). The rename tripwire stays generalized over the existing constant in `sanctioned-home.ts`.

## 5. Suppression consolidation

**One item ships here; the rest is a separate program.**

Ships: nothing in the marker grammar changes, and `markerImmune` stays a boolean with its four named occupants and its written admission doctrine. Folding it into a `suppression: "none"` enum turns a doctrine into a default and the fifth occupant arrives by convenience.

**`gate-ignore-inventory`'s corpus fence is DELETED — one line, no config, route it today.** Its header claims `scripts/` is excluded "because NO gate's scanRoot admits it, so no gate can ever fire there". False: 82 of 254 descriptors admit `scripts/dev/engines.ts` (15 explicitly, including `suppressions.ts`'s `SCRIPT_SOURCE_RE`, plus 67 by silence), and the currently published run has three gates FIRING on a `scripts/` path. The suppressor consults only `findGateIgnore`, never a path, so an `@orb-gate-ignore` under `scripts/**` would be honoured and never audited — the #751 shape one directory over, latent (zero markers there today) and armed. `scanRoot === undefined` makes the auditor's corpus the whole project, which is EXACTLY the set where a marker can resolve. Cost: 34 more files on a 6-7s gate, zero new findings. Note the header has now carried a false reason TWICE in the same sentence; fix the prose in the same commit.

**The union derivation is dropped, not demoted.** An earlier pass called `gateIgnoreInventory.scope = unionOfEveryDeclaredScope()` "the strongest single argument for declarative scope anywhere in the packet". It is unsound: the marker-resolvable surface is the PROJECT, not any fence, and gates demonstrably report outside their own fence — `no-raw-clock`'s predicate excludes `tooling/` while its `finalize` reports at `tooling/src/verify/gates/no-raw-clock.ts` through `reportUnresolvedHomes`'s `gateSelf`, a shape 24 gates import. A union is a LOWER bound on the suppressible surface; "structurally incapable of drifting" was a differently-shaped hole with a reassuring name. It also collapses to `@all` the moment any of the 15 undeclared walkers declares one, which the migration expects.

Deferred to its own P2 row (real, measured, and answering neither complaint): unifying the 15 gate-owned marker vocabularies behind one `declareMarker({name, binding, window, position, language, polarity})` reader. Only 3 have a parser-backed mention fence, 5 have a line-opener-only fence that a template-literal line satisfies, 4 have none at all; `terse-ok` is a bare `/terse-ok/u` with no stale arm and zero live sites while `GATE-AUTHORING` §4.3 names it as a house-grammar exemplar; `allow-skip` has no reader anywhere while §4.4 cites it as an in-tree gold standard in a gate containing zero of them; `ASSUMES(single-replica)` is an unfenced file-wide attestation over \~28 live sites that a fixture string satisfies. Bundling it here changes \~150 live suppression sites on top of a descriptor migration — two blast radii in one commit.

**One constraint this migration owes the suppression surface anyway.** Every vocabulary-owning gate embeds marker text inside its own `files:` example strings. The class is dormant only because those examples are single-line escaped strings; normalizing them into readable backtick templates arms the line-opener bypass across five vocabularies at once, silently. Do not normalize example strings in this program. Separately, any fence NARROWING turns a correct `@orb-gate-ignore` into a STALE finding whose own diagnostic tells the author to DELETE the recorded reason — so a newly-stale marker is a fence regression until proven otherwise, and the `gateIgnoreUseCount` key set is captured before and after every migration batch.

## 6. Dropped, with reasons

| dropped | why |
| - | - |
| `budgetMs` per-gate cost ratchet | Cannot name an enforcer that survives the evidence, which AGENTS §2.3 makes disqualifying. Per-gate wall clock on this shared box has median CV \~42% and one gate measured 11,524 -> 36,199ms on the SAME tree; it would be the repo's first gate whose verdict depends on box load, inside a harness that REDs the tree for exactly that sin. Share-of-gateMs is \~5x more stable but REDs you when a SIBLING gets faster. The house already declined this once: the 2026-08-30 report asked for measurement AND a budget alarm; #1107 shipped `lib/timing.ts`'s measurement plus its untimed-run refusal and deliberately shipped no budget judgment. |
| per-gate `tier` | Deferral is a STAGE decision: `StageDef` carries one `argv` plus a per-Selection `scopedArgv` and `planStage` never sees a tier, so a per-gate field cannot change what `structure:full` runs at any tier. The sanctioned mechanism is a second `StageDef` row — already law (GATE-AUTHORING §2 coupled site #5) and already named as the fallback in `biome-grant-liveness`'s header. Also `tier: "push"` reads as "the gate is on" while the gate is off at the commit bar. NOTE the two rationales an earlier pass used are both wrong and must not be re-derived: `reconcile()` is entrypoint-local and `ops/scoped.ts` already runs a gate PARTITION with a named deferral notice; and `status`/`scopeSafety` do not occupy the axis (`status` has 0 dormant occupants; `scopeSafety` partitions only the `changed` tier). |
| `OVERRIDES [{includes, gates, why}]` | Biome's precedence is last-wins positional with no specificity and no diagnostic — probed both orders, appending a broad row after a narrow one silently revokes it at exit 0. And a row re-targeting N gates re-targets N SUBJECT CLAIMS without touching N sets of self-proofs. With the fence on the descriptor there is no precedence question to get wrong. |
| `suppression: "none" \| {binding}` | Binding is already determined by which `ctx.report` overload the gate calls; a declared binding beside the call is the "two facts that can disagree" ban `contract/gate.ts` states in the adjacent field. `"none"` is `markerImmune` renamed. |
| `category` / `level` | No consumer, therefore no enforcer. `level` is a censused abolition (2026-08-22 dimension a5, CLEAN), and the one level-like arm that exists has ZERO occupants (254 active / 0 dormant). `category` earns its place the day something dispatches on it. |
| central `GATES: Record<GateName, GateConfig>` | Unbuildable: the loader globs and `await import()`s at runtime and `GateDescriptor.name` is `string`, so no `GateName` union exists; manufacturing one needs either a static barrel (reversing the fail-closed auto-loader) or codegen (a new derived artifact owing its own freshness gate). It is also a FIFTH gate-name roster spelling, inheriting `enforcement-registry-parity`'s both-directions obligation — and this repo already retired exactly this table (`GATE_SCOPES`, whose author shipped a fail-OPEN fallback because he knew it would drift). |
| removing `ctx.project` from `GateRunCtx` | The shared lib layer keys per-pass caches on Project IDENTITY (`state.project === ctx.project`) and `sanctioned-home.ts` — the module the exclusion migration depends on — calls `ctx.project.getSourceFiles()` itself. It is a reader-layer rewrite, not a slice. |
| `gate-walk-discipline` (the whole gate) | Its arm A is an IDENTITY TRANSFORM at the tier that matters: `projectCtx` returns `files: project.getSourceFiles()`, so at project scope `ctx.files` and `ctx.project.getSourceFiles()` have identical membership. They differ only under `--changed`, where 28 of the \~36 callers are `scopeSafety: "whole-project"` and are already deferred wholesale. Measurable behaviour change: three gates in one tier, against a 36-gate bite audit. Route it separately if ever; do not spend it here. |
| the `visited === 0` dead-arm alarm | Measured unsound. 81 gates have `scanned > 0 && visited === 0` and exactly ONE has a walk hook. `markVisited` fires from `walkFile` only when a subscribed node is FOUND, so for a `visit` gate `visited === 0` means "no node of my kind exists" — the CLEAN state; and for a `visitFile` gate it is unconditional inside the in-scope branch, so `visited === scanned` always. The alarm would red a correctly-passing gate. The AXIS is real and unread — `visited` is recorded by the harness and judged by nobody — so it is published as the honest denominator in `check:scope` and given no verdict. |
| `isBlindScan` as the self-proof register key | Wrong in both directions: 38 rows are blind while their path IS in scope (the fsBacked substrate keeps non-TS files out of the project, so 60 blind rows have no TS file at all) and 51 are out of scope but NOT blind (the gate declared units). `lib/pass.ts` also says in its own words that it is judged ONLY at the real-tree entrypoint, never inside a run, because conformance mini-projects cannot be told apart. |
| the loader refusal keyed on hook family | An earlier pass banned the boundary label on any descriptor carrying `begin`/`run`/`finalize`, deadlocking 37 rows across 26 gates against a hook family §4.4a MANDATES. Measured, its premise is false: all 16 "both"-class rows return findings 0, `visited` 0, `scanned` 0, and 15 of 16 declare no units — nothing judged anything, and four of their own `why` strings name THE ANCHOR GUARD as the reason. |
| the `mustFlag` `&& !isBlindScan` conjunct | REDs 48 biting rows across 25 gates, every one a §4.4a mode-(B) stale proof or a §4.6 blindness tripwire — the shapes the law MANDATES — while adding zero detection, since zero `mustFlag` rows produce zero findings today. Legibility belongs in the failure `detail` string, where it fires only on rows already failing. |
| per-gate admitted-count census in `ledgers:fresh` | Cannot ratchet (derived on both sides; the printed remedy is "regenerate and commit") and reds on ordinary file churn: the live corpus moved 6,766 -> 6,797 in hours with ZERO commits. Replaced by the fence-hash ledger (§2). |
| `git ls-files` as the census corpus | 106 of 254 gates' git-derived admitted count disagrees with both the filesystem corpus and the run's own `scanned`. The fence is applied to a FILESYSTEM glob (§9). |
| `SCOPE_MEMBER_BUDGET` | Exceeded at birth by its own sketch, unit never defined, and the `BACKREF_BUDGET` precedent caps an irreducibly UNJUDGEABLE family while every fence member is judged by the liveness arms. A hand-edited ceiling is the hand-minted permanence #569 forbids. Consumer count per member is PRINTED as a review signal instead, never as a verdict. |
| `scope-vocabulary-liveness` arm D ("a narrowing removing zero findings is dead text") | Vacuous or inverted: on a near-green tree every narrowing removes zero findings, so it reds the whole vocabulary. The biome precedent inverts — a biome grant exists BECAUSE the diagnostic is present; a fence narrowing exists because the files are out of SUBJECT. Also unpriced at roughly a second full pass. Arms A-C survive. |
| on-tree shadow mode (`fence` optional beside `scanRoot`, migrated in batches) | A multi-commit dual-home state AGENTS §4 and Core-Tooling-Law §1 both ban. The equivalence diff runs OFF-TREE (§7.2). |
| stage overlap | Measured at -43.2s and OWNER-RULED 2026-08-31 not to pursue. Recorded so it is not re-proposed. |

## 7. Migration order

Each slice ships alone. A/B/C are strictly valuable if D is never built, and D is GATED on §8's first question.

### 7.1 Slice A — the self-proof register partition (no config, no vocabulary, no field)

The live defect: `checkArm` fetches the `GatePassResult` and then judges a `mustPass` by `findings.length === 0`, discarding the `scan` it already holds. **89 `mustPass` rows have every resolved path outside their own gate's `scanRoot`** — 42 on fenced-only gates (structurally vacuous: the matcher could be deleted and they pass), 16 on both-hook gates, 31 on walk-less gates. They are not a defect to delete: their own `why` strings are declared-limit prose ("out of scanRoot, passes", "the seam file itself is scanRoot-excluded", "only engine/ is blind"), and GATE-AUTHORING §5 sanctions exactly that register. A blanket "assert every example is in scope" would RED all of them.

Ship a PARTITION, in two tiers because the two halves are decidable by different means:

| arm | where | rule | today |
| - | - | - | - |
| A VACUOUS | `ops/structure.ts`, static | fenced-only gate + unlabelled `mustPass` + every resolved path outside the fence -> RED | 42 rows / 35 gates |
| B MISLABEL | `ops/structure.ts`, static | any fenced gate + `register: "scope-boundary"` + ANY resolved path inside the fence -> RED | 0 |
| C IMPOSSIBLE | `ops/structure.ts`, static | fenced-only gate + `mustFlag` + every resolved path outside the fence -> RED | 0 (lands green, stays armed) |
| D MEASURED | `ops/conformance.ts`, push | a `scope-boundary` row must measure `findings.length === 0 && scan.visited === 0 && (scan.declared?.scanned ?? 0) === 0` | validates the 47 rows static data cannot decide |

The static arms go at the entrypoint, NOT in conformance, because `verifyGateProofs` has no consumer under `tooling/src/verify/ops/**` and `tests:node` is `["changed","push","full"]` — the commit hook never runs it, which is exactly where a bulk fence edit lands. `structure:full` is a STATIC-tier stage and the entrypoint already holds every loaded descriptor and already drives exit 2.

Arm A's real domain is explicit-`at` and map rows only: `defaultPathFor` derives the default example path FROM the fence, so an implicit-path example is in-fence by construction.

Coupled sites: `contract/gate.ts` (the row type), `ops/conformance.ts` (export `defaultPathFor`/`exampleFiles` rather than re-spelling them; an ops->ops import inside one tool is dep-cruiser-legal), `ops/structure.ts`, and 58 rows read and classified BY HAND — a row that is an accident is RE-POINTED, never relabelled, or the partition launders a bug into a declaration.

### 7.2 Slice B — the three one-line honesty fixes (no config)

Delete `gate-ignore-inventory`'s `scanRoot` and fix its twice-false header (§5). Fix `GATE-AUTHORING.md`'s "\~16 multi-clause predicates" (real: 68 of 187) (its `monotonic-tests.ts` `allow-skip` citation is MOOT — that gate was deleted whole in #2217.) Fix `contract/stage.ts`'s dangling `GATE-AUTHORING §"no warn tier"` citation — that section does not exist; the ruling lives in the 2026-08-22 gate-stance census §A5. All four are the fix-tools-as-we-find-them-lying rule; none needs this design.

### 7.3 Slice C — the report and the off-tree diff

`pnpm check:scope` against the CURRENT closures — `loadGateCorpus` costs \~469ms and the three-column report is \~15 lines. It makes the owner's question answerable this week, cannot rot (it IS the gates), and its output is the input to the §8 decision.

Then the diff that gates everything downstream, OFF-TREE, no descriptor change and no commit: import the live descriptors and a candidate vocabulary, evaluate both over the real corpus, print the per-gate symmetric difference. Executing all 254 predicates against the 6,797-file corpus costs **142ms** — the reason this has never been run is not cost, it is that nobody looked at the corpus as an object. Until it runs, "a \~16-member vocabulary expresses the fleet without loss" is a hypothesis with two counterexamples already on the board (§4).

### 7.4 In parallel, unrelated to this design — the four measured code fixes

These are complaint #1 and together they are LARGER than this design's entire lever: `caught-failure-ownership`'s kind-less `getDescendants()` inside a `.some()` looking only for Return/Break/Continue (all node kinds that take the cheap parse-tree path); one shared gate-corpus index retiring the two `new Project(` sites in `dangling-refs` and `enforcement-registry-parity` (whose grandfather rows carry written, achievable end conditions, with the `fsBacked` constraint as the implementation note); `brand-in-name-position`'s double full-text split per file; `detached-work-traced`'s begin sweep. Do NOT land the kind-less-walk fix wholesale — two of the five such gates have MEASURED correctness reasons (`ct-no-oneshot-live-read-assert` loses 41 comment ranges in the PERMISSIVE direction under the cheap walk).

### 7.5 Slice D — the vocabulary, landed WHOLE

Only after §8 Q1 and the §7.3 diff. One commit: `contract/scopes.ts`, `lib/fence.ts`, the descriptor field, the loader arms, every gate's `fence`, `scanRoot` deleted. There is no incremental arm — the two fields cannot coexist without `pass.ts` reading two facts that can disagree.

Coupled sites for slice D, all five in-tool consumers plus the tier nobody listed:

| site | obligation |
| - | - |
| `lib/pass.ts` | dispatch + the per-file `scanned` tally. The resolved fence MUST keep incrementing it per file or the zero-scan alarm dies |
| `ops/conformance.ts` | `defaultPathFor` derives the default example path from the fence — ONE spelling post-migration |
| `ops/gen/caught-failure-population.ts` | reads the declared fence; regenerating `population.json` REDs `ledgers:fresh` on a shared tree, so this is its own single-gate step in an ISOLATED worktree |
| `ops/new-gate.ts` | THE SCAFFOLD emits `scanRoot:` and prints scanRoot doctrine in three places. Unchanged, every new gate is born non-conformant |
| `lib/render.ts` | names the field in the zero-scan diagnostic |
| `tests/tooling/**` | **31 `scanRoot` occurrences across 9 test files** construct or assert descriptors, and `tests:node` is invisible to `pnpm check` — a rename lands green at the commit bar and REDs at the push barrier. Name them in the verification floor |
| `Core-Enforcement-Active-Gates.md` | a row plus the `(N registered gates)` count line per new gate, or `enforcement-registry-parity` REDs |
| `_shared/ratchet-rows.ts` shape | the `census.totals` shrink arm for `caught-failure-ownership` |
| `ops/ledgers-fresh.ts` | the fence-hash ledger; note `ledgerFreshness`/`runLedgersFresh` are SYNC while `loadGateCorpus` is async — the whole chain and its re-export must become async |

Every migrating gate whose admitted set moves owes Core-Tooling-Law §3.2's four-step FENCE-or-EMBRACE protocol, mechanized by the §7.3 diff. That was cited once and never priced in the prior drafts.

### 7.6 Merges slice D retires

`@ui` retires BOTH `lib/baseui-read.ts`'s and `lib/variant-axis-stamp.ts`'s `UI_SRC` (two homes for one literal today). `@authored` retires `gates/suppressions.ts`'s `governedScope` SCOPE half while its `GovernedScope` discriminant stays. `isSchemaFile` is NOT a merge — it subtracts a single file and is a sanctioned-home rewrite (§4). An unstated merge is a doubling that ships.

## 8. Open questions

| question | stated default if the owner does not rule |
| - | - |
| Slice D at all? The fence reaches 18 of the 94 gates that touch `tooling/src`, and the repo's history shows ONE bulk re-target in two months — an exclusion sweep this grammar refuses to express. | **Do not build D.** Ship A/B/C, hand over `check:scope`, and require a NAMED second re-target the owner actually wants and cannot perform before touching \~190 descriptors. |
| Is `not`/`notNamed` over named members and literal conventions inside GATE-AUTHORING §3? | **Yes, allowed.** §3 bans subtracting a sanctioned HOME (which carries its exemption silently through a rename), not a zone. `no-raw-clock`'s own header does both correctly in one descriptor: homes are scanned and exempted with the tripwire, while the test/dev-tool ZONES "stay a scope decision in scanRoot, which is what they are". The alternative — forbid negation entirely — leaves \~23 gates with code predicates and shrinks D by that much. |
| Pull the `structure:full` tier split? A second `StageDef` row over a named partition is already law and already named as the fallback; the top-25 gates are \~74% of gate time and the push tier already costs \~2,801s. | **Do not pull it yet.** Land §7.4's four code fixes first and re-measure; the split's price is a second workspace load that has never been quantified. |
| Should the harness corpus include UNTRACKED files? Today it does (§9), and that is why the published run is red on a sibling lane's in-flight work. | **Leave it.** It is a harness-wide ruling, far larger than this design, and no census here depends on it once the fence-hash ledger replaces admitted counts. |
| `status: "dormant"` has zero occupants and no design says what a dormant gate's fence means — `runPass` filters dormant gates out, but the static arms would judge their example rows anyway. | **Loader requires a fence regardless of `status`;** the static arms judge every loaded descriptor. Untested vocabulary meeting a new static judge is worth one explicit sentence, not a new axis. |

## 9. Not verified

- **NO suite, gate, `structure:full` or `pnpm check` was run.** Every timing figure is read from committed artifacts, and the `latest` pointer moved THREE times during this exercise (gateMs 214,359 -> 155,310 -> 147,304 on the same tree, a \~1.5x spread). No absolute millisecond figure is stated as law here for that reason; ratios, phase shares and concentration survive, absolutes do not.
- **The equivalence diff has not been run by anyone.** \~150 fence declarations have never been written and their admitted sets never diffed against the closures. This is the design's weakest load-bearing claim and §7.3 exists to settle it.
- **The corpus is a FILESYSTEM glob, not the git tree** — `harnessGlobs` globs disk, so \~114 corpus files are UNTRACKED and \~22 tracked files in corpus paths are absent from disk. Self-generated proof: `gate-ignore-inventory` reports `skipped: 34, skipReasons {"out-of-scanRoot": 34}` while `git ls-files scripts` counts 32 TS files. Nothing in the harness reconciles the two spellings, and no prior pass in this exercise examined it.
- **The 89 register rows are classified by CLASS, not row by row.** Someone must read all of them before the labels are written.
- **The \~8 sanctioned-home conversions were not individually costed** — the foreign-corpus vs true-home split inside H-HOMEOUT is an estimate; the exact partition needs 9 gate headers read.
- **`ext` as a partition was designed, not probed.** No prototype resolver exists, so no fence expression in §3 has been executed against the corpus.
- Not re-derived here: the biome/dep-cruiser axis probes, the per-vocabulary suppression fence classifications, and the 8-slot CV computations. Those are cited to their lanes.
- Re-derived independently for this document: the hook profile and the 6 `() => false` occupants; `projectCtx`'s `files: project.getSourceFiles()`; `inRoot`'s admit-all on absence and the all-runs `scanned` increment; `isBlindScan`; `biome-grant-liveness`'s and `over-art-plate-arm`'s headers; 36/17/22/254 for `getSourceFiles`/`getSourceFile`/`ctx.files`/gates (ast-grep, `scannedFileCount` 254); the 300-commit scanRoot churn and `a61b267bb`; `caught-failure-population.ts`'s scanRoot read and its one-producer header; the `gate-ignore-inventory` skip count against 32 tracked `scripts/` files and zero markers there.
