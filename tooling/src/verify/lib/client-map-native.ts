import { ESLINT_NATIVE_EXECUTION_INPUT_PATHS } from "../contract/config-snapshot.ts";
/** Canonical data and implementation changes must rejudge the native parallel-map wall. */
export const CLIENT_MAP_NATIVE_INPUT_PATHS = [
  "eslint.config.js",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "packages/client/src/state/section-ids.ts",
  "packages/client/src/state/modal-slot-ids.ts",
  "packages/client/src/state/config-group-ids.ts",
  "packages/client/src/state/chrome-registry.ts",
  "packages/client/src/state/section-registry.ts",
  "tooling/src/verify/contract/registry-definition-home.ts",
  "tooling/src/verify/lib/registry-definition-home.ts",
  "tooling/src/verify/lib/client-map-native.ts",
  ...ESLINT_NATIVE_EXECUTION_INPUT_PATHS,
] as const;

export const CLIENT_MAP_NATIVE_RULE = "orb/no-parallel-section-map";

/** Includes deleted inputs and containing directory requests, not just current source paths. */
export function affectsClientMapNativeLint(path: string): boolean {
  const prefix = path.replace(/\/$/u, "");
  return path === "." || CLIENT_MAP_NATIVE_INPUT_PATHS.some((input) => input === path || input.startsWith(`${prefix}/`));
}
