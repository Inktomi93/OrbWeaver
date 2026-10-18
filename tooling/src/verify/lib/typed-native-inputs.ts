// Native typed policy scopes and source dependencies are shared by configuration, cache identity and changed selection.

import { randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { z } from "zod";
import { ID_BRAND_HOME } from "../../floor/code-facts/id-brand.ts";
import {
  SERVER_FACTORY_TIER_REFERENCE_POLICY_ID,
  TYPE_HOME_NATIVE_CONTRACT_GLOBS,
  TYPE_HOME_NATIVE_POLICY_ID,
  TYPE_HOME_NATIVE_SOURCE_GLOBS,
  TYPE_HOME_NATIVE_UNADMITTED_GLOBS,
} from "../../floor/code-facts/type-home.ts";
import { compilerConfigRoster, readCompilerProgramGraph } from "../../floor/compiler/compiler-programs.ts";
import type { EslintFileAdmission, EslintNativeMetadataFamily } from "../contract/config-snapshot.ts";
import type { PolicyWorkspacePackage } from "../contract/policy-scope.ts";
import { POPULATION_ROOTS, POPULATION_SETS } from "../contract/population.ts";
import { readPolicyRepositoryInventory, readPolicyWorkspacePackages } from "./policy-repo-inventory.ts";
import { TOOLING_ENTRY_NATIVE_POLICIES } from "./tooling-entry-native.ts";

const SERVER_DECLARATION_PACKAGE = "@orb/server";
const WORKSPACE_PROTOCOL = "workspace:";
export const TYPED_NATIVE_COMPILER_CONTEXT_ENV = "ORB_ESLINT_NATIVE_COMPILER_CONTEXT";
const UNCACHED_CONTEXT_IDENTITY = randomUUID();
const compilerContext = z.object({ root: z.string(), configs: z.array(z.string()).nullable() });

/** Only the existing native child dispatch can supply persistent configured-world authority. */
export function typedNativeCompilerContext(root: string): { readonly configs: readonly string[] | undefined; readonly identity: string } {
  const value = processEnvValue(TYPED_NATIVE_COMPILER_CONTEXT_ENV);
  if (value === undefined) {
    return { configs: undefined, identity: UNCACHED_CONTEXT_IDENTITY };
  }
  const context = compilerContext.parse(JSON.parse(value));
  if (resolve(context.root) !== resolve(root) || context.configs === null) {
    return { configs: undefined, identity: UNCACHED_CONTEXT_IDENTITY };
  }
  if (context.configs.length === 0 || compilerConfigRoster(context.configs).length !== context.configs.length) {
    throw new Error("native compiler cache context has no configured compiler roster");
  }
  return { configs: context.configs, identity: JSON.stringify(context.configs.toSorted()) };
}

/** Unknown or caller-provided Programs remain uncached instead of borrowing an intended primary world. */
export function typedNativeCompilerConfigs(admissions: readonly EslintFileAdmission[]): readonly string[] | undefined {
  return admissions.some((entry) => entry.compilerConfigs === undefined || entry.compilerConfigs === null)
    ? undefined
    : [...new Set(admissions.flatMap((entry) => entry.compilerConfigs ?? []))];
}

const COMMON_INPUTS = [
  "eslint.config.js",
  "tooling/src/verify/lib/typed-native-inputs.ts",
  "tooling/src/floor/compiler/compiler-programs.ts",
  "tooling/src/verify/contract/population.ts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
] as const;
const BRAND_INPUTS = [...COMMON_INPUTS, ID_BRAND_HOME, "tooling/src/floor/code-facts/id-brand.ts"];
const MEMBER_INPUTS = [...COMMON_INPUTS, "tooling/src/floor/code-facts/type-member-origin-core.ts", "tooling/src/floor/code-facts/type-projection-contract.ts"];
const SCALAR_INPUTS = [
  ...COMMON_INPUTS,
  "tooling/src/floor/code-facts/static-authored-value.ts",
  "tooling/src/floor/code-facts/reference-fact.ts",
  "tooling/src/floor/code-facts/reference-fact-alias.ts",
  "tooling/src/floor/code-facts/reference-fact-writes.ts",
  "tooling/src/floor/code-facts/reference-fact-global.ts",
  "tooling/src/floor/code-facts/reference-fact-member.ts",
  "tooling/src/floor/code-facts/reference-fact-module.ts",
  "tooling/src/floor/code-facts/reference-documentation.ts",
  "tooling/src/floor/compiler/ts-workspace.ts",
];
const authored = POPULATION_SETS["@authored"].flatMap((root) => POPULATION_ROOTS[root].map((prefix) => `${prefix}**/*.{ts,tsx}`));
const authoredInputRoots = POPULATION_SETS["@authored"].flatMap((root) => POPULATION_ROOTS[root]);
const brandRoots = ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference", "@tests"] as const;
const product = POPULATION_SETS["@product"].flatMap((root) => POPULATION_ROOTS[root].map((prefix) => `${prefix}**/*.{ts,tsx}`));
const AMBIENT_INPUTS = [
  ...SCALAR_INPUTS,
  "tooling/src/floor/code-facts/reference-fact-global.ts",
  "tooling/src/floor/code-facts/reference-fact-member.ts",
  "tooling/src/verify/lib/ambient-determinism.ts",
  "tooling/src/verify/lib/origin-verdict.ts",
];

const TYPE_HOME_INPUTS = [
  ...SCALAR_INPUTS,
  ...MEMBER_INPUTS,
  "tooling/src/floor/code-facts/type-home.ts",
  "tooling/src/floor/code-facts/server-factory-type-home.ts",
  "tooling/src/floor/code-facts/shape-declaration.ts",
  "tooling/src/floor/code-facts/shape-derivation.ts",
  "tooling/src/floor/code-facts/shape-derivation-contract.ts",
  "tooling/src/floor/code-facts/type-member-origin.ts",
  "tooling/src/floor/code-facts/type-member-origin-contract.ts",
  "tooling/src/floor/code-facts/assignability.ts",
];

export const TYPED_NATIVE_POLICIES = [
  ...TOOLING_ENTRY_NATIVE_POLICIES.map((entry) => ({ ...entry, inputs: [...SCALAR_INPUTS, ...entry.inputs] })),
  {
    id: "test-value-cast",
    ruleId: "@typescript-eslint/no-unsafe-type-assertion",
    processPrivate: true,
    scope: ["tests/**/*.{ts,tsx}"],
    notUnder: ["tests/tooling/**"],
    inputs: [...COMMON_INPUTS, "patches/@typescript-eslint__eslint-plugin@8.70.1.patch"],
  },
  {
    id: TYPE_HOME_NATIVE_POLICY_ID,
    declarationPackage: SERVER_DECLARATION_PACKAGE,
    dependencyScope: POPULATION_ROOTS["@server"].map((root) => `${root}**/*.{ts,tsx}`),
    scope: TYPE_HOME_NATIVE_SOURCE_GLOBS,
    notUnder: [...TYPE_HOME_NATIVE_CONTRACT_GLOBS, ...TYPE_HOME_NATIVE_UNADMITTED_GLOBS],
    inputs: TYPE_HOME_INPUTS,
  },
  {
    id: SERVER_FACTORY_TIER_REFERENCE_POLICY_ID,
    declarationPackage: SERVER_DECLARATION_PACKAGE,
    dependencyScope: POPULATION_ROOTS["@server"].map((root) => `${root}**/*.{ts,tsx}`),
    scope: POPULATION_ROOTS["@server"].map((root) => `${root}**/*.{ts,tsx}`),
    notUnder: TYPE_HOME_NATIVE_UNADMITTED_GLOBS,
    inputs: TYPE_HOME_INPUTS,
  },
  { id: "list-row-adoption", scope: ["packages/client/src/**/*.tsx"], inputs: SCALAR_INPUTS },
  {
    id: "no-raw-intl-time",
    scope: authored,
    inputs: [
      ...AMBIENT_INPUTS,
      ...MEMBER_INPUTS,
      "tooling/src/verify/lib/project-home-origin.ts",
      "tooling/src/verify/lib/type-member-origin.ts",
      "tooling/src/floor/code-facts/type-member-origin.ts",
    ],
  },
  {
    id: "test-fixture-imports",
    scope: authored.flatMap((glob) => [
      [glob, "tests/**"],
      [glob, "**/tests/**"],
    ]),
    notUnder: ["tests/e2e/**", "tests/support/**", "**/tests/e2e/**", "**/tests/support/**"],
    notNamed: ["**/*.test-d.ts"],
    inputs: [...SCALAR_INPUTS, "tooling/src/verify/lib/test-runner-door.ts"],
  },
  {
    id: "zod-modern-spellings",
    scope: [...product, "tests/**/*.{ts,tsx}"],
    inputs: [
      ...SCALAR_INPUTS,
      ...MEMBER_INPUTS,
      "tooling/src/floor/code-facts/zod-origin.ts",
      "tooling/src/floor/code-facts/reference-fact-module.ts",
      "tooling/src/floor/code-facts/type-member-origin.ts",
    ],
  },
  {
    id: "zustand-selector-stability",
    scope: authored,
    notNamed: ["**/*.test.{ts,tsx}"],
    home: "packages/client/src/state/create-gated-store.ts",
    exportedName: "GatedStoreHook",
    inputs: [...SCALAR_INPUTS, ...MEMBER_INPUTS, "tooling/src/floor/code-facts/type-member-origin.ts", "packages/client/src/state/create-gated-store.ts"],
  },
  {
    id: "no-mint-via-cast",
    scope: product,
    inputs: [
      ...BRAND_INPUTS,
      ...AMBIENT_INPUTS,
      "tooling/src/floor/code-facts/reference-fact-call.ts",
      "tooling/src/floor/code-facts/reference-fact-module.ts",
      "tooling/src/verify/lib/id-brand.ts",
      "tooling/src/verify/lib/ast-read.ts",
      "tooling/src/floor/code-facts/reference-fact-overload.ts",
      "tooling/src/floor/code-facts/reference-fact-same-file-merge.ts",
      "tooling/src/floor/code-facts/reference-fact-state.ts",
    ],
  },
  {
    id: "no-manual-autosave-flush",
    scope: ["packages/client/src/features/**/*.{ts,tsx}"],
    inputs: [...SCALAR_INPUTS, ...MEMBER_INPUTS, "tooling/src/floor/code-facts/type-member-origin.ts", "tooling/src/verify/lib/origin-verdict.ts"],
  },
  {
    id: "no-chat-trpc-in-surface",
    scope: authored.map((glob) => [glob, "**/features/*/surfaces/**"]),
    inputs: [...SCALAR_INPUTS, ...MEMBER_INPUTS, "tooling/src/floor/code-facts/type-member-origin.ts", "tooling/src/verify/lib/origin-verdict.ts"],
  },
  { id: "no-raw-clock", scope: product, notNamed: ["**/*.test.{ts,tsx}"], inputs: AMBIENT_INPUTS },
  { id: "no-raw-random", scope: [...product, "tooling/src/**/*.{ts,tsx}"], notNamed: ["**/*.test.{ts,tsx}"], inputs: AMBIENT_INPUTS },
  {
    id: "no-multiplexed-mutation-error",
    scope: ["packages/client/src/**/*.{ts,tsx}"],
    notNamed: ["**/*.test.{ts,tsx}"],
    home: "packages/client/src/data/create-entity-mutation.ts",
    exportedName: "EntityMutationResult",
    inputs: [
      ...SCALAR_INPUTS,
      ...MEMBER_INPUTS,
      "tooling/src/floor/code-facts/type-member-origin.ts",
      "tooling/src/verify/lib/origin-verdict.ts",
      "packages/client/src/data/create-entity-mutation.ts",
    ],
  },
  { id: "no-interactive-role-in-features", scope: ["packages/client/src/features/**/*.tsx"], inputs: SCALAR_INPUTS },
  { id: "baseui-portal-container-seam", scope: ["packages/ui/src/**/*.{ts,tsx}"], inputs: COMMON_INPUTS },
  { id: "no-inline-invalidate-outside-seam", scope: ["packages/client/src/**/*.{ts,tsx}"], inputs: MEMBER_INPUTS },
  {
    id: "client-cache-surgery-only-in-data",
    scope: ["packages/client/src/**/*.{ts,tsx}"],
    notNamed: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    inputs: MEMBER_INPUTS,
  },
  { id: "no-inline-optimistic-in-surface", scope: authored.map((glob) => [glob, "**/features/*/surfaces/**"]), inputs: MEMBER_INPUTS },
  { id: "brand-in-name-position", scope: brandRoots.flatMap((root) => POPULATION_ROOTS[root].map((prefix) => `${prefix}**/*.{ts,tsx}`)), inputs: BRAND_INPUTS },
  {
    id: "test-factory-contract",
    scope: ["tests/support/node/factories/**/*.{ts,tsx}", "**/tests/support/node/factories/**/*.{ts,tsx}"],
    inputs: COMMON_INPUTS,
  },
  {
    id: "no-opaque-test-fixture",
    scope: ["tests/**/support/**/*.{ts,tsx}", "tests/**/fixtures.{ts,tsx}", "tests/**/*.fixtures.{ts,tsx}"],
    inputs: [...COMMON_INPUTS, "tooling/src/verify/lib/waivable-coordinate.ts"],
  },
  { id: "no-context-returntype", scope: authored.map((glob) => [glob, "**/context.ts"]), inputs: COMMON_INPUTS },
].map((entry) => ({
  ...entry,
  ruleId: "ruleId" in entry ? (entry.ruleId ?? `orb/${entry.id}`) : `orb/${entry.id}`,
  hard: "hard" in entry && entry.hard === true,
  processPrivate: entry.processPrivate === true,
  declarationPackage: "declarationPackage" in entry ? entry.declarationPackage : undefined,
  dependencyScope: "dependencyScope" in entry ? entry.dependencyScope : ["."],
  homes: [],
  notUnder: [...("notUnder" in entry ? (entry.notUnder ?? []) : []), "tests/legacy/**"],
}));

/** This family has no observed parser dependency closure; its existing child lifetime supplies no persistent reuse authority. */
export function typedNativeInputIdentity(entry: (typeof TYPED_NATIVE_POLICIES)[number], configuredIdentity: string): string {
  if (entry.processPrivate) {
    return UNCACHED_CONTEXT_IDENTITY;
  }
  return entry.declarationPackage === undefined ? "" : configuredIdentity;
}

/** Literal policy implementation inputs retain deletion and directory-selection signals. */
export function affectsTypedNativePolicy(entry: (typeof TYPED_NATIVE_POLICIES)[number], path: string): boolean {
  const prefix = path.replace(/\/$/u, "");
  return entry.inputs.some((input) => input === path || input.startsWith(`${prefix}/`));
}

/** Deleted inputs and containing-directory selections retain the dependent native population. */
export function affectsTypedNativeLint(path: string): boolean {
  return (
    path === "." ||
    compilerConfigRoster([path]).length > 0 ||
    path.endsWith(".d.ts") ||
    path.startsWith("packages/") ||
    authoredInputRoots.some((root) => path.startsWith(root) || root.startsWith(`${path.replace(/\/$/u, "")}/`)) ||
    TYPED_NATIVE_POLICIES.some((entry) => affectsTypedNativePolicy(entry, path))
  );
}

const workspaceManifest = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  optionalDependencies: z.record(z.string(), z.string()).default({}),
  peerDependencies: z.record(z.string(), z.string()).default({}),
});

function workspaceTarget(
  name: string,
  range: string,
  owner: PolicyWorkspacePackage,
  { packages, root }: { readonly packages: readonly PolicyWorkspacePackage[]; readonly root: string },
): string {
  const requested = range.slice(WORKSPACE_PROTOCOL.length);
  if (requested.startsWith(".")) {
    const directory = resolve(root, owner.path, requested);
    const target = packages.find((candidate) => resolve(root, candidate.path) === directory);
    if (target === undefined) {
      throw new Error(`unknown workspace dependency ${range} in ${owner.name}`);
    }
    return target.name;
  }
  const split = requested.lastIndexOf("@");
  const target = split > 0 ? requested.slice(0, split) : name;
  const version = split > 0 ? requested.slice(split + 1) : requested;
  if (!(["*", "^", "~"].includes(version) && packages.some((candidate) => candidate.name === target))) {
    throw new Error(`unknown or unsupported workspace dependency ${name}: ${range} in ${owner.name}`);
  }
  return target;
}

function declarationPackageInputs(
  name: string,
  packages: readonly PolicyWorkspacePackage[],
  authoredPaths: readonly string[],
  root: string,
): { readonly manifest: string; readonly sourceRoots: readonly string[]; readonly dependencies: readonly string[] } {
  const owner = packages.find((candidate) => candidate.name === name);
  if (owner === undefined) {
    throw new Error(`native declaration workspace manifest is missing: ${name}`);
  }
  const manifest = owner.path === "." ? "package.json" : `${owner.path}/package.json`;
  if (!authoredPaths.includes(manifest)) {
    throw new Error(`native declaration workspace manifest is not authored: ${manifest}`);
  }
  const sourceRoots = [
    ...new Set(
      Object.values(POPULATION_ROOTS)
        .flat()
        .filter((prefix) => prefix.startsWith(`${owner.path}/`) && prefix.endsWith("/src/")),
    ),
  ];
  if (sourceRoots.length === 0) {
    throw new Error(`native declaration workspace has no canonical source owner: ${name}`);
  }
  const data = workspaceManifest.parse(JSON.parse(readFileSync(resolve(root, manifest), "utf8")));
  const dependencies = Object.values(data)
    .flatMap((section) => Object.entries(section))
    .filter(([, range]) => range.startsWith(WORKSPACE_PROTOCOL))
    .map(([dependency, range]) => workspaceTarget(dependency, range, owner, { packages, root }));
  return { manifest, sourceRoots, dependencies };
}

/** Declared workspace dependencies invalidate source semantics; this is not a proof of native import exposure. */
export function typedNativeDependencyInputs(
  entry: (typeof TYPED_NATIVE_POLICIES)[number],
  authoredPaths: readonly string[],
  root?: string,
  configs?: readonly string[],
): { readonly paths: readonly string[]; readonly roots: readonly string[]; readonly unknownCompiler: boolean } {
  const base = [...entry.inputs, ...compilerConfigRoster(authoredPaths)];
  if (entry.processPrivate) {
    if (root === undefined || !statSync(root).isDirectory()) {
      throw new Error(`native process-private dependency owner is missing for ${entry.id}`);
    }
    const manifests = authoredPaths.filter(packageManifestPath);
    return { paths: [...new Set([...base, ...manifests])], roots: authoredInputRoots, unknownCompiler: true };
  }
  if (entry.declarationPackage === undefined) {
    return { paths: [...new Set(base)], roots: [], unknownCompiler: false };
  }
  if (root === undefined) {
    throw new Error(`native declaration dependency owner is missing for ${entry.id}`);
  }
  const inventory = readPolicyRepositoryInventory(root);
  const packages = readPolicyWorkspacePackages(inventory);
  const pending = [entry.declarationPackage];
  const visited = new Set<string>();
  const manifests = new Set<string>();
  const roots = new Set<string>();
  for (const name of pending) {
    if (visited.has(name)) {
      continue;
    }
    visited.add(name);
    const owner = declarationPackageInputs(name, packages, authoredPaths, root);
    manifests.add(owner.manifest);
    for (const prefix of owner.sourceRoots) {
      roots.add(prefix);
    }
    for (const dependency of owner.dependencies) {
      pending.push(dependency);
    }
  }
  const declarations = (configs === undefined ? [] : readCompilerProgramGraph(inventory, configs))
    .filter((program) => program.files.some((path) => [...roots].some((prefix) => path.startsWith(prefix))))
    .flatMap((program) => program.files.filter((path) => path.endsWith(".d.ts")));
  return {
    paths: [...new Set([...base, ...manifests, ...declarations, ...authoredPaths.filter((path) => [...roots].some((prefix) => path.startsWith(prefix)))])],
    roots: [...roots],
    unknownCompiler: configs === undefined,
  };
}

/** Native compiler settings and inherited bases share cache identity with current dependency source bytes. */
export function typedNativeInputPaths(
  entry: (typeof TYPED_NATIVE_POLICIES)[number],
  authoredPaths: readonly string[],
  root?: string,
  configs?: readonly string[],
): readonly string[] {
  return typedNativeDependencyInputs(entry, authoredPaths, root, configs).paths;
}

/** Changed config identities invalidate the current roster, not an obsolete config's required existence. */
export function validateTypedCompilerInputs(root: string, paths: readonly string[]): boolean {
  if (compilerConfigRoster(paths).length === 0) {
    return false;
  }
  for (const config of compilerConfigRoster(readPolicyRepositoryInventory(root).paths)) {
    readFileSync(resolve(root, config));
  }
  return true;
}

function packageManifestPath(path: string): boolean {
  return path === "package.json" || path.endsWith("/package.json");
}

function typedDependencyChanged(data: ReturnType<typeof typedNativeDependencyInputs>, path: string, processPrivate: boolean): boolean {
  const prefix = path.replace(/\/$/u, "");
  return (
    (processPrivate && packageManifestPath(path)) ||
    (data.unknownCompiler && path.endsWith(".d.ts")) ||
    data.paths.includes(path) ||
    data.roots.some((root) => path.startsWith(root) || root.startsWith(`${prefix}/`))
  );
}

/** Dependency checks may defer native admission, never establish its population or compiler authority. */
export function typedNativeDependencySignal(
  entry: (typeof TYPED_NATIVE_POLICIES)[number],
  paths: readonly string[],
  authoredPaths: readonly string[],
  root: string,
): boolean {
  if (entry.processPrivate) {
    const inputs = typedNativeDependencyInputs(entry, authoredPaths, root);
    return paths.some((path) => typedDependencyChanged(inputs, path, true));
  }
  if (entry.declarationPackage === undefined) {
    return false;
  }
  if (!readPolicyWorkspacePackages(readPolicyRepositoryInventory(root)).some((owner) => owner.name === entry.declarationPackage)) {
    // Only native admission can establish whether an absent declaration owner is required.
    return true;
  }
  const data = typedNativeDependencyInputs(entry, authoredPaths, root);
  return paths.some((path) => typedDependencyChanged(data, path, entry.processPrivate));
}

/** Actual native admission retains the family and its original owner route after invalidation. */
export function typedNativeMetadataSelection(
  family: EslintNativeMetadataFamily,
  entry: (typeof TYPED_NATIVE_POLICIES)[number],
  { paths, direct }: { readonly paths: readonly string[]; readonly direct: boolean },
  data: ReturnType<typeof typedNativeDependencyInputs>,
): readonly EslintNativeMetadataFamily[] {
  return direct || paths.some((path) => typedDependencyChanged(data, path, entry.processPrivate))
    ? [{ ...family, inputs: data.paths, patterns: direct ? ["."] : entry.dependencyScope }]
    : [];
}
