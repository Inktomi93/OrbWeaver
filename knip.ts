import type { KnipConfig } from "knip";

// knip — the dead-code/dead-export/dead-dependency authority (flipped on 2026-07-13; the
// dep-cruiser no-orphans warn is the cheap in-graph tripwire, THIS is the deep scan).
//
// Posture: maximal. Every issue type on, config hints are errors, member-level analysis on.
// `entry!`/`project!` (production markers) make `pnpm knip:prod` the SHIPPABLE-ONLY view:
// anything reported there but not in the default run is alive purely via tests/tooling —
// the "kept alive by a test" rot lens, mechanized.
//
// Deliberate-API escape hatch: tag an export `/** @public */` and it is exempt from unused-
// export reporting (tags below) — the honest way to keep a real public surface, instead of
// ignores nobody re-audits.
const config = {
  tags: ["-@public"],
  // The trailing ! applies only in production mode: tooling stays fully checked by the default run,
  // while developer tools must not keep application exports alive in the shippable-only view.
  ignoreWorkspaces: ["tooling!"],
  treatConfigHintsAsErrors: true,
  rules: {
    files: "error",
    dependencies: "error",
    devDependencies: "error",
    optionalPeerDependencies: "error",
    unlisted: "error",
    binaries: "error",
    unresolved: "error",
    exports: "error",
    types: "error",
    nsExports: "error",
    nsTypes: "error",
    duplicates: "error",
    enumMembers: "error",
    namespaceMembers: "error",
    catalog: "error",
    // CYCLES HAVE THREE GATES AND ONE AUTHORITY OF RECORD (#1332). dep-cruiser's recommended-strict
    // `no-circular` is the gate and the place an exemption is granted (it has a rule-level `pathNot` seam);
    // knip's view is the report twin, hence `warn`. The THIRD is biome's `suspicious/noImportCycles`
    // ("error", repo-wide, no per-rule exemption seam at all — the only escape would be a banned
    // `biome-ignore`), and it is WIDER than either: `pnpm depcruise` scans `packages tooling` only, so biome
    // is the only cycle gate over `tests/`, `scripts/` and `playwright/`. That is coverage, not a conflict.
    // The note lives HERE and in .dependency-cruiser.cjs's header rather than beside biome's own rule
    // because biome.json cannot carry a comment: measured 2026-09-19 with `biome rage --linter` before and
    // after planting one, a `//` line makes biome 2.5.1 SILENTLY skip the file and load an ancestor config
    // (or its built-ins) with no parse error and exit 0. `json.parser.allowComments` governs the .json files
    // biome LINTS, never its own config loader.
    cycles: "warn",
  },
  workspaces: {
    ".": {
      // Every scripts/ tool is directly runnable (node runs .ts source); gate files were DYNAMICALLY discovered by
      // the check harness loader, so they must be entries or knip calls the whole gate corpus dead.
      // The ST-parity rig's CAPTURED RUNTIME (gitignored, 26k files) sits under scripts/probes/ — the
      // negation is knip's fence. A planted bare .ts proved too weak to test this fence: knip's
      // dependency lens only fires on a file that IMPORTS something (the runtime's own index.d.ts
      // imports csrf-sync), so the fence's probe must plant an import, not an empty file.
      entry: ["scripts/**/*.ts", "!scripts/probes/st-goldens/sillytavern-runtime/**", "playwright/**/*.{ts,tsx}", "tests/support/**/*.{ts,tsx}"],
      project: ["scripts/**/*.ts", "!scripts/probes/st-goldens/sillytavern-runtime/**", "tests/**/*.{ts,tsx}", "playwright/**/*.{ts,tsx}"],
      // The full binary analysis sees these deliberately fake executables in missing-binary and PATH-shim controls.
      ignoreBinaries: ["orb-nonexistent-binary-xyz-123", "orb-fake-probe-bin"],
      // pino-pretty is spawned as a BINARY by tooling/src/stack/dev.sh (the dev-log pretty-pipe), never imported —
      // invisible to import analysis. It's a root devDependency because the dev script lives at the repo root.
      // ts7 (npm:typescript@7) is resolved by PATH STRING in scripts/ts7.cjs (node_modules/ts7/bin/tsc) —
      // invisible to import analysis.
      // @typescript/native (npm:typescript@7) is imported by stryker's typescript-checker itself when
      // experimentalNativePreview is on (its loader imports `@typescript/native/unstable/sync`) — a
      // node_modules-internal consumer knip cannot see. Rides the checker patch + pin set on any bump.
      ignoreDependencies: ["pino-pretty", "ts7", "@typescript/native"],
      // These imports execute inside the captured browser runtime, not against repository-relative modules.
      ignoreUnresolved: ["./scripts/openai.js", "./scripts/extensions.js", "./scripts/tool-calling.js"],
    },
    // @orb/tooling: every tool's cli.ts + index.ts are entries; _shared modules are entries too
    // (research-zone scripts import them by subpath until their tools promote).
    tooling: {
      // The four BASH-SPAWNED entries are invisible to the import graph: `stack` is a bash-fronted tool
      // (Core-Tooling-Law.md §4.1) whose .sh entrypoints exec these by path, so nothing imports them.
      // `stack/ops/start-entry.ts` needs NO row for the opposite reason: the root `start` script names it
      // directly (`node tooling/src/stack/ops/start-entry.ts`), and knip reads package.json scripts — a row
      // for it is a redundant-entry hint, which is an error here.
      // The GATE CORPUS is an entry glob for the same reason one level up: `verify`'s loader IS the registry
      // — it `globSync`s `gates/*.ts` and imports each by URL at runtime (Core-Tooling-Law.md §4.3), so every
      // descriptor is a plugin nothing statically imports. Without this row knip reads all 219 `export const
      // gate` as dead, and drops every helper they alone consume with them.
      entry: [
        "src/*/cli.ts",
        "src/*/index.ts",
        "src/_shared/*.ts",
        "src/verify/gates/*.ts",
        "src/stack/ops/prod-entry.ts",
        "src/stack/ops/engines.ts",
        "src/stack/ops/engines-ctl.ts",
        "src/stack/ops/engines-compose.ts",
        "src/verify/ops/required-live-evidence-reporter.ts",
      ],
      project: ["src/**/*.ts"],
      // The heap arm loads chrome-devtools-mcp's browser-free parser through a version-pinned dynamic
      // subpath held in a constant. Knip cannot resolve that indirection, while the heap suite exercises
      // the installed module and its exact-version compatibility fence.
      ignoreDependencies: ["chrome-devtools-mcp"],
      // The dev engine fleet (`stack/lib/engine-fleet/`, yeeted from the server with the inference program)
      // invokes host executables, not npm binaries.
      ignoreBinaries: ["nvidia-smi", "ss"],
    },
    "packages/kit": { entry: ["src/**/index.ts!"], project: ["src/**/*.ts!"] },
    "packages/contracts": { entry: ["src/**/index.ts!"], project: ["src/**/*.ts!"] },
    "packages/db": { entry: ["src/**/index.ts!"], project: ["src/**/*.ts!"] },
    "packages/inference": { entry: ["src/**/index.ts!"], project: ["src/**/*.ts!"] },
    // @orb/showcase-plugins: the TS surface is one reader module; `bundles/**` is guest .js + content that
    // no import graph reaches by construction (the QuickJS realm has no module loader), so the project glob
    // stays scoped to src/ rather than accusing nine shipped bundles of being dead files.
    // @orb/default-content: same shape as showcase-plugins — one reader module under src/, while
    // `avatars/**` + `demo-chats/**` are shipped BYTES no import graph reaches, so the project glob stays
    // scoped to src/ rather than accusing the content of being dead files.
    "packages/default-content": { entry: ["src/**/index.ts!"], project: ["src/**/*.ts!"] },
    "packages/showcase-plugins": { entry: ["src/**/index.ts!"], project: ["src/**/*.ts!"] },
    "packages/ui": {
      // Entry set = the package.json subpath exports map (knip reads it) + tokens.build.ts, which is
      // auto-detected as an entry via the `tokens:build` package script that runs it.
      //
      // The bare `*.ts` row is the PACKAGE-ROOT devtime trio (`tokens.build.ts` · `token-contract.ts` ·
      // `tokens.near-duplicate.ts`) and it deliberately carries NO `!`: they are node-only build/verify
      // machinery, so they belong to the DEFAULT view (where their `ajv`/`style-dictionary` devDependencies
      // must stay accounted for) and NOT to the production view. Without the row, dropping `./token-contract`
      // from the exports map in #1847 left `token-contract.ts` outside every project glob, and its ajv imports
      // read as unused devDependencies of @orb/ui. `src/**` keeps the `!` — that IS the shipped surface.
      project: ["src/**/*.{ts,tsx}!", "*.ts"],
    },
    "packages/server": {
      // Entry auto-detected from package.json exports (`./*` → src/*/index.ts, covers src/entry/index.ts).
      project: ["src/**/*.ts!"],
    },
    "packages/client": {
      // main.tsx is auto-detected as an entry from index.html's <script type="module"> tag.
      entry: ["index.html"],
      project: ["src/**/*.{ts,tsx}!"],
      // Tailwind v4: the vite plugin (@tailwindcss/vite) requires the bare `tailwindcss` package
      // resolvable at build; nothing imports it directly.
      ignoreDependencies: ["tailwindcss"],
    },
  },
} satisfies KnipConfig;

// biome-ignore lint/style/noDefaultExport: knip's config loader requires the default export.
export default config;
