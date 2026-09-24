---
kind: law
status: active
updated: 2026-09-23
---

# `@orb/tooling` — tooling-tree law

> The detail home for the tooling tree. `Core-0-Architecture-and-Structure.md` §9 is the summary and the entry point; this doc owns the roster, the plumbing floor, the per-gate contracts, the coupled-site census, and the move playbook. Gate authoring starts at `docs/law/gate-runtime-read-first.md`; `../../tooling/src/verify/gates/GATE-AUTHORING.md` is the final authoring guide and links the verbatim legacy archive. Live gate catalog: `Core-Enforcement-Active-Gates.md`. The research zone's roster: `../../scripts/README.md`.

## 1. Standing rulings (owner — do not relitigate)

- **ONE package**, never per-tool packages. No `bin` entries — pnpm root scripts are the front door. Command renames migrate all live callers; they do not retain compatibility aliases. Path values are implementation details.
- **`scripts/` survives** as the explicitly-throwaway research zone (§2.7).
- **Tools sit ABOVE the cake.** `@orb/tooling` may import any app package; nothing in `packages/**` may ever import tooling. Enforcers: resolver physics (no package declares the dep) + the `packages-no-tooling` cruiser guard (§4.6).
- **Pure shared definitions migrate DOWN** — string/regex engines to `kit`, browser-only shared engines to `@orb/ui`.
- **No compatibility shims.** A move is a clean cut; a re-export stub left "for now" is the banned half-migration. Process launchers (§2.6) never keep an old entry point alive.

## 2. Architecture

### 2.1 The tree

```
tooling/
├── package.json          @orb/tooling · private · type module
├── tsconfig.json         generated Node-world program (§2.3)
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
- No per-package `typecheck` script: root `pnpm typecheck [--config <repo-relative-tsconfig>]...` is the one executor. With no configs it discovers every runnable program through the shared compiler reader; repeated configs select, deduplicate and expand native project references.
- Root `package.json` `devDependencies` carries `"@orb/tooling": "workspace:*"` so `tests/tooling/**` can import the programmatic APIs under pnpm isolation.

### 2.3 tsconfig.json

The generated config extends the Node-world template. Shared compiler intent owns its source roots, ambient declaration roots and exclusions; do not maintain another array here. Module resolution remains NodeNext because Node executes tooling source directly. Native compiler ownership and root parity are checked by `pnpm check:type-ownership`.

Compiler intent may declare a supported TypeScript dialect or an explicit helper root before its first
member exists. Those empty roots are standing ownership policy, not stale selectors: generated configs
consume the shared intent, while independent native ownership checks prove the files TypeScript actually
owns. Test ownership is derived from kind and root, never from per-test filename exceptions. Ambient
declarations remain a separate scoped input and do not inherit ownership from a generic source glob.

**Consequence: there is no DOM lib.** A `page.evaluate` body must be a raw STRING, never a typed function form (§9.1-6).

### 2.4 `_shared/` — the ONE plumbing floor

The constitution bans `_shared` drawers in `packages/` (`Core-0-Architecture-and-Structure.md` §1 principle 3); this one is the tooling tree's owner-approved exception. It is not a services drawer — it is the pinned plumbing floor tools compose, flat modules only (a subdir is a hidden drawer, gate-RED), and it reaches UP to no tool. The enforcer that it stays the ONLY home: `tooling-shared-plumbing` (§4.4).

| module | contract |
| - | - |
| `browser.ts` | the one Playwright bootstrap; the only legal `chromium.launch` site; also carries the test-only, protocol-level CDP fault injector (`ORB_PROBE_TEST_CDP_FAULT=<Domain.method>[@<nth>]`, VITEST-only) that every launched/attached context installs |
| `ts-workspace.ts` | the one ts-morph loader (`getWorkspace`/`harnessGlobs`/`searchGlobs`/`collectByKinds`); the only legal `new Project(` site |
| `artifacts.ts` | `reports/<kind>/` artifact filing (`artifactFile`/`artifactKey`) + the RESULT-line convention (`print`/`printResult`) + the RUN-SLOT layout that makes concurrent runs safe (`runId`/`checkoutName`/`openRunSlot`/`runFile`/`publishRunSlot`/`abandonedRuns` — the layout's one home is `UNIFIED-VERIFICATION-DESIGN.md` §3.3b) |
| `argv.ts` | flag-parsing idioms (`splitFirstEq`/`splitLastEq`/`parseViewport`/`splitPageSuffix`/`parseGotoTarget`) |
| `appearance.ts` | the settings shim + the curated preset library (its data file lives beside it) |
| `theme.ts` | the theme part of the settings shim |
| `nav.ts` | the app-nav verbs (`--goto`/`--open-chat`/…) |
| `pixel-backdrop.ts` | framebuffer backdrop sampling |
| `ffmpeg.ts` | the ffmpeg shell door |
| `wcag.ts` | the WCAG contrast kernel (`relativeLuminance`/`contrastRatio`/`isLargeText` + the ratio floors) |
| `schema-read.ts` | the ts-morph drizzle-schema reader — cross-zone shared plumbing |
| `run-tool.ts` | `runTool`/`UsageError` — the exit-honesty runner every `cli.ts` enters through: crash ≠ verdict (uncaught/unhandled → hard `EXIT.toolError` with sync stderr), pipe-drain (verdicts set `process.exitCode`, never `process.exit`), never-downgrade (clean→any, violations→toolError only), `UsageError` → `EXIT.misuse` |
| `proc.ts` | the ONE `node:child_process` door — `spawnNiced`/`runNicedSync`/`execNicedSync` all ride `nice -n 19` (the box co-hosts other services); `spawnNicedChild` is the detached long-lived door (own process group + `killGroup`); `spawnFullPrioritySync` is the loud un-niced exception, legal only for a caller holding an exact `(caller, full-priority-spawn)` reviewed-grant row in `lib/reviewed-grants.ts` (the gate-owned caller census it replaced is deleted). Its doors pin `stdio: ["ignore","pipe","pipe"]` and fold captured stderr into the thrown message — `execFileSync` FORWARDS a child's stderr even while capturing it |
| `load-budget.ts` | THE ONE READING OF THE BOX — `budget()` (wall clocks stretched by the box's per-core contention, capped), `judgeMeasurementLoad`/`annotateRateLoad` (a RATE measured under load is LABELLED `load-suspect`, never promoted), the load-kill classifiers. Its planted-reading seam is `ORB_BOX_LOAD` |
| `concurrency-profile.ts` | the typed, validated Node door onto `tooling/concurrency-profile.json`. The JSON owns worker/slot values; the reader owns their schema. Shell consumers read the same JSON. The SHELL env `ORB_DEDICATED_BOX` selects `shared`\|`dedicated`, never the repo `.env`. Do not copy the field or consumer inventory into prose: adding a cap updates the data, reader and actual consumers with native execution controls. Load-budget stretches clocks under contention; this profile controls admission and parallelism |
| `log.ts` | `warn` — the stderr channel; stdout is reserved for payload (RESULT lines) |
| `exit-contract.ts` | `EXIT = { clean: 0, violations: 1, toolError: 2, misuse: 3 } as const` — the house exit contract |
| `instruments.ts` | the `INSTRUMENT_TOOLS` registry (§4.5) |
| `devtools-assets.ts` | exact-tuple/hash/license validation + the manifest-closed loopback asset server |
| `devtools-runtime.ts` | ephemeral debugging profile/endpoint + official DevTools SDK cascade bridge and cleanup |
| `debugging-endpoint.ts` | the ephemeral Chromium debugging ENDPOINT — the persistent-profile launch args + the ONE reader of `DevToolsActivePort`; a stateful snap session, the cascade runtime and a sibling attach all share it |

**A module joins this floor by IMPORTER CENSUS, never by classification.** "Tool-specific" is a hypothesis; `rg --files-with-matches '<module>' scripts/ tooling/ tests/` is the verdict. Genuinely tool-specific plumbing stays in its tool (`snap/ops/fixture.ts`, the snap stage set).

Every depth-derived root constant is RE-DERIVED at its move, never carried (§9.1-4).

### 2.4a Shims on a shared session browser

Install every session-wide shim with `context.route` or `context.addInitScript`. A shim reaches a tab by its own scope, not by the connection that installed it. A context-scoped shim also covers a tab that an attached client opens. A `page.route` covers only its own page, so an attached instrument that opens a tab would measure the unshimmed app. A page-scoped route is correct only for a local intercept that one drive installs and removes, such as `tooling/src/snap/ops/appearance-density-persistence.ts`.

`attachProbeSession` in `tooling/src/_shared/browser.ts` attaches with `chromium.connectOverCDP`. A `connect()` client cannot see contexts that another client created, so attach would find no session to join.

`tests/tooling/_shared/browser-attach.suite.int.test.ts` pins both facts.

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

**A TOOL DIR IS NOT A COMMAND.** `ui-audit/`, `motion-audit/` and `cpu-profile/` are ENGINES: Snap is the
only rendered front door, they are entered through their own `index.ts`, and they own NO `cli.ts` at all
— gate `tooling-slot-template` case B recognises an ENGINE DIR (an `index.ts`-only tool dir that some
module under `snap/` imports through that index, derived from Snap's own import specifiers, never a row)
and asks it for no argv door. The product is unlaunched, so a dropped command is fixed by grepping and
removing its call sites rather than kept alive behind a redirect that must be maintained, tested and
removed a second time.

| tooling/src/ | owns | pnpm scripts |
| - | - | - |
| `bug-reports/` | the READER for the dev bug button's gitignored captures (list + show) — the artifacts have no tree presence, so the script name IS their discoverability | `bug:reports` |
| `snap/` | the sole rendered-instrument CLI and the sole rendered-instrument ARGV DOOR: capture + evidence, labelled transition filmstrips, motion/perf/CPU/boot/React analyzers, the deterministic design/a11y scan, scenarios, sessions, and the isolated stage | `snap` |
| `ui-audit/` | the design/a11y walker + its rule families — the ENGINE behind Snap's `--design-audit` case; it has no program and no `cli.ts` (an engine dir, entered through `index.ts` — §4.1) | (none — `snap --design-audit`) |
| `render-trace/` | render/tail/fire — three ops behind one dispatcher | `trace:render` `trace:tail` `trace:fire` |
| `wire-tap/` | the server-wire incident toolkit (sse · captures · trpc) | `sse-tap` |
| `cache-check/` | the live prompt-cache check per route and turn shape, on an isolated stage; run on demand and before releases, never in CI or `pnpm check` | `cache:check` |
| `ast/` | the structural-search + rot-detection engine | `ast` · `check:respell/swallowed/typeonly/columns/regkeys/chains` |
| `codemod/` | the ts-morph codemod kit | `codemod` |
| `verify/` | the whole verification system + the gate corpus + `GATE-AUTHORING.md` | `check` `verify` `check:structure` `check:show` `gate:new` `prose:baseline` `check:type-ownership` `check:tests-execution-membership` `check:db-baseline` `check:orphan-ratchet` |
| `doc/` | the docs system's structural writer — ADR/plan/item minting, status and supersession, work-item transitions and landing, archiving with link rewrites, the generated indexes, the soft freshness report; its rules are what `check:agents` runs over `docs/**` and `check:docs`/`format:docs` run over the governed tree | `doc` |
| `agent-sync/` | Codex agent-manifest sync + the instruction-layer and docs-tree check | `agents:sync` `check:agents` |
| `seed/` | demo · chat · multi-user seeding (three verbs) | `seed:demo` |
| `stack/` | the dev and prod stack (bash-fronted; `start` is its node-only door) | `stack` `start` |

**Process launchers and supervisors** may live directly under `scripts/`. They adapt native tool invocation, apply the shared capacity policy, supervise processes and preserve honest exit/report behavior. They do not own duplicate policy readers, application logic or compatibility entry points. Reusable tool implementation belongs in `tooling/`. Root `package.json` scripts identify the live launchers; there is no separate filename allowlist. TypeScript launchers are owned by the Node compiler program and the shared direct-script ESLint surface.

**Revisioned DevTools runtime asset root.** `tooling/src/snap/lib/devtools-frontend/` is Snap's one
sanctioned non-TS runtime asset home. It is generated by `pnpm snap:devtools-assets` from the exact
`pin.json` compatibility tuple; no file below it is hand-edited. `manifest.json` closes every served
resource by URL/path/byte length/SHA-256/MIME/license family, `licenses.json` closes the revision-pinned
root/third-party notice inventory, and `licenses/` carries those exact notices. Normal Snap/CT runs are
offline: `_shared/devtools-assets.ts` revalidates the complete closure (including absence of extras and
symlinks) before serving only manifest members on an ephemeral IPv4 loopback listener. Updating
Playwright/Chromium/DevTools is one generated-tuple change and owes the planted cascade matrix.

### 2.7 `scripts/` — the research zone

Explicitly throwaway probes, one-shot checks, launcher shims, operator scripts. KISS/YAGNI apply there and only there. It MAY import `@orb/tooling` — the one-way glass is against `packages/**`, never against the research zone. It keeps its blanket biome relaxations and knip entry globs.

**Research retention rationale lives in `../../scripts/README.md`.** A research implementation that becomes required for verification is PROMOTED into `tooling/src/<tool>/` under the template, original deleted, never a compat stub. The process-adapter boundary in §2.6 is distinct from research promotion; it does not exempt launchers from their compiler, lint or behavioral checks.

### 2.8 In-app sensors do NOT move

`packages/client/src/lib/{motion-stats,motion-flaggers,motion-dead-class-flagger,long-task-tracer,agent-bridge}` are client code. Their correctness contract is the instrument-proof CT suite, not a promotion. Two one-definition merges are LAW here:

- **The dead-class tokenizer is `@orb/kit/dead-css`.** The definition of "dead" (the escaped-class-token regex + the marker namespaces that legitimately ship no rule) is ONE kit module; the live `[css]` flagger calls it and `snap --dead-css` serializes its regex sources + marker tables into the `page.evaluate` string. Only the DOM halves stay local — a live MutationObserver vs a one-shot census — because that is the half the consumers genuinely differ on.
- **ONE LoAF observer.** `motion-stats.ts` installs the app's only `long-animation-frame` PerformanceObserver and publishes each entry through `subscribeLongAnimationFrames`; every other channel SUBSCRIBES, never observes.

Two merges are REFUSED — do not re-propose without new evidence:

- **accname engine → `@orb/ui`: refused.** There is no accname engine in `@orb/ui` to sit beside; `UI-Primitives-and-Reuse.md` §13.10 is the authority and its mechanical half (`tests/support/browser/accessible-names.ts`) carries the OPPOSITE ruling — a hand-rolled in-page name computation is banned, which is why it reads Playwright's `ariaSnapshot()`. The two tooling sites are not one engine either (snap resolves a NAME for a selector; ui-audit emits raw ATTRIBUTES and never computes what the name IS). The two tool-side resolvers are merged into one shared comparison key, never an accname engine, so the refusal above stands: the ruling survives, only its input changed.
  **The refusal governs the RULING, not the shared COMPARISON KEY.** The key both sites compute — never
  an accname ENGINE — is spelled once, in spec order (`aria-label` before `aria-labelledby`, accname 1.2's
  2B before 2C), in the walker's `ops/walker/accessible-name.ts` segment, and composed by both consumers
  through `ui-audit/index.ts`. No WCAG name is COMPUTED for a verdict — the `aria-name` rule still tests
  PRESENCE (`RULE-AUTHORING.md` row 8) — and `pnpm snap … --aria` (Playwright's `ariaSnapshot`) remains
  the only spec-correct name source in the fleet and the oracle the shared key is proven against.
- **trpc/bus devlog merge: refused.** `trpc-devlog.ts` is a tRPC op formatter with key redaction that SHIPS (loggerLink calls it in prod for errors); `bus-devlog.ts` is an IS_DEV-gated subscription ring. They share only the house console `%c` palette, which is deliberately identical across every dev channel. Merging drags a dev-only ring into the prod bundle.

## 3. Coupled sites of a tooling change

### 3.1 The inventory

A tool move, rename, or new tool touches these. Each row is a place a path or a scope is spelled.

| surface | what changes |
| - | - |
| root `package.json` scripts | command and path changes migrate all live callers; no compatibility aliases |
| root `package.json` depcruise scripts | all five must cruise `packages tooling`, or the tooling stanzas are unfireable |
| generated compiler intent | `tooling/tsconfig.json` owns tooling source; the root Node program retains scripts and tests. Update shared intent, regenerate, and verify native ownership rather than hand-editing compiler roots |
| `tooling/src/_shared/test-kinds.ts` resource registration + `vitest.config.ts` execution groups | repository-resource tests retain their registered kind as they relocate into the mirror (§4.7); runner selectors derive from the kind data, never a filename roster |
| `.dependency-cruiser.cjs` | the tooling stanzas (§4.6) |
| `knip.ts` | the `tooling` workspace entry (`entry: ["src/*/cli.ts","src/_shared/index.ts","src/*/index.ts"]`). **A knip workspace boundary is a coupled site**: `scripts/**` is entry-globbed wholesale and was never analysed for unused exports, so anything moving into `tooling/` enters real analysis at once — an fs-discovered corpus needs its OWN entry row or every descriptor reads as dead |
| `biome.json` | path-named rows repoint at their tool's move. Born-compliant is the default: each relaxation is re-justified against the moved file, never blanket-copied from `scripts/` |
| `tests/tooling/**` path literals | swept per move — but the `runCli` fixture (§5.1) kills the class going forward: tests name TOOLS, not paths |
| `tooling/src/verify/lib/selection.ts` | the graph-tree classifier and `depcruisePaths` must both admit `tooling/` |
| `_shared/ts-workspace.ts` `harnessGlobs` | the shared walk's scope — §3.2 governs any widening |
| law-doc + `.claude/` cites | `pnpm check:docs` + `dangling-refs` are the guards. Lanes never edit `.claude/` — flag those for the orchestrator |
| `tests/**/*.ct.tsx` importers | a moved file with test-side importers may affect compiler programs outside its nearest config; run every native program selected by affected-mode routing through `pnpm typecheck --config <path>` |
| comment/prose cites of the moved BASENAME | live code + `status: active` docs are updated; dated reviews and `history/` are frozen evidence and are never rewritten |
| a ZONE-KEYED EXCLUSION | a predicate that excludes a file's former zone (`startsWith("scripts/")`) is a path literal too. After any cross-ZONE move, grep the gate corpus for the OLD ZONE PREFIX, not only for old file paths — these fail SILENTLY and in both directions (an exclusion starts reporting the corpus's own documentation, or stops scanning it at all) |
| a spawner naming an ops FILE | an ops file stops being independently runnable; its spawners must name a VERB through the one cli door |
| `pnpm-lock.yaml` | the workspace add + each dep addition re-resolve it |

**Population changes require current native evidence.** ESLint covers configured application, tooling, test and Node-launcher surfaces; CPD covers authored package and tooling implementation. Their configs own the selectors, and native observations prove their meaning. A workspace addition does not automatically expand application-specific policy scopes such as `package-layout`. Stryker's native configuration and sandbox behavior must be checked against the changed dependency closure. The Bash tool guard is Claude-only by the later owner ruling; its header in `.claude/hooks/tool-guard.mjs` records the registration boundary and rationale.

### 3.2 The `harnessGlobs` widening protocol

`harnessGlobs` includes `tooling/src/**/*.ts`, so the shared ts-morph walk carries tool code. **Every change that GROWS the population under it re-runs this protocol** — a gate whose `scanRoot` is a NEGATED predicate (not-in-tests shapes) silently starts judging code it was never designed for.

1. Capture every gate's `scanned N/M` denominator BEFORE (`reports/check-structure.json` → `gates[].scan`).
2. Land the growth; re-run; DIFF the per-gate scanned counts.
3. **Every gate whose count grew gets an explicit recorded decision in the same commit: EXCLUDE its scanRoot, or deliberately EMBRACE the new tree.** Each embrace is its own reviewed line. There is no third option and no deferral.
4. Plant one positive control inside the new population and one in `packages/`, and prove both still bite — the widening must not have broken dispatch.

## 4. Enforcement

The live roster derives from the loader. Final policies follow `docs/law/gate-runtime-standardization.md` and the final `../../tooling/src/verify/gates/GATE-AUTHORING.md`; legacy descriptor maintenance uses that guide’s verbatim archive. **Live violations found at any landing are FIXED in that lane** — no debt baselines are minted for tooling.

### 4.1 `tooling-slot-template`

fsBacked, whole-project, comment-SAFE (fs shape, reads no file text); scan unit is the `tooling/src/` tree.

REDs: a top-level entry that is a loose file rather than a dir; a tool dir missing `cli.ts` or `index.ts`; a tool-root entry outside `{cli.ts, index.ts, contract/, ops/, lib/}`; a subdir inside `_shared/`. `_shared/` is exempt from the tool SHAPE (flat modules). **An ENGINE DIR owes no `cli.ts`**: a tool dir with `index.ts` that some module under `tooling/src/snap/` imports through `<tool>/index.ts` (ui-audit, motion-audit, cpu-profile — Snap is the sole rendered front door). The set is DERIVED from Snap's relative import specifiers on every run, never declared: an engine nothing under Snap imports any more reverts to owing its argv door by itself, and the positive control is a `mustFlag` row.

Two typed exemption tables, both two-sided: `BASH_FRONTED_TOOLS` (a `.sh`-entrypoint tool needs no `cli.ts`) — a row naming a dead dir OR a dir that grew a `cli.ts` is RED; `CORPUS_SLOTS` (the `verify/gates/` sixth slot) — a row naming a dead dir or a tool that lost its extra slot is RED.

### 4.2 `tooling-front-door`

incremental-safe, `kinds: [ImportDeclaration]`, comment-SAFE; `scanRoot: (p) => p.startsWith("tooling/src/")`.

REDs: an import in `tooling/src/<a>/**` whose specifier resolves into sibling `<b>`'s internals — anything other than `#<b>` / `../<b>/index.ts`; a `cli.ts` importing anything but its own tool's `index.ts` (+ `_shared`); a relative escape out of `tooling/`. `_shared` is a legal target per-module.

A repo-root CONFIG read whose data would otherwise be respelled (one-home config reads) is licensed by an exact reviewed grant `(consumer, root-config-import:<config>)` in `lib/reviewed-grants.ts`, judged by the sibling policy `tooling-root-config-import` (the relative-escape case under reviewed-grant authority); central grant liveness over those rows is the two-sided stale sweep a root-config exemption table would otherwise need.

**Two layers on purpose, not two homes.** This gate is the LANE-SPEED case (a scoped `check:structure` sees a changed file) and matches specifier SHAPE; the §4.6 cruiser stanzas are the whole-graph resolved-edge backstop — the same split as `domain-sibling-front-door`.

### 4.3 `tooling-size`

incremental-safe, `visitFile` line count, comments-INTENDED (it counts comment lines, like `component-size`); `scanRoot: tooling/src/`.

REDs: any file >450 lines; any `cli.ts` >200. Declared carve with its own `mustPass` row: `tooling/src/verify/gates/**` is cap-EXEMPT — a gate file is a contract-headed single-purpose module, and splitting one is worse than a long one.

**This gate is ORDERING, not a ratchet.** It exists before a monolith can move, which is what forces decomposition at the move instead of after it.

**WHEN THE FILE YOU ARE EDITING IS AT THE CAP, LAND THE NEW THING AS A SIBLING MODULE — never buy a line by deleting a doc comment.** The gate counts comment lines, so at 450 the cheapest way to fit one more field is to delete the sentence explaining an old one. A deleted comment is invisible to every check in this repo and costs the next cold reader the whole derivation, while a sibling module costs one import. The cap is a DECOMPOSITION trigger; treating it as a comment budget inverts it. Where the sibling genuinely has nowhere to go, decompose the file — the one answer the cap never accepts is a smaller explanation.

### 4.4 The plumbing homes — the ten-policy split of `tooling-shared-plumbing`

`tooling-shared-plumbing` does not run; the ten policies below are what runs instead. One `defineGate` policy governs each `_shared/` capability, each with ONE authority; the `_shared` homes and the censused exceptions are exact reviewed grants in `lib/reviewed-grants.ts` (subject, operation, why, endsWhen), and central grant liveness replaces every hand-written stale sweep. Comment posture stays comment-SAFE throughout (node kinds, statically-read strings, numeric literals — never a text regex).

| Policy | Law | Authority · reader |
| - | - | - |
| `tooling-project-home` | ONE ts-morph loader: `new Project(` outside `_shared/ts-workspace.ts` | reviewed-grant · `lib/project-home-origin.ts#readPackageExportOrigin` against ts-morph's `Project`; nine `ts-morph-project-construction` grants (the loader plus eight non-workspace parsers) |
| `tooling-browser-door` | ONE launch (`launchProbeSession`) and ONE attach (`attachProbeSession`): `<engine>.launch(`/`.connect(`/`.connectOverCDP(` outside `_shared/browser.ts` | reviewed-grant · Playwright's engine exports over `@playwright/test`/`playwright`/`playwright-core`; grants `browser-launch` + `browser-attach` |
| `tooling-artifact-path-home` | a `"reports"`/`"reports/…"` literal fed to `join`/`resolve`/`mkdir`/`mkdirSync` outside `_shared/artifacts.ts` | reviewed-grant · family `tooling-artifact`, `lib/artifact-filing.ts` (the callee by identity against node's path/fs doors); grant `reports-path-literal` |
| `tooling-artifact-run-slot` | a tool filing through `artifactDir`/`artifactFile` opens `withInstrumentRun` in its `cli.ts` | hard · family `tooling-artifact`; the home located and evidenced |
| `tooling-process-exit-home` | `process.exit(` outside `_shared/run-tool.ts` | reviewed-grant · family `process-member`, `lib/process-member-origin.ts`; grant `process-exit` |
| `tooling-cli-entry` | every `tooling/src/<tool>/cli.ts` calls `runTool` | hard · family `tooling-program-entry`, `lib/project-home-origin.ts` against the located runner home |
| `tooling-child-process-door` | `node:child_process` outside `_shared/proc.ts`; a full-priority door call outside a reviewed caller | reviewed-grant · the import by specifier, the doors by identity against the located `proc.ts`; grants `child-process-import` + five `full-priority-spawn` |
| `tooling-port-registry` | a port literal outside `_shared/ports.ts`, in `tooling/src/**` + `tests/e2e/support/**` | reviewed-grant · family `plumbing-literals`, `lib/plumbing-literals.ts#portLiteralOf`; grant `port-literal` |
| `tooling-clock-budget` | a fixed wall clock in `tooling/src/**` + `tests/tooling/**` | **ordinary** · family `plumbing-literals`, `#fixedClockOf`; a deliberately fixed clock is `@orb-waive tooling-clock-budget(<literal>)` at its site |
| `tooling-runner-config-literals` | both literal laws over the three root runner configs, for the port-registry and clock-budget policies above | hard · resource; three `exact-file` ids, walked by `#runnerConfigLiteralFacts` through the one scratch parser |

**Identity, not spelling** governs matching: every callee, receiver and constructor is judged by DECLARATION through the shared origin readers — an alias is caught, a same-named local passes, an unplaceable one is reported fail-closed. **Clocks are ordinary, everything else is a grant:** a per-site argument (the tool guard's `timeout` is its input under test) is a waiver; a home or a censused caller is a permission that outlives any one edit, which is a grant. **Homes are located and evidenced:** `_shared/proc.ts`, `_shared/run-tool.ts` and `_shared/artifact-out.ts` are found in the population and evidenced one record per home, so a moved home refuses the run instead of silently carrying its exemption. The root-config policy's closed `exact-file` ids name the three configs that exist; a fourth runner config is unjudged until it gets an id.

### 4.5 `tooling-instrument-proof`

fsBacked, whole-project. Keys off a LIVE registry, not a path list: `_shared/instruments.ts` exports `INSTRUMENT_TOOLS` (an `as const` tuple) — the tools whose output is a VERDICT about the app, where a blind zero reads as a pass. The gate reads the tuple through `ast-read.ts` unwrapping (the `as const satisfies` ts-morph blindness is a known trap) and REDs an empty derivation as its blindness tripwire. An EMPTY registry is a valid state; a missing or unreadable one is not.

**Two proof classes, one of EACH per member**, with one finding per class so a missing absence proof can never hide behind a present defect proof:

| marker | answers |
| - | - |
| `// @instrument-proof: <what is planted and what must red>` | does it BITE? — the test constructs the defect class the instrument exists to catch and asserts it REDs |
| `// @instrument-absence-proof: <what apparatus/population is removed and what must NOT read clean>` | when it could NOT measure, does it SAY so? — the blind-zero-renders-as-clean class |

Three cases per class: a member with no marker-carrying test in its `tests/tooling/<tool>/` mirror; a marker in a NON-member's tree (two-sided vocabulary — an unregistered "proof" is either a lie or a missing registry row); a malformed marker (the reason is REQUIRED). Plus the rename tripwire: a member naming a tool dir that does not exist.

A registry member joins in the SAME commit its tool dir lands. An incident instrument (`wire-tap`) satisfies the gate uniformly rather than through a second tier: its CI proof plants a LOOPBACK fixture server and asserts the tap reports exactly the planted frames — **a committed proof never depends on the dev stack**; a live connect smoke is landing EVIDENCE, not a test.

### 4.9 `tooling-argv-front-door`

Two final policies over `@tooling` (`kinds: [PropertyAccessExpression, ElementAccessExpression]`, comment-SAFE — node kinds only, so a header explaining the argv layout is not a read): `tooling-argv-front-door` (reviewed-grant, `entire-population`) reports every non-`cli.ts` read as one `(file, process-argv-read)` finding, and `tooling-argv-front-door-health` (hard) carries the blindness tripwire. The receiver is judged by identity through `lib/process-member-origin.ts` — the ambient `process` or the `node:process` default export — never by its text.

**The law it pins.** The OPERATOR'S ARGV enters a tooling program at exactly ONE place and flows DOWN as a `readonly string[]` parameter. `process.argv` may be read only in:

- a tool's `cli.ts` — the five-slot argv front door (§2.5), matched by SHAPE (`tooling/src/<tool>/cli.ts`) rather than by a path list, so a cli.ts that moves reds at its new path instead of carrying its exemption along;
- a REVIEWED entry — an exact `(file, process-argv-read)` grant in `lib/reviewed-grants.ts`: the node half a `.sh` execs, which has no `cli.ts` by §2.5 (`stack/ops/prod-entry.ts`, `stack/ops/dev-identity-entry.ts`, and `stack/ops/start-entry.ts`, the one stack entry a pnpm script runs directly), the private `verify/ops/config-snapshot-entry.ts` worker boundary, and `_shared/entrypoint.ts`, whose subject is `argv[1]` — the ENTRY IDENTITY ("was this module the program?") — and never the operator's flags.

Everything else — `ops/`, `lib/`, `contract/`, and every `ops/parse.ts` — takes argv as a PARAMETER. **A library reading the global argv is the defect class:** its behaviour depends on how the PROCESS was started, so no caller and no test can drive it, it silently re-admits flags the front door already refused, and two callers of the same helper get different answers. The defect class looked like: `codemod/lib/diagnostics.ts` (the `--max-output-lines=N` spill knob), `codemod/lib/example.ts` (`getFlag`'s default parameter), `codemod/lib/run.ts` (`runCodemod`'s own `--apply`/`--dry-run` decision) and `stack/ops/prod.ts`, which reached past its own entry to re-find the `--` forwarding separator in the GLOBAL frame.

**Threading argv in is a REQUIRED field, not an optional one.** `RunCodemodOptions.argv` is required precisely because the omission's failure mode is silent: `resolveIsDryRun([])` returns "dry run", so a forgotten argv would swallow an operator's `--apply` and report a clean preview. A required field makes it a tsc error instead.

Cases: **(A)** the read outside a sanctioned home, both spellings (an element-access-blind matcher would be the loophole) — a reviewed-grant finding; **(B)** the two-sided stale sweep is CENTRAL grant liveness — a grant row consumed zero times after a complete run is STALE, whether its file merely stopped reading argv or is GONE, so the two modes collapse to one check by construction; **(C)** the `docs/law/gate-runtime-standardization.md` §6.1 blindness tripwire, its own hard policy `tooling-argv-front-door-health` — zero `cli.ts` readers on a real-tree run means the matcher stopped recognising the shape, and every case above is vacuously green. Both whole-tree cases are anchored on `_shared/exit-contract.ts` (case B by the entire-population deferral, case C by the anchor guard), never on a scope kind.

**DECLARED LIMIT (its own `mustPass` row): this gate pins WHERE argv is read, never HOW STRICTLY each tool's grammar parses it.** Each CLI's real grammar is classified once — strict-ordered (`snap`), positional/subcommand (`ast`/`verify`/`doc`/`seed`/`wire-tap`/`render-trace`), flag-bag, and `--`-forwarding (`stack`) — and the lenient ones are closed by hand. The ui-audit design/a11y scan rides `snap`'s grammar: there is one rendered-argv reader in the fleet, and the engine dirs' `cli.ts` files parse nothing at all. There is deliberately NO generic `parseArgv(spec)`: flattening the remaining grammars into one would change every tool's contract, and each existing contract stays byte-stable.

### 4.6 dep-cruiser stanzas

Require the cruise-scope widening (`depcruise packages tooling`) or the stanzas are unfireable by construction.

1. `packages-no-tooling` — `from: ^packages/`, `to: ^tooling/`, error. The deep-relative-escape backstop over the resolver physics (the `ui-cake` posture).
2. `tooling-internal-direction` — `ops/` may import `{lib,contract,_shared}` + its own tool's modules; nothing imports a sibling tool's `ops|lib|contract` directly. **Type-only is NOT exempt** for the cross-tool case — the front-door law is a SHAPE rule (the domain-sibling precedent).
3. `tooling-cli-via-index` — a `cli.ts` reaches its own tool only through `"./index.ts"`.
4. `tooling-shared-floor` — `_shared/` reaches UP to no tool (the `foundation-reaches-up-to-nothing` mirror).
5. `tooling-no-provider-families` — the provider FAMILIES (`packages/inference/src/backends/<x>`, where the agent-sdk credential firewall lives) and the contract internals stay sealed against tooling; `contract/index.ts` alone is open, and the front door `packages/inference/src/index.ts` is legal because tools sit above the cake (§1). There is no vLLM carve-out: there is no in-server supervisor to keep in step, the fleet lives outside this repo in the owner's infra (docs/plans/fleet-out/design.md), and nothing in `@orb/inference` builds an engine argv.

Coupled: `tests/tooling/dependency-cruiser.int.test.ts` carries a `__dc` pin per stanza (a planted violation cruises red). **A stanza without its pin is an inert rule** — the derived anti-drift case has nothing to fire it.

### 4.7 `test-layout` — the tooling mirror

When a test path is `tests/tooling/<dir>/…` AND `tooling/src/<dir>/` exists, the mirror rule applies: `tests/tooling/<tool>/<path>.<kind>` must prefix-swap to `tooling/src/<tool>/<path>.ts` (file or dir-index), with the existing `.suite.*` exemptions. Flat files directly under `tests/tooling/` and dirs matching no `tooling/src/` dir stay exempt — they test root configs, the guard, and research-zone scripts.

Endgame residents of the flat tier: `tool-guard.int.test.ts` (subject is `.claude/hooks/*.mjs`), `issue-form-guidance-integrity.test.ts` (subject is `.github/`), `dependency-cruiser.int.test.ts` (subject is the root config), `smoke.test.ts`.

### 4.8 `test-fixture-imports` — the tool-fixtures door

Within `tests/tooling/**`, importing `test`/`it`/`expect` from `support/fixtures` is RED with its own message: the tooling door is `support/tool-fixtures`.

**Why this matters, and is not ceremony:** the RESULT snapshot serializer registers via tool-fixtures (§5.3). A tooling test entering through plain fixtures silently writes UNNORMALIZED inline snapshots — a drift bomb every later normalization invalidates. Since `toolTest` extends the house test (§5.1), the single door costs nothing.

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

Registered in `tool-fixtures.ts` via `expect.addSnapshotSerializer` — the side effect that makes §4.8's single-door case necessary. Scope: only files importing tool-fixtures. House style stays INLINE snapshots; no file snapshots.

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

Type assertions use the type-test kinds defined by `tooling/src/_shared/test-kinds.ts`; Vitest derives their project names and selectors by compiler world. Keep the source mirror described by `Spine-Testing.md`. New tool tests default to `plantedTree`-in-scratch and are parallel-safe. A repository-resource test uses the registered `.repo.int.test.ts` kind; `vitest.config.ts` derives the `repository` execution group from that data and serializes its files after the normal groups. Standing hazard: `check-gates.repo.int` is not concurrency-safe with itself.

## 6. The verification floor for a tooling change

The scoped lane floor and shared-host scheduling live in the `lane` skill
(`.claude/skills/lane/SKILL.md`), sections “Running tools” and “Floor”. A lane must not launch whole-tree checks alongside an integration train.

Run scoped Biome and ESLint, the behavioral suites for the changed contract, and every affected native
compiler program. A shared-value change also runs coupled literal assertions. Moves require the §3.1
path/consumer sweep and native graph and unused-code checks. An instrument member retains its actual-CLI
violation and absence controls. The orchestrator owns the consolidated structure and whole-program
verification on the quiescent integrated tree; scoped green does not discharge that obligation.

Run the graph and unused-code checks before the final structure pass after a split: they detect cycles,
orphaned exports and broken front doors that a local slice can miss.

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
| compat re-export stubs during a move | owner ruling: nothing else runs; clean cuts (§1) |
| blanket-copying `scripts/**`'s biome relaxations to `tooling/**` | born-compliant means each relaxation is re-justified against the file it covers |
| a `no-useless-fragment` gate | biome's `noUselessFragments` is already on at error and covers element-nested fragments; the residual return-position cases are style-tier, and `GATE-AUTHORING.md` §10 bans mirroring an enabled native rule. No successor exists or should be built |
| a count ratio or count-equality tolerance for ui-audit subject accounting | an equal count cannot see one element replaced by another. `censusThinGap` in `tooling/src/ui-audit/lib/evidence.ts` requires settled = walked + classified skips, with no identity churn |
| retrying a ui-audit walk after an accounting mismatch | a warmed retry erases the evidence that the first walk was incomplete, and timing then decides which result survives |
| inferring the rendered theme from the requested theme name | a request cannot prove what rendered. The walker reads the source from the root `data-theme` and the ThemeScope inline tokens, and polarity from computed `color-scheme` (`tooling/src/ui-audit/ops/walker/core.ts`) |

Split off [core-tooling-move-playbook.md](core-tooling-move-playbook.md) for the 48 KiB law cap (census hazards in the gate corpus; the move playbook).
