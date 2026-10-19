// Native compiler-owner shards isolate HARD authority from ordinary exceptions and cache lifetimes.
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import { compilerConfigRoster } from "../../floor/compiler/compiler-programs.ts";
import { BASE_UI_DATA_RULE, BASE_UI_HANDLER_RULE, BASE_UI_NATIVE_INPUT_PATHS, BASE_UI_STATE_RULE } from "../contract/baseui.ts";
import type { EslintCompletedProfiles, EslintFileAdmission, EslintNativeMetadataFamily as NativeMetadataFamily } from "../contract/config-snapshot.ts";
import { ESLINT_CONFIG_REL as CONFIG_REL, ESLINT_HARD_CONFIG_REL as HARD_CONFIG_REL } from "../contract/config-snapshot.ts";
import { POPULATION_ROOTS } from "../contract/population.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";
import { affectsBaseUiLint, surfaceManifestFrom } from "../lib/baseui-manifest.ts";
import { affectsClientLexicalNativeLint, CLIENT_LEXICAL_NATIVE_INPUT_PATHS, CLIENT_LEXICAL_NATIVE_RULES } from "../lib/client-lexical-native.ts";
import { affectsClientMapNativeLint, CLIENT_MAP_NATIVE_INPUT_PATHS, CLIENT_MAP_NATIVE_RULE } from "../lib/client-map-native.ts";
import { DISCOVERY_MAX_BUFFER_BYTES, readAdmittedEslintPopulation, readDiscoveredPopulation, readTypedEslintAdmissions } from "../lib/config-snapshot.ts";
import { affectsContextNativeLint, CONTEXT_NATIVE_INPUT_PATHS, CONTEXT_NATIVE_RULES } from "../lib/context-definition-shape.ts";
import { readPolicyRepositoryInventory } from "../lib/policy-repo-inventory.ts";
import {
  affectsSourceTypeSuppressionNativeLint,
  SOURCE_TYPE_SUPPRESSION_GLOBS,
  SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS,
  SOURCE_TYPE_SUPPRESSION_RULE,
} from "../lib/source-type-suppression-native.ts";
import {
  affectsTestToolingImportsNativeLint,
  TEST_TOOLING_IMPORT_NATIVE_FAMILIES,
  TEST_TOOLING_IMPORT_NATIVE_INPUT_PATHS,
} from "../lib/test-tooling-imports-native.ts";
import {
  affectsTypedNativeLint,
  affectsTypedNativePolicy,
  TYPED_NATIVE_POLICIES,
  typedNativeCompilerConfigs,
  typedNativeDependencyInputs,
  typedNativeDependencySignal,
  typedNativeMetadataSelection,
  validateTypedCompilerInputs,
} from "../lib/typed-native-inputs.ts";
import { readEslintFileAdmissions } from "./config-snapshot.ts";
import { hasCompletedProfiles, runProfiles } from "./eslint-profile.ts";

refuseDirectInvocation(import.meta.url, "pnpm lint:eslint");

/** Cross-check native discovery against effective ConfigArray admission. */
function admittedPopulation(root: string, patterns: readonly string[]): Promise<readonly EslintFileAdmission[]> {
  return readAdmittedEslintPopulation(root, CONFIG_REL, readDiscoveredPopulation(root, DISCOVERY_MAX_BUFFER_BYTES, patterns));
}

export async function runEslint(root: string): Promise<number> {
  return runProfiles(root, await admittedPopulation(root, []), "");
}

export const ESLINT_SCOPED_USAGE =
  "usage: node tooling/src/verify/cli.ts eslint-scoped <paths…>\n  Lints the named files or directories in sequential native compiler-owner processes, one TypeScript program per process. A path ESLint ignores is skipped.";

export async function runScopedEslint(root: string, paths: readonly string[]): Promise<number> {
  const flag = paths.find((path) => path.startsWith("-"));
  if (flag !== undefined) {
    throw new UsageError(`eslint-scoped takes paths only — got ${JSON.stringify(flag)}\n${ESLINT_SCOPED_USAGE}`);
  }
  if (paths.length === 0) {
    throw new UsageError(`eslint-scoped needs at least one path\n${ESLINT_SCOPED_USAGE}`);
  }
  const populations = new Map<string, ReturnType<typeof admittedPopulation>>();
  const observe: typeof admittedPopulation = (directory, patterns) => {
    const key = JSON.stringify([directory, patterns]);
    let population = populations.get(key);
    if (population === undefined) {
      population = admittedPopulation(directory, patterns);
      populations.set(key, population);
    }
    return population;
  };
  const completed = new Map<string, EslintCompletedProfiles>();
  const sources = paths.filter((path) => !isNativeInput(path) || (/\.[cm]?[jt]sx?$/u.test(path) && existsSync(resolve(root, path))));
  // The named targets lint first and alone; dependency-wide findings follow under their own banner.
  const named = sources.length === 0 ? EXIT.clean : await lintNamedSources(root, sources, observe, completed);
  // A named tool error still runs the metadata families: their refusal names the missing compiler owner.
  return Math.max(named, await recheckScopedNativeMetadata(root, paths, observe, completed));
}

function isNativeInput(path: string): boolean {
  return (
    BASE_UI_NATIVE_INPUT_PATHS.some((input) => input === path) ||
    CONTEXT_NATIVE_INPUT_PATHS.some((input) => input === path) ||
    CLIENT_MAP_NATIVE_INPUT_PATHS.some((input) => input === path) ||
    CLIENT_LEXICAL_NATIVE_INPUT_PATHS.some((input) => input === path) ||
    SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS.some((input) => input === path) ||
    TEST_TOOLING_IMPORT_NATIVE_INPUT_PATHS.some((input) => input === path) ||
    TYPED_NATIVE_POLICIES.some((entry) => entry.inputs.some((input) => input === path)) ||
    compilerConfigRoster([path]).length > 0
  );
}

async function lintNamedSources(
  root: string,
  sources: readonly string[],
  observe: typeof admittedPopulation,
  completed: Map<string, EslintCompletedProfiles>,
): Promise<number> {
  const admitted = await observe(root, [...sources]);
  // A named source that no config admits has no verdict; a native input is judged by its own metadata family instead.
  const unlinted = sources.filter(
    (path) =>
      !isNativeInput(path) && statSync(resolve(root, path), { throwIfNoEntry: false })?.isFile() === true && !admitted.some((entry) => entry.path === path),
  );
  if (unlinted.length > 0) {
    process.stderr.write(`[eslint] eslint.config.js admits no rules for named file(s), so no verdict exists: ${unlinted.join(", ")}\n`);
    return EXIT.toolError;
  }
  if (admitted.length === 0) {
    process.stderr.write("[eslint] eslint.config.js ignores every scoped source path; nothing ordinary to lint\n");
    return EXIT.clean;
  }
  process.stderr.write(`[eslint] named targets: ${sources.join(", ")}\n`);
  return runProfiles(root, admitted, "scoped-", completed);
}

function sourceTypeSuppressionMetadata(root: string, paths: readonly string[]): NativeMetadataFamily[] {
  if (!paths.some(affectsSourceTypeSuppressionNativeLint) || paths.includes(".")) {
    return [];
  }
  for (const path of SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS) {
    readFileSync(resolve(root, path));
  }
  return [
    {
      hard: true,
      patterns: SOURCE_TYPE_SUPPRESSION_GLOBS,
      rules: [SOURCE_TYPE_SUPPRESSION_RULE],
      label: "source-type-suppression-native",
    },
  ];
}

async function recheckScopedNativeMetadata(
  root: string,
  paths: readonly string[],
  observe: typeof admittedPopulation,
  completed: Map<string, EslintCompletedProfiles>,
): Promise<number> {
  const baseUi = paths.some(affectsBaseUiLint) && !coversNativeRoots(paths, POPULATION_ROOTS["@ui"]);
  const context = paths.some(affectsContextNativeLint) && !coversNativeRoots(paths, POPULATION_ROOTS["@client"]);
  const map = paths.some(affectsClientMapNativeLint) && !coversNativeRoots(paths, POPULATION_ROOTS["@client"]);
  const frontendRoots = [...POPULATION_ROOTS["@client"], ...POPULATION_ROOTS["@ui"]];
  const lexical = paths.some(affectsClientLexicalNativeLint) && !coversNativeRoots(paths, frontendRoots);
  const families = [
    ...(await typedNativeMetadata(root, paths, observe)),
    ...(baseUi ? baseUiMetadata(root) : []),
    ...(context ? [contextMetadata(root)] : []),
    ...(map ? [clientMapMetadata(root)] : []),
    ...(lexical ? [clientLexicalMetadata(root)] : []),
    ...sourceTypeSuppressionMetadata(root, paths),
    ...(paths.some(affectsTestToolingImportsNativeLint) && !paths.includes(".") ? TEST_TOOLING_IMPORT_NATIVE_FAMILIES : []),
  ];
  if (families.length > 0) {
    process.stderr.write("[eslint] dependency-wide checks selected by the named targets; findings below are not limited to them\n");
  }
  return recheckNativeFamilies(root, families, observe, completed);
}

async function typedNativeMetadata(root: string, paths: readonly string[], observe: typeof admittedPopulation): Promise<NativeMetadataFamily[]> {
  if (!paths.some((path) => affectsTypedNativeLint(path, root)) || paths.includes(".")) {
    return [];
  }
  const configs = validateTypedCompilerInputs(root, paths);
  const authored = readPolicyRepositoryInventory(root).paths;
  const families: NativeMetadataFamily[] = [];
  let declarationAdmissions: readonly EslintFileAdmission[] | undefined;
  for (const entry of TYPED_NATIVE_POLICIES) {
    const direct = configs || paths.some((path) => affectsTypedNativePolicy(entry, path));
    if (!(direct || typedNativeDependencySignal(entry, paths, authored, root))) {
      continue;
    }
    const family = { hard: entry.hard, requiresTypeInformation: true, patterns: ["."], rules: [entry.ruleId], label: `typed-native:${entry.id}` };
    let compilerConfigs: readonly string[] | undefined;
    if (entry.declarationPackage !== undefined) {
      declarationAdmissions ??= await observe(root, ["."]);
      const active = await readTypedEslintAdmissions(root, CONFIG_REL, declarationAdmissions, [family]);
      if (active.length === 0) {
        continue;
      }
      compilerConfigs = typedNativeCompilerConfigs(active);
    }
    const data = typedNativeDependencyInputs(entry, authored, root, compilerConfigs);
    families.push(...typedNativeMetadataSelection(family, entry, { paths, direct }, data));
  }
  return families;
}

async function recheckTypedNativeFamilies(
  root: string,
  families: readonly NativeMetadataFamily[],
  observe: typeof admittedPopulation,
  completed: Map<string, EslintCompletedProfiles>,
): Promise<number> {
  if (families.length === 0) {
    return EXIT.clean;
  }
  const admitted = await observe(root, [...new Set(families.flatMap((family) => family.patterns))]);
  const selected = new Set<string>();
  for (const hard of [false, true]) {
    const matching = families.filter((family) => family.hard === hard);
    if (matching.length === 0) {
      continue;
    }
    const config = hard ? HARD_CONFIG_REL : CONFIG_REL;
    const owners = hard
      ? await readEslintFileAdmissions(
          root,
          config,
          admitted.map(({ path }) => path),
        )
      : admitted;
    for (const entry of await readTypedEslintAdmissions(root, config, owners, matching)) {
      selected.add(entry.path);
    }
  }
  const pending: EslintFileAdmission[] = [];
  for (const entry of admitted.filter(({ path }) => selected.has(path))) {
    // The named pass already linted this exact file under the same configuration, source and compiler owner.
    if (!(completed.has(entry.path) && (await hasCompletedProfiles(root, [entry.path], completed)))) {
      pending.push(entry);
    }
  }
  return pending.length === 0 ? EXIT.clean : runProfiles(root, pending, "metadata-typed-", completed);
}

async function recheckNativeFamilies(
  root: string,
  families: readonly NativeMetadataFamily[],
  observe: typeof admittedPopulation,
  completed: Map<string, EslintCompletedProfiles>,
): Promise<number> {
  const typedVerdict = await recheckTypedNativeFamilies(
    root,
    families.filter((family) => family.requiresTypeInformation === true),
    observe,
    completed,
  );
  if (typedVerdict === EXIT.toolError) {
    return typedVerdict;
  }
  const hard = families.filter((family) => family.hard && family.requiresTypeInformation !== true);
  const hardPatterns = hard.flatMap(({ patterns }) => patterns);
  let verdict = Math.max(typedVerdict, hard.length === 0 ? EXIT.clean : await nativeSyntaxPass(root, hardPatterns, hard));
  if (verdict === EXIT.toolError) {
    return verdict;
  }
  // Ordinary comments retain authority. Only families requesting the same native pattern can share its rules.
  const byPattern = new Map<string, NativeMetadataFamily[]>();
  for (const family of families.filter((entry) => !(entry.hard || entry.requiresTypeInformation === true))) {
    for (const pattern of family.patterns) {
      const entries = byPattern.get(pattern) ?? [];
      entries.push(family);
      byPattern.set(pattern, entries);
    }
  }
  const groups = new Map<string, { patterns: string[]; families: readonly NativeMetadataFamily[] }>();
  for (const [pattern, entries] of byPattern) {
    const key = JSON.stringify(entries.map(({ rules }) => rules));
    const group = groups.get(key) ?? { patterns: [], families: entries };
    group.patterns.push(pattern);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    verdict = Math.max(verdict, await nativeSyntaxPass(root, group.patterns, group.families));
    if (verdict === EXIT.toolError) {
      return verdict;
    }
  }
  return verdict;
}

function coversNativeRoots(paths: readonly string[], roots: readonly string[]): boolean {
  return paths.some(
    (path) => path === "." || roots.every((prefix) => `${path.replace(/\/$/u, "")}/` === prefix || prefix.startsWith(`${path.replace(/\/$/u, "")}/`)),
  );
}

function baseUiMetadata(root: string): NativeMetadataFamily[] {
  for (const path of BASE_UI_NATIVE_INPUT_PATHS) {
    readFileSync(resolve(root, path));
  }
  const manifest = surfaceManifestFrom(JSON.parse(readFileSync(resolve(root, JSON_RESOURCE_PATHS["baseui-manifest"]), "utf8")) as JsonValue);
  if (!manifest.ok) {
    throw new Error(`Native Base UI policies cannot read the surface manifest: ${manifest.reason}`);
  }
  const patterns = POPULATION_ROOTS["@ui"].map((prefix) => `${prefix}**/*.{ts,tsx}`);
  return [true, false].map((hard) => ({
    hard,
    patterns,
    rules: hard ? [BASE_UI_HANDLER_RULE] : [BASE_UI_DATA_RULE, BASE_UI_STATE_RULE],
    label: "base-ui-native",
  }));
}

function contextMetadata(root: string): NativeMetadataFamily {
  for (const path of CONTEXT_NATIVE_INPUT_PATHS) {
    readFileSync(resolve(root, path));
  }
  return {
    patterns: POPULATION_ROOTS["@client"].map((prefix) => `${prefix}**/*.{ts,tsx}`),
    hard: false,
    rules: CONTEXT_NATIVE_RULES,
    label: "context-native",
  };
}

function clientMapMetadata(root: string): NativeMetadataFamily {
  for (const path of CLIENT_MAP_NATIVE_INPUT_PATHS) {
    readFileSync(resolve(root, path));
  }
  return {
    patterns: POPULATION_ROOTS["@client"].map((prefix) => `${prefix}**/*.{ts,tsx}`),
    hard: false,
    rules: [CLIENT_MAP_NATIVE_RULE],
    label: "parallel-map-native",
  };
}

function clientLexicalMetadata(root: string): NativeMetadataFamily {
  for (const path of CLIENT_LEXICAL_NATIVE_INPUT_PATHS) {
    readFileSync(resolve(root, path));
  }
  const roots = [...POPULATION_ROOTS["@client"], ...POPULATION_ROOTS["@ui"]];
  return {
    patterns: roots.map((prefix) => `${prefix}**/*.{ts,tsx}`),
    hard: false,
    rules: CLIENT_LEXICAL_NATIVE_RULES,
    label: "client-lexical-native",
  };
}

async function nativeSyntaxPass(root: string, patterns: string[], families: readonly NativeMetadataFamily[]): Promise<number> {
  const hard = families[0]?.hard === true;
  const rules = new Set(families.flatMap((family) => family.rules));
  const label = families.map((family) => family.label).join("+");
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: resolve(root, hard ? HARD_CONFIG_REL : CONFIG_REL),
    allowInlineConfig: !hard,
    errorOnUnmatchedPattern: true,
    ruleFilter: ({ ruleId }): boolean => rules.has(ruleId),
    overrideConfig: [
      { languageOptions: { parserOptions: { project: false, projectService: false, programs: null } } },
      // HARD cannot re-enable these rules inline; local ignores preserve native admission and original rule options.
      ...(hard
        ? families.map((family) => ({
            ignores: [...family.patterns],
            rules: Object.fromEntries(family.rules.map((rule) => [rule, "off"] as const)),
          }))
        : []),
    ],
  });
  // ESLint refuses EACH unmatched/ignored glob before deduplicating files: a populated sibling cannot mask it.
  const results = await eslint.lintFiles([...new Set(patterns)]);
  if (results.length === 0) {
    throw new Error(`Native ${label} metadata recheck admitted zero sources; no verdict is available`);
  }
  const formatter = await eslint.loadFormatter("stylish");
  process.stdout.write(`[eslint] ${label} ${hard ? "hard" : "ordinary"}: ${String(results.length)} file(s)\n${await formatter.format(results)}`);
  if (results.some((result) => result.fatalErrorCount > 0)) {
    return EXIT.toolError;
  }
  return results.some((result) => result.errorCount > 0 || result.warningCount > 0) ? EXIT.violations : EXIT.clean;
}
