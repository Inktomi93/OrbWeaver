/** Native lexical rule and helper changes rejudge the actual frontend syntax population. */
export const CLIENT_LEXICAL_NATIVE_INPUT_PATHS = [
  "eslint.config.js",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tooling/src/verify/lib/tailwind-class-token.ts",
  "tooling/src/verify/lib/client-lexical-native.ts",
  "tooling/src/verify/ops/eslint.ts",
] as const;

export const CLIENT_LEXICAL_NATIVE_RULES = ["orb/testid-typed-only", "orb/scroll-container-positioned"] as const;

/** Deleted helpers remain inputs; containing-directory requests retain the same dependency. */
export function affectsClientLexicalNativeLint(path: string): boolean {
  const prefix = path.replace(/\/$/u, "");
  return path === "." || CLIENT_LEXICAL_NATIVE_INPUT_PATHS.some((input) => input === path || input.startsWith(`${prefix}/`));
}
