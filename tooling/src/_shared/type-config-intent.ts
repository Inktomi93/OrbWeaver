// Authored TypeScript program intent. Native config expansion remains an independent observation.
import type { World } from "./project-worlds.ts";
import { BROWSER_SURFACE_DIRS, HELPER_WORLD_DIRS, PACKAGE_WORLDS, packageWorld, TEST_WORLD_PROGRAMS } from "./project-worlds.ts";
import { TEST_KIND_DEFINITIONS } from "./test-kinds.ts";

export const TYPE_WORLD_TEMPLATE_PATHS = {
  node: "tsconfig.world-node.json",
  browser: "tsconfig.world-browser.json",
} as const satisfies Readonly<Record<Exclude<World, "iso">, string>>;

export const AMBIENT_SCOPES = ["all-programs", "graph-only", "ui-and-browser-tests", "client-source", "browser-tests", "vitest-tests"] as const;
export type AmbientScope = (typeof AMBIENT_SCOPES)[number];

const AMBIENT_INTENT = [
  { path: "reset.d.ts", scope: "all-programs" },
  { path: "platform.d.ts", scope: "all-programs" },
  { path: "aggregator-assets.d.ts", scope: "graph-only" },
  { path: "packages/showcase-plugins/bundles/host-v1.d.ts", scope: "graph-only" },
  { path: "packages/ui/src/markdown/css-modules.d.ts", scope: "ui-and-browser-tests" },
  { path: "packages/client/src/styles/vite-env.d.ts", scope: "client-source" },
  { path: "playwright/globals.d.ts", scope: "browser-tests" },
  { path: "tests/support/vitest-tags.d.ts", scope: "vitest-tests" },
] as const satisfies readonly { readonly path: string; readonly scope: AmbientScope }[];
export const AMBIENT_SCOPE_DEFINITIONS: Readonly<Record<string, AmbientScope>> = Object.fromEntries(AMBIENT_INTENT.map(({ path, scope }) => [path, scope]));

function ambientsWithScope(...scopes: readonly AmbientScope[]): readonly string[] {
  return AMBIENT_INTENT.filter(({ scope }) => scopes.includes(scope)).map(({ path }) => path);
}

export function ambientScopeOf(path: string): AmbientScope | undefined {
  return AMBIENT_SCOPE_DEFINITIONS[path];
}

const PACKAGE_CONFIG_RE = /^packages\/([^/]+)\/tsconfig\.json$/u;

/** Intended world of a runnable config. An unknown config is unresolved intent, never permission inferred
 * from the compiler roots or libraries it happens to carry. */
export function programWorldOf(config: string): World | undefined {
  const packageName = PACKAGE_CONFIG_RE.exec(config)?.[1];
  if (packageName !== undefined) {
    return packageWorld(packageName);
  }
  if (config === "tooling/tsconfig.json") {
    return "node";
  }
  return Object.entries(TEST_WORLD_PROGRAMS).find(([, path]) => path === config)?.[0] as World | undefined;
}

/** Ambient scopes admitted by one concrete program. The generator and membership validator consume this
 * same decision; reference-only containers are filtered by the validator because they own no roots. */
export function ambientScopesForProgram(config: string): readonly AmbientScope[] | undefined {
  const world = programWorldOf(config);
  if (world === undefined) {
    return;
  }
  const scopes: AmbientScope[] = ["all-programs"];
  if (config === TEST_WORLD_PROGRAMS.node) {
    scopes.push("graph-only", "vitest-tests");
  }
  if (config === packageConfigPath("ui") || config === TEST_WORLD_PROGRAMS.browser) {
    scopes.push("ui-and-browser-tests");
  }
  if (config === packageConfigPath("client")) {
    scopes.push("client-source");
  }
  if (config === TEST_WORLD_PROGRAMS.browser) {
    scopes.push("browser-tests", "vitest-tests");
  }
  return scopes;
}

export function ambientRootsForProgram(config: string): readonly string[] | undefined {
  const scopes = ambientScopesForProgram(config);
  return scopes === undefined ? undefined : ambientsWithScope(...scopes);
}

// Every concrete leaf restates these because TypeScript replaces inherited exclude arrays. `__g_*` is
// the transient structural-gate fixture namespace; node_modules is absent from the authored corpus.
export const TYPE_CONFIG_EXCLUDES = ["**/node_modules", "**/__g_*", "**/__g_*/**"] as const;
export const BROWSER_LIB_ADDITIONS = ["dom", "dom.iterable"] as const;

export interface TypeConfigIntentInput {
  readonly packageWorlds: Readonly<Record<string, World>>;
  readonly testKinds: readonly { readonly suffix: string; readonly compilerWorld: World }[];
}

export const TYPE_CONFIG_INTENT_INPUT: TypeConfigIntentInput = {
  packageWorlds: PACKAGE_WORLDS,
  testKinds: TEST_KIND_DEFINITIONS,
};

export function packageConfigPath(packageName: string): string {
  return `packages/${packageName}/tsconfig.json`;
}

export function worldTemplateFor(world: World): string {
  return world === "iso" ? "tsconfig.base.json" : TYPE_WORLD_TEMPLATE_PATHS[world];
}

export function rootTestProgram(world: World): string {
  return TEST_WORLD_PROGRAMS[world];
}

export function browserTestRootPatterns(testKinds: TypeConfigIntentInput["testKinds"]): readonly string[] {
  const suffixes = testKinds.filter(({ compilerWorld }) => compilerWorld === "browser").map(({ suffix }) => suffix);
  return suffixes.filter((suffix) => !suffixes.some((other) => suffix !== other && suffix.endsWith(other))).map((suffix) => `tests/**/*${suffix}`);
}

export function browserSurfaceRootPatterns(): readonly string[] {
  return BROWSER_SURFACE_DIRS.map((dir) => `${dir}/**/*`);
}

export function nodeTestExclusionPatterns(testKinds: TypeConfigIntentInput["testKinds"]): readonly string[] {
  return browserTestRootPatterns(testKinds);
}

export const TEST_HELPER_ROOTS = HELPER_WORLD_DIRS;
