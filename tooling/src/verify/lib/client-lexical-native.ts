/** Native lexical rule and helper changes rejudge the actual frontend syntax population. */
export const CLIENT_LEXICAL_NATIVE_INPUT_PATHS = [
  "eslint.config.js",
  "packages/ui/src/primitives/button/size-hit-area.ts",
  "packages/ui/package.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tooling/src/verify/lib/tailwind-class-token.ts",
  "tooling/src/verify/lib/raw-spacing-tier.ts",
  "tooling/src/verify/lib/raw-typography-tier.ts",
  "tooling/src/verify/lib/client-lexical-native.ts",
  "tooling/src/verify/ops/eslint.ts",
] as const;

export const CLIENT_LEXICAL_NATIVE_RULES = [
  "orb/zustand-selector-derived",
  "orb/no-raw-spacing-in-features",
  "orb/no-raw-typography-in-features",
  "orb/no-hover-display-swap",
  "orb/no-floorless-control-in-wrap",
  "orb/testid-typed-only",
  "orb/scroll-container-positioned",
  "orb/ui-size-via-variant",
] as const;

/** Deleted helpers remain inputs; containing-directory requests retain the same dependency. */
export function affectsClientLexicalNativeLint(path: string): boolean {
  const prefix = path.replace(/\/$/u, "");
  return path === "." || CLIENT_LEXICAL_NATIVE_INPUT_PATHS.some((input) => input === path || input.startsWith(`${prefix}/`));
}
