import type { KnipConfig, KnipConfiguration } from "knip";

// The resolver owns public doors; Knip owns unused files, symbols and dependencies (D318).
export const config = {
  tags: ["-@public"],
  // The trailing ! applies only in production mode: tooling stays fully checked by the default run,
  // while developer tools must not keep application exports alive in the shippable-only view.
  ignoreWorkspaces: ["tooling!", "tests/support!"],
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
    // Dependency-cruiser blocks cycles; Knip also reports them in its liveness graph.
    cycles: "warn",
  },
  workspaces: {
    ".": {
      "dependency-cruiser": { config: [".dependency-cruiser.ts"] },
      // Operator scripts are direct Node entry points.
      entry: [
        "scripts/**/*.ts",
        "playwright/**/*.{ts,tsx}",
        // The CT Vite transform reads this stylesheet as text rather than through an ESM import.
        "playwright/index.css",
      ],
      project: ["scripts/**/*.ts", "tests/**/*.{ts,tsx}", "playwright/**/*.{ts,tsx,css}"],
      // The full binary analysis sees these deliberately fake executables in missing-binary and PATH-shim controls.
      // mkfifo is the POSIX coreutils binary the orchestrator-inject hook test uses to plant a FIFO transcript path;
      // it is an OS tool, never an npm dependency, so knip has no package to credit it to.
      ignoreBinaries: ["orb-nonexistent-binary-xyz-123", "mkfifo"],
      // pino-pretty is a root devDependency the dev launcher's pretty log rides; its importer is the tooling
      // workspace (tooling/src/dev/ops/dev.ts), which knip credits to that workspace, not to the root.
      // @typescript/native (npm:typescript@7) is resolved by PATH STRING in scripts/typecheck.ts (node_modules/@typescript/native/bin/tsc) —
      // invisible to import analysis.
      // @anthropic-ai/sdk is never imported; it is the peer pin for @anthropic-ai/claude-agent-sdk (pnpm-workspace.yaml).
      // typeid-js is resolved through the root node_modules by fixtures that copy packages/kit/src/ids (testkit-enforcement nativeProgram).
      ignoreDependencies: ["pino-pretty", "@typescript/native", "@anthropic-ai/sdk", "typeid-js"],
    },
    // @orb/testkit: every world module is a package subpath export, so each one is an entry.
    "tests/support": {
      includeEntryExports: true,
      entry: ["{iso,node,browser}/**/*.{ts,tsx}"],
      project: ["{iso,node,browser}/**/*.{ts,tsx}"],
      // Peer pin for @anthropic-ai/claude-agent-sdk (pnpm-workspace.yaml); never imported.
      ignoreDependencies: ["@anthropic-ai/sdk"],
    },
    // @orb/tooling: every tool's cli.ts + index.ts are entries; floor modules are entries too
    // Shared floor modules are exported package entry points.
    tooling: {
      entry: ["src/*/cli.ts", "src/*/index.ts", "src/floor/*/*.ts", "src/snap/lib/budgets.ts"],
      project: ["src/**/*.ts"],
      // The heap arm loads chrome-devtools-mcp's browser-free parser through a version-pinned dynamic
      // subpath held in a constant. Knip cannot resolve that indirection, while the heap suite exercises
      // the installed module and its exact-version compatibility fence.
      ignoreDependencies: ["chrome-devtools-mcp"],
    },
    "packages/kit": { includeEntryExports: true, project: ["src/**/*.ts!"] },
    "packages/contracts": { includeEntryExports: true, project: ["src/**/*.ts!"] },
    "packages/db": { project: ["src/**/*.ts!"] },
    "packages/inference": {
      project: ["src/**/*.ts!"],
      // @ai-sdk/provider is imported 15 times and EVERY import is `import type` (the V4 model/call-option
      // interfaces the three hosted backends implement). knip's production view drops type-only imports, so
      // strict mode reads the package as unused; it is not — dropping it breaks `tsc`, and the catalog pin
      // must additionally satisfy every `@ai-sdk/*` provider package's own dependency on it at install
      // (pnpm-workspace.yaml:201-208). An ignore with this reason, never a package.json edit — and the `!`
      // keeps it PRODUCTION-only, so the default view still accounts for the package normally.
      ignoreDependencies: ["@ai-sdk/provider!"],
    },
    // @orb/showcase-plugins: the imported TS surface is one reader module; `bundles/**` is authored guest TS
    // compiled by @orb/plugin-toolchain and no import graph reaches it by construction (the QuickJS realm has
    // no module loader), so the project glob stays scoped to src/ rather than accusing nine build inputs of
    // being dead files.
    // @orb/default-content: same shape as showcase-plugins — one reader module under src/, while
    // `avatars/**` + `demo-chats/**` are shipped BYTES no import graph reaches, so the project glob stays
    // scoped to src/ rather than accusing the content of being dead files.
    "packages/default-content": { project: ["src/**/*.ts!"] },
    "packages/showcase-plugins": { project: ["src/**/*.ts!"] },
    // Released authoring doors have consumers outside this workspace; internal modules remain checked.
    "packages/plugin-sdk": { includeEntryExports: false, project: ["**/*.ts!"] },
    "packages/plugin-toolchain": { includeEntryExports: false, project: ["src/**/*.ts!"] },
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
      project: ["src/**/*.{ts,tsx,css}!", "*.ts"],
    },
    "packages/server": {
      includeEntryExports: true,
      entry: ["src/entry/index.ts!"],
      // Public entries come from package.json exports.
      // The shipped script entries are added for the production view below (PRODUCTION_SCRIPT_ENTRIES).
      project: ["src/**/*.ts!"],
    },
    "packages/client": {
      // main.tsx is auto-detected as an entry from index.html's <script type="module"> tag.
      entry: ["index.html"],
      project: ["src/**/*.{ts,tsx,css}!"],
      // Tailwind v4: the vite plugin (@tailwindcss/vite) requires the bare `tailwindcss` package
      // resolvable at build; nothing imports it directly.
      ignoreDependencies: ["tailwindcss"],
    },
  },
} satisfies KnipConfig;

// SHIPPED SCRIPT ENTRIES. knip's production view reads only a workspace's `start` script, so a file that
// ships through another script is invisible to it: `check-media.ts` runs on `postinstall` and again in the
// final image (Dockerfile). The default view already sees it through the script, where naming it again is a
// redundant-entry hint, so it is added for production alone.
const PRODUCTION_SCRIPT_ENTRIES = { "packages/server": ["src/entry/check-media.ts!"] } as const;

/** The CLI flags knip hands a function config (`--production`, and `--strict`, which implies it). */
interface KnipModeArgs {
  readonly production?: boolean;
  readonly strict?: boolean;
}

// `KnipConfig` also admits the function form this file's default export takes; the object arm carries workspaces.
type WorkspaceConfig = NonNullable<Exclude<KnipConfig, (...args: never) => unknown>["workspaces"]>[string];

/** knip accepts a pattern list as one string or an array. */
function patternList(patterns: string | readonly string[] | undefined): readonly string[] {
  if (patterns === undefined) {
    return [];
  }
  return typeof patterns === "string" ? [patterns] : patterns;
}

function configFor({ production = false, strict = false }: KnipModeArgs): KnipConfiguration {
  if (!(production || strict)) {
    return config;
  }
  const workspaces: Record<string, WorkspaceConfig> = { ...config.workspaces };
  for (const [name, entries] of Object.entries(PRODUCTION_SCRIPT_ENTRIES)) {
    const workspace = workspaces[name] ?? {};
    workspaces[name] = { ...workspace, entry: [...patternList(workspace.entry), ...entries] };
  }
  return { ...config, tags: [], includeEntryExports: true, workspaces };
}

// knip's config loader requires the default export; biome.json's config-file block admits it for this file.
export default configFor;
