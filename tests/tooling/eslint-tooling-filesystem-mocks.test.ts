import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

test("tooling tests use real temporary files instead of replacing filesystem modules", { timeout: 120_000 }, async ({ repoRoot }) => {
  const filename = join(repoRoot, "tests/tooling/stack/ops/prod-state.test.ts");
  const config = await new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot }).calculateConfigForFile(filename);
  const native = {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
    rules: { "no-restricted-syntax": config.rules["no-restricted-syntax"] ?? "off" },
  };
  const linter = new Linter();
  for (const source of [
    'import { readFileSync } from "node:fs"; readFileSync(path, "utf8");',
    'const root = await plantedTree({ ".env": "PORT=12345" }); readEnvFile(root);',
    'vi.stubEnv("STACK_RUN_DIR", scratch);',
    'vi.mock("node:path", () => ({}));',
    'vi.mock("node:timers/promises", () => ({}));',
  ]) {
    expect(linter.verify(source, native, { filename }), source).toEqual([]);
  }
  for (const module of ["fs", "node:fs", "fs/promises", "node:fs/promises"]) {
    for (const call of ["vi.mock", "vi.doMock", 'vi["mock"]', 'vi["doMock"]', "mock", "doMock"]) {
      for (const argument of [JSON.stringify(module), `import(${JSON.stringify(module)})`]) {
        const source = `${call}(${argument}, () => ({}));`;
        const found = linter.verify(source, native, { filename });
        expect(
          found.map(({ ruleId }) => ruleId),
          source,
        ).toEqual(["no-restricted-syntax"]);
        expect(found[0]?.message, source).toContain("scratch");
      }
    }
  }
});
