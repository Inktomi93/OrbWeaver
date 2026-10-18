// Native compiler-owner shards isolate HARD authority from ordinary exceptions and cache lifetimes.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import type { CompilerProgramMembership } from "../../floor/compiler/compiler-programs.ts";
import { compilerConfigRoster } from "../../floor/compiler/compiler-programs.ts";
import { isTypeWorldSource, predictedProgram } from "../../floor/compiler/project-worlds.ts";
import { BASE_UI_DATA_RULE, BASE_UI_HANDLER_RULE, BASE_UI_NATIVE_INPUT_PATHS, BASE_UI_STATE_RULE } from "../contract/baseui.ts";
import type { EslintFileAdmission, EslintNativeMetadataFamily as NativeMetadataFamily } from "../contract/config-snapshot.ts";
import { POPULATION_ROOTS } from "../contract/population.ts";
import type { JsonValue } from "../contract/resource-json.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";
import { affectsBaseUiLint, surfaceManifestFrom } from "../lib/baseui-manifest.ts";
import { affectsClientLexicalNativeLint, CLIENT_LEXICAL_NATIVE_INPUT_PATHS, CLIENT_LEXICAL_NATIVE_RULES } from "../lib/client-lexical-native.ts";
import { affectsClientMapNativeLint, CLIENT_MAP_NATIVE_INPUT_PATHS, CLIENT_MAP_NATIVE_RULE } from "../lib/client-map-native.ts";
import { DISCOVERY_MAX_BUFFER_BYTES, readAdmittedEslintPopulation, readDiscoveredPopulation, readTypedEslintAdmissions } from "../lib/config-snapshot.ts";
import { affectsContextNativeLint, CONTEXT_NATIVE_INPUT_PATHS, CONTEXT_NATIVE_RULES } from "../lib/context-definition-shape.ts";
import { eslintScheme } from "../lib/exit-classifiers.ts";
import { readCompilerProgramsFromInventory } from "../lib/policy-program-membership.ts";
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
  TYPED_NATIVE_COMPILER_CONTEXT_ENV,
  TYPED_NATIVE_POLICIES,
  typedNativeCompilerConfigs,
  typedNativeDependencyInputs,
  typedNativeDependencySignal,
  typedNativeMetadataSelection,
  validateTypedCompilerInputs,
} from "../lib/typed-native-inputs.ts";
import { readEslintFileAdmissions } from "./config-snapshot.ts";

refuseDirectInvocation(import.meta.url, "pnpm lint:eslint");

const CONFIG_REL = "eslint.config.js";
const HARD_CONFIG_REL = "eslint-hard.config.js";
const HARD_CHILD_FLAGS = ["--config", HARD_CONFIG_REL, "--no-config-lookup", "--no-inline-config"] as const;
// Worker threads reload the partition Program; owner processes already provide the isolation boundary.
const CHILD_FLAGS = ["--max-warnings", "0", "--cache", "--cache-strategy", "content", "--concurrency", "off"] as const;
const ESLINT_CACHE_DIR = ".cache/eslint";
const UNTYPED_OWNER = "<untyped>";

function ownerFor(path: string, owners: readonly string[]): string {
  if (!isTypeWorldSource(path)) {
    return UNTYPED_OWNER;
  }
  const predicted = predictedProgram(path);
  if (predicted !== undefined && owners.includes(predicted)) {
    return predicted;
  }
  if (owners.length === 1) {
    return owners[0] ?? "<unowned>";
  }
  throw new Error(`ESLint file ${path} has ${owners.length === 0 ? "no native compiler owner" : `ambiguous native compiler owners {${owners.join(", ")}}`}`);
}

export function partitionEslintFiles(
  paths: readonly string[],
  programs: readonly CompilerProgramMembership[],
  typedPaths?: ReadonlySet<string>,
): ReadonlyMap<string, readonly string[]> {
  if (paths.length === 0) {
    throw new Error("ESLint discovery produced an empty population; no lint verdict is available");
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error("ESLint discovery produced duplicate file identities");
  }
  const roots = new Map<string, string[]>();
  for (const program of programs) {
    for (const path of program.files) {
      const owners = roots.get(path) ?? [];
      owners.push(program.id);
      roots.set(path, owners);
    }
  }
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const owner = typedPaths !== undefined && !typedPaths.has(path) ? UNTYPED_OWNER : ownerFor(path, roots.get(path) ?? []);
    const members = groups.get(owner) ?? [];
    members.push(path);
    groups.set(owner, members);
  }
  return groups;
}

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
  const supplemental = await recheckScopedNativeMetadata(root, paths);
  if (supplemental === EXIT.toolError) {
    return EXIT.toolError;
  }
  const sources = paths.filter(
    (path) =>
      !(
        BASE_UI_NATIVE_INPUT_PATHS.some((input) => input === path) ||
        CONTEXT_NATIVE_INPUT_PATHS.some((input) => input === path) ||
        CLIENT_MAP_NATIVE_INPUT_PATHS.some((input) => input === path) ||
        CLIENT_LEXICAL_NATIVE_INPUT_PATHS.some((input) => input === path) ||
        SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS.some((input) => input === path) ||
        TEST_TOOLING_IMPORT_NATIVE_INPUT_PATHS.some((input) => input === path) ||
        TYPED_NATIVE_POLICIES.some((entry) => entry.inputs.some((input) => input === path)) ||
        compilerConfigRoster([path]).length > 0
      ) ||
      (/\.[cm]?[jt]sx?$/u.test(path) && existsSync(resolve(root, path))),
  );
  if (sources.length === 0) {
    return supplemental;
  }
  const admitted = await admittedPopulation(root, sources);
  if (admitted.length === 0) {
    process.stderr.write("[eslint] eslint.config.js ignores every scoped source path; nothing ordinary to lint\n");
    return supplemental;
  }
  return Math.max(supplemental, await runProfiles(root, admitted, "scoped-"));
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

async function recheckScopedNativeMetadata(root: string, paths: readonly string[]): Promise<number> {
  const baseUi = paths.some(affectsBaseUiLint) && !coversNativeRoots(paths, POPULATION_ROOTS["@ui"]);
  const context = paths.some(affectsContextNativeLint) && !coversNativeRoots(paths, POPULATION_ROOTS["@client"]);
  const map = paths.some(affectsClientMapNativeLint) && !coversNativeRoots(paths, POPULATION_ROOTS["@client"]);
  const frontendRoots = [...POPULATION_ROOTS["@client"], ...POPULATION_ROOTS["@ui"]];
  const lexical = paths.some(affectsClientLexicalNativeLint) && !coversNativeRoots(paths, frontendRoots);
  const families = [
    ...(await typedNativeMetadata(root, paths)),
    ...(baseUi ? baseUiMetadata(root) : []),
    ...(context ? [contextMetadata(root)] : []),
    ...(map ? [clientMapMetadata(root)] : []),
    ...(lexical ? [clientLexicalMetadata(root)] : []),
    ...sourceTypeSuppressionMetadata(root, paths),
    ...(paths.some(affectsTestToolingImportsNativeLint) && !paths.includes(".") ? TEST_TOOLING_IMPORT_NATIVE_FAMILIES : []),
  ];
  return recheckNativeFamilies(root, families);
}

async function typedNativeMetadata(root: string, paths: readonly string[]): Promise<NativeMetadataFamily[]> {
  if (!paths.some(affectsTypedNativeLint) || paths.includes(".")) {
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
      declarationAdmissions ??= await admittedPopulation(root, ["."]);
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

async function recheckTypedNativeFamilies(root: string, families: readonly NativeMetadataFamily[]): Promise<number> {
  if (families.length === 0) {
    return EXIT.clean;
  }
  const admitted = await admittedPopulation(root, [...new Set(families.flatMap((family) => family.patterns))]);
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
  return selected.size === 0
    ? EXIT.clean
    : runProfiles(
        root,
        admitted.filter(({ path }) => selected.has(path)),
        "metadata-typed-",
      );
}

async function recheckNativeFamilies(root: string, families: readonly NativeMetadataFamily[]): Promise<number> {
  const typedVerdict = await recheckTypedNativeFamilies(
    root,
    families.filter((family) => family.requiresTypeInformation === true),
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

async function runProfiles(root: string, admitted: readonly EslintFileAdmission[], cachePrefix: string): Promise<number> {
  const hardAdmissions = await readEslintFileAdmissions(
    root,
    HARD_CONFIG_REL,
    admitted.map(({ path }) => path),
  );
  if (hardAdmissions.some((entry) => entry.requiresTypeInformation && entry.compilerConfigs?.length !== 1)) {
    throw new Error("HARD native compiler admission is unavailable");
  }
  const hard = hardAdmissions.filter(({ hasEnabledRules }) => hasEnabledRules);
  const hardVerdict = hard.length === 0 ? EXIT.clean : runPartitions(root, hard, `${cachePrefix}hard-`, true);
  if (hardVerdict === EXIT.toolError) {
    return EXIT.toolError;
  }
  return Math.max(hardVerdict, runPartitions(root, admitted, cachePrefix, false));
}

function nativeCompilerChildEnv(root: string, admitted: readonly EslintFileAdmission[]): NodeJS.ProcessEnv {
  const configs = typedNativeCompilerConfigs(admitted.filter((entry) => entry.requiresTypeInformation));
  return inheritedProcessEnv({
    [TYPED_NATIVE_COMPILER_CONTEXT_ENV]: JSON.stringify({ root, configs: configs === undefined || configs.length === 0 ? null : configs }),
  });
}

function runPartitions(root: string, admitted: readonly EslintFileAdmission[], cachePrefix: string, hard: boolean): number {
  const filenames = admitted.map(({ path }) => path);
  const typedPaths = new Set(admitted.filter(({ requiresTypeInformation }) => requiresTypeInformation).map(({ path }) => path));
  const programs = typedPaths.size === 0 ? [] : readCompilerProgramsFromInventory(readPolicyRepositoryInventory(root));
  const groups = partitionEslintFiles(filenames, programs, typedPaths);
  const cacheDir = join(root, ESLINT_CACHE_DIR);
  mkdirSync(cacheDir, { recursive: true });

  let verdict: number = EXIT.clean;
  for (const [owner, paths] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
    const partition = admitted.filter((entry) => paths.includes(entry.path));
    if (hard && partition.some((entry) => entry.requiresTypeInformation && (entry.compilerConfigs?.length !== 1 || entry.compilerConfigs[0] !== owner))) {
      throw new Error(`HARD native compiler admission does not match owner ${owner}`);
    }
    process.stderr.write(`[eslint] ${owner}: ${String(paths.length)} file(s)\n`);
    const ownerCacheFile = join(cacheDir, `${cachePrefix}${encodeURIComponent(owner)}.eslintcache`);
    const argumentsDir = mkdtempSync(join(cacheDir, "argv-"));
    let childVerdict: number;
    try {
      const argumentsFile = join(argumentsDir, "arguments.json");
      const suppressionsFile = join(argumentsDir, "suppressions.json");
      if (hard) {
        // Ordinary migration debt must never grant permission to the HARD profile.
        writeFileSync(suppressionsFile, "{}");
      }
      const profileFlags = hard ? [...HARD_CHILD_FLAGS, "--suppressions-location", suppressionsFile] : [];
      writeFileSync(argumentsFile, JSON.stringify([...CHILD_FLAGS, ...profileFlags, "--cache-location", ownerCacheFile, ...paths]));
      const result = runNicedSync(process.execPath, ["scripts/eslint.ts", "--args-file", argumentsFile], {
        cwd: root,
        stdio: "inherit",
        env: nativeCompilerChildEnv(root, partition),
      });
      childVerdict = eslintScheme(result.status);
    } finally {
      rmSync(argumentsDir, { recursive: true, force: true });
    }
    if (childVerdict === EXIT.toolError) {
      return EXIT.toolError;
    }
    if (childVerdict === EXIT.violations) {
      verdict = EXIT.violations;
    }
  }
  return verdict;
}
