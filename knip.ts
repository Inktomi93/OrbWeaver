// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow knip's type re-export chain (dist/types.d.ts `export type { RawConfigurationOrFn as KnipConfig }`); tsgo resolves it fine — the react-19.2 named-exports precedent.
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
const config: KnipConfig = {
  tags: ["-@public"],
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
    // dep-cruiser's recommended-strict no-circular is the gate; knip's view is the report twin.
    cycles: "warn",
  },
  workspaces: {
    ".": {
      // Every scripts/ tool is directly runnable (tsx); gate files are DYNAMICALLY discovered by
      // the check harness loader, so they must be entries or knip calls the whole gate corpus dead.
      entry: ["scripts/**/*.ts", "playwright/**/*.{ts,tsx}", "tests/support/**/*.{ts,tsx}"],
      project: ["scripts/**/*.ts", "tests/**/*.{ts,tsx}", "playwright/**/*.{ts,tsx}"],
      // verify-run.int.test.ts asserts missing-binary handling with a deliberately fake binary name.
      ignoreBinaries: ["orb-nonexistent-binary-xyz-123"],
    },
    "packages/kit": { entry: ["src/**/index.ts!"], project: ["src/**/*.ts!"] },
    "packages/contracts": { entry: ["src/**/index.ts!"], project: ["src/**/*.ts!"] },
    "packages/db": { entry: ["src/**/index.ts!"], project: ["src/**/*.ts!"] },
    "packages/ui": {
      // Subpath exports map = the real entry set (knip reads package.json exports); tokens.build.ts
      // is the codegen script at the package root (run via the tokens:build package script).
      entry: ["tokens.build.ts"],
      project: ["src/**/*.{ts,tsx}!", "tokens.build.ts"],
    },
    "packages/server": {
      entry: ["src/entry/index.ts!"],
      project: ["src/**/*.ts!"],
      // pino loads its transport by NAME STRING (`target: "pino-pretty"`, foundation logger) —
      // invisible to import analysis. nvidia-smi/ps/ss are system binaries the vllm engine shells.
      ignoreDependencies: ["pino-pretty"],
      ignoreBinaries: ["nvidia-smi", "ps", "ss"],
    },
    "packages/client": {
      entry: ["src/main.tsx!", "index.html"],
      project: ["src/**/*.{ts,tsx}!"],
      // Tailwind v4: the vite plugin (@tailwindcss/vite) requires the bare `tailwindcss` package
      // resolvable at build; nothing imports it directly.
      ignoreDependencies: ["tailwindcss"],
    },
  },
};

// biome-ignore lint/style/noDefaultExport: knip's config loader requires the default export.
export default config;
