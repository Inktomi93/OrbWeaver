---
kind: law
status: active
updated: 2026-09-06
---

# `@orb/tooling` — tooling-tree law

> The detail home for the tooling tree. `Core-0-Architecture-and-Structure.md` §9 is the summary and the entry point; this doc owns the roster, the plumbing floor, the per-gate contracts, the coupled-site census, and the move playbook. Gate authoring: `../../../tooling/src/verify/gates/GATE-AUTHORING.md`. Live gate catalog: `Core-Enforcement-Active-Gates.md`. The research zone's roster: `../../../scripts/README.md`.

## 1. Standing rulings (owner — do not relitigate)

- **ONE package**, never per-tool packages. No `bin` entries — pnpm root scripts are the front door; script NAMES are the stable surface, their path VALUES are free.
- **`scripts/` survives** as the explicitly-throwaway research zone (§2.7).
- **Tools sit ABOVE the cake.** `@orb/tooling` may import any app package; nothing in `packages/**` may ever import tooling. Enforcers: resolver physics (no package declares the dep) + the `packages-no-tooling` cruiser belt (§4.6).
- **Pure shared definitions migrate DOWN** — string/regex engines to `kit`, browser-only shared engines to `@orb/ui`.
- **No shims, no compat layers.** A move is a clean cut; a re-export stub left "for now" is the banned half-migration.

## 2. Architecture

### 2.1 The tree

```
tooling/
├── package.json          @orb/tooling · private · type module
├── tsconfig.json         extends ../tsconfig.base.json (§2.3)
└── src/
    ├── _shared/          the ONE plumbing floor (§2.4) — sorted first by design
    └── <tool>/           five-slot template (§2.5), one dir per tool (§2.6)
```

`tooling/` is a ROOT tree beside `packages/`, not inside it: every `packages/*` glob in the repo keeps meaning "the cake" unchanged, and "above the cake" is legible from the path alone. `pnpm-workspace.yaml` carries it as a second workspace entry.

### 2.2 package.json

- `name: "@orb/tooling"`, `private: true`, `type: "module"`, `engines: { node: ">=26" }`.
- **Deps grow with consumption.** knip's `dependencies: "error"` REDs a declared dep nothing imports, so the manifest never pre-declares a surface. The end state is {kit, contracts, db, server, ui} and NOT client.
- **exports**: per-directory front-door map (`"./*": "./src/*/index.ts"`) plus `"./_shared/*": "./src/_shared/*.ts"`. Deliberately NO `"."` root export and NO `_shared` barrel — an aggregate index chain-loads playwright/ts-morph for any single import. `_shared` is consumed per-MODULE (`@orb/tooling/_shared/browser`), which is how a research script reaches the plumbing floor.
- **imports**: `{ "#*": "./src/*/index.ts" }` — the house intra-package subpath map; a tool reaches a sibling as `#<tool>` (front door only, §4.2).
- No per-package `typecheck` script: root `pnpm typecheck` is `pnpm -r exec node scripts/ts7.cjs …`, which sweeps any workspace member with its own tsconfig.
- Root `package.json` `devDependencies` carries `"@orb/tooling": "workspace:*"` so `tests/tooling/**` can import the programmatic APIs under pnpm isolation.

### 2.3 tsconfig.json

Extends `../tsconfig.base.json` with `types: ["node"]` (tools are node-context). The base's `include` assumes depth-2 packages; tooling is depth-1, so it OVERRIDES `include` entirely (`["src", "../reset.d.ts", "../platform.d.ts"]`). `exclude` mirrors the repo's `__g_` fixture excludes. Module stays inherited `nodenext` — node runs tooling source directly, so node-strict resolution is the honest checker.

**Consequence: there is no DOM lib.** A `page.evaluate` body must be a raw STRING, never a typed function form (§9.1-6).

### 2.4 `_shared/` — the ONE plumbing floor

The constitution bans `_shared` drawers in `packages/` (`Core-0-Architecture-and-Structure.md` §1 principle 3); this one is the tooling tree's owner-approved exception. It is not a services drawer — it is the pinned plumbing floor tools compose, flat modules only (a subdir is a hidden drawer, gate-RED), and it reaches UP to no tool. The enforcer that it stays the ONLY home: `tooling-shared-plumbing` (§4.4).

| module | contract |
| - | - |
| `browser.ts` | the one Playwright bootstrap; the only legal `chromium.launch` site; also carries the test-only, protocol-level CDP fault injector (`ORB_PROBE_TEST_CDP_FAULT=<Domain.method>[@<nth>]`, VITEST-only, #1093) that every launched/attached context installs |
| `ts-workspace.ts` | the one ts-morph loader (`getWorkspace`/`harnessGlobs`/`searchGlobs`/`collectByKinds`); the only legal `new Project(` site |
| `artifacts.ts` | `reports/<kind>/` artifact filing (`artifactFile`/`artifactKey`) + the RESULT-line convention (`print`/`printResult`) + the RUN-SLOT layout that makes concurrent runs safe (`runId`/`checkoutName`/`openRunSlot`/`runFile`/`publishRunSlot`/`abandonedRuns`, #1029 — the layout's one home is `UNIFIED-VERIFICATION-DESIGN.md` §3.3b) |
| `argv.ts` | flag-parsing idioms (`splitFirstEq`/`splitLastEq`/`parseViewport`/`splitPageSuffix`/`parseGotoTarget`) |
| `appearance.ts` | the settings shim + the curated preset library (its data file lives beside it) |
| `theme.ts` | the theme arm of the settings shim |
| `nav.ts` | the app-nav verbs (`--goto`/`--open-chat`/…) |
| `pixel-backdrop.ts` | framebuffer backdrop sampling |
| `ffmpeg.ts` | the ffmpeg shell door |
| `wcag.ts` | the WCAG contrast kernel (`relativeLuminance`/`contrastRatio`/`isLargeText` + the ratio floors) |
| `schema-read.ts` | the ts-morph drizzle-schema reader — cross-zone shared plumbing |
| `run-tool.ts` | `runTool`/`UsageError` — the exit-honesty runner every `cli.ts` enters through: crash ≠ verdict (uncaught/unhandled → hard `EXIT.toolError` with sync stderr), pipe-drain (verdicts set `process.exitCode`, never `process.exit`), never-downgrade (clean→any, violations→toolError only), `UsageError` → `EXIT.misuse` |
| `proc.ts` | the ONE `node:child_process` door — `spawnNiced`/`runNicedSync`/`execNicedSync` all ride `nice -n 19` (the box co-hosts other services); `spawnNicedChild` is the detached long-lived door (own process group + `killGroup`); `spawnFullPrioritySync` is the loud un-niced exception, legal only for a census'd `FULL_PRIORITY_CALLERS` row. Its doors pin `stdio: ["ignore","pipe","pipe"]` and fold captured stderr into the thrown message — `execFileSync` FORWARDS a child's stderr even while capturing it |
| `load-budget.ts` | THE ONE READING OF THE BOX — `budget()` (wall clocks stretched by the box's per-core contention, capped), `judgeMeasurementLoad`/`annotateRateLoad` (a RATE measured under load is LABELLED `load-suspect`, never promoted), the load-kill classifiers. Its planted-reading seam is `ORB_BOX_LOAD` |
| `concurrency-profile.ts` | the typed door onto `tooling/concurrency-profile.json` (#1835) — the ONE home for every worker/slot cap in the fleet (`vitestMaxWorkers`/`ctWorkers`/`ts7Checkers`/`pnpmWorkspaceConcurrency`/`eslintConcurrency`/`hookPoolSlots`/`hookTs7Checkers`/`ctRunnersHostWide`/`sessionCpuQuotaPct`/`sessionMemoryHigh`/`wholeVerifyQueue`), switched `shared`\|`dedicated` by the SHELL env `ORB_DEDICATED_BOX` (never the repo `.env`). **The data is JSON, not TypeScript, because bash — `.claude/hooks/{biome-check,cpu-fence}.sh` via jq — and CommonJS (`scripts/{ts7,typecheck,eslint}.cjs`) read the same numbers with no build step.** load-budget's opposite half: that one stretches a clock because the box is busy, this one starts fewer workers because the box is SHARED |
| `log.ts` | `warn` — the stderr channel; stdout is reserved for payload (RESULT lines) |
| `exit-contract.ts` | `EXIT = { clean: 0, violations: 1, toolError: 2, misuse: 3 } as const` — the house exit contract |
| `instruments.ts` | the `INSTRUMENT_TOOLS` registry (§4.5) |
| `devtools-assets.ts` | exact-tuple/hash/license validation + the manifest-closed loopback asset server |
| `devtools-runtime.ts` | ephemeral debugging profile/endpoint + official DevTools SDK cascade bridge and cleanup |
| `debugging-endpoint.ts` | the ephemeral Chromium debugging ENDPOINT — the persistent-profile launch args + the ONE reader of `DevToolsActivePort`; a stateful snap session, the cascade runtime and a sibling attach all share it (#1231) |

**A module joins this floor by IMPORTER CENSUS, never by classification.** "Tool-specific" is a hypothesis; `rg --files-with-matches '<module>' scripts/ tooling/ tests/` is the verdict. Genuinely tool-specific plumbing stays in its tool (`snap/ops/fixture.ts`, the snap stage set).

Every depth-derived root constant is RE-DERIVED at its move, never carried (§9.1-4).

### 2.5 The five-slot tool template

```
tooling/src/<tool>/
├── cli.ts        argv parse + dispatch ONLY (cap 200 lines — §4.3)
├── index.ts      programmatic API — tests import THIS; cli.ts consumes it
├── contract/     result shapes, config schemas, typed exit data
├── ops/          one file per command family / capability
└── lib/          tool-internal pure helpers
```

Navigation is mechanical, mirroring the domain template: what does it do → `index.ts` exports; where is command X → `ops/<x>.ts`; what shape does it emit → `contract/`; pure logic → `lib/`. Non-TS data files live inside `ops/` or `lib/` beside their consumer — the tool ROOT admits only the five slots (§4.1). **Every pnpm script points at the tool's `cli.ts` (+ subcommand)**; a script pointing into `ops/` would bypass the one argv parse. Bash-fronted tools carry their `.sh` entrypoints at the tool root under a typed exemption row; the node half a `.sh` execs is an `ops/*-entry.ts`, never a second `cli.ts` (and it still enters through `runTool`).

`verify/gates/` is the ONE sanctioned SIXTH slot: an fs-discovered descriptor corpus is neither a command family nor tool-internal helpers. It is cap-exempt (§4.3).

### 2.6 Tool roster

Every row is reached by the pnpm script name in the last column, never by path.

**A TOOL DIR IS NOT A COMMAND (#1315, owner ruling 2026-09-04).** `ui-audit/`, `motion-audit/` and
`cpu-profile/` are ENGINES: Snap is the only rendered front door, they are entered through their own
`index.ts`, and they own NO `cli.ts` at all — gate `tooling-slot-template` arm B recognises an ENGINE DIR
(an `index.ts`-only tool dir that some module under `snap/` imports through that index, derived from Snap's
own import specifiers, never a row) and asks it for no argv door (owner ask 2026-09-06). The three-line
`cli.ts` refusal stubs that arm B used to force are deleted with that clause. The product is unlaunched, so a retired command is GREP-FIXED at its call sites
rather than kept alive behind a redirect that must be maintained, tested and retired a second time; that
is why `screen-record/` (which was nothing BUT a redirect) is gone from this roster entirely, along with
the `design-audit` / `record` / `perf-meter` / `motion-audit` pnpm scripts.

| tooling/src/ | owns | pnpm scripts |
| - | - | - |
| `bug-reports/` | the READER for the dev bug button's gitignored captures (list + show) — the artifacts have no tree presence, so the script name IS their discoverability | `bug:reports` |
| `snap/` | the sole rendered-instrument CLI — and since #1315 the sole rendered-instrument ARGV DOOR: capture + evidence, labelled transition filmstrips, motion/perf/CPU/boot/React analyzers, the deterministic design/a11y scan, scenarios, sessions, and the isolated stage | `snap` |
| `ui-audit/` | the design/a11y walker + its rule families — the ENGINE behind Snap's `--design-audit` arm (#1315); it has no program and no `cli.ts` (an engine dir, entered through `index.ts` — §4.1) | (none — `snap --design-audit`) |
| `render-trace/` | render/tail/fire — three ops behind one dispatcher | `trace:render` `trace:tail` `trace:fire` |
| `wire-tap/` | the server-wire incident toolkit (sse · captures · trpc) | `sse-tap` |
| `ast/` | the structural-search + rot-lens engine | `ast` · `check:respell/swallowed/typeonly/columns/regkeys/chains` |
| `codemod/` | the ts-morph codemod kit | `codemod` |
| `verify/` | the whole verification system + the gate corpus + `GATE-AUTHORING.md` | `check` `verify` `check:structure` `check:show` `gate:new` `prose:baseline` `check:tests-membership` `check:tests-execution-membership` `check:db-baseline` `check:orphan-ratchet` |
| `workboard/` | GitHub Project 1 lifecycle | `work:item` |
| `doc-catalog/` | the doc catalog + the markdown formatter (two verbs) | `doc-catalog:*` `check:docs` `format:docs` `check:doc-catalog` |
| `agent-sync/` | Codex agent-manifest sync | `agents:sync` `check:agents` |
| `seed/` | demo · chat · multi-user seeding (three verbs) | `seed:demo` |
| `stack/` | the dev stack + engine launchers (bash-fronted) | `stack` `engines*` |
| `model-ab/` | model A/B harness | (none) |

**Root-shim survivors** — launcher shims, neither research nor tooling, and they stay at `scripts/`: `scripts/ts7.cjs` (the TS7 wrapper every `types:graph` spelling names) and `scripts/worktree-bootstrap.sh`.

**Revisioned DevTools runtime asset root.** `tooling/src/snap/lib/devtools-frontend/` is Snap's one
sanctioned non-TS runtime asset home. It is generated by `pnpm snap:devtools-assets` from the exact
`pin.json` compatibility tuple; no file below it is hand-edited. `manifest.json` closes every served
resource by URL/path/byte length/SHA-256/MIME/license family, `licenses.json` closes the revision-pinned
root/third-party notice inventory, and `licenses/` carries those exact notices. Normal Snap/CT runs are
offline: `_shared/devtools-assets.ts` revalidates the complete closure (including absence of extras and
symlinks) before serving only manifest members on an ephemeral IPv4 loopback listener. Updating
Playwright/Chromium/DevTools is one generated-tuple change and owes the planted cascade matrix.

### 2.7 `scripts/` — the research zone

Explicitly throwaway probes, one-shot lenses, launcher shims, operator scripts. KISS/YAGNI apply there and only there. It MAY import `@orb/tooling` — the one-way glass is against `packages/**`, never against the research zone. It keeps its blanket biome relaxations and knip entry globs.

**The roster and its retention rationale live in `../../../scripts/README.md`** — one home. A research script that becomes load-bearing for verification is PROMOTED into `tooling/src/<tool>/` under the template, original deleted, never a compat stub.

**Open owner fork (no Project row yet):** the flag-for-delete list in `scripts/README.md` — four one-shot lenses with zero invocations in any visible window. Git preserves them; the ruling is whether they stay.

### 2.8 In-app sensors do NOT move

`packages/client/src/lib/{motion-stats,motion-flaggers,motion-dead-class-flagger,long-task-tracer,agent-bridge}` are client code. Their correctness contract is the instrument-proof CT suite, not a promotion. Two one-definition merges are LAW here:

- **The dead-class tokenizer is `@orb/kit/dead-css`.** The definition of "dead" (the escaped-class-token regex + the marker namespaces that legitimately ship no rule) is ONE kit module; the live `[css]` flagger calls it and `snap --dead-css` serializes its regex sources + marker tables into the `page.evaluate` string. Only the DOM halves stay local — a live MutationObserver vs a one-shot census — because that is the half the consumers genuinely differ on.
- **ONE LoAF observer.** `motion-stats.ts` installs the app's only `long-animation-frame` PerformanceObserver and publishes each entry through `subscribeLongAnimationFrames`; every other channel SUBSCRIBES, never observes.

Two merges are REFUSED with receipts — do not re-propose without new evidence:

- **accname engine → `@orb/ui`: refused.** There is no accname engine in `@orb/ui` to sit beside; `UI-Primitives-and-Reuse.md` §13.10 is the authority and its mechanical half (`tests/support/ct/accessible-names.ts`) carries the OPPOSITE ruling — a hand-rolled in-page name computation is banned, which is why it reads Playwright's `ariaSnapshot()`. The two tooling sites are not one engine either (snap resolves a NAME for a selector; ui-audit emits raw ATTRIBUTES and never computes what the name IS). If the two tool-side resolvers are ever merged, `tooling/src/_shared/` is the home `tooling-shared-plumbing` already guards.
  **THE TWO TOOL-SIDE RESOLVERS WERE MERGED (#1324, 2026-09-04) — and the refusal above is unchanged.**
  The ruling survives; its INPUT changed. What the merge folded is not an accname ENGINE but a
  COMPARISON KEY that both sites already computed and both computed wrong the same way: snap's surface
  map and the walker's door census each read `aria-label` BEFORE `aria-labelledby`, the reverse of accname
  1.2 (2B precedes 2C). A planted pair produced a false `duplicate-action-door` and hid a real one. The
  key is now spelled once, in spec order, in the walker's `ops/walker/accessible-name.ts` segment and
  composed by both consumers through `ui-audit/index.ts`. No WCAG name is COMPUTED for a verdict — the
  `aria-name` rule still tests PRESENCE (`RULE-AUTHORING.md` row 8) — and `pnpm snap … --aria`
  (Playwright's `ariaSnapshot`) remains the only spec-correct name source in the fleet and the oracle the
  merged key is proven against.
- **trpc/bus devlog merge: refused.** `trpc-devlog.ts` is a tRPC op formatter with key redaction that SHIPS (loggerLink calls it in prod for errors); `bus-devlog.ts` is an IS\_DEV-gated subscription ring. They share only the house console `%c` palette, which is deliberately identical across every dev channel. Merging drags a dev-only ring into the prod bundle.

## 3. Coupled sites of a tooling change

### 3.1 The inventory

A tool move, rename, or new tool touches these. Each row is a place a path or a scope is spelled.

| surface | what changes |
| - | - |
| root `package.json` scripts | the tool's rows repoint; script NAMES never change |
| root `package.json` depcruise scripts | all five must cruise `packages tooling`, or the tooling stanzas are unfireable |
| `tsconfig.json` (graph) | `include` carries `"tooling"`; the `scripts` include survives (the research zone is still typechecked) |
| `vitest.config.ts` `SERIAL_INT` | rows follow their files as tests relocate into the mirror (§4.7) |
| `.dependency-cruiser.cjs` | the tooling stanzas (§4.6) |
| `knip.ts` | the `tooling` workspace entry (`entry: ["src/*/cli.ts","src/_shared/index.ts","src/*/index.ts"]`). **A knip workspace boundary is a coupled site**: `scripts/**` is entry-globbed wholesale and was never analysed for unused exports, so anything moving into `tooling/` enters real analysis at once — an fs-discovered corpus needs its OWN entry row or every descriptor reads as dead |
| `biome.json` | path-named rows repoint at their tool's move. Born-compliant is the default: each relaxation is re-justified against the moved file, never blanket-copied from `scripts/` |
| `tests/tooling/**` path literals | swept per move — but the `runCli` fixture (§5.1) kills the class going forward: tests name TOOLS, not paths |
| `tooling/src/verify/lib/selection.ts` | the graph-tree classifier and `depcruisePaths` must both admit `tooling/` |
| `_shared/ts-workspace.ts` `harnessGlobs` | the shared walk's scope — §3.2 governs any widening |
| doc-catalog receipts | evidence targets citing a moved path RED at `pnpm check:doc-catalog`. Sweep `/usr/bin/grep -rn '"target": "…"' docs/catalog/receipts/` and RE-DERIVE each hit row (never re-prefix) |
| law-doc + `.claude/` cites | `pnpm check:docs` + `dangling-refs` are the fences. Lanes never edit `.claude/` — flag those for the orchestrator |
| `docs/test-baseline/manifest.json` | a RELOCATED test file is a manifest deletion: old path STAYS in `testFiles`, a `deletions` row states the relocation, the new home joins `testFiles`. Hand-edit the rows; never run the whole-tree regenerator on a shared tree |
| `tests/**/*.ct.tsx` importers | CT tsx is typechecked ONLY by per-package `pnpm typecheck`. A moved file with test-side importers leaves a red the graph program structurally cannot see — run per-package client tsc whenever anything test-side imported it |
| comment/prose cites of the moved BASENAME | live code + `status: active` docs are updated; dated reviews and `history/` are frozen evidence and are never rewritten |
| a ZONE-KEYED FENCE | a predicate that fenced the zone a file used to live in (`startsWith("scripts/")`) is a path literal too. After any cross-ZONE move, grep the gate corpus for the OLD ZONE PREFIX, not only for old file paths — these fail SILENTLY and in both directions (a fence starts reporting the corpus's own documentation, or stops scanning it at all) |
| a spawner naming an ops FILE | an ops file stops being independently runnable; its spawners must name a VERB through the one cli door |
| `pnpm-lock.yaml` | the workspace add + each dep addition re-resolve it |

**Verified NOT coupled** (premise narrowings — do not re-derive): `package-layout` scans `packages/{kit,contracts,client,db,ui}` only; Stryker's sandbox patch discovers workspace symlinks generically by realpath, so its configs need zero edits and `tooling/` must NOT be added to `ignorePatterns`; the tool-guard keys on PNPM SCRIPT NAMES and git-tracked-ness, not path patterns; eslint never covered `scripts/` and does not cover `tooling/`; `jscpd.json` is product-code-only.

### 3.2 The `harnessGlobs` widening protocol

`harnessGlobs` includes `tooling/src/**/*.ts`, so the shared ts-morph walk carries tool code. **Every change that GROWS the population under it re-runs this protocol** — a gate whose `scanRoot` is a NEGATED predicate (not-in-tests shapes) silently starts judging code it was never designed for.

1. Capture every gate's `scanned N/M` denominator BEFORE (`reports/check-structure.json` → `gates[].scan`).
2. Land the growth; re-run; DIFF the per-gate scanned counts.
3. **Every gate whose count grew gets an explicit recorded decision in the same commit: FENCE its scanRoot, or deliberately EMBRACE the new tree.** Each embrace is its own reviewed line. There is no third option and no deferral.
4. Plant one positive control inside the new population and one in `packages/`, and prove both still bite — the widening must not have broken dispatch.

Worked precedents for step 3: `no-raw-clock` was FENCED with a `mustPass` row (tools MEASURE real time; the injected-clock law governs app determinism). `no-inline-union-redecl` was EMBRACED by converting the inline unions to `as const` tuples. `nullable-column-inequality` was FENCED because a tool issues no drizzle predicate, so its markers there are prose about the grammar. `diagnostic-legibility`'s pointer vocabulary was WIDENED, because a message navigating a reader to `tooling/src/verify/gates/` read as a dead end. `tooling-shared-plumbing` arm A was CENSUSED rather than exempted — each non-workspace ts-morph Project is a cited `PROJECT_SITES` row with a two-sided stale sweep.

## 4. Enforcement

Six tooling gates, three cruiser stanzas, two extensions of existing gates. Each follows `GATE-AUTHORING.md` in full. **Live violations found at any landing are FIXED in that lane** — no debt baselines are minted for tooling.

### 4.1 `tooling-slot-template`

fsBacked, whole-project, comment-SAFE (fs shape, reads no file text); scan unit is the `tooling/src/` tree.

REDs: a top-level entry that is a loose file rather than a dir; a tool dir missing `cli.ts` or `index.ts`; a tool-root entry outside `{cli.ts, index.ts, contract/, ops/, lib/}`; a subdir inside `_shared/`. `_shared/` is exempt from the tool SHAPE (flat modules). **An ENGINE DIR owes no `cli.ts`**: a tool dir with `index.ts` that some module under `tooling/src/snap/` imports through `<tool>/index.ts` (ui-audit, motion-audit, cpu-profile — Snap is the sole rendered front door, #1315). The set is DERIVED from Snap's relative import specifiers on every run, never declared: an engine nothing under Snap imports any more reverts to owing its argv door by itself, and the positive control is a `mustFlag` row (owner ask 2026-09-06).

Two typed exemption tables, both two-sided: `BASH_FRONTED_TOOLS` (a `.sh`-entrypoint tool needs no `cli.ts`) — a row naming a dead dir OR a dir that grew a `cli.ts` is RED; `CORPUS_SLOTS` (the `verify/gates/` sixth slot) — a row naming a dead dir or a tool that lost its extra slot is RED.

### 4.2 `tooling-front-door`

incremental-safe, `kinds: [ImportDeclaration]`, comment-SAFE; `scanRoot: (p) => p.startsWith("tooling/src/")`.

REDs: an import in `tooling/src/<a>/**` whose specifier resolves into sibling `<b>`'s internals — anything other than `#<b>` / `../<b>/index.ts`; a `cli.ts` importing anything but its own tool's `index.ts` (+ `_shared`); a relative escape out of `tooling/`. `_shared` is a legal target per-module.

Typed `ROOT_CONFIG_IMPORTS` rows admit a tool importing a repo-root CONFIG whose data would otherwise be respelled (one-home config reads), with a two-sided stale sweep.

**Two layers on purpose, not two homes.** This gate is the LANE-SPEED arm (a scoped `check:structure` sees a changed file) and matches specifier SHAPE; the §4.6 cruiser stanzas are the whole-graph resolved-edge backstop — the same split as `domain-sibling-front-door`.

### 4.3 `tooling-size`

incremental-safe, `visitFile` line count, comments-INTENDED (it counts comment lines, like `component-size`); `scanRoot: tooling/src/`.

REDs: any file >450 lines; any `cli.ts` >200. Declared carve with its own `mustPass` row: `tooling/src/verify/gates/**` is cap-EXEMPT — a gate file is a contract-headed single-purpose module, and splitting one is worse than a long one.

**This gate is ORDERING, not a ratchet.** It exists before a monolith can move, which is what forces decomposition at the move instead of after it.

### 4.4 `tooling-shared-plumbing`

incremental-safe, `kinds: [CallExpression, NewExpression, ImportDeclaration]` + a `visitFile` arm, comment-SAFE (node kinds + `ast-read` value reads, never a text regex); `scanRoot: tooling/src/`, scan-and-allowlist over the homes.

One arm per capability: **(A)** `new Project(` outside `_shared/ts-workspace.ts` · **(B)** a playwright `.launch(` outside `_shared/browser.ts` · **(C)** an artifact-dir respell (a `reports`/`reports/…` literal fed to `join`/`resolve`/`mkdir`) outside `_shared/artifacts.ts` · **(D)** a bare `process.exit(` outside `_shared/run-tool.ts` (it drops the stdout pipe AND dodges the exit-honesty runner) · **(E)** a tool `cli.ts` that does not import AND call `runTool` · **(F)** a `node:child_process` import outside `_shared/proc.ts` · **(F2)** a call to any member of the full-priority DOOR SET outside the `FULL_PRIORITY_CALLERS` census.

**(G)** a tool that FILES an artifact (a call to `artifactDir`/`artifactFile` anywhere under `tooling/src/<tool>/`) whose `cli.ts` never opens a run slot (`withInstrumentRun`) — an unslotted instrument writes into the shared `reports/<kind>/`, where a concurrent run of the same instrument destroys its artifacts (#1164; the layout's one home is `UNIFIED-VERIFICATION-DESIGN.md` §3.3b). Cross-file, and adjudicated BEFORE the anchor guard so a conformance mini-project is judged too.

**(H)** a playwright ATTACH — `<engine>.connectOverCDP(` or `<engine>.connect(` — outside `_shared/browser.ts` (`attachProbeSession` is the one door onto a stateful session daemon's browser, `docs/design/1208-instrument-substrate.md` §3.4; a raw attach elsewhere is a second `ProbeSession` shape and a shim-leak). Matched as the attach SET on arm B's engine receivers; puppeteer's `connect` (the Lighthouse engine's own page seam, phase 3) is a declared limit with its own `mustPass` row. Test-owned attaches under `tests/**` are outside the gate's `tooling/src/` scan by derivation.

**Arm F2 matches a door SET, never one callee name** — a second detached full-priority door added later would otherwise be an unguarded loophole.

The homes and the census rows are SCANNED and carried as cited allowlist rows with two-sided stale sweeps — scanRoot-exclusion is NOT the mechanism (scan-and-allowlist beats it, per `GATE-AUTHORING.md` §4), so a moved home or a row whose file stopped spawning goes RED.

### 4.5 `tooling-instrument-proof`

fsBacked, whole-project. Keys off a LIVE registry, not a path list: `_shared/instruments.ts` exports `INSTRUMENT_TOOLS` (an `as const` tuple) — the tools whose output is a VERDICT about the app, where a blind zero reads as a pass. The gate reads the tuple through `ast-read.ts` unwrapping (the `as const satisfies` ts-morph blindness is a known trap) and REDs an empty derivation as its blindness tripwire. An EMPTY registry is legal-armed; a missing or unreadable one is not.

**Two proof classes, one of EACH per member**, with one finding per class so a missing absence proof can never hide behind a present defect proof:

| marker | answers |
| - | - |
| `// @instrument-proof: <what is planted and what must red>` | does it BITE? — the test constructs the defect class the instrument exists to catch and asserts it REDs |
| `// @instrument-absence-proof: <what apparatus/population is removed and what must NOT read clean>` | when it could NOT measure, does it SAY so? — the blind-zero-renders-as-clean class |

Three arms per class: a member with no marker-carrying test in its `tests/tooling/<tool>/` mirror; a marker in a NON-member's tree (two-sided vocabulary — an unregistered "proof" is either a lie or a missing registry row); a malformed marker (the reason is REQUIRED). Plus the rename tripwire: a member naming a tool dir that does not exist.

A registry member joins in the SAME commit its tool dir lands. An incident instrument (`wire-tap`) satisfies the gate uniformly rather than through a second tier: its CI proof plants a LOOPBACK fixture server and asserts the tap reports exactly the planted frames — **a committed proof never depends on the dev stack**; a live connect smoke is a landing RECEIPT, not a test.

### 4.9 `tooling-argv-front-door`

incremental-safe by node shape but declared `whole-project` (its stale + blindness arms are cross-file); `kinds: [PropertyAccessExpression, ElementAccessExpression]`, comment-SAFE (node kinds only, so a header explaining the argv layout is not a read); `scanRoot: tooling/src/`, scan-and-allowlist over the entries.

**The law it pins.** The OPERATOR'S ARGV enters a tooling program at exactly ONE place and flows DOWN as a `readonly string[]` parameter. `process.argv` may be read only in:

- a tool's `cli.ts` — the five-slot argv front door (§2.5), matched by SHAPE (`tooling/src/<tool>/cli.ts`) rather than by a path list, so a cli.ts that moves reds at its new path instead of carrying its exemption along;
- a censused `ARGV_ENTRIES` row — the node half a `.sh` execs, which has no `cli.ts` by §2.5 (`stack/ops/{prod-entry,dev-identity-entry,engines,engines-ctl}.ts`), plus `_shared/entrypoint.ts`, whose subject is `argv[1]` — the ENTRY IDENTITY ("was this module the program?") — and never the operator's flags.

Everything else — `ops/`, `lib/`, `contract/`, and every `ops/parse.ts` — takes argv as a PARAMETER. **A library reading the global argv is the defect class:** its behaviour depends on how the PROCESS was started, so no caller and no test can drive it, it silently re-admits flags the front door already refused, and two callers of the same helper get different answers. The mint census (2026-08-31, #971) found exactly four: `codemod/lib/diagnostics.ts` (the `--max-output-lines=N` spill knob), `codemod/lib/example.ts` (`getFlag`'s default parameter), `codemod/lib/run.ts` (`runCodemod`'s own `--apply`/`--dry-run` decision) and `stack/ops/prod.ts`, which reached past its own entry to re-find the `--` forwarding separator in the GLOBAL frame.

**Threading argv in is a REQUIRED field, not an optional one.** `RunCodemodOptions.argv` is required precisely because the omission's failure mode is silent: `resolveIsDryRun([])` returns "dry run", so a forgotten argv would swallow an operator's `--apply` and report a clean preview. A required field makes it a tsc error instead.

Arms: **(A)** the read outside a sanctioned home, both spellings (an element-access-blind matcher would be the loophole); **(B)** the two-sided `ARGV_ENTRIES` stale sweep — a `seen` set populated only by a live match, so a row whose file merely stopped reading argv and a row whose file is GONE collapse to one check (§4.4a); **(C)** the §4.6 blindness tripwire — zero `cli.ts` readers on a real-tree run means the matcher stopped recognising the shape, and every arm above is vacuously green. Arms B and C are anchored on `_shared/exit-contract.ts` via `fileLoaded`, never on `scope.kind`.

**DECLARED LIMIT (its own `mustPass` row): this gate pins WHERE argv is read, never HOW STRICTLY each tool's grammar parses it.** The 27-reader census behind #971 classified each CLI's real grammar — strict-ordered (`snap`), positional/subcommand (`ast`/`verify`/`workboard`/`doc-catalog`/`seed`/`wire-tap`/`render-trace`), flag-bag, and `--`-forwarding (`stack`) — and closed the lenient ones by hand. `ui-audit`'s strict-ordered parser was the second rendered grammar and is GONE with its CLI (#1315): the scan rides snap's, so there is one rendered-argv reader left rather than two byte-stable ones. The engine dirs' `cli.ts` files parse nothing at all. There is deliberately NO generic `parseArgv(spec)`: flattening the remaining grammars into one would change every tool's contract, and each existing contract stays byte-stable.

### 4.6 dep-cruiser stanzas

Require the cruise-scope widening (`depcruise packages tooling`) or the stanzas are unfireable by construction.

1. `packages-no-tooling` — `from: ^packages/`, `to: ^tooling/`, error. The deep-relative-escape backstop over the resolver physics (the `ui-cake` posture).
2. `tooling-internal-direction` — `ops/` may import `{lib,contract,_shared}` + its own tool's modules; nothing imports a sibling tool's `ops|lib|contract` directly. **Type-only is NOT exempt** for the cross-tool arm — the front-door law is a SHAPE rule (the domain-sibling precedent).
3. `tooling-cli-via-index` — a `cli.ts` reaches its own tool only through `./index.ts`.
4. `tooling-shared-floor` — `_shared/` reaches UP to no tool (the `foundation-reaches-up-to-nothing` mirror).
5. `tooling-no-provider-families` — the provider FAMILIES (`infra/providers/backends/<x>`, where the credential firewall lives) and the contract internals stay sealed against tooling; the vLLM engine's shared spawn-spec/wake-budget builders do not, because the fleet launcher and the in-server supervisor must not drift.

Coupled: `tests/tooling/dependency-cruiser.int.test.ts` carries a `__dc` pin per stanza (a planted violation cruises red). **A stanza without its pin is an inert rule** — the derived anti-drift case has nothing to fire it.

### 4.7 `test-layout` — the tooling mirror

When a test path is `tests/tooling/<dir>/…` AND `tooling/src/<dir>/` exists, the mirror rule applies: `tests/tooling/<tool>/<path>.<kind>` must prefix-swap to `tooling/src/<tool>/<path>.ts` (file or dir-index), with the existing `.suite.*` exemptions. Flat files directly under `tests/tooling/` and dirs matching no `tooling/src/` dir stay exempt — they test root configs, the guard, and research-zone scripts.

Endgame residents of the flat tier: `tool-guard.int.test.ts` (subject is `.claude/hooks/*.mjs`), `issue-form-guidance-integrity.test.ts` (subject is `.github/`), `dependency-cruiser.int.test.ts` (subject is the root config), `smoke.test.ts`.

### 4.8 `test-fixture-imports` — the tool-fixtures door

Within `tests/tooling/**`, importing `test`/`it`/`expect` from `support/fixtures` is RED with its own message: the tooling door is `support/tool-fixtures`.

**Why this is load-bearing and not ceremony:** the RESULT snapshot serializer registers via tool-fixtures (§5.3). A tooling test entering through plain fixtures silently writes UNNORMALIZED inline snapshots — a drift bomb every later normalization invalidates. Since `toolTest` extends the house test (§5.1), the single door costs nothing.

## 5. Test infrastructure

### 5.1 `tests/support/tool-fixtures.ts` — the composed `toolTest`

Extends the HOUSE composed test (`houseTest.extend<ToolFixtures>(…)`) so tooling tests keep `clock`/`ids`/`db`/`app`/callers, and follows the house authoring laws: the `({}, use)` idiom, heavy modules dynamic-imported inside fixture bodies, matchers registered by side effect through the fixtures barrel.

| fixture | contract |
| - | - |
| `repoRoot` | the ONE root resolution — kills the per-file ROOT respell |
| `scratch` | an `mkdtemp` dir, auto-removed after `use` — kills manual cleanup |
| `runCli` | takes the TOOL NAME and derives `tooling/src/<tool>/cli.ts`. One derivation, so tests carry no path literals and later moves stop sweeping tests. Spawns `process.execPath`, returns a typed result honoring `_shared/exit-contract.ts`. **A nonexistent tool name THROWS with the roster listed** — fail-loud, never a spawn ENOENT |
| `fakeBin` | writes an executable into a per-test bin dir, prepends it to PATH for the fixture's scope, restores after `use` |
| `plantedTree` | materializes a file map under `scratch`. New fsBacked tool tests plant violation trees THERE, never in the real tree — `__g_` stays reserved for the gate-harness class |

### 5.2 The `toExitWith` matcher

`expect(cliResult).toExitWith(code)` passes iff `received.code === code`; on mismatch it prints expected/actual WITH the exit contract's NAME for each (`1 (violations)`) plus bounded tails of stdout+stderr. A bare `expect(res.code).toBe(0)` failure prints `1 ≠ 0` and nothing else — that is why the matcher exists.

Home: `tests/support/matchers.ts`, THE matcher module (its header carries the cap census), registered through the side-effect chain every test already loads.

### 5.3 The RESULT snapshot serializer

Registered in `tool-fixtures.ts` via `expect.addSnapshotSerializer` — the side effect that makes §4.8's single-door arm load-bearing. Scope: only files importing tool-fixtures. House style stays INLINE snapshots; no file snapshots.

Normalization covers non-deterministic atoms ONLY — over-normalization hides regressions:

| matches | becomes | why |
| - | - | - |
| the absolute repo-root prefix | `<root>` | worktrees and checkouts differ |
| `/tmp/**` scratch paths | `<scratch>` | per-run dirs |
| ISO-8601 timestamps + epoch-ms literals | `<ts>` | clock |
| `pid=<n>` / standalone pid fields | `<pid>` | process identity |
| `<n>ms` duration atoms in RESULT lines | `<ms>` | wall clock |

The serializer's `test()` predicate admits only strings carrying one of those atoms or the `RESULT <tool> ` line shape; everything else serializes untouched. It ships with its own unit test proving each rule AND a planted NEGATIVE (a deterministic string passing through byte-identical).

### 5.4 Type tests and serial routing

Every tool's `contract/` ships `tests/tooling/<tool>/contract/index.test-d.ts` (the `types` vitest project already globs `tests/**/*.test-d.ts`). New tool tests default to `plantedTree`-in-scratch and are parallel-safe; a `SERIAL_INT` row is earned only under `vitest.config.ts`'s own admission rules. Standing hazard: `check-gates.int` is not concurrency-safe with itself.

## 6. The verification floor for a tooling change

Every change to `tooling/` owes, before it is done:

- biome on the touched files;
- BOTH type programs — `node scripts/ts7.cjs --noEmit -p tooling/tsconfig.json` AND `pnpm typecheck:graph` (per-package is blind to `tests/`), plus per-package client tsc whenever anything test-side imported a moved file;
- `pnpm check:structure`;
- `pnpm exec depcruise packages tooling --config .dependency-cruiser.cjs` (a file move changes the graph);
- whole-tree knip (a move re-homes last-importers);
- the tool's own suites by path, plus `check-gates.int` / `gate-conformance.int` / `gate-ignore-grammar.int` / `dependency-cruiser.int` when a gate or stanza changed;
- the PATH SWEEP of §3.1 — proving ZERO references to the old home, with a positive control in the same invocation;
- for an `INSTRUMENT_TOOLS` member, the `@instrument-proof` plant driven through the REAL cli, plus its passing twin.

**Run knip and depcruise BEFORE the final structure pass after any split** — they are the split-residue detectors (type-only import cycles, orphaned consts, front-door fidelity gaps a slice silently dropped).

A change that moves a shared VALUE additionally runs the suites that assert the literal.

## 7. Considered and rejected (recorded so nobody relitigates)

| alternative | rejected because |
| - | - |
| per-tool packages | owner veto: N manifests/tsconfigs/exports for zero physics gained — the ONE package's exports map + gates give the same front-door law |
| `bin` entries | owner veto: install-relink footgun; pnpm root scripts are the front door |
| `tooling` inside `packages/` | every `packages/*` glob and cake gate would need a carve; the root tree keeps "above the cake" legible from the path (§2.1) |
| a task runner (turbo/nx) | nothing builds — tsc is a noEmit oracle and node runs source; a build graph would govern zero artifacts |
| a bench lane | zero bench usage; instrument self-cost is guarded by the instrument-proof suite + Snap's `--cpu-profile` attribution. Revisit on a measured need |
| `setupFiles` for matcher/serializer registration | the house registers by side effect through the composed test; a second mechanism is a two-homes violation |
| `toExitWith` in a separate tool-matchers module | `matchers.ts` is the ONE matcher home, with the cap census in its header |
| a `"."` root export for `@orb/tooling` | an aggregate barrel chain-loads every tool's heavy graph (§2.2) |
| extending eslint to `tooling/` | eslint's repo role is the react/tsdoc gates on the typed public API surface; tools ship no public API. Revisit if tooling grows exported TSDoc surfaces |
| compat re-export stubs during a move | owner ruling: nothing else runs; clean cuts (§1) |
| blanket-copying `scripts/**`'s biome relaxations to `tooling/**` | born-compliant means each relaxation is re-justified against the file it covers |
| a `no-useless-fragment` gate | biome's `noUselessFragments` is already on at error and covers element-nested fragments; the residual return-position cases are style-tier, and `GATE-AUTHORING.md` §10 bans mirroring an enabled native rule. No successor exists or should be built |

## 8. Census hazards in the gate corpus

**Any import or dependency census over `tooling/src/verify/gates/**` MUST exclude example-string literals**, or it reports fixture fiction as real dependencies. A gate's `mustFlag`/`mustPass` examples are SOURCE TEXT for in-memory mini-projects: they import specifiers no package resolves and packages the tree never depends on. Two entries entered this program's premise set exactly that way — one an invented one-letter specifier, one `@orb/client`, which `@orb/tooling` deliberately does not depend on.

The same hazard has a second face: the corpus cites DEAD names deliberately, as fixture strings and as its own exemption-table KEYS. A name-resolution index built over the corpus must exclude the string-literal and object-property-key arms for gate files, or every exemption row vouches for itself.

## 9. The move playbook

The ordered checklist for promoting or relocating a tool. Every step was paid for at least once.

1. **Full-read the monolith before slicing.** Classify each region by NATURE into the five slots: pure derivation → `lib/`, shapes → `contract/`, I/O → `ops/`, argv+dispatch → `cli.ts`, curated exports → `index.ts`. By nature, never by size.
2. **Consumer census BEFORE homing** anything the tool drags along (§2.4). The classification is a hypothesis; the importer census is the verdict — and this applies to DATA files, not only to code (a data file's consumers can prove it belongs in `packages/`, not in `tooling/`).
3. **Repair the slicer's artifact classes.** A cut landing mid-JSDoc (re-anchor on the opening `/**`); doubled `export export`; helpers duplicated across two slices (one home, delete the copy); an over-cap slice (re-split by nature). **A trailing comment defeats an ends-with-`;` block boundary** and silently swallows the NEXT declaration into the wrong file — a nothing-dropped line count does NOT catch mis-ROUTING, so grep the `lib/` files for `export type|interface` (contract-only vocabulary) as the routing fence.
4. **Re-derive every depth-derived ROOT constant at its new depth** — `import.meta.dirname` up-counts differ between homes, and AGAIN when the tests relocate.
5. **Break import cycles by construction.** The monolith's implicit layering becomes explicit: shared leaf constants get their own `lib/` module, cross-mode refusal/config helpers get `ops/guards.ts`, the dispatcher lives in `cli.ts`. Cycles die by moving LEAVES DOWN, never by re-merging and never by routing through `index.ts`. A `contract/` importing an OP's exported type is the same bug: the type moves DOWN to `contract/`.
6. **DOM-typed `page.evaluate` bodies become raw strings** (§2.3 — there is no DOM lib). A segmented in-page IIFE is the size-cap arm for walker-class strings: one function scope, segment files concatenated IN ORDER, byte-equality of the composition asserted at the split, and the walker CT re-run as the behavioral twin. Never route a cycle or a reorder through the segments.
7. **Exit-contract convergence is a SHARED-VALUE change.** Aligning a tool's historical exits to `_shared/exit-contract.ts` reds assertions in suites nobody would associate with the tool — `rg -n 'toBe\(2\)|exit 2' tests/tooling` and sweep in the same commit.
8. **`cli.ts` enters through `runTool`, and everything the cli dispatches is re-exported from `index.ts`.** The cli consumes the programmatic API it fronts.
9. **Test relocation is a monotonic-manifest hand-edit** (§3.1), never the regenerator on a shared tree.
10. **Replay §3.2 over the phase's own delta** — the widening protocol is per-change, not one-time.
11. **The sweeps, exact commands** (per moved file and per moved BASENAME; a zero owes a positive control in the same invocation):
    - old-path: `rg -n '<old path>'` over `package.json`, configs, `tests/`, `docs/` — expect zero;
    - CT-side: `rg -n '<old path>' tests/ --glob '*.ct.tsx'` + per-package client tsc when anything test-side imported it;
    - comment/prose cites: `rg -n '<basename>'` repo-wide — live code and `status: active` docs are updated; dated reviews and `history/` are frozen;
    - catalog receipts: `/usr/bin/grep -rn '"target": "<old prefix>' docs/catalog/receipts/` — re-derive each hit row;
    - the OLD ZONE PREFIX across the gate corpus (§3.1's zone-keyed-fence row);
    - recipe lines in active docs: a `node scripts/…` invocation becomes the pnpm front door.
12. **Doc edits ride the two-commit attest:** the doc bytes commit FIRST, the catalog receipt commits second pointing at that commit, `updated:` bumped, scoped `pnpm check:docs` in the floor.
13. **Then §6's floor, then the LIVE run.**

### 9.1 Proof idioms that are now standard

- **A stack-free cli proof** is a `file://` base over a scratch fixture page that declares `data-app-ready` on itself (skipping the readiness ceiling), plus a planted `__orb` bridge defining the instrument's INPUT CONTRACT. mustFlag discipline at the cli tier with zero dev-stack dependency.
- **A clean TWIN asserts the PLANTED CLASS's absence, not sterility.** Pin `p1=0` + the absent finding kind + exit 0 — never "no findings", which makes the proof lie the day any unrelated rule grows.
- **`satisfies <RealShape>` on a proof fixture is a live drift fence** — a fixture that desyncs from the real serialized shape fails tsc.
- **A test spying `console.log` goes blind when output moves to the print/warn doors** — the spy must follow the REAL sink.
- **Time BOTH sides warm before calling a regression.** A cold-vs-warm confound reads as a 2× slowdown at tool scale.
- **Never trust a text fixer beyond tsc.** An automated import/export fixer's own despecifier regex mangled a type body (`Map<SkipReason, number>` → `Map<number>`); tsc is the mangle detector.

### 9.2 Orchestrator-side, at every merge

- **A sibling lane's `tests/tooling` test written before the tool-fixtures door existed will red at the barrier** on §4.8. The fix is mechanical rerouting; budget one per live sibling lane.
- **Three-way merges break organizeImports sort in files both sides touched** (and the JSON-formatter variant on a unioned `docs/catalog/receipts/*.json`). Run a scoped `biome check --write` over the merge-touched set and land it as a style commit.
- **A merged sibling's tooling-adjacent dep may need its own knip row** — a lane cannot see a sibling's dep surface.
