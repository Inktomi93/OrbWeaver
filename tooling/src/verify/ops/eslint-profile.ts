// Full native profile dispatch and completed file coverage share the same compiler-owner plan.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/floor/cli/entrypoint";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import type { CompilerProgramMembership } from "../../floor/compiler/compiler-programs.ts";
import { readCompilerProgramsFromInventory } from "../../floor/compiler/compiler-programs.ts";
import { isTypeWorldSource, predictedProgram } from "../../floor/compiler/project-worlds.ts";
import type { EslintCompletedProfiles, EslintFileAdmission } from "../contract/config-snapshot.ts";
import { ESLINT_CONFIG_REL as CONFIG_REL, ESLINT_HARD_CONFIG_REL as HARD_CONFIG_REL } from "../contract/config-snapshot.ts";
import { eslintScheme } from "../lib/exit-classifiers.ts";
import { readPolicyRepositoryInventory } from "../lib/policy-repo-inventory.ts";
import { TYPED_NATIVE_COMPILER_CONTEXT_ENV, typedNativeCompilerConfigs } from "../lib/typed-native-inputs.ts";
import { readEslintFileAdmissions } from "./config-snapshot.ts";

refuseDirectInvocation(import.meta.url, "pnpm lint:eslint");

const HARD_CHILD_FLAGS = ["--config", HARD_CONFIG_REL, "--no-config-lookup", "--no-inline-config"] as const;
// Worker threads reload the partition Program; owner processes already provide the isolation boundary.
const CHILD_FLAGS = ["--max-warnings", "0", "--cache", "--cache-strategy", "content", "--concurrency", "off"] as const;
const ESLINT_CACHE_DIR = ".cache/eslint";
const UNTYPED_OWNER = "<untyped>";

interface ProfileDispatch {
  readonly cachePrefix: string;
  readonly hard: boolean;
  readonly receipts: Map<string, string> | undefined;
}

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

export async function runProfiles(
  root: string,
  admitted: readonly EslintFileAdmission[],
  cachePrefix: string,
  completed?: Map<string, EslintCompletedProfiles>,
): Promise<number> {
  const configuration = completed === undefined ? undefined : configurationIdentity(root);
  const hardAdmissions = await readEslintFileAdmissions(
    root,
    HARD_CONFIG_REL,
    admitted.map(({ path }) => path),
  );
  if (hardAdmissions.some((entry) => entry.requiresTypeInformation && entry.compilerConfigs?.length !== 1)) {
    throw new Error("HARD native compiler admission is unavailable");
  }
  const hard = hardAdmissions.filter(({ hasEnabledRules }) => hasEnabledRules);
  const hardReceipts = completed === undefined ? undefined : new Map<string, string>();
  const ordinaryReceipts = completed === undefined ? undefined : new Map<string, string>();
  const hardVerdict = hard.length === 0 ? EXIT.clean : runPartitions(root, hard, { cachePrefix: `${cachePrefix}hard-`, hard: true, receipts: hardReceipts });
  if (hardVerdict === EXIT.toolError) {
    return EXIT.toolError;
  }
  const verdict = Math.max(hardVerdict, runPartitions(root, admitted, { cachePrefix, hard: false, receipts: ordinaryReceipts }));
  if (completed !== undefined && verdict !== EXIT.toolError && configuration !== undefined && configuration === configurationIdentity(root)) {
    retainCompletedProfiles(completed, admitted, hardAdmissions, { configuration, ordinary: ordinaryReceipts, hard: hardReceipts });
  }
  return verdict;
}

function retainCompletedProfiles(
  completed: Map<string, EslintCompletedProfiles>,
  admitted: readonly EslintFileAdmission[],
  hardAdmissions: readonly EslintFileAdmission[],
  receipts: {
    readonly configuration: string;
    readonly ordinary: ReadonlyMap<string, string> | undefined;
    readonly hard: ReadonlyMap<string, string> | undefined;
  },
): void {
  for (const admission of admitted) {
    const ordinary = receipts.ordinary?.get(admission.path);
    const hardAdmission = hardAdmissions.find(({ path }) => path === admission.path);
    const mandatory = hardAdmission?.hasEnabledRules === true ? receipts.hard?.get(admission.path) : JSON.stringify(["inactive", hardAdmission]);
    if (ordinary !== undefined && mandatory !== undefined) {
      completed.set(admission.path, { ordinary: admission, hard: hardAdmission, identity: JSON.stringify([receipts.configuration, ordinary, mandatory]) });
    }
  }
}

function nativeCompilerChildEnv(root: string, admitted: readonly EslintFileAdmission[]): NodeJS.ProcessEnv {
  const configs = typedNativeCompilerConfigs(admitted.filter((entry) => entry.requiresTypeInformation));
  return inheritedProcessEnv({
    [TYPED_NATIVE_COMPILER_CONTEXT_ENV]: JSON.stringify({ root, configs: configs === undefined || configs.length === 0 ? null : configs }),
  });
}

function profilePartitions(root: string, admitted: readonly EslintFileAdmission[]): ReadonlyMap<string, readonly EslintFileAdmission[]> {
  const filenames = admitted.map(({ path }) => path);
  const typedPaths = new Set(admitted.filter(({ requiresTypeInformation }) => requiresTypeInformation).map(({ path }) => path));
  const programs = typedPaths.size === 0 ? [] : readCompilerProgramsFromInventory(readPolicyRepositoryInventory(root));
  return new Map(
    [...partitionEslintFiles(filenames, programs, typedPaths)].map(([owner, paths]) => [owner, admitted.filter((entry) => paths.includes(entry.path))]),
  );
}

function sourceIdentity(root: string, path: string): string | undefined {
  const absolute = resolve(root, path);
  return statSync(absolute, { throwIfNoEntry: false })?.isFile() === true ? createHash("sha256").update(readFileSync(absolute)).digest("hex") : undefined;
}

function configurationIdentity(root: string): string | undefined {
  const ordinary = sourceIdentity(root, CONFIG_REL);
  const hard = sourceIdentity(root, HARD_CONFIG_REL);
  return ordinary === undefined || hard === undefined ? undefined : JSON.stringify([ordinary, hard]);
}

function profileReceipt(root: string, admission: EslintFileAdmission, owner: string, environment: NodeJS.ProcessEnv): string | undefined {
  if (
    admission.requiresTypeInformation &&
    !(admission.compilerConfigs !== null && admission.compilerConfigs !== undefined && admission.compilerConfigs.length > 0)
  ) {
    return undefined;
  }
  const source = sourceIdentity(root, admission.path);
  return source === undefined ? undefined : JSON.stringify([admission, owner, Object.entries(environment).toSorted(([a], [b]) => a.localeCompare(b)), source]);
}

/** Only an exact file with matching completed native profiles can avoid a second native pass. */
export async function hasCompletedProfiles(root: string, paths: readonly string[], completed: ReadonlyMap<string, EslintCompletedProfiles>): Promise<boolean> {
  if (paths.length === 0 || new Set(paths).size !== paths.length || paths.some((path) => !completed.has(path) || sourceIdentity(root, path) === undefined)) {
    return false;
  }
  const ordinary = await readEslintFileAdmissions(root, CONFIG_REL, paths);
  if (ordinary.length !== paths.length || ordinary.some(({ path }, index) => path !== paths[index])) {
    return false;
  }
  const hard = await readEslintFileAdmissions(root, HARD_CONFIG_REL, paths);
  if (
    ordinary.some((entry) => JSON.stringify(entry) !== JSON.stringify(completed.get(entry.path)?.ordinary)) ||
    paths.some((path) => JSON.stringify(hard.find((entry) => entry.path === path)) !== JSON.stringify(completed.get(path)?.hard))
  ) {
    return false;
  }
  if (hard.some((entry) => entry.requiresTypeInformation && entry.compilerConfigs?.length !== 1)) {
    return false;
  }
  const configuration = configurationIdentity(root);
  if (configuration === undefined) {
    return false;
  }
  const ordinaryKeys = plannedReceipts(root, ordinary);
  const hardKeys = plannedReceipts(
    root,
    hard.filter(({ hasEnabledRules }) => hasEnabledRules),
  );
  return ordinary.every((admission) => {
    const hardAdmission = hard.find(({ path }) => path === admission.path);
    const mandatory = hardAdmission?.hasEnabledRules === true ? hardKeys.get(admission.path) : JSON.stringify(["inactive", hardAdmission]);
    return completed.get(admission.path)?.identity === JSON.stringify([configuration, ordinaryKeys.get(admission.path), mandatory]);
  });
}

function plannedReceipts(root: string, admitted: readonly EslintFileAdmission[]): ReadonlyMap<string, string> {
  const keys = new Map<string, string>();
  if (admitted.length === 0) {
    return keys;
  }
  for (const [owner, partition] of profilePartitions(root, admitted)) {
    const environment = nativeCompilerChildEnv(root, partition);
    for (const admission of partition) {
      const receipt = profileReceipt(root, admission, owner, environment);
      if (receipt !== undefined) {
        keys.set(admission.path, receipt);
      }
    }
  }
  return keys;
}

function runPartitions(root: string, admitted: readonly EslintFileAdmission[], profile: ProfileDispatch): number {
  const groups = profilePartitions(root, admitted);
  const cacheDir = join(root, ESLINT_CACHE_DIR);
  mkdirSync(cacheDir, { recursive: true });

  let verdict: number = EXIT.clean;
  for (const [owner, partition] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
    const childVerdict = runPartitionChild(root, owner, partition, profile);
    if (childVerdict === EXIT.toolError) {
      return EXIT.toolError;
    }
    if (childVerdict === EXIT.violations) {
      verdict = EXIT.violations;
    }
  }
  return verdict;
}

function runPartitionChild(root: string, owner: string, partition: readonly EslintFileAdmission[], { hard, cachePrefix, receipts }: ProfileDispatch): number {
  if (hard && partition.some((entry) => entry.requiresTypeInformation && (entry.compilerConfigs?.length !== 1 || entry.compilerConfigs[0] !== owner))) {
    throw new Error(`HARD native compiler admission does not match owner ${owner}`);
  }
  const paths = partition.map(({ path }) => path);
  process.stderr.write(`[eslint] ${owner}: ${String(paths.length)} file(s)\n`);
  const cacheDir = join(root, ESLINT_CACHE_DIR);
  const ownerCacheFile = join(cacheDir, `${cachePrefix}${encodeURIComponent(owner)}.eslintcache`);
  const argumentsDir = mkdtempSync(join(cacheDir, "argv-"));
  try {
    const argumentsFile = join(argumentsDir, "arguments.json");
    const suppressionsFile = join(argumentsDir, "suppressions.json");
    if (hard) {
      // Ordinary migration debt must never grant permission to the HARD profile.
      writeFileSync(suppressionsFile, "{}");
    }
    const profileFlags = hard ? [...HARD_CHILD_FLAGS, "--suppressions-location", suppressionsFile] : [];
    writeFileSync(argumentsFile, JSON.stringify([...CHILD_FLAGS, ...profileFlags, "--cache-location", ownerCacheFile, ...paths]));
    const environment = nativeCompilerChildEnv(root, partition);
    const before = receipts === undefined ? [] : partition.map((entry) => profileReceipt(root, entry, owner, environment));
    // Supervised: this process blocks in the spawn, so only the launcher can stop the worker if we die. A
    // signal death still reaches `eslintScheme` as a null status, so it stays a tool error.
    const result = runNicedSync(process.execPath, ["scripts/eslint.ts", "--args-file", argumentsFile], {
      cwd: root,
      stdio: "inherit",
      env: environment,
      supervised: true,
    });
    const childVerdict = eslintScheme(result.status);
    if (receipts !== undefined && childVerdict !== EXIT.toolError) {
      retainPartitionReceipts(root, owner, partition, { before, environment, receipts });
    }
    return childVerdict;
  } finally {
    rmSync(argumentsDir, { recursive: true, force: true });
  }
}

function retainPartitionReceipts(
  root: string,
  owner: string,
  partition: readonly EslintFileAdmission[],
  {
    before,
    environment,
    receipts,
  }: { readonly before: readonly (string | undefined)[]; readonly environment: NodeJS.ProcessEnv; readonly receipts: Map<string, string> },
): void {
  for (const [index, admission] of partition.entries()) {
    const receipt = before[index];
    if (receipt !== undefined && receipt === profileReceipt(root, admission, owner, environment)) {
      receipts.set(admission.path, receipt);
    }
  }
}
