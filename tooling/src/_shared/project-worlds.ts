// Intended worlds are data; compiler membership is owned by verify/lib/policy-program-membership.ts.
export const WORLDS = ["iso", "node", "browser"] as const;
export type World = (typeof WORLDS)[number];

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

/** Trees of the test surface (tests/, scripts/, playwright/) that are browser-context by DIRECTORY: the
 *  browser-subject test trees (#1243), e2e (owner ruling 2026-07-24), the browser helper world (phase 1), the
 *  CT mount, and the st-goldens rig (a browser-driving probe rig, on the e2e precedent). Any `.tsx` anywhere on
 *  that surface is browser by SUFFIX (React under playwright-ct). Everything else on the surface is node. */
export const BROWSER_SURFACE_DIRS: readonly string[] = Object.freeze([
  "tests/client",
  "tests/ui",
  "tests/e2e",
  "tests/support/browser",
  "playwright",
  "scripts/probes/st-goldens",
]);

/** The two programs that root the test surface: the DOM-less node world and the browser-tests world. */
export const NODE_WORLD_PROGRAM = "tsconfig.json";
export const BROWSER_TESTS_PROGRAM = "tsconfig.tests-dom.json";

const PKG_SRC_RE = /^packages\/([^/]+)\/src\//u;
const TEST_SURFACE_RE = /^(?:tests|scripts|playwright)\//u;

/** The world a repo-relative TypeScript file is written for, by package + directory + suffix — or undefined
 *  when the path is outside every world the model knows (a root config file, a package's non-src file). */
export function worldOf(rel: string): World | undefined {
  const pkg = PKG_SRC_RE.exec(rel)?.[1];
  if (pkg !== undefined) {
    return PACKAGE_WORLDS[pkg];
  }
  if (rel.startsWith("tooling/src/")) {
    return "node";
  }
  if (!TEST_SURFACE_RE.test(rel)) {
    return;
  }
  if (rel.endsWith(".tsx") || BROWSER_SURFACE_DIRS.some((dir) => rel.startsWith(`${dir}/`))) {
    return "browser";
  }
  return "node";
}

/** The program the model PREDICTS roots a test-surface file — the prediction the membership report compares
 *  against reality, and (phase 6) the verdict. undefined off the test surface. */
export function predictedTestProgram(rel: string): string | undefined {
  if (!TEST_SURFACE_RE.test(rel)) {
    return;
  }
  return worldOf(rel) === "browser" ? BROWSER_TESTS_PROGRAM : NODE_WORLD_PROGRAM;
}
