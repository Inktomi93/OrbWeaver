// Drives one native `orb/*` rule through the repo's real ESLint config for a chosen path, the way the product lint does.
import { join } from "node:path";
import { expect } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const engines = new Map<string, ESLint>();

export async function ruleMessages(root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const engine = engines.get(root) ?? new ESLint({ cwd: root });
  engines.set(root, engine);
  const config = await engine.calculateConfigForFile(filename);
  expect(config, path).toBeDefined();
  const found = new Linter({ cwd: root }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      settings: config.settings ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found;
}
