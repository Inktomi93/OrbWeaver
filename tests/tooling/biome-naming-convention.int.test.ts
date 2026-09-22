// `useNamingConvention` ships with a hidden selector matrix, and an override's `options.conventions`
// REPLACES the global array in Biome 2.5.1. This pin keeps every replacement complete: path-specific wire
// key rows come first, followed by the same explicit code-owned matrix carried by the global rule.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const CONFIG_REL = "biome.json";
const NORMAL_FILE = "packages/client/src/__naming-convention-control.ts";
const KEY_OVERRIDE_FILE = "packages/client/src/forms/editor/use-app-form.ts";
const RULE_CATEGORY = "lint/style/useNamingConvention";
const BIOME_EXIT_CLEAN = 0;
const BIOME_EXIT_DIAGNOSTICS = 1;
const SPAWN_BUDGET_MS = scaledBudget(60_000);
const STDOUT_BUFFER_BYTES = 16_000_000;

interface Convention {
  readonly formats?: readonly string[];
  readonly match?: string;
  readonly selector?: { readonly kind?: string; readonly modifiers?: readonly string[]; readonly scope?: string };
}

interface NamingRule {
  readonly level?: string;
  readonly options?: { readonly conventions?: readonly Convention[] };
}

interface BiomeOverride {
  readonly includes?: readonly string[];
  readonly linter?: { readonly rules?: { readonly style?: { readonly useNamingConvention?: NamingRule | string } } };
}

interface BiomeConfig {
  readonly linter?: { readonly rules?: { readonly style?: { readonly useNamingConvention?: NamingRule | string } } };
  readonly overrides?: readonly BiomeOverride[];
}

interface BiomeReport {
  readonly summary: { readonly unchanged?: number; readonly skipped?: number; readonly diagnosticsNotPrinted?: number };
  readonly diagnostics: readonly {
    readonly category?: string;
    readonly location?: { readonly path?: string; readonly start?: { readonly line?: number } };
  }[];
}

function isPathKeyRow(row: Convention): boolean {
  return row.selector?.kind === "objectLiteralProperty" || (row.selector?.kind === "typeProperty" && row.selector.modifiers === undefined);
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function namingReport(scratch: string, repoRoot: string, files: readonly string[] = [NORMAL_FILE, KEY_OVERRIDE_FILE]): BiomeReport {
  const result = runNicedSync(
    join(repoRoot, "node_modules", ".bin", "biome"),
    ["lint", ...files, "--only=style/useNamingConvention", "--reporter=json", "--max-diagnostics=none"],
    { cwd: scratch, timeout: SPAWN_BUDGET_MS, maxBuffer: STDOUT_BUFFER_BYTES },
  );
  if (result.status !== BIOME_EXIT_CLEAN && result.status !== BIOME_EXIT_DIAGNOSTICS) {
    throw new Error(`biome naming probe did not reach a verdict (status ${String(result.status)}):\n${result.stderr}`);
  }
  return JSON.parse(result.stdout) as BiomeReport;
}

test(
  "the explicit matrix judges code identifiers while narrow key overrides preserve wire names",
  ({ scratch, repoRoot }) => {
    plant(scratch, CONFIG_REL, readFileSync(join(repoRoot, CONFIG_REL), "utf8"));
    plant(
      scratch,
      NORMAL_FILE,
      "export const bad_name = 1;\nexport const normal = { snake_key: 1 };\nexport const _trimmedName = 1;\nexport function GET() {}\n",
    );
    plant(
      scratch,
      KEY_OVERRIDE_FILE,
      "export const bad_name = 1;\nexport const wire = { snake_key: 1, PascalKey: 2 };\nexport interface Wire { snake_key: string; PascalKey: string }\n",
    );
    execFixtureGit(scratch, ["init", "-q"]);
    execFixtureGit(scratch, ["add", "-A"]);

    const report = namingReport(scratch, repoRoot);
    expect(report.summary.unchanged, "files biome actually read").toBe(2);
    expect(report.summary.skipped ?? 0, "files biome skipped").toBe(0);
    expect(report.summary.diagnosticsNotPrinted ?? 0, "diagnostics the reporter withheld").toBe(0);
    expect(
      report.diagnostics
        .filter((diagnostic) => diagnostic.category === RULE_CATEGORY)
        .map((diagnostic) => `${diagnostic.location?.path ?? "?"}:${String(diagnostic.location?.start?.line ?? "?")}`)
        .sort(),
    ).toEqual([`${KEY_OVERRIDE_FILE}:1`, `${NORMAL_FILE}:1`, `${NORMAL_FILE}:2`].sort());
  },
  SPAWN_BUDGET_MS,
);

test(
  "an override carries code rules itself: restrictive mutations still flag its local variable while its snake wire key passes",
  ({ scratch, repoRoot }) => {
    const config = JSON.parse(readFileSync(join(repoRoot, CONFIG_REL), "utf8")) as BiomeConfig;
    const globalRule = config.linter?.rules?.style?.useNamingConvention;
    if (typeof globalRule !== "object") {
      throw new Error("global useNamingConvention is not an object rule");
    }
    const globalConventions = globalRule.options?.conventions;
    if (globalConventions === undefined) {
      throw new Error("global useNamingConvention has no explicit conventions");
    }
    // If Biome merged arrays, this camel-only global key row would reject the snake key below. Under its
    // actual replacement semantics the path override owns that key, and its key row comes first.
    (globalConventions as Convention[]).splice(1, 0, {
      selector: { kind: "objectLiteralProperty" },
      formats: ["camelCase"],
    });
    const namingRules = [globalRule, ...(config.overrides ?? []).map((row) => row.linter?.rules?.style?.useNamingConvention)].filter(
      (rule): rule is NamingRule => typeof rule === "object",
    );
    for (const rule of namingRules) {
      const variable = rule.options?.conventions?.find((row) => row.selector?.kind === "variable");
      if (variable !== undefined) {
        (variable as { formats?: readonly string[] }).formats = ["CONSTANT_CASE"];
      }
    }

    plant(scratch, CONFIG_REL, JSON.stringify(config));
    plant(
      scratch,
      KEY_OVERRIDE_FILE,
      "export function probe(): number {\n  const localName = 1;\n  return localName;\n}\nexport const wire = { snake_key: 1 };\n",
    );
    execFixtureGit(scratch, ["init", "-q"]);
    execFixtureGit(scratch, ["add", "-A"]);

    const report = namingReport(scratch, repoRoot, [KEY_OVERRIDE_FILE]);
    expect(report.summary.unchanged, "files biome actually read").toBe(1);
    expect(report.summary.skipped ?? 0, "files biome skipped").toBe(0);
    expect(report.summary.diagnosticsNotPrinted ?? 0, "diagnostics the reporter withheld").toBe(0);
    expect(
      report.diagnostics
        .filter((diagnostic) => diagnostic.category === RULE_CATEGORY)
        .map((diagnostic) => `${diagnostic.location?.path ?? "?"}:${String(diagnostic.location?.start?.line ?? "?")}`),
    ).toEqual([`${KEY_OVERRIDE_FILE}:2`]);
  },
  SPAWN_BUDGET_MS,
);

test("the global and every override spell the complete code matrix with no naming rule-off scopes", ({ repoRoot }) => {
  const config = JSON.parse(readFileSync(join(repoRoot, CONFIG_REL), "utf8")) as BiomeConfig;
  const globalRule = config.linter?.rules?.style?.useNamingConvention;
  expect(typeof globalRule).toBe("object");
  const conventions = typeof globalRule === "object" ? (globalRule.options?.conventions ?? []) : [];
  expect(conventions[0]?.match, "the stock leading/trailing _/$ allowance must stay explicit").toBe("[_$]+|[_$]*(.+?)[_$]*");
  expect(conventions.length, "the selector policy must not fall back to Biome's hidden stock matrix").toBeGreaterThan(10);
  expect(
    conventions
      .filter((row) => ["typeProperty", "typeGetter", "typeMember", "objectLiteralMember"].includes(row.selector?.kind ?? ""))
      .map((row) => ({ selector: row.selector, formats: row.formats })),
    "the global array must explicitly own stock member defaults instead of falling through to Biome's hidden matrix",
  ).toEqual([
    { selector: { kind: "typeProperty", modifiers: ["readonly"] }, formats: ["camelCase", "CONSTANT_CASE"] },
    { selector: { kind: "typeGetter" }, formats: ["camelCase", "CONSTANT_CASE"] },
    { selector: { kind: "typeMember" }, formats: ["camelCase"] },
    { selector: { kind: "objectLiteralMember" }, formats: ["camelCase"] },
  ]);

  const offScopes = (config.overrides ?? []).filter((row) => row.linter?.rules?.style?.useNamingConvention === "off").map((row) => [...(row.includes ?? [])]);
  expect(offScopes).toEqual([]);
  const globalTransforms = conventions.filter((row) => row.selector === undefined);
  const globalCodeRows = conventions.filter((row) => row.selector !== undefined && !isPathKeyRow(row));
  const namingOverrides = (config.overrides ?? []).filter((row) => row.linter?.rules?.style?.useNamingConvention !== undefined);
  expect(namingOverrides).toHaveLength(9);
  for (const override of namingOverrides) {
    const rule = override.linter?.rules?.style?.useNamingConvention;
    expect(typeof rule, `naming override ${JSON.stringify(override.includes)} must be an object rule`).toBe("object");
    const rows = typeof rule === "object" ? (rule.options?.conventions ?? []) : [];
    expect(
      rows.filter((row) => row.selector === undefined),
      `sigil forwarding in ${JSON.stringify(override.includes)}`,
    ).toEqual(globalTransforms);
    expect(
      rows.filter((row) => row.selector !== undefined && !isPathKeyRow(row)),
      `complete code selector matrix in ${JSON.stringify(override.includes)}`,
    ).toEqual(globalCodeRows);
    const firstCodeRow = rows.findIndex((row) => row.selector !== undefined && !isPathKeyRow(row));
    const keyRows = rows.filter(isPathKeyRow);
    expect(keyRows.length, `path-specific key rows in ${JSON.stringify(override.includes)}`).toBeGreaterThan(0);
    expect(rows.findLastIndex(isPathKeyRow), `key rows precede code rows in ${JSON.stringify(override.includes)}`).toBeLessThan(firstCodeRow);
  }
});
