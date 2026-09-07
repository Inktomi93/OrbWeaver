// The ONE type-world model (type-worlds program, #1351 phase 0). Two kinds of fact live here and nothing else:
//   • INTENT, hand-authored: which WORLD each package's source belongs to (`PACKAGE_WORLDS`) and which trees of
//     the test surface are browser-context by ruling (`BROWSER_SURFACE_DIRS`). This is the one list the model
//     keeps; every other statement of world membership on the tree is DERIVED from it or from the tsconfigs.
//   • DERIVATION, from the tree: `worldOf(rel)` (package + directory + suffix, the terminal-state rule),
//     `discoverTypePrograms(root)` (every tsconfig that is a real program, found on disk — never a hand list),
//     and `programRootFiles(root, cfg)` (what a config ROOTS, through TypeScript's own config reader).
// Consumers: the routing algebra (`verify/lib/program-routing.ts` derives its browser-package set here), the
// `tests-type-membership` stage (its program list + the actual-vs-predicted report) and the
// `tsconfig-routing-parity` gate (its candidate programs). Phase 5 generates the forced tsconfig parts from
// this same data; phase 6 turns the report's prediction into the verdict. Enforces nothing itself.
import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ts } from "ts-morph";

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
const TS_SOURCE_RE = /\.(?:ts|tsx|mts|cts)$/u;

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

const TSCONFIG_NAME_RE = /^tsconfig(?:\..+)?\.json$/u;
/** TS18003 "No inputs were found" — an EMPTY program is a legitimate answer here (an abstract template), not a
 *  parse failure, so it is the one error code the reader does not treat as fatal. */
const TS_NO_INPUTS_CODE = 18_003;

/** Every tsconfig on the tree that could be a program, found on DISK (never `git ls-files` — a just-planted
 *  config must appear without an edit): the repo root's `tsconfig*.json`, every `packages/<p>/tsconfig.json`,
 *  and `tooling/tsconfig.json`. Order is stable (sorted). */
export function tsconfigCandidates(root: string): readonly string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    if (TSCONFIG_NAME_RE.test(name)) {
      out.push(name);
    }
  }
  const packagesDir = join(root, "packages");
  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(packagesDir, entry.name, "tsconfig.json"))) {
        out.push(`packages/${entry.name}/tsconfig.json`);
      }
    }
  }
  if (existsSync(join(root, "tooling", "tsconfig.json"))) {
    out.push("tooling/tsconfig.json");
  }
  return out.sort((left, right) => left.localeCompare(right));
}

/** The SOURCE files (repo-relative posix, `node_modules` and out-of-root excluded) a config resolves as its
 *  roots, through TypeScript's own config reader (`extends`, `${configDir}`, include/exclude/files — the
 *  compiler's semantics, not a re-implementation). Throws on an unparseable config: a silently-defaulted
 *  program would let every downstream verdict lie. */
export function programRootFiles(root: string, cfg: string): readonly string[] {
  const diagnostics: ts.Diagnostic[] = [];
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      diagnostics.push(diagnostic);
    },
  };
  // The reader reports an unreadable/invalid config through the host callback and returns nothing; a readable
  // one may still carry error diagnostics (a bad `extends` target, an unknown option) — both are fatal here.
  const parsed: ts.ParsedCommandLine | undefined = ts.getParsedCommandLineOfConfigFile(join(root, cfg), undefined, host);
  const unreadable = diagnostics[0];
  if (unreadable !== undefined || parsed === undefined) {
    const text = unreadable === undefined ? "the config reader returned no command line" : ts.flattenDiagnosticMessageText(unreadable.messageText, "\n");
    throw new Error(`tsconfig ${cfg} is unparseable: ${text}`);
  }
  const invalid = parsed.errors.find((error) => error.category === ts.DiagnosticCategory.Error && error.code !== TS_NO_INPUTS_CODE);
  if (invalid !== undefined) {
    throw new Error(`tsconfig ${cfg} is unparseable: ${ts.flattenDiagnosticMessageText(invalid.messageText, "\n")}`);
  }
  const out: string[] = [];
  for (const abs of parsed.fileNames) {
    const rel = relative(root, abs).split(sep).join("/");
    if (rel.startsWith("..") || rel.includes("node_modules/") || !TS_SOURCE_RE.test(rel)) {
      continue;
    }
    out.push(rel);
  }
  return out.sort((left, right) => left.localeCompare(right));
}

/** A config is a PROGRAM when it roots at least one SOURCE file (not only ambient `.d.ts`). The one abstract
 *  template on the tree, `tsconfig.base.json`, resolves nothing but the root ambient pair when invoked directly
 *  (its `${configDir}/src` is meant for extenders), so it falls out by this rule and not by name. */
export function isProgramConfig(root: string, cfg: string): boolean {
  return programRootFiles(root, cfg).some((rel) => !rel.endsWith(".d.ts"));
}

/** Every real type program on the tree — DERIVED, the replacement for every hand-kept `PROGRAMS` /
 *  `CANDIDATE_TSCONFIGS` list. A newly planted tsconfig that roots a source file appears here with no edit. */
export function discoverTypePrograms(root: string): readonly string[] {
  return tsconfigCandidates(root).filter((cfg) => isProgramConfig(root, cfg));
}
