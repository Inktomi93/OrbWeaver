// One source population and metadata seam for the mandatory native type-comment boundary.

import { matchesGlob } from "node:path";
import { ESLINT_NATIVE_EXECUTION_INPUT_PATHS } from "../contract/config-snapshot.ts";

export const SOURCE_TYPE_SUPPRESSION_RULE = "@typescript-eslint/ban-ts-comment";
export const SOURCE_TYPE_SUPPRESSION_GLOBS = [
  "*.ts",
  "packages/*/*.ts",
  "packages/*/bundles/**/*.ts",
  "packages/*/src/**/*.{ts,tsx}",
  "playwright/**/*.{ts,tsx}",
  "tooling/src/**/*.{ts,tsx}",
  "scripts/**/*.{ts,tsx}",
] as const;
export const SOURCE_TYPE_SUPPRESSION_EXCLUSIONS = ["scripts/probes/st-goldens/sillytavern-runtime/**", "**/.cache/**"] as const;
export const SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS = [
  "eslint.config.js",
  "eslint-hard.config.js",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tooling/src/verify/lib/source-type-suppression-native.ts",
  "tooling/src/verify/lib/selection.ts",
  ...ESLINT_NATIVE_EXECUTION_INPUT_PATHS,
] as const;

export function isSourceTypeSuppressionSource(path: string): boolean {
  return SOURCE_TYPE_SUPPRESSION_GLOBS.some((glob) => matchesGlob(path, glob)) && !SOURCE_TYPE_SUPPRESSION_EXCLUSIONS.some((glob) => matchesGlob(path, glob));
}

export function affectsSourceTypeSuppressionNativeLint(path: string): boolean {
  const prefix = path.replace(/\/$/u, "");
  return path === "." || SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS.some((input) => input === path || input.startsWith(`${prefix}/`));
}
