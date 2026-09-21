// The PERMANENT PIN for the browser-purity lint override (#1312): biome.json's `style/noRestrictedGlobals`
// row over `packages/ui/**` + `packages/client/**`. WHY lint and not types: `types: []` (inherited from
// tsconfig.base.json) only suppresses AUTO-inclusion of `@types/*`; it cannot suppress a triple-slash
// `/// <reference types="node" />` inside a dependency's own `.d.ts` (vite's `dist/node/index.d.ts` in ui;
// pino/undici through `@orb/server`'s AppRouter in client), so both browser programs typecheck `Buffer`,
// `setImmediate`, `require`… clean and would ship a ReferenceError. The row is the ONLY belt, which is why a
// silent drop of it, or of one name, must be RED here rather than shrinking an assertion.
//
// HERMETIC on purpose (house precedent: tests/tooling/verify/gates/biome-grant-liveness.int.test.ts): the
// REAL biome binary runs over a COPY of the REAL biome.json in a mkdtemp root. Planting a node-global file
// under packages/*/src on the real tree would red any concurrent whole-tree biome/knip/tsc pass, and
// `**/__probe*` is gitignored so biome (useIgnoreFile) never sees a probe planted there. The zero on the
// local-binding body rides the SAME invocation as the nine-global body: a bare zero is never a verdict.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { describe } from "vitest";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const CONFIG_REL = "biome.json";
const RULE_CATEGORY = "lint/style/noRestrictedGlobals";
const OVERRIDE_INCLUDES: readonly string[] = ["packages/ui/**", "packages/client/**"];
/** The nine node-only globals the override denies: the CONTRACT, restated rather than read from the config,
 *  so a name silently dropped from biome.json reds here instead of shrinking the assertion. */
const DENIED_GLOBALS: readonly string[] = ["Buffer", "setImmediate", "clearImmediate", "global", "__dirname", "__filename", "require", "module", "exports"];
const NINE_GLOBALS_REL = "src/lib/pin-nine-globals.ts";
const LOCAL_BINDINGS_REL = "src/lib/pin-local-bindings.ts";
const NINE_GLOBALS_BODY = `export const nodeOnly = [${DENIED_GLOBALS.join(", ")}];\n`;
/** `module` and `global` as LOCAL bindings. The rule is scope-aware; this protects the two real files that
 *  declare such locals (`ui-guest.worker.ts`, `databank-library-row.tsx`) from a false positive. */
const LOCAL_BINDINGS_BODY =
  "export function localBindings(): number {\n  const module = { size: 1 };\n  const global = 2;\n  return module.size + global;\n}\n";
/** biome exits 0 (clean) or 1 (diagnostics). Anything else is the tool failing, not a verdict. */
const BIOME_EXIT_CLEAN = 0;
const BIOME_EXIT_DIAGNOSTICS = 1;
/** One biome spawn per arm: 3-12s measured 2026-09-05 under a load-45 co-run. A SPAWN budget, which degrades
 *  with load, so the headroom is generous rather than tuned to one machine. */
const SPAWN_BUDGET_MS = scaledBudget(60_000);
const STDOUT_BUFFER_BYTES = 16_000_000;
const PLANTED_FILE_COUNT = 2;

interface BiomeDiagnostic {
  readonly category?: string;
  readonly message?: string;
  readonly location?: { readonly path?: string };
}

/** biome's `--reporter=json` payload, narrowed to what this pin reads. `summary.unchanged` counts the files
 *  biome actually read (nothing is written), which is the scanned-file receipt behind every zero below. */
interface BiomeReport {
  readonly summary: { readonly unchanged?: number; readonly skipped?: number; readonly diagnosticsNotPrinted?: number };
  readonly diagnostics: readonly BiomeDiagnostic[];
}

interface NoRestrictedGlobalsRow {
  readonly level?: string;
  readonly options?: { readonly deniedGlobals?: Readonly<Record<string, string>> };
}

interface OverrideRow {
  readonly includes?: readonly string[];
  readonly linter?: { readonly rules?: { readonly style?: { readonly noRestrictedGlobals?: NoRestrictedGlobalsRow | string } } };
}

interface BiomeConfig {
  readonly overrides?: readonly OverrideRow[];
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** A git root (biome's `vcs.enabled` needs a repository) carrying the REAL biome.json and the two planted
 *  bodies under `packages/<pkg>/`. */
function seedRoot(scratch: string, repoRoot: string, pkg: string): void {
  plant(scratch, CONFIG_REL, readFileSync(join(repoRoot, CONFIG_REL), "utf8"));
  plant(scratch, join("packages", pkg, NINE_GLOBALS_REL), NINE_GLOBALS_BODY);
  plant(scratch, join("packages", pkg, LOCAL_BINDINGS_REL), LOCAL_BINDINGS_BODY);
  execFixtureGit(scratch, ["init", "-q"]);
  execFixtureGit(scratch, ["add", "-A"]);
}

function checkWithBiome(scratch: string, repoRoot: string, files: readonly string[]): BiomeReport {
  const res = runNicedSync(join(repoRoot, "node_modules", ".bin", "biome"), ["check", ...files, "--reporter=json"], {
    cwd: scratch,
    timeout: SPAWN_BUDGET_MS,
    maxBuffer: STDOUT_BUFFER_BYTES,
  });
  if (res.status !== BIOME_EXIT_CLEAN && res.status !== BIOME_EXIT_DIAGNOSTICS) {
    throw new Error(`biome check did not reach a verdict (status ${String(res.status)}):\n${res.stderr}`);
  }
  return JSON.parse(res.stdout) as BiomeReport;
}

function restrictedGlobalMessages(report: BiomeReport, path: string): readonly string[] {
  return report.diagnostics
    .filter((d) => d.category === RULE_CATEGORY && d.location?.path === path)
    .map((d) => d.message ?? "")
    .sort();
}

const EXPECTED_MESSAGES: readonly string[] = DENIED_GLOBALS.map((name) => `Do not use the global variable ${name}.`).sort();

interface PackagePin {
  readonly report: BiomeReport;
  /** The planted node-global body's path as biome reports it (root-relative). */
  readonly nine: string;
  /** The planted local-binding body's path. */
  readonly locals: string;
}

/** ONE invocation over both planted files: nine firings on the node-global body prove the row reaches this
 *  package, and that same run's zero on the local-binding body is therefore a measurement. */
function pinPackage(scratch: string, repoRoot: string, pkg: string): PackagePin {
  seedRoot(scratch, repoRoot, pkg);
  const nine = join("packages", pkg, NINE_GLOBALS_REL);
  const locals = join("packages", pkg, LOCAL_BINDINGS_REL);
  return { report: checkWithBiome(scratch, repoRoot, [nine, locals]), nine, locals };
}

describe("biome.json browser-purity override (#1312): noRestrictedGlobals over ui + client", () => {
  test(
    "packages/client: each of the nine node globals fires once, and local bindings of the same names do not",
    ({ scratch, repoRoot }) => {
      const { report, nine, locals } = pinPackage(scratch, repoRoot, "client");
      expect(report.summary.unchanged, "files biome actually read").toBe(PLANTED_FILE_COUNT);
      expect(report.summary.skipped ?? 0, "files biome skipped").toBe(0);
      expect(report.summary.diagnosticsNotPrinted ?? 0, "diagnostics the reporter withheld").toBe(0);
      expect(restrictedGlobalMessages(report, nine)).toEqual(EXPECTED_MESSAGES);
      expect(restrictedGlobalMessages(report, locals)).toEqual([]);
    },
    SPAWN_BUDGET_MS,
  );

  test(
    "packages/ui: the second glob is live — the same nine fire, the same locals stay clean",
    ({ scratch, repoRoot }) => {
      const { report, nine, locals } = pinPackage(scratch, repoRoot, "ui");
      expect(report.summary.unchanged, "files biome actually read").toBe(PLANTED_FILE_COUNT);
      expect(report.summary.skipped ?? 0, "files biome skipped").toBe(0);
      expect(report.summary.diagnosticsNotPrinted ?? 0, "diagnostics the reporter withheld").toBe(0);
      expect(restrictedGlobalMessages(report, nine)).toEqual(EXPECTED_MESSAGES);
      expect(restrictedGlobalMessages(report, locals)).toEqual([]);
    },
    SPAWN_BUDGET_MS,
  );

  test("the row itself: exactly the nine names at level error, and every message names the tsc blind spot", ({ repoRoot }) => {
    // biome.json is STRICT JSON (no comments), so JSON.parse is the honest reader.
    const config = JSON.parse(readFileSync(join(repoRoot, CONFIG_REL), "utf8")) as BiomeConfig;
    const row = (config.overrides ?? []).find((o) => OVERRIDE_INCLUDES.every((glob) => o.includes?.includes(glob) ?? false));
    if (row === undefined) {
      throw new Error(`biome.json has no override row whose includes carry ${OVERRIDE_INCLUDES.join(" + ")}`);
    }
    const rule = row.linter?.rules?.style?.noRestrictedGlobals;
    if (rule === undefined || typeof rule === "string") {
      throw new Error(`the ui+client override carries no object noRestrictedGlobals row: ${JSON.stringify(rule)}`);
    }
    expect(rule.level).toBe("error");
    const denied = rule.options?.deniedGlobals ?? {};
    expect(Object.keys(denied).sort()).toEqual([...DENIED_GLOBALS].sort());
    for (const [name, message] of Object.entries(denied)) {
      expect(message, `${name}'s message must say why tsc does not catch it`).toMatch(/tsc/);
    }
  });
});
