// Native typed policy scopes and source dependencies are shared by configuration, cache identity and changed selection.

import { ID_BRAND_HOME } from "../../floor/code-facts/id-brand.ts";
import { compilerConfigRoster } from "../../floor/compiler/compiler-programs.ts";
import { POPULATION_ROOTS, POPULATION_SETS } from "../contract/population.ts";

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
const brandRoots = ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference", "@tests"] as const;
const product = POPULATION_SETS["@product"].flatMap((root) => POPULATION_ROOTS[root].map((prefix) => `${prefix}**/*.{ts,tsx}`));
const AMBIENT_INPUTS = [
  ...SCALAR_INPUTS,
  "tooling/src/floor/code-facts/reference-fact-global.ts",
  "tooling/src/floor/code-facts/reference-fact-member.ts",
  "tooling/src/verify/lib/ambient-determinism.ts",
  "tooling/src/verify/lib/origin-verdict.ts",
];

export const TYPED_NATIVE_POLICIES = [
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
].map((entry) => ({ ...entry, homes: [], notUnder: [...(entry.notUnder ?? []), "tests/legacy/**"] }));

/** Deleted inputs and containing-directory selections retain the dependent native population. */
export function affectsTypedNativeLint(path: string): boolean {
  const prefix = path.replace(/\/$/u, "");
  return (
    path === "." ||
    compilerConfigRoster([path]).length > 0 ||
    TYPED_NATIVE_POLICIES.some((entry) => entry.inputs.some((input) => input === path || input.startsWith(`${prefix}/`)))
  );
}

/** Native compiler settings and their inherited authored bases participate in the same cache identity. */
export function typedNativeInputPaths(entry: (typeof TYPED_NATIVE_POLICIES)[number], authoredPaths: readonly string[]): readonly string[] {
  return [...new Set([...entry.inputs, ...compilerConfigRoster(authoredPaths)])];
}
