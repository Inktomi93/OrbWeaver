---
kind: review
status: active
updated: 2026-08-30
---

# ts-morph in August 2026: no faster drop-in exists, and the 290s gate run is our code, not the library

Research lane `nate-research` (worktree `wt/nate-research` @ `7f574337a`), 2026-08-30. Read-only on the
tree. Web research via WebSearch plus raw-text fetches (trafilatura, `gh api`); every number below was
measured in this session on this worktree with the two scratch scripts described in §6.

## 0. The answer in five sentences

1. There is no faster equivalent of ts-morph to switch to. ts-morph 28.0.0 (2026-04-12, TypeScript 6.0)
   is the current release with zero code commits since; TypeScript 7.0 shipped in July with NO
   programmatic API, the new-and-different API is promised for 7.1 (roughly October 2026), and dsherret's
   `tsgo-wasm` branch (a fork of typescript-go compiled to Wasm; last commit 2026-08-26) is unreleased.
   The Rust parsers (`oxc-parser`, `@ast-grep/napi`, tree-sitter) hand back an AST with no type graph, and
   24 of our tooling files call `getType()`/`getSymbol()`.
2. Our posture (ts-morph on TypeScript 6.0.3, `ts7` for the type floor) is exactly the side-by-side setup
   Microsoft's 7.0 announcement prescribes; nothing to change there.
3. `structure:full` costs 290s of a ~470s `pnpm check` (every other stage is under 35s). A per-gate
   profile of the real `runPass` reproduces it at 292.6s and shows the shared single-pass walk plus all
   130 `visit` gates cost 16s combined; gate-private `run`/`visitFile`/`begin` code costs 276s.
4. Five idioms account for it, and the worst single one (`lib/bus-coverage.ts`, shared by five gates, 115s,
   39% of the stage) is a quadratic re-walk that indexes nothing.
5. The two cheapest wins are a per-file declaration index in that one lib (about 110s) and a harness-level
   memo plus raw-node helper for `getDescendantsOfKind` (the token-kind form costs 18s and 4GB per sweep
   where a raw `ts.forEachChild` costs 0.3s). Together they plausibly put the stage under 90s with no
   library change.

## 1. The landscape (web research, primary sources)

| Fact | Receipt |
| - | - |
| ts-morph latest = 28.0.0, 2026-04-12: "feat(BREAKING): TypeScript 6.0", `printStructure`, one fix. Prior: 27.0.2 (2025-10), 27.0.0 (2025-09, `perf: switch to tinyglobby`, TS 5.9). | `gh api repos/dsherret/ts-morph/releases`; CHANGELOG.md head |
| Commits on `main` since 28.0.0: one docs commit (2026-08-21). No perf work landed. | `gh api repos/dsherret/ts-morph/commits?since=2026-04-12` |
| Issue #1621 "ts-morph and Go based native tsc": open, 13 comments, last 2026-07-30. dsherret 2026-07-26: "significant progress ... PR in the coming weeks"; 2026-07-28: "It requires a fork of typescript, and I'm going to start shifting things over to go ... To start, it will just be Wasm to prioritize portability, but I'll look into native builds in the future". | `gh api .../issues/1621/comments` |
| Branch `tsgo-wasm` exists (dirs `tsgo-wasm/`, `submodules/`, `rfcs/`), last commit 2026-08-26 "deps: point the typescript-go submodule at the migrate-tsmain port"; late-July commits are perf/docs on the Go-to-JS boundary ("chattiness is the biggest lever left, not execution speed"). Not published. | `gh api repos/dsherret/ts-morph/branches/tsgo-wasm`, `.../commits?sha=tsgo-wasm` |
| TypeScript 7.0 announcement: "it does not ship with an API. We expect TypeScript 7.1 to ship with a new (and different) API ... we have made it a priority to ensure TypeScript can be run side-by-side with TypeScript 6.0 for utilities that still need some programmatic access to the compiler". Official alias: `npm install -D typescript@npm:@typescript/typescript6`. | devblogs.microsoft.com/typescript/announcing-typescript-7-0/ (raw text, §"Running Side-by-Side with TypeScript 6.0") |
| typescript-go's `_packages/` today contains only `native-preview`; no JS API package is published. Latest tag `typescript/v7.0.2` (2026-07-08). | `gh api repos/microsoft/typescript-go/contents/_packages`, `.../releases` |
| Microsoft on ts-morph specifically: "it is explicitly an anti-goal to prevent ts-morph from working altogether. Type information is effectively the reason why we need to have an API at all". | typescript-go discussion #455, quoted in #1621 |
| `@ts-morph/bootstrap`: the same Project/file-system plumbing but returns raw `ts.SourceFile`/`ts.Program`; no wrapper layer. | packages/bootstrap/readme.md |
| `oxc-parser`: fastest conformant TS parser; JS API returns TS-ESTree; `experimentalRawTransfer: true` (Node ≥ 22) removes the JSON serde cost that made it lose to `typescript`'s own parser in the ast-grep benchmark. No binder, no checker. Known Windows issue: the raw-transfer buffer is ~6GiB per parse (oxc #23759, knip #1813). | oxc PR #9516, issue #23759; H. Darkholme "Benchmark TypeScript Parsers" (raw text) |
| `@ast-grep/napi` 0.45.x: tree-sitter based, returns a tree handle (no serde), `parseAsync` uses the libuv pool. No types. | ast-grep.github.io/guide/api-usage/performance-tip.html |
| `tsz` (Rust checker), `tsgo-wasm` (sxzz, TS 7 Wasm build): checkers/binaries, not AST APIs for tooling. | tsz.dev; npm `tsgo-wasm` |
| ts-morph's own performance page is about MANIPULATION (structures, batching, forget blocks, analyze-then-manipulate). The one analysis-relevant primitive it documents is `.compilerNode` plus `createWrappedNode` for navigating raw compiler nodes. | ts-morph.com/manipulation/performance, ts-morph.com/navigation/compiler-nodes |

Consequence: the only library-level path to a faster ts-morph is dsherret's Wasm port, and it is a
fork-of-typescript work in progress. Everything below is about how WE use the current library.

## 2. Where the time actually goes (measured)

Environment: node v26.5.0, ts-morph 28.0.0, `@ts-morph/common` 0.29.0, typescript 6.0.3, heap floor 16GB.
Corpus = `harnessGlobs` (`tooling/src/_shared/ts-workspace.ts:29`): 6,212 files, 50.4MB of source (the
five largest are 285KB/254KB/200KB/196KB/178KB test files).

### 2.1 The stage in the last real check (main, 2026-08-30 17:22)

`reports/verify.json`: `structure:full` 290,050ms; next largest `lint:eslint` 33,953ms, `ledgers:fresh`
33,048ms, `docs:catalog` 20,872ms, `lint:biome` 17,934ms. `reports/check-structure.json` carries no
timing at all (keys: `run`, `gates[].{name,ok,scan,violations}`, `toolErrors`, `scanAlarms`, `total`, `ok`).

### 2.2 Baselines (scratch profiler, §6)

| Step | Time | Heap |
| - | - | - |
| `getWorkspace({root})` load + parse, 6,212 files | 4.9s | 1.08GB |
| RAW `ts.forEachChild` recursive walk, all 4,683,319 compiler nodes | **0.28s** | +0 |
| ts-morph `sf.forEachDescendant` over the same nodes, cold wrap cache | **6.7s** | +0.85GB |
| same, warm (every node already wrapped) | 2.6s | |

The wrapper tax is 24× cold / 9× warm per full walk. That is the price of `Node` objects being created
and cached per compiler node (`compilerFactory.getNodeFromCompilerNode`, `ts-morph.js` ≈ line 20k; each
`forEachChild` in `Node` snapshots and wraps every child, `ts-morph.js` ≈ line 3358).

### 2.3 The real `runPass`, every hook timed

Total **292.6s** (reproduces the stage). Heap peak 6.35GB.

| Phase | Sum |
| - | - |
| shared walk + dispatch remainder (all of `pass.ts`'s own work) | 5.6s |
| `visit` (130 gates on the single pass) | 10.2s |
| `visitFile` (35 gates) | 57.4s |
| `run` (76 gates) | 199.0s |
| `begin` | 20.0s |
| `finalize` | 0.4s |

Top gates (ms; `v`=visit, `vf`=visitFile, `run`, `begin` derived as total minus the rest):

| gate | total | shape |
| - | - | - |
| bus-coverage | 61,671 | run |
| user-bus-coverage | 21,824 | run |
| contract-verb-presence | 17,487 | run |
| automation-bus-coverage | 15,411 | run |
| freeze-provenance-write-pairing | 15,189 | begin ≈14,268 + v 920 |
| suppressions | 12,961 | run |
| caught-failure-ownership | 12,491 | vf |
| knob-wire-coverage | 12,265 | run |
| no-test-fabrication | 11,243 | vf |
| brand-in-name-position | 9,017 | vf |
| domain-events-coverage | 8,360 | run |
| dangling-refs | 7,815 | run |
| rpg-bus-coverage | 7,216 | run |
| audit-client-tests | 6,966 | run |
| detached-work-traced | 6,347 | begin ≈5,522 + vf 825 |
| gate-ignore-inventory | 6,189 | vf |
| ct-no-oneshot-live-read-assert | 5,185 | vf |
| density-tier | 4,073 | vf |
| context-definition-shape | 3,859 | vf |
| test-presence-client | 3,535 | run |

Top 10 = 66% of hook time. The five `*-bus-coverage`/`domain-events-coverage` gates that share
`lib/bus-coverage.ts` sum to **114.5s = 39% of the stage**. For contrast, the heaviest `visit`-only gate
(`testid-liveness`, 1,056,242 dispatches) costs 717ms; `member-card-clamped` sees 1,690,195 nodes for
472ms. The single-pass design is doing its job; the cost is in code that opted out of it.

### 2.4 Idiom micro-benchmark (fresh Project per arm, whole corpus)

| Idiom | Time | Heap delta |
| - | - | - |
| A `sf.getDescendantsOfKind(SyntaxKind.CallExpression)` (a NODE kind), 359,215 hits | 2.55s cold / 1.35s warm | +0.3GB |
| B `sf.getDescendantsOfKind(SyntaxKind.Identifier)` (a TOKEN kind), 1,565,284 hits | **18.2s cold / 5.7s warm** | **+4.2GB** |
| C `sf.forEachDescendant` + `getKind()===Identifier` filter | 8.6s | +0.9GB |
| D raw `ts.forEachChild` + `kind===Identifier` filter on `sf.compilerNode` | **0.34s** | +0 |
| E first `getType()` (builds the `ts.Program` + binder for 6,212 files) + 939 calls | 6.1s | +1.9GB |
| E2 next 790 `getType()` calls, Program warm | 0.19s (0.24ms/call) | |
| F `types:false` arm: 296 `@orb/*` named imports, `getSymbol().getAliasedSymbol().getDeclarations()` | 296 resolved cross-file, 0 unresolved | |

Why B is a cliff: `ts-morph.js:5799` `useParseTreeSearchForKind` routes only kinds in
`[FirstNode=167, FirstJSDocNode=310)` through the cheap `forEachChild` iterator; `Identifier` is 80,
`StringLiteral` 11, every token kind < 167. Those go through `ExtendedParser.getCompilerChildren`, which
materializes the full token-level child arrays (SyntaxLists, punctuation) for every node on the path and
caches them in a WeakMap; that is the 4.2GB. `getDescendants()` (no kind) takes the same path.

F matters because it retires a worry: the pure-AST harness Project resolves workspace imports through the
pnpm links, so gates calling `getSymbol()` in the `types:false` arm are not silently blind cross-file.

## 3. The five idioms that cost the 290s (receipts)

### 3.1 Whole-corpus re-sweeps in `run()`/`begin()` (57 gates)

`rg -l 'ctx\.files|project\.getSourceFiles\(\)' tooling/src/verify/gates` = 57 files. Each such gate does
its own `for (sf of project.getSourceFiles()) sf.getDescendantsOfKind(k)` sweep: 1.35–2.5s per node
kind, 5.7–18s per token kind (§2.4). Examples: `bus-coverage.ts:49` → `lib/bus-coverage.ts:273`
(`emittedDiscriminators` over all files, per bus, five buses); `freeze-provenance-write-pairing.ts:566-571`
(`deriveAliases` + `deriveBuilders` over all files in `begin`, five kinds each at `:427,:438,:454,:460`
plus `getFullText` at `:491`); `detached-work-traced.ts:571-572` (`deriveRootSpanOpeners` over all
files); `dangling-refs.ts:559-561` (a second full `forEachDescendant` over the whole project);
`audit-client-tests.ts:260-265`; `contract-verb-presence.ts:183,:226,:232`.

### 3.2 Token-kind `getDescendantsOfKind` and `getDescendants()` (73 sites)

`getDescendantsOfKind(SyntaxKind.Identifier)` 33 sites, `StringLiteral` 9, `NoSubstitutionTemplateLiteral`
6, `TemplateHead/Middle/Tail` 3; `getDescendants()` 22 sites. Worst offenders by profile:
`knob-wire-coverage.ts:116-117` and `:269` (two whole-corpus Identifier sweeps ≈ the gate's 12.3s),
`:229,:272` (StringLiteral); `suppressions.ts:270` (`getDescendants()` per file, by design because it
needs token carriers, 13s); `no-test-fabrication.ts:100` (`getDescendants()` per file, 11.2s);
`context-definition-shape.ts:227-231` (five token-kind sweeps per file); `density-tier.ts:149`;
`caught-failure-ownership.ts:182,:751,:872,:1337`.

### 3.3 Quadratic per-candidate re-walks

`lib/bus-coverage.ts`: `callDiscriminators` (`:258`) iterates every `CallExpression` in scope; for each
call whose callee is a bare identifier, `canonicalEmitterName` (`:225-234`) tries EVERY emitter name (7 for
`CHAT_BUS_EVENT_TYPES`, `:52`) and each try enters `isCanonicalEmitterExpression` →
`isCanonicalVariableBinding` (`:107-108`), which re-runs `sf.getDescendantsOfKind(VariableDeclaration)` over
the WHOLE file; `objectExpressions` (`:180-188`) does the same per identifier argument. Cost per file is
calls × emitters × file nodes; `domain/chat/verbs/turn.ts` is 144KB. Same shape in
`contract-verb-presence.ts:166-167` (`getDescendantsOfKind(VariableDeclaration).find(...)` per candidate)
and `:183/:226` (a per-domain filter over all files inside a loop over domains).

### 3.4 Type queries on every node of a kind

`knob-wire-coverage.ts:180-186`: `for sf of all files: for pa of getDescendantsOfKind(PropertyAccessExpression): pa.getExpression().getType()`.
Warm `getType()` is 0.24ms (§2.4 E2) but the corpus has hundreds of thousands of property accesses. The
Program build itself (6s once) is not the cost; the per-node fan-out is.

### 3.5 Text-level re-derivation per file

`sf.getFullText()` + regex/split in 22 gates, `readFileSync` in 21 gates. `brand-in-name-position.ts:216`
and `:261` split the full text TWICE per file; `detached-work-traced.ts:507,:526` re-split per site;
`gate-ignore-inventory.ts` (6.2s) and `lib/gate-ignore.ts` re-derive marker tables per file. Each split of a
285KB file is cheap alone; done per gate per file per call it adds up to the `visitFile` 57s.

## 4. What to do, ranked by expected win over blast radius

**A. Index once in `lib/bus-coverage.ts`** (one file, five gates, ≈110s). Build per `SourceFile` one
`{ varsByName: Map<string, VariableDeclaration>, importsByLocal: Map<string, {module, imported}> }` on
first touch (WeakMap keyed on the `SourceFile`), and have `isCanonicalVariableBinding`,
`isCanonicalImportBinding` and `objectExpressions` read the index. The recursion/`seen` logic stays. Expected
residual: one `CallExpression` sweep per bus over the server scope, ≈2s each. This is the whole stage's
biggest lever and it has a unit test surface already (`tests/tooling/verify/lib/…`, and the five gates'
mustFlag/mustPass examples).

**B. Memoize `getDescendantsOfKind` per `(SourceFile, kind)` for the life of a pass** (harness lib,
touches no gate). Files are immutable during `runPass` (no gate manipulates), so a WeakMap\<SourceFile,
Map\<SyntaxKind, Node\[]>> behind ONE helper in `lib/ast-read.ts` (`descendantsOfKind(sf, kind)`) turns the
229 call sites' repeated sweeps into at most one per (file, kind). Migrating call sites is mechanical
(`sf.getDescendantsOfKind(k)` → `descendantsOfKind(sf, k)`), and a gate (`no-raw-descendants-of-kind` in
the gates corpus, scanRoot = `tooling/src/verify/**`) keeps it that way. Reset the cache in `runPass` (the
conformance suite runs many passes over synthetic projects).

**C. A raw-node helper for token kinds** (harness lib + the 73 sites of §3.2). `identifiersOf(sf)` /
`tokensOfKind(sf, kind)` walking `sf.compilerNode` with `ts.forEachChild` and returning
`{ text, pos, kind }` records (or wrapping only the hits via `sf.getDescendantAtPos(start)` when a Node
is genuinely needed). 18.2s → 0.34s and −4.2GB per sweep. `pass.ts` already accepts a `Finding` literal
(file/line/column), so a gate can report from a raw record without a wrapped Node. ts-morph documents
`.compilerNode` as the sanctioned door (ts-morph.com/navigation/compiler-nodes); the warning there is about
manipulation, which the gate run never does.

**D. Put timing in the artifact so this cannot go dark again** (`pass.ts` + `contract/pass.ts` +
`render.ts`, ≈40 lines). The profiler's wrapper is exactly `guard()` with `process.hrtime.bigint()` around
`fn()`; record `ms` per gate per phase into `GatePassResult`, print the top-N in the render tail, and add a
budget alarm next to `zeroScanGates` (a gate over, say, 5s prints ⚠ with its phase). Ratchet the total.

**E. Do not spend time on:** `skipLoadingLibFiles`/`skipFileDependencyResolution`/`useInMemoryFileSystem`
(load is 4.9s of 292); worker-thread parallelism of the walk (the walk is 5.6s); swapping the parser for
oxc/ast-grep (parse ≈ the 4.9s load, and the gates need the binder/checker); ts-morph's manipulation tips
(structures, batching, forget blocks: we don't manipulate in the gate run); waiting for TypeScript 7.1's API
(it will be "different", and ts-morph on it is dsherret's fork work, unreleased).

**F. Watch list:** ts-morph #1621 and the `tsgo-wasm` branch; TypeScript 7.1 (API). When the workspace
moves `tsc` to 7.x, the tooling package keeps `typescript@npm:@typescript/typescript6` (the official
alias) so ts-morph 28 keeps resolving; that is the same side-by-side we already run with `ts7`.

Estimate, labelled as such: A (−110s) + B/C on the named §3.2/§3.3 sites (knob-wire 12→≈1, suppressions
13→≈3, no-test-fabrication 11→≈3, freeze-provenance 15→≈3, contract-verb-presence 17→≈4,
brand-in-name-position 9→≈2, dangling-refs 8→≈3, detached-work-traced 6→≈1, caught-failure-ownership
12→≈6) lands the stage in the 60–90s band. D is what proves it.

## 5. The other two consumers (not measured; same bootstrap)

`pnpm ast` and the codemod kit ride the same `getWorkspace` (`tooling/src/ast/lib/emit.ts:178-186`,
`tooling/src/codemod/lib/project.ts:48`), so the 4.9s load figure is theirs too. The `types:true` arm adds
root-tsconfig resolution and the typed verbs use the language service (`refs`/`findReferences`), which is the
one ts-morph path with a known super-linear cost class (issue #642); that is a separate measurement this
lane did not take. The codemod path is manipulation-shaped and is the one place ts-morph's own performance
page applies (analyze-then-manipulate, batch adds, `forgetNodesCreatedInBlock`).

## 6. Method and reproducibility

Two untracked scratch scripts were run from the worktree and then removed; copies live in the session
scratchpad (`…/scratchpad/tsm/__tsm-profile.ts`, `__tsm-micro.ts`, logs `profile1.log`, `micro1.log`).

- `__tsm-profile.ts`: loads `getWorkspace({root})`, times the raw and wrapped walks, then calls the REAL
  `loadGateCorpus` + `runPass` with every descriptor's `begin/visit/visitFile/run/finalize` wrapped in an
  `hrtime` accumulator, and prints the per-gate/per-phase table. Run: `node --max-old-space-size=16384
  scripts/__tsm-profile.ts` (the `root` constant is pinned to the worktree).
- `__tsm-micro.ts`: arms A–F of §2.4, each on a fresh Project.

Negative claims and their counts: "no ts-morph code commit since 28.0.0" = `gh api` commit list (4 rows,
3 of them the release day); "no JS API package in typescript-go" = `_packages/` listing (1 entry);
`ctx.checker()` is called by 0 gate files (`rg -l`, 233-file corpus) while `getType()/getSymbol()` appear in
24 files (`rg` per-file counts in §2 of the session log).

Web sources read in full (raw text): ts-morph performance + setup + compiler-nodes pages; TypeScript 7.0
announcement; the ast-grep author's parser benchmark; ts-morph #1621 (all 13 comments), CHANGELOG,
releases, `tsgo-wasm` branch listing and commits; `@ts-morph/bootstrap` readme; oxc PR #9516 and issue
\#23759 via search summaries; typescript-go `_packages` and releases.
