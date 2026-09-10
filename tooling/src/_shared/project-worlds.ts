// Intended worlds are data; compiler membership is owned by verify/lib/policy-program-membership.ts.
import { classifyTestFilename } from "./test-kinds.ts";

export const WORLDS = ["iso", "node", "browser"] as const;
export type World = (typeof WORLDS)[number];

export const HELPER_WORLD_DIRS = {
  iso: "tests/support/iso",
  node: "tests/support/node",
  browser: "tests/support/browser",
} as const satisfies Readonly<Record<World, string>>;

export function isWorldHelperPath(rel: string): boolean {
  return Object.values(HELPER_WORLD_DIRS).some((dir) => rel === dir || rel.startsWith(`${dir}/`));
}

/** Package directory name → the world its `src` is written for. INTENT: kit/contracts are isomorphic (no node,
 *  no dom), db/server/showcase-plugins run under node, ui/client run in the browser. A package absent here has
 *  no world, and `worldOf` says so rather than guessing. */
export const PACKAGE_WORLDS: Readonly<Record<string, World>> = Object.freeze({
  kit: "iso",
  contracts: "iso",
  db: "node",
  server: "node",
  "showcase-plugins": "node",
  ui: "browser",
  client: "browser",
});

/** The packages whose src is browser-world — derived from PACKAGE_WORLDS, never spelled twice. */
export const BROWSER_PACKAGES: ReadonlySet<string> = new Set(
  Object.entries(PACKAGE_WORLDS)
    .filter(([, world]) => world === "browser")
    .map(([name]) => name),
);

/** Browser-context harnesses by nature; temporary client/ui test-directory containment is not intent. */
export const BROWSER_SURFACE_DIRS: readonly string[] = Object.freeze(["tests/e2e", "tests/support/browser", "playwright", "scripts/probes/st-goldens"]);

/** Target owners; an absent program remains visible as migration debt when its first file appears. */
export const TEST_WORLD_PROGRAMS = {
  iso: "tsconfig.tests-iso.json",
  node: "tsconfig.json",
  browser: "tsconfig.tests-dom.json",
} as const satisfies Readonly<Record<World, string>>;

const PKG_SRC_RE = /^packages\/([^/]+)\/src\//u;
const PKG_TOOL_RE = /^packages\/([^/]+)\/[^/]+$/u;
const TEST_SURFACE_RE = /^(?:tests|scripts|playwright)\//u;
const TS_SOURCE_RE = /\.(?:ts|tsx|mts|cts)$/u;
const DECLARATION_RE = /\.d\.(?:ts|mts|cts)$/u;
const NODE_TOOL_RE = /^(?:[^/]+|packages\/[^/]+\/[^/]+|scripts\/[^/]+)\.(?:ts|mts|cts)$/u;

/** Root, package-root, and direct scripts/ TypeScript tools execute under Node regardless of a package's shipped world. */
export const NODE_TOOL_SURFACE_GLOBS = ["*.{ts,mts,cts}", "packages/*/*.{ts,mts,cts}", "scripts/*.{ts,mts,cts}"] as const;

export function isNodeToolSource(rel: string): boolean {
  return NODE_TOOL_RE.test(rel) && !DECLARATION_RE.test(rel) && worldOf(rel) === "node";
}

/** The compiler-membership universe includes declaration files and all authored TypeScript dialects. */
export function isTypeWorldSource(rel: string): boolean {
  return TS_SOURCE_RE.test(rel);
}

/** Intended world by authored home and suffix; declarations without a package home remain unresolved. */
export function worldOf(rel: string): World | undefined {
  if (!isTypeWorldSource(rel)) {
    return;
  }
  const pkg = PKG_SRC_RE.exec(rel)?.[1];
  if (pkg !== undefined) {
    return PACKAGE_WORLDS[pkg];
  }
  if (rel.startsWith("tooling/src/")) {
    return "node";
  }
  for (const world of WORLDS) {
    if (rel.startsWith(`${HELPER_WORLD_DIRS[world]}/`)) {
      return world;
    }
  }
  if (TEST_SURFACE_RE.test(rel)) {
    const testKind = classifyTestFilename(rel);
    if (rel.endsWith(".tsx") || BROWSER_SURFACE_DIRS.some((dir) => rel.startsWith(`${dir}/`))) {
      return "browser";
    }
    return testKind?.definition.compilerWorld ?? "node";
  }
  if (DECLARATION_RE.test(rel)) {
    return;
  }
  const toolPackage = PKG_TOOL_RE.exec(rel)?.[1];
  return !rel.includes("/") || (toolPackage !== undefined && PACKAGE_WORLDS[toolPackage] !== undefined) ? "node" : undefined;
}

/** Required primary compiler owner; package source may also participate in consumer programs. */
export function predictedProgram(rel: string): string | undefined {
  const world = worldOf(rel);
  if (world === undefined) {
    return;
  }
  const pkg = PKG_SRC_RE.exec(rel)?.[1];
  if (pkg !== undefined) {
    return `packages/${pkg}/tsconfig.json`;
  }
  if (rel.startsWith("tooling/src/")) {
    return "tooling/tsconfig.json";
  }
  const toolPackage = PKG_TOOL_RE.exec(rel)?.[1];
  if (toolPackage !== undefined && PACKAGE_WORLDS[toolPackage] === "node") {
    return `packages/${toolPackage}/tsconfig.json`;
  }
  return TEST_WORLD_PROGRAMS[world];
}

/** A test or harness must have one root owner even though its imports can enter other closures. */
export function requiresExclusiveRoot(rel: string): boolean {
  return TEST_SURFACE_RE.test(rel);
}
