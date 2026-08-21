---
kind: design
status: active
updated: 2026-08-21
---

# `@orb/tooling` — the tooling workspace package (program design)

> The durable in-repo form of the owner-approved 2026-08-21 program (approved verbatim; issue #393): promote the durable tool fleet out of `scripts/` into a new root workspace tree `tooling/` as ONE private package `@orb/tooling`, with a five-slot per-tool template, born-compliant gates, and test infrastructure baked in at birth. This doc is the binding shape for P1-P9; the pilot's coupled-site playbook lands as §9 at P2 close. Every tree claim below carries a `path:line` receipt taken on the 2026-08-21 tree (branch base 5acb0d523).

## 1. Rulings already closed (owner — do not relitigate)

- **ONE package**, not per-tool packages. No `bin` entries — pnpm root scripts stay the front door (script NAMES unchanged; their path VALUES move).
- **`scripts/` survives** as the explicitly-throwaway research zone.
- **Tools sit ABOVE the cake**: `@orb/tooling` may import any app package; nothing in `packages/` may ever import tooling (enforcer: resolver physics — no package declares the dep — plus the `packages-no-tooling` cruiser belt, §4.6).
- **Pure shared definitions migrate DOWN**: string/regex engines → `kit`; browser-only shared engines → the ui lib (P7).
- **No shims, no compat layers**: nothing else runs during execution; moves are clean cuts. A re-export stub left "for now" is the banned half-migration.

## 2. Architecture

### 2.1 The tree

```
tooling/
├── package.json          @orb/tooling · private · type module
├── tsconfig.json         extends ../tsconfig.base.json (§2.3)
└── src/
    ├── _shared/          the ONE plumbing home (§2.4) — sorted first by design
    └── <tool>/           five-slot template (§2.5), one dir per tool (§2.6)
```

`tooling/` is a ROOT tree beside `packages/`, not inside it: it is not a layer of the cake, every `packages/*` glob in the repo (cruiser roots, `package-layout`'s PACKAGES list at `scripts/check/gates/package-layout.ts:11`, coverage include at `vitest.config.ts:134`) keeps meaning "the cake" unchanged, and "tools sit above the cake" is legible from the path alone. Added to `pnpm-workspace.yaml:1-2` as a second entry (`- tooling`).

### 2.2 package.json

- `name: "@orb/tooling"`, `private: true`, `type: "module"`, `engines: { node: ">=26" }`.
- **deps**: `@orb/{kit,contracts,db,server,ui}` `workspace:*` — the five REAL import surfaces measured on the tree (§8.2). NOT `@orb/client` (zero real imports exist — §8.2). Third-party deps (ts-morph, playwright, yaml, …) are enumerated at P1 by an import sweep of the moving fleet; each rides `catalog:` where the catalog pins it.
- **exports**: `{ "./*": "./src/*/index.ts" }` — the house per-directory front-door map (`Core-0` §2). Deliberately NO `"."` root export: an aggregate barrel would chain-load every tool's graph (playwright + ts-morph + the server graph) for any single import. `_shared` rides the same map (`@orb/tooling/_shared`) so not-yet-moved research scripts can consume the ONE plumbing home mid-program (§2.4).
- **imports**: `{ "#*": "./src/*/index.ts" }` — the house intra-package subpath map; a tool reaches a sibling as `#<tool>` (front-door only, §4.2).
- No per-package `typecheck` script needed: root `pnpm typecheck` is `pnpm -r exec node $PWD/scripts/ts7.cjs …` (`package.json:45`) — a workspace member with its own tsconfig is swept automatically.
- Root `package.json` `devDependencies` gains `"@orb/tooling": "workspace:*"` so `tests/tooling/**` can import the programmatic APIs under pnpm isolation (coupled site, §3.1).

### 2.3 tsconfig.json

Extends `../tsconfig.base.json`; `compilerOptions.types: ["node"]` (tools are node-context, like the root aggregator at `tsconfig.json:24`). The base's `include` assumes depth-2 packages (`${configDir}/../../reset.d.ts` — documented escape at `tsconfig.base.json:99-105`); tooling is depth-1, so it OVERRIDES `include` entirely: `["src", "../reset.d.ts", "../platform.d.ts"]` (an override drops the base line — the base's own comment names the three existing overriders; tooling is the fourth). `exclude` mirrors `["**/node_modules", "**/__g_*", "**/__g_*/**"]` — the 7th `__g_` mirror (existing six: tsconfig.base.json:114 · tsconfig.json:78-79 · biome.json:24 · vitest.config.ts:20 · eslint.config.js:146 · .dependency-cruiser.cjs:655). Module stays inherited `nodenext` — node runs tooling source directly, so node-strict resolution is the honest checker.

### 2.4 `_shared/` — the ONE plumbing home

The constitution bans `_shared` drawers in `packages/` (Core-0 §1 principle 3); this one is the plan's explicit, owner-approved exception for the tooling tree: it is not a services drawer, it is the pinned plumbing floor tools compose, and the underscore sorts it first in `ls` (the roster-legibility goal). Enforcer that it stays plumbing: the `tooling-shared-plumbing` gate (§4.4) makes a SECOND home for any of its capabilities RED.

| module | absorbs (from) | contract |
| - | - | - |
| `browser.ts` | `scripts/probes/_kit/browser.ts` | the one Playwright bootstrap; the only legal `chromium.launch` site (§4.4) |
| `ts-workspace.ts` | `scripts/ts-workspace.ts` (moved at P1; consolidation of ast/codemod loaders at P4) | the one ts-morph loader (`getWorkspace`/`harnessGlobs`/`searchGlobs`/`collectByKinds`); the only legal `new Project(` site |
| `artifacts.ts` | `scripts/probes/_kit/artifacts.ts` + `_kit/result.ts` | `reports/<kind>/` artifact filing (`artifactFile`/`artifactKey`, the #209 anchoring rules) + the RESULT-line convention (`print`/`printResult`) |
| `argv.ts` | `scripts/probes/_kit/flags.ts` (generalized) | flag parsing helpers |
| `proc.ts` | new (extracted respellings) | spawn/exec wrappers with the exit contract |
| `log.ts` | new | stderr progress vs stdout payload discipline |
| `exit-contract.ts` | new (codifies the live convention) | `EXIT = { clean: 0, violations: 1, toolError: 2, misuse: 3 } as const` — the house exit contract (AGENTS.md §4; already spoken by work-item, verify, snap: `tests/tooling/work-item-cli.test.ts:11-12`) |

NOT `_shared`: `_kit/nav.ts`, `appearance.ts`, `theme.ts`, `fixture.ts`, `pixel-backdrop.ts`, `snap-stage.ts` — snap-specific; they become `snap/ops/` + `snap/lib/` at P2. `_kit/ffmpeg.ts` rides with `record.ts`'s promotion decision (§2.7): promoted → `_shared`; else it stays beside record in the research zone.

`artifacts.ts` carries a depth-derived `REPO_ROOT` (`scripts/probes/_kit/artifacts.ts:7` — "three levels up"); `tooling/src/_shared/` is coincidentally also depth-3 from root, but every depth-derived root constant is re-derived at its move, never trusted (playbook item, §9).

### 2.5 The five-slot tool template

```
tooling/src/<tool>/
├── cli.ts        argv parse + dispatch ONLY (cap 200 lines — §4.3)
├── index.ts      programmatic API — tests import THIS; cli.ts consumes it
├── contract/     result shapes, config schemas, typed exit data
├── ops/          one file per command family / capability
└── lib/          tool-internal pure helpers
```

Navigation is mechanical, mirroring the domain template (Core-0 §4): what does it do → `index.ts` exports; where is command X → `ops/<x>.ts`; what shape does it emit → `contract/`; pure logic → `lib/`. Non-TS data files (e.g. `model-ab.variants.json`, `appearance-presets.json`, the vLLM `.jinja` templates) live inside `ops/` or `lib/` beside their consumer — the tool ROOT admits only the five slots plus `cli.ts`/`index.ts` (§4.1). Every pnpm script points at the tool's `cli.ts` (+ subcommand) — pointing a script into `ops/` would bypass the one argv parse. Bash-fronted tools (`stack/`) carry their `.sh` entrypoints at the tool root under a typed exemption row (§4.1); bash never enters the tsconfig.

The 27 `#!/usr/bin/env tsx` shebangs across `scripts/` (tsx was shed 2026-08-03; every script runs via `node`) are launcher rot — a promoted tool's shebang is DELETED at its move (playbook item).

### 2.6 Tool roster (renames; pnpm script names unchanged)

| tooling/src/ | from | pnpm scripts repointed | note |
| - | - | - | - |
| `snap/` | `scripts/probes/snap.ts` (4,513 ln) + `_kit/{nav,appearance,theme,fixture,pixel-backdrop,snap-stage}.ts` + `scenarios/orb-app.json` + `appearance-presets.json` | `snap` | P2 pilot; the monolith decomposes into ops/ (navigate, capture, map, eval, dead-css, appearance, stage, contrast…) under the 450 cap |
| `ui-audit/` | `design-audit.ts` (603) + `design-audit-walker.ts` (1,495) + `design-audit-checks.ts` (1,610) | `design-audit` | renamed; carries the one REAL `@orb/ui` import (`design-audit-checks.ts:16` `TOKENS`) |
| `motion-audit/` | `motion-audit.ts` (557) | `motion-audit` | |
| `cpu-profile/` | `perf-meter.ts` (693) | `perf-meter` | renamed |
| `render-trace/` | `trace-render.ts` (255) + `trace-tail.ts` (111) + `probe-fire.ts` | `trace:render` `trace:tail` `trace:fire` | merged: one tool, three ops (probe-fire folded in — it is the trace family's fire op and has a live alias; deviation from the plan's two-file list, stated) |
| `ast/` | `codemods/ast.ts` (6,241) | `ast` + `check:respell/swallowed/typeonly/columns/regkeys/chains` | keeps its brand; the six `check:*` lens aliases repoint too (`package.json:54-59`) |
| `codemod/` | `codemod-kit.ts` (3,385) + `codemod.ts` + `migrate-macro-blocks.ts` + `export-rot-cleanup.ts` | `codemod` | migrations become ops |
| `verify/` | `scripts/check/**` (247 files incl. gates/ + GATE-AUTHORING.md) + `scripts/verify/**` (9 files) | `check` `verify` `check:structure` `check:show` `gate:new` `prose:baseline` `check:tests-membership` `check:tests-execution-membership` `check:db-baseline` `check:orphan-ratchet` | one system; moved LAST (P6); the largest coupled surface (§3.3) |
| `workboard/` | `github/work-item.ts` (975) | `work:item` | renamed |
| `doc-catalog/` | `docs/catalog.ts` (937) + `docs/format-md.ts` (77) | `doc-catalog:*` `check:docs` `format:docs` `check:doc-catalog` | |
| `agent-sync/` | `agents/sync-codex-agents.ts` (251) | `agents:sync` `check:agents` | renamed |
| `seed/` | `seed/seed-demo.ts` (443) + `dev/seed-chat.ts` + `dev/multi-user-seed.ts` | `seed:demo` | |
| `stack/` | `dev/{stack.sh,dev.sh,stack-prod.ts,engines.sh,engines.ts,engines-ctl.ts}` + `dev/_kit/{stack-mode,spawn-lock}.ts` + `pino-pretty.json` + `*.jinja` | `stack` `engines*` | bash rides along at tool root (§4.1 exemption row); no tsconfig involvement for `.sh` |
| `model-ab/` | `dev/model-ab.ts` (769) + `model-ab.variants.json` | (none today) | |
| `wire-tap/` | `probes/sse-tap.ts` (modernized) + two net-new ops | `sse-tap` (→ `cli.ts sse`) | the server-wire incident toolkit (orchestrator input 2026-08-21): `ops/sse.ts` = sse-tap with the tsx shebang + `--experimental-eventsource` self-re-exec (lines 39-42) DROPPED — `EventSource` is a stable global on node 26, verified at the move; `ops/captures.ts` = a reader for the `/api/_debug/wire` captures; `ops/trpc.ts` = the uncookied dev tRPC harvest — both currently orchestrator-memory-only curl recipes, promoted to durable ops. Incident instrument, idle-by-design (§4.5) |

Root-shim survivors (neither research nor tooling — launcher shims, named in the `scripts/` README at P9): `scripts/ts7.cjs` (the TS7 wrapper — `package.json:45-47`, `registry.ts:101`, and every brief's `types:graph` spelling depend on the path; a `.cjs` launcher, not a tool) and `scripts/worktree-bootstrap.sh` (`package.json:14`). Owner-visible default: they stay put.

### 2.7 Stays in `scripts/` (research zone) — dated classification

Evidence line for the dates: transcript archaeology 2026-08-21, retention-bounded (orchestrator-supplied; invocation-form matches, planted-control-validated — not re-derived here).

**(a) research-keep, recent use:** `st-goldens/` (last ran 2026-08-17; foreign captured runtime, fenced everywhere — §3.2), `rpg-extraction/` (2026-08-17), `impersonate/`, `openrouter/` (probe rigs with committed RESULTS).

**(b) research-keep, reference/instrument value despite idleness:**

- The `sdk-*-probe` family (five aliased, `package.json:27-31`) — grounds Tier-3b agent-sdk behavioral claims.
- `sdk-hook-wire-probe.ts` — KEEP with the family (reclassified from flag-for-delete after full read): it is the family's only WIRE-LEVEL member (loopback capture server reads the actual `/v1/messages` body — header, `sdk-hook-wire-probe.ts:5-13`) and it exercises the REAL credential-firewall exports (`dynamicContextOptions`/`firewallBase` from the agent-sdk backend, `sdk-hook-wire-probe.ts:28`). Deleting it removes the one wire-capture harness for the firewall seam. Hand-run by design (header: "Hand-run, never CI"); it has no pnpm alias and needs none.
- `sse-tap.ts` — PROMOTED, not research (orchestrator ruling 2026-08-21): it becomes `wire-tap/ops/sse.ts` at P3 (§2.6).
- `transcript-census.ts` — KEEP (reclassified from flag-for-delete after full read): it is the census half of the tool-guard tuning rig — `tool-guard.mjs:325` names it in `SELF_TOOL_RELPATHS` beside `guard-replay.ts`, and the doctrine's "census of 133,631 Bash calls" receipt (agent-doctrine.md:60) is its output. Deleting it orphans a live guard constant and the guard's corpus-validation loop. Its header is also the only record of the reverse-engineered transcript JSONL shape (`transcript-census.ts:14-27`).
- `guard-replay.ts`/`.mjs` — the guard rig's other half (`tool-guard.mjs:112,325`).

**(c) RULED DELETE (orchestrator, 2026-08-21):** `useless-fragments.ts` — deleted at P9, NO replacement gate (§7 records the receipt so nobody rebuilds it).

**(d) FLAG-FOR-DELETE, pending owner ruling (zero invocations in any visible window; git preserves them):** `find-react-element-casts.ts`, `find-shitty-casts.ts` (one-shot-lens class), `scripts/lens/kit-candidates.ts` + `scripts/audit/build-repository-audit-manifest.mjs` (same class; `lens:kit-candidates` alias dies with it if ruled delete).

**Promotion-or-research decision (plan §roster):** `record.ts` (last ran 2026-08-16) — promoted as `screen-record/` ONLY if it gains a test at its move; else it stays, keeping `_kit/ffmpeg.ts` beside it.

**Operator one-offs, stay:** `sandbox.sh`, `vllm-setup.sh`, `oracle-steady-clone.sh`, `multi-user-fixture.sh`, `probe:history-system-rows` (`history-system-rows.ts`).

The research zone MAY import `@orb/tooling` (plumbing reuse beats respelling; the one-way glass is `packages/** ⇏ tooling`, not `scripts/ ⇏ tooling`). It keeps its blanket biome relaxations (`biome.json:575`) and knip entry globs (`knip.ts:44-45`) unchanged.

### 2.8 In-app sensors do NOT move

`packages/client/src/lib/{motion-stats,motion-flaggers,long-task-tracer,agent-bridge,devlogs}` are client code; their fix is the P8 instrument-proof CT suite plus the P7 one-definition down-migrations. Verified P7 receipts: the dead-class definition exists twice by its own comment's admission (`motion-flaggers.ts:11-12` — "the dead-token half of `pnpm snap --dead-css`, ported"; `:261` — "flagger and the probe agree about what dead means"); two LoAF observers watch the same frames (`motion-stats.ts:256` and `long-task-tracer.ts:200`, both `type: "long-animation-frame"`); accname logic is multi-homed across `snap.ts` + `design-audit-walker.ts` + `design-audit-checks.ts` (grep receipts §3.1) with the documented authority beside list-row in `@orb/ui`.

## 3. Coupled-site census (recon receipts, 2026-08-21 tree)

The plan's seed list, re-derived and extended on the tree. Legend: P<n> = the phase that touches it.

### 3.1 Per-surface inventory

| surface | receipt | what changes, when |
| - | - | - |
| `pnpm-workspace.yaml` | `:1-2` `packages: - packages/*` | P1: add `- tooling` |
| root `package.json` scripts | 40+ path-bearing rows, `:12-92` (per-tool mapping in §2.6) | each move phase repoints its tool's rows; names never change |
| root `package.json` devDependencies | `:94-155` | P1: add `@orb/tooling: workspace:*` |
| root `package.json` depcruise scripts | `:70-74` — five scripts cruise `packages` only | P1: `depcruise packages tooling --config …` (all five) so the tooling stanzas can fire at all |
| `tsconfig.json` (graph) | include `"scripts"`,`"tests"` `:46-60`; excludes st-goldens `:141` | P1: include gains `"tooling"`; scripts include SURVIVES (research zone still typechecked) |
| `tooling/tsconfig.json` | new | P1 (§2.3); swept by `pnpm -r exec` typecheck automatically |
| `vitest.config.ts` SERIAL\_INT | `:39-76` — 5 tooling rows: check-gates.int `:41`, gate-ignore-grammar.int `:44`, dependency-cruiser.int `:45`, gate-conformance.int `:48`, ast-observability.int `:52` | P2-P6: rows follow their files as tests migrate into mirror dirs (§4.7) |
| `stryker.config.json` / `stryker.gate.config.json` | ignorePatterns st-goldens rows `:52-55` / `:47-50`; mutate globs are packages-only | NO change: st-goldens stays; `tooling/` must NOT be added to ignorePatterns (the sandbox needs the tree, and the workspace-symlink patch discovers workspace packages generically — `patches/@stryker-mutator__core@9.6.1.patch`, `linkNodeModulesEntries` re-points by realpath, no package list). P1 done-bar smoke-proves it |
| `.dependency-cruiser.cjs` | rules `:64-619`; options.exclude `__g_` `:655` | P1: the three tooling stanzas (§4.6); `__g_`/`__dc_` excludes are path-generic, no edit |
| `lefthook.yml` | commands are `pnpm check`/`pnpm verify --push` only; one prose cite of `scripts/verify/registry.ts` `:116` | P6: fix the prose cite; commands unchanged |
| `knip.ts` | root workspace scripts globs `:44-45`; per-package entries `:62-83` | P1: add a `tooling` workspace entry (`entry: ["src/*/cli.ts","src/_shared/index.ts","src/*/index.ts"]`, `project: ["src/**/*.ts"]`); root scripts globs survive |
| `biome.json` | `scripts/codemods/codemod-kit.ts` `:474`; `scripts/**` blanket `:575`; `scripts/seed/**` `:590`; st-goldens `:669`; `snap.ts`+`design-audit.ts` useAwaitThenable `:701-702` | P1: a `tooling/**` override carrying ONLY `noConsole: off` (CLI output is stdout; `_shared/log.ts` is the convention home, biome is not its enforcer). Every other relaxation is re-justified per file at its move, never blanket-copied (born-compliant means the old drawer's indulgences don't transfer). Path-named rows (`:474`,`:701-702`) repoint at their tool's move |
| `.claude/hooks/tool-guard.mjs` | `SELF_TOOL_RELPATHS` `:325` (guard-replay, transcript-census — both STAY); tracked-script mechanism is git-based (`isTrackedScript`, `:1121`), not path-pattern; the harness-command regex keys on PNPM SCRIPT NAMES (`:307` — `pnpm snap`, `pnpm check`…) | NO change required — verified not coupled (script names don't change; tracked-ness follows git). Orchestrator owns any `.claude/` edit regardless |
| `tests/tooling/**` path literals | 60+ refs; top spellings: `scripts/probes/snap.ts` ×9, `scripts/check/pass.ts` ×7, `scripts/dev/stack.sh` ×6, `scripts/codemods/ast.ts` ×6, `scripts/verify/registry.ts` ×5 (full census in the P0 lane report) | each move phase sweeps its tool's spellings; the `runCli` fixture (§5.1) removes the class going forward (tests name TOOLS, not paths) |
| `scripts/verify/registry.ts` argvs | `:308` scoped docs argv spells `tsx scripts/docs/format-md.ts`; `:101` ts7 wrapper path | P5 edits `:308` in place (registry itself moves P6); `:101` stays (ts7.cjs stays) |
| `scripts/verify/selection.ts` | graph-tree classifier `rel.startsWith("scripts/")` `:80`; `depcruisePaths` = paths ∩ packages/ `:166` | P1: both admit `tooling/` (changed tooling files must reach the graph program + the cruiser) |
| `scripts/ts-workspace.ts` `harnessGlobs` | `:34-42` — packages+tests+`scripts/check/gates/**`; header pins "never widen it" | P1: MOVES to `_shared/ts-workspace.ts` AND gains `tooling/src/**/*.ts` — the pin survives, its INPUT changed (a new first-class tree joined the law's scope). §3.2 protocol governs the widening |
| doc-catalog receipts | 15 evidence targets cite `scripts/` paths (e.g. `package-layout.ts:35` ×3, `verify-registry-parity.ts:31` ×2, `design-audit-walker.ts:870`, `stack-prod.ts:15`, `ast.ts:4638`, `registry.ts:293`) — `catalog.ts:660-669` REDs a dangling target at `pnpm check:doc-catalog` | each move phase sweeps `/usr/bin/grep -rn '"target": "scripts/' docs/catalog/receipts/` and re-targets hit rows (re-derive the line, don't just re-prefix) |
| law-doc cites | `docs/architecture/core/`: 22× `scripts/check/gates/`, 3× `GATE-AUTHORING.md`, 3× `scripts/verify/{selection,registry}.ts`, 3× `scripts/docs/catalog.ts`, +20 more (grep census in lane report); `AGENTS.md` §7 cites `scripts/codemods/ast.ts`, `codemod-kit.ts`, `../../../scripts/check/GATE-AUTHORING.md` | P9 sweeps them all (P6 for GATE-AUTHORING's own move); `pnpm check:docs` + `dangling-refs` are the fences |
| `.claude/agent-doctrine.md` + `.claude/rules/*` cites | doctrine cites `scripts/check/GATE-AUTHORING.md`, `scripts/codemods/codemod-kit.ts` | flagged FOR THE ORCHESTRATOR at P6/P9 — lanes never edit `.claude/` |
| catalog scope | `catalog.ts:245-247` `trackedDocs()` = `git ls-files -- docs` — GATE-AUTHORING.md is NOT catalog-tracked at either home; `format-md.ts:23` scope is `docs/architecture/**` only | no catalog row for the moved doc; its cites are the coupled surface |
| gate corpus internals (P6) | `loader.ts` glob `scripts/check/gates/*.ts`; `harnessGlobs` gate-corpus glob (`ts-workspace.ts:40`); `diagnostic-legibility` scanRoot over the corpus; `finding-overload-provenance.baseline.json` keys carry `scripts/check/gates/…` paths; `check-gates.int` + `gate-ignore-grammar.int` plant `__g_` fixtures AT the gates dir; gates dispatching on hard-coded paths + their `\/`-escaped spellings (GATE-AUTHORING §9 sweep) | P6, with §9's rename sweep run over the WHOLE corpus; baselines hand-edited row-by-row (never regenerated on a shared tree) |
| `tests/tooling/dependency-cruiser.int.test.ts` | plants `__dc` fixtures under `packages/` and prunes `find packages -name '__dc*'` `:49` | P1: new stanza fixtures + prune scope gains `tooling` |

### 3.2 The harnessGlobs widening protocol (P1 — the one dangerous edit)

Adding `tooling/src/**/*.ts` to the shared walk changes every gate's candidate set. A gate whose `scanRoot` is a NEGATED predicate (not-in-tests shapes) silently starts scanning tool code — the exact class that makes `no-inline-types` red a tool's `contract/` or leaves a catch-all gate quietly judging code it was never designed for. Protocol, mandatory at P1:

1. Run `pnpm exec tsx scripts/check/report.ts` BEFORE the widening; save every gate's `scanned N/M` denominator (`reports/check-structure.json` `gates[].scan`).
2. Widen; re-run; DIFF per-gate scanned counts.
3. Every gate whose count grew gets an explicit decision recorded in the P1 commit: fence its scanRoot to its pre-P1 set, or deliberately embrace the tooling tree (each embrace is its own reviewed line). Default: existing gates keep their pre-P1 scanned sets; only the five new gates (§4) and deliberate opt-ins see tooling.
4. Plant one positive control in `tooling/src/` (a violation of a new gate) and one in `packages/` (a known existing-gate violation) and prove both still bite — the widening must not have broken dispatch.

At P1 the tree under `tooling/src/` is `_shared/` only, so the diff is small and reviewable; that is deliberate — the widening lands BEFORE any tool does.

### 3.3 Verified NOT coupled (premise-narrowings, receipts)

- `package-layout` gate: scans `packages/{kit,contracts,client,db,ui}` only (`package-layout.ts:11-17`) — `tooling/` never enters it; `tooling-slot-template` (§4.1) is its tooling-tree counterpart.
- Stryker: the sandbox patch discovers workspace symlinks generically by realpath (patch hunk `linkNodeModulesEntries`) — no package enumeration to extend; configs need zero edits (watch-out recorded in §3.1).
- tool-guard: no path-pattern coupling (§3.1 row).
- eslint: `lint:eslint` (`package.json:61`) never covered `scripts/`; tooling stays outside it (§7 row 9).
- `jscpd.json`: excludes tooling by its own comment's scope ("product code only"; `jscpd.json:2` already anticipates a `tools/` tree).

## 4. Enforcement (P1, before any tool moves — born compliant)

All five gates follow GATE-AUTHORING in full: descriptor + ≥1 `mustFlag`/`mustPass` each with a `why`, Core-Enforcement-Active-Gates row + count-line bump (cite the count line, never restate the number — the `enforcement-registry-parity` one-home arm), a `__g_` fixture in `check-gates.int` or an `UNFIXTURABLE_GATES` row, and a REAL planted violation probed before trust. Live violations found at any landing are FIXED in that lane (owner law); no debt baselines are minted for this program.

### 4.1 `tooling-slot-template`

- fsBacked, whole-project, comment-SAFE (fs shape, reads no file text). `scanRoot`/scan unit: the `tooling/src/` directory tree.
- REDs: a top-level entry that is a loose file (not a dir); a tool dir missing `cli.ts` or `index.ts`; a tool-root entry outside `{cli.ts, index.ts, contract/, ops/, lib/}`; `_shared/` is exempt from the tool shape (it is flat modules + `index.ts`).
- Typed exemption table `BASH_FRONTED_TOOLS: Record<string, ExemptionRow>` (`stack` at mint: its `.sh` entrypoints sit at the tool root; `cli.ts` not required while the entrypoint is bash). Two-sided: a row naming a dir that no longer exists, or one that grew a `cli.ts`, is RED (stale arm, anchored on `tooling/src/_shared/exit-contract.ts` as the real-tree anchor).
- mustFlag sketch: `tooling/src/badtool/stray.ts` present, no `cli.ts`/`index.ts` → "missing front door" + "stray root file". mustPass: a conforming five-slot dir; `_shared/` flat modules.
- Fixture: `__g_` plantable (a throwaway `tooling/src/__g_badtool/` dir).

### 4.2 `tooling-front-door`

- incremental-safe, `kinds: [ImportDeclaration]`, comment-SAFE. scanRoot: `(p) => p.startsWith("tooling/src/")`.
- REDs: an import in `tooling/src/<a>/**` whose specifier resolves into sibling `<b>`'s internals — anything other than `#<b>` / `../<b>/index.ts`. `_shared` is a legal target via its index only. `cli.ts` may import only its own tool's `index.ts` (+ `_shared`) — the cli consumes the programmatic API it fronts.
- Two layers on purpose (not two homes): this gate is the LANE-SPEED arm (scoped `check:structure` sees a changed file); the §4.6 cruiser stanzas are the whole-graph resolved-edge backstop the same way `domain-sibling-front-door` backstops the domain template. The gate matches specifier SHAPE; the cruiser proves resolution.
- mustFlag: `import { x } from "../snap/ops/capture.ts"` from another tool. mustPass: `#snap`; `../_shared/index.ts`; own-tool relative internals.
- Fixture: `__g_` plantable (two planted sibling dirs).

### 4.3 `tooling-size`

- incremental-safe, `visitFile` line count, comments-INTENDED posture note (counts comment lines, like `component-size`). scanRoot: `tooling/src/`.
- REDs: any file >450 lines (the `component-size` default, `component-size.ts:13`); any `cli.ts` >200. Declared carve with its own mustPass row: `tooling/src/verify/gates/**` is cap-EXEMPT after P6 (gate files are contract-headed single-purpose modules already capped socially at \~900 — `open-json-column-key-parity.ts` is 883 — and splitting a gate is worse than a long one; the exemption is a scanRoot clause, reviewed under the §3 complex-predicate rule, and its `why` names the largest-gate receipt).
- This is the gate that decomposes snap (P2: 4,513 → ops/), ast (P4: 6,241), codemod-kit (P4: 3,385), work-item/catalog/design-audit (P3/P5). It exists BEFORE they move, so a monolith cannot land un-split — the born-compliant mechanism is ordering, not a ratchet.
- mustFlag: a 451-line planted file; a 201-line `cli.ts`. mustPass: a 450-line file; a gates-dir file over cap.
- Fixture: `__g_` plantable.

### 4.4 `tooling-shared-plumbing`

- incremental-safe, `kinds: [CallExpression, NewExpression]`, comment-SAFE (node kinds + `ast-read` value reads — never a text regex). scanRoot: `tooling/src/` excluding `_shared/`.
- REDs, one arm each: a `*.launch(` reaching playwright outside `_shared/browser.ts`; a `new Project(` (ts-morph) outside `_shared/ts-workspace.ts`; an artifact-dir respell (`mkdir` into a `reports/`-joined path) outside `_shared/artifacts.ts`. Each arm's `why` cites the respelled-definition census that motivated the program.
- mustFlag: one per arm. mustPass: the `_shared` homes themselves (scanRoot-excluded is NOT the mechanism — scan-and-allowlist beats scanRoot-exclusion per GATE-AUTHORING §4; the homes are SCANNED and carried as cited allowlist rows with a rename tripwire, so a moved home goes RED at its new path).
- Fixture: `__g_` plantable.

### 4.5 `tooling-instrument-proof`

- fsBacked, whole-project. Keys off a LIVE registry, not a path list: `_shared/instruments.ts` exports `INSTRUMENT_TOOLS` (`as const` tuple; at mint: `snap`, `ui-audit`, `motion-audit`, `cpu-profile`, `render-trace`, `wire-tap` — the tools whose output is a VERDICT about the app, where a blind zero reads as a pass). The gate READS the tuple through `ast-read.ts` unwrapping (the `as-const-satisfies` ts-morph blindness is a known trap; a planted control proves the read is live) and REDs an empty derivation (§4.6 blindness tripwire).
- REDs: a registry member whose `tests/tooling/<tool>/` mirror tree contains ZERO files carrying the `// @instrument-proof: <what is planted and what must red>` marker (grammar `marker:\s*\S`, reason required); a marker in a NON-member's tree (two-sided vocabulary — an unregistered "proof" is either a lie or a missing registry row); a member naming a tool dir that does not exist (rename tripwire).
- The marker names the PLANT because the proof contract is behavioral: the test must construct the defect class the instrument exists to catch (a planted dead class, a planted stutter, a planted contrast failure) and assert the instrument REDs on it — a mustFlag/mustPass discipline extended to instruments. The P8 CT suite satisfies the client-sensor half; each promoted instrument tool satisfies its own at its move phase.
- `wire-tap` (incident-instrument class, orchestrator note: proof is SMOKE-form, never continuous CI against the dev stack) satisfies the gate uniformly rather than through a second tier: its marker-carrying CI test plants a LOOPBACK fixture server emitting scripted SSE frames (the `sdk-hook-wire-probe.ts:10-13` capture-server idiom) and asserts the tap reports exactly the planted frames — a planted-positive with no stack dependency. The connect/attach smoke against the real dev stack is P3's done-bar RECEIPT, not a committed test. Stated refinement, not a deviation: the gate stays one-armed and the CI never touches the stack.
- Fixture: `__g_` plantable for the stale arm (a marker planted in a non-member `__g_` tree); the membership arm reads the real registry → the `check-gates.int` fixture drives the stale arm, and the membership arm's proof is the P2/P3 landing itself plus its `mustFlag` mini-project (registry + empty test tree materialized fsBacked).

### 4.6 dep-cruiser stanzas (`.dependency-cruiser.cjs`, P1)

Requires the cruise-scope widening (`depcruise packages tooling`, §3.1) or the stanzas are unfireable-by-construction — the config's own NOTE at `:219-221` bans exactly that shape.

1. `packages-no-tooling` — `from: ^packages/`, `to: ^tooling/`, error. The belt over the resolver physics (no package declares the dep, so the import cannot resolve — this stanza is the deep-relative-escape backstop, same posture as `ui-cake` `:159`).
2. `tooling-internal-direction` — `ops/` may import `{lib,contract,_shared}` + its own tool's modules; `cli.ts` imports only its own `index.ts` + `_shared`; nothing imports a sibling tool's `ops|lib|contract` directly (front-door capture-group rule, the `client-features-no-cross`/`domain-sibling-front-door` idiom, `:137-145`/`:440-449`). Type-only NOT exempt for the cross-tool front-door arm (the domain-sibling precedent: the front-door law is a shape rule).
3. `tooling-shared-floor` — `_shared/` reaches UP to no tool dir (the `foundation-reaches-up-to-nothing` mirror, `:352-358`).

Coupled: `tests/tooling/dependency-cruiser.int.test.ts` gains a `__dc` pin per stanza (planted violation cruises red), and its fixture prune widens to the tooling root (§3.1).

### 4.7 `test-layout` extension (the tooling mirror)

Today `tests/tooling/` is blanket-exempt (`test-layout.ts:45-48`). Extension: when a test path is `tests/tooling/<dir>/…` AND `tooling/src/<dir>/` exists on the tree, the mirror rule applies — `tests/tooling/<tool>/<path>.<kind>` must prefix-swap to `tooling/src/<tool>/<path>.ts` (file or dir-index, reusing `srcExistsFor`), with the existing `.suite.*` exemptions. Flat files directly under `tests/tooling/` and dirs NOT matching a `tooling/src/` dir stay exempt (they test root configs, the guard, and research-zone scripts). This makes the extension bite tool-by-tool as each move lands, and each move phase relocates its tool's flat legacy tests into the mirror (e.g. P2: `snap-cli.test.ts` → `tests/tooling/snap/cli.test.ts`). mustFlag: a `tests/tooling/<planted-tool>/ghost.test.ts` with the src dir present but no `ghost.ts`. mustPass: the mirror hit; a flat root file.

Endgame residents of the flat tier: `tool-guard.int.test.ts` (subject is `.claude/hooks/*.mjs`), `issue-form-guidance-integrity.test.ts` (subject is `.github/`), `dependency-cruiser.int.test.ts` (subject is the root config), `smoke.test.ts`.

### 4.8 `test-fixture-imports` extension (the tool-fixtures door)

The gate already covers `tests/tooling` (its own mustFlag sits there, `test-fixture-imports.ts:46-51`). New arm: within `tests/tooling/**`, an import of `test`/`it`/`expect` from `support/fixtures` (specifier suffix match) is RED with its own message — the tooling door is `support/tool-fixtures`. WHY this is load-bearing and not ceremony: the RESULT snapshot serializer registers via tool-fixtures (§5.3); a tooling test entering through plain fixtures silently writes UNNORMALIZED inline snapshots, which is a drift bomb every later normalization invalidates. Since `toolTest` extends the house test (§5.1), the single door costs nothing. mustFlag: `import { test } from "../support/fixtures.ts"` at a tooling path. mustPass: the same import at a `tests/server/` path (unchanged law); `tool-fixtures` at a tooling path.

## 5. Test infrastructure (P1 — the hurts-to-retrofit set)

### 5.1 `tests/support/tool-fixtures.ts` — the composed `toolTest`

Extends the HOUSE composed test (`export const test = houseTest.extend<ToolFixtures>(…)` over `tests/support/fixtures.ts`) so tooling tests keep `clock`/`ids`/`db`/`app`/callers when they need them, and follows the house authoring laws: `({}, use)` idiom, heavy modules dynamic-imported inside fixture bodies, matchers by side-effect through the fixtures barrel.

```ts
interface ToolFixtures {
  repoRoot: string;                       // the ONE root resolution (kills the per-file ROOT respell)
  scratch: string;                        // mkdtemp dir, auto-rm after use (kills manual-cleanup)
  runCli: (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;
  fakeBin: (name: string, script: string) => Promise<void>;   // temp executable + PATH prepend, auto-restored
  plantedTree: (files: Readonly<Record<string, string>>) => Promise<string>; // materialize under scratch
}
interface CliResult { code: number; stdout: string; stderr: string; }
interface RunCliOpts { cwd?: string; env?: Readonly<Record<string, string>>; timeoutMs?: number; }
```

- `runCli` takes the TOOL NAME and derives `tooling/src/<tool>/cli.ts` (one derivation; tests stop carrying path literals, so later moves stop sweeping tests — the §3.1 path-literal class dies here). Spawns `process.execPath`, utf8, default timeout, returns the typed result honoring `_shared/exit-contract.ts`. A nonexistent tool name throws with the roster listed (fail-loud, not a spawn ENOENT).
- `fakeBin` generalizes the fake-`gh` shim (`work-item-cli.test.ts:64+`): writes an executable into a per-test bin dir, prepends it to PATH for the fixture's scope, restores after `use`.
- `plantedTree` is the conformance harness's materialize-into-temp pattern exposed as a fixture: new fsBacked tool tests plant violation trees in `scratch`, NEVER in the real tree — `__g_` stays reserved for the gate-harness class (`check-gates.int` and its sentinel space are unchanged).

### 5.2 The `toExitWith` matcher

Contract: `expect(cliResult).toExitWith(code)` — passes iff `received.code === code`; on mismatch the message prints the expected/actual codes WITH the exit contract's name for each (`1 (violations)`) and bounded tails of stdout+stderr (the diff-beats-generic-assertion bar; a bare `expect(res.code).toBe(0)` failure prints `1 ≠ 0` and nothing else, which is why the class exists).

Home: `tests/support/matchers.ts` — a stated DEVIATION from the plan's "registered from tool-fixtures.ts" letter, on the one-home law: matchers.ts is THE matcher module (its header carries the cap census "hard cap 5; 2 used", `matchers.ts:1-9`), it is runtime-light (this matcher needs zero imports), and it registers through the existing side-effect chain every test already loads. The header's count line updates to 3-of-5 in the same edit. Type augmentation rides the existing `declare module "vitest"` block.

### 5.3 The RESULT snapshot serializer (registered from day one)

Registered in `tool-fixtures.ts` via `expect.addSnapshotSerializer` (side-effect on import — which is what makes §4.8's single-door arm load-bearing). Scope: only files importing tool-fixtures get it; no other suite's snapshots change. House style stays INLINE snapshots (`toMatchInlineSnapshot` — the sole existing usage is `tests/server/…/build-argv.test.ts`); no file snapshots.

Normalization rules — non-deterministic atoms ONLY (over-normalization hides regressions; each rule exists because the raw form breaks snapshot determinism):

| matches | becomes | why |
| - | - | - |
| the absolute repo root prefix | `<root>` | worktrees and checkouts differ |
| `/tmp/**` scratch/mkdtemp paths | `<scratch>` | per-run dirs |
| ISO-8601 timestamps + epoch-ms literals | `<ts>` | clock |
| `pid=<n>` / standalone pid fields | `<pid>` | process identity |
| `<n>ms` duration atoms in RESULT lines | `<ms>` | wall clock |

The serializer's `test()` predicate admits only strings carrying one of those atoms or the `RESULT <tool> ` line shape (`_shared/artifacts.ts` convention, ex-`result.ts:1-4`) — everything else serializes untouched. The serializer ships with its OWN unit test proving each rule and a planted NEGATIVE (a deterministic string passing through byte-identical).

### 5.4 `.test-d.ts` + serial routing

- Every promoted tool's `contract/` ships `tests/tooling/<tool>/contract/index.test-d.ts` at its move (the `types` vitest project already globs `tests/**/*.test-d.ts`, `vitest.config.ts:195` — zero config).
- SERIAL\_INT rows follow their files at each move (§3.1); NEW tool tests default to `plantedTree`-in-scratch (parallel-safe) and earn a SERIAL\_INT row only under the config's own admission rules (`vitest.config.ts:26-38`). The standing hazard stays: `check-gates.int` is not concurrency-safe with itself.

## 6. Phases and done-bars

One forge lane, one commit per phase; the orchestrator merges + runs the whole-tree `pnpm check` between phases. Every phase's floor: biome on touched files; `node scripts/ts7.cjs --noEmit -p tooling/tsconfig.json` AND `pnpm typecheck:graph` (both programs — per-package is blind to `tests/`); `pnpm check:structure`; `npx depcruise packages tooling --config .dependency-cruiser.cjs` (file moves change the graph); whole-tree `npx knip --cache` (last-importer moves); the moved tool's own suites by path; the per-phase PATH SWEEP: `rg -n '<old path>'` across `package.json`, configs, `tests/`, `docs/` (incl. `docs/catalog/receipts/`), proving zero references to the old home. A phase that moves a shared VALUE additionally runs the suites that assert the literal.

| phase | scope | done-bar beyond the floor |
| - | - | - |
| P0 | this document | owner review; STOP |
| P1 | workspace glob · package.json · tsconfig · `_shared/` (browser, ts-workspace MOVED + widened, artifacts+result merge, argv, proc, log, exit-contract, instruments registry) · all 5 gates + 3 cruiser stanzas + both gate extensions · tool-fixtures + toExitWith + serializer | §3.2 widening protocol receipts (before/after scanned diff + two planted controls); each gate probed with a REAL planted violation; conformance + `check-gates.int` + `gate-ignore-grammar.int` green; a stryker gate-config smoke run proving the 7th workspace package sandboxes (§3.3); serializer unit test incl. the negative control |
| P2 | PILOT: snap → five slots under the caps; tests → `tests/tooling/snap/` mirror; every snap path reference updated | OUTPUT: §9 filled — the coupled-site playbook (ordered checklist with the exact sweeps, the classes hit, and any class this design missed); `pnpm snap` proven live against the stage; the snap instrument-proof marker satisfied |
| P3 | ui-audit · motion-audit · cpu-profile · render-trace (3 ops) · wire-tap (sse modernization + the two net-new ops; `sse-tap` alias repointed) · the `record.ts` promotion decision executed | playbook replayed; instrument-proof markers for all five; wire-tap's dev-stack connect/attach smoke receipt (§4.5); the node-26 `EventSource` global verified before the re-exec trim lands |
| P4 | ast + codemod; loader consolidation onto `_shared/ts-workspace.ts` (the ast/codemod-kit `new Project` sites die; `tooling-shared-plumbing` proves it) | `pnpm ast` cold-run parity spot-check (same refs/callers output pre/post on a pinned query); the 6 `check:*` lens aliases repointed and run once each |
| P5 | workboard · doc-catalog · agent-sync · seed · stack · model-ab | `registry.ts:308` argv edit; `pnpm work:item --help`, `pnpm check:docs`, `pnpm check:doc-catalog`, `pnpm agents:sync --check`, a stack start-fg smoke — each run once, cold |
| P6 | verify/check + the whole gate corpus + GATE-AUTHORING.md | the §9 playbook plus GATE-AUTHORING §9's rename sweep over the corpus (old basenames AND `\/`-escaped spellings); `finding-overload-provenance.baseline.json` keys hand-edited; lefthook prose cite; `pnpm check` + `pnpm verify --list` byte-compared against pre-move output; every `UNFIXTURABLE_GATES` + `DORMANT_GATES` row re-verified |
| P7 | one-definition merges + down-migrations: dead-CSS tokenizer → `kit` (receipts §2.8); accname engine → ui lib beside its list-row authority; ONE LoAF observer feeding both channels; trpc/bus devlog merge (lowest priority) | each merge is a shared-value change: run BOTH consumers' suites + the repo-wide literal grep; kit additions pass `kit-purity` (isomorphic proof) |
| P8 | instrument-proof CT suite for the client sensors: planted stutter (\[drop] + its re-arm), planted dead class (\[css]), planted long task (\[frame]), planted unreserved box (\[space]), planted CLS | every proof REDs on its planted regression (red-first receipts); CT files named by path in the report |
| P9 | law docs: Core-0 tooling-tree section · constitution §7 index rows · `scripts/` README declaring the research zone (incl. §2.7's classification + the (d) flag-for-delete list for the owner) · the ruled `useless-fragments.ts` delete · doc-cite sweep | `pnpm check:docs` + `check:doc-catalog` green; `dangling-refs` green; the §2.7(d) owner ruling requested via the orchestrator |

## 7. Considered-rejected (recorded so nobody relitigates)

| alternative | rejected because |
| - | - |
| per-tool packages | owner veto: N manifests/tsconfigs/exports for zero physics gained — the ONE package's exports map + gates give the same front-door law |
| `bin` entries | owner veto: install-relink footgun; pnpm root scripts are the front door |
| `tooling` inside `packages/` | every `packages/*` glob and cake gate would need a carve; the root tree keeps "above the cake" legible from the path (§2.1) |
| a task runner (turbo/nx) | nothing builds — tsc is a noEmit oracle and node runs source; a build graph would govern zero artifacts |
| a bench lane | zero bench usage on the tree; instrument self-cost is guarded by the instrument-proof suite + cpu-profile attribution; revisit on a measured need |
| `setupFiles` for matcher/serializer registration | the house registers by side-effect through the composed test (`fixtures.ts:47-48`); a second registration mechanism is a two-homes violation |
| `toExitWith` in a separate tool-matchers module | matchers.ts is the ONE matcher home with the cap census in its header (§5.2 deviation note) |
| a `"."` root export for `@orb/tooling` | an aggregate barrel chain-loads every tool's heavy graph (§2.2) |
| extending eslint to `tooling/` | eslint's repo role is react/tsdoc gates on the typed public API surface; tools ship no public API; biome + the five gates own tooling. Revisit if tooling grows exported TSDoc surfaces |
| compat re-export stubs during the move window | owner ruling: nothing else runs; clean cuts (§1) |
| blanket-copying `scripts/**`'s biome relaxations to `tooling/**` | born-compliant means each relaxation is re-justified; only `noConsole` transfers (§3.1) |
| a `no-useless-fragment` gate to replace `useless-fragments.ts` | measured (orchestrator, 4-shape planted probe 2026-08-21): biome's `noUselessFragments` is already on at error (`biome.json:90`) and covers element-NESTED fragments; the script's residual return-position single-child cases are style-tier — GATE-AUTHORING §10 bans mirroring an enabled native rule and gating a non-invariant. The script deletes at P9 with no successor |

## 8. Open items — resolved on the tree

### 8.1 `@orb/x`

Not an import. The single occurrence is a VIRTUAL specifier inside a conformance-fixture string: `scripts/check/gates/no-form-reset-in-autosave.ts:142` (`'import { createAutosaveEntityForm } from "@orb/x";\n…'` — mustFlag example source for an in-memory mini-project). No dependency, no action. Corollary recorded: any import census over the gate corpus must exclude example-string literals, or it reports fixture fiction as dependencies — which is exactly how this row and §8.2's entered the program's premise set.

### 8.2 The `@orb/client` imports

All three are the same fixture-string artifact: `scripts/check/gates/test-presence-client.ts:268,283,337` (conformance examples importing `@orb/client/state` in virtual files). Absence of REAL client imports proven two ways: ast-grep import patterns over `scripts/` — 0 matches at `scannedFileCount=330` with a positive control (`@orb/db` pattern matches `seed-demo.ts:48`, `seed-chat.ts:40`) — plus an exhaustive literal grep of `@orb/client` (16 occurrences, each classified: comments, a `pnpm --filter` spawn arg at `stack-prod.ts:314`, a tsconfig-list entry at `tests-type-membership.ts:23`, and the three fixture strings). Consequence: no `@orb/client` dep, no `__orb`-bridge replacement work, and the plan's census row is corrected here. The real per-package import counts on today's tree: db 127 · kit 50 · server 44 · contracts 39 · ui 24 (of which the only REAL ui import is `design-audit-checks.ts:16`; the rest are gate fixture strings — the dep stays for that one live consumer).

## 9. The coupled-site playbook (P2 OUTPUT — reserved)

Filled at pilot close: the ordered move checklist P3-P6 replay, with the exact sweep commands, the §3 classes each move hit, and any class this design missed (a missed class amends §3 in the same commit).
