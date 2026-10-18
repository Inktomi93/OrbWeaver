import { matchesGlob } from "node:path";
import { HELPER_WORLD_DIRS } from "../../floor/compiler/project-worlds.ts";
import { LEGACY_TEST_ROOT } from "../../floor/testing/test-population.ts";
import { ESLINT_NATIVE_EXECUTION_INPUT_PATHS } from "../contract/config-snapshot.ts";

export const TEST_PACKAGE_SUBPATH_RULE = "orb/tests-package-subpath";
export const TOOLING_ROOT_CONFIG_IMPORT_RULE = "orb/tooling-root-config-import";
export const TEST_IMPORT_GLOBS = ["tests/**/*.{ts,tsx}", `${HELPER_WORLD_DIRS.node}/**/*.mjs`] as const;
export const TEST_IMPORT_EXCLUSIONS = [`${LEGACY_TEST_ROOT}/**`] as const;
export const TOOLING_IMPORT_GLOBS = ["tooling/src/**/*.{ts,tsx}"] as const;
export const CONFIG_ANCHOR_OWNER = "packages/client/src/state/config-section-registry.ts";
export const CONFIG_ANCHOR_FORMATTER = "configAnchorId";
export const TEST_TOOLING_IMPORT_NATIVE_FAMILIES = [
  { hard: true, patterns: TEST_IMPORT_GLOBS, rules: [TEST_PACKAGE_SUBPATH_RULE], label: "test-import-native" },
  { hard: true, patterns: TOOLING_IMPORT_GLOBS, rules: [TOOLING_ROOT_CONFIG_IMPORT_RULE], label: "tooling-import-native" },
  { hard: true, patterns: [CONFIG_ANCHOR_OWNER], rules: ["no-restricted-exports", "no-restricted-syntax"], label: "config-anchor-native" },
] as const;
export const TEST_TOOLING_IMPORT_NATIVE_INPUT_PATHS = [
  "eslint.config.js",
  "eslint-hard.config.js",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tooling/src/verify/lib/test-tooling-imports-native.ts",
  "tooling/src/floor/code-facts/module-specifier.ts",
  "tooling/src/floor/compiler/project-worlds.ts",
  "tooling/src/floor/testing/test-population.ts",
  ...ESLINT_NATIVE_EXECUTION_INPUT_PATHS,
  "tooling/src/verify/lib/selection.ts",
] as const;

/** Native Node helper JavaScript is a test subject even though it has no TypeScript suffix. */
export function isTestImportNativeSource(path: string): boolean {
  return TEST_IMPORT_GLOBS.some((glob) => matchesGlob(path, glob)) && !TEST_IMPORT_EXCLUSIONS.some((glob) => matchesGlob(path, glob));
}

/** Shared module-position/path inputs rejudge only their test/tooling subjects. */
export function affectsTestToolingImportsNativeLint(path: string): boolean {
  const prefix = path.replace(/\/$/u, "");
  return path === "." || TEST_TOOLING_IMPORT_NATIVE_INPUT_PATHS.some((input) => input === path || input.startsWith(`${prefix}/`));
}
