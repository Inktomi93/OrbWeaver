// Size limits use the effective ESLint configuration; fixtures never acquire compiler programs.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const ROOT = join(import.meta.dirname, "../../../..");
const eslint = new ESLint({ cwd: ROOT });
const RULE = "max-lines";

async function findings(path: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx,mjs}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    path,
  ).toEqual([]);
  return messages;
}

function lines(count: number, separator = "\n", terminal = true): string {
  return Array.from({ length: count }, () => "// counted comment").join(separator) + (terminal ? separator : "");
}

test("native size limits preserve every cap, route allowance and nested CLI boundary", async () => {
  for (const [path, cap] of [
    ["packages/client/src/features/chat/lib/size.ts", 450],
    ["packages/client/src/features/chat/ui/size.tsx", 450],
    ["packages/client/src/routes/size.tsx", 500],
    ["packages/ui/src/primitives/button/size.tsx", 450],
    ["tooling/src/snap/ops/size.ts", 450],
    ["tooling/src/snap/cli.ts", 200],
    ["tooling/src/snap/nested/cli.ts", 200],
    ["tests/tooling/verify/ops/size.test.ts", 1000],
    ["tests/client/_ct-stories.tsx", 1000],
    ["tests/support/node/size.mjs", 1000],
  ] as const) {
    for (const separator of ["\n", "\r\n"]) {
      for (const terminal of [false, true]) {
        expect(await findings(path, lines(cap, separator, terminal)), path).toEqual([]);
        expect(await findings(path, lines(cap + 1, separator, terminal)), path).toMatchObject([{ ruleId: RULE, line: cap + 1, severity: 2 }]);
      }
    }
  }
  expect(await findings("packages/client/src/routes/size.tsx", lines(451))).toEqual([]);
  expect(await findings("packages/client/src/features/size.tsx", "\n".repeat(451))).toHaveLength(1);
});

test("native size scopes preserve generated, declaration, CT and fixture distinctions", async () => {
  for (const path of [
    "packages/client/src/features/size.ct.tsx",
    "packages/client/src/features/size.fixtures.tsx",
    "packages/ui/src/tokens/index.ts",
    "tooling/src/snap/size.gen.ts",
    "tooling/src/snap/size.d.ts",
    "tests/tooling/size.gen.ts",
    "tests/tooling/size.d.ts",
  ]) {
    expect(await findings(path, lines(1001)), path).toHaveLength(1);
  }
  for (const path of [
    "packages/client/src/features/size.test.tsx",
    "packages/client/src/features/size.spec.ts",
    "packages/client/src/features/size.gen.ts",
    "packages/client/src/features/size.gen.tsx",
    "packages/client/src/features/size.d.ts",
    "packages/ui/src/primitives/size.test.ts",
    "packages/ui/src/primitives/size.spec.tsx",
    "packages/ui/src/primitives/size.ct.tsx",
    "packages/ui/src/primitives/size.fixtures.tsx",
    "packages/ui/src/primitives/size.gen.ts",
    "packages/ui/src/primitives/size.d.ts",
    "tooling/src/verify/gates/size.ts",
    "tests/legacy/tooling/size.test.ts",
    "packages/kit/src/size.ts",
    "scripts/size.ts",
    "tests/support/iso/size.mjs",
    "tests/tooling/size.js",
  ]) {
    expect(await findings(path, lines(1001)), path).toEqual([]);
  }
  for (const root of ["packages/client/src", "packages/ui/src"]) {
    for (const directory of ["node_modules", "dist", "__screenshots__"]) {
      const config = await eslint.calculateConfigForFile(join(ROOT, root, directory, "size.ts"));
      expect(config?.rules[RULE], `${root}/${directory}`).toBeUndefined();
    }
  }
  const tokenConfig = await eslint.calculateConfigForFile(join(ROOT, "packages/ui/src/tokens/index.ts"));
  expect(tokenConfig.rules["@typescript-eslint/no-floating-promises"]).toBeUndefined();
});

test("native line separators and empty files follow ESLint rather than a custom count adapter", async () => {
  const path = "packages/client/src/features/size.ts";
  expect(await findings(path, "")).toEqual([]);
  for (const separator of ["\r", "\u2028", "\u2029"]) {
    expect(await findings(path, lines(450, separator))).toEqual([]);
    expect(await findings(path, lines(451, separator))).toMatchObject([{ ruleId: RULE, line: 451 }]);
  }
});

test("native bulk debt never licenses a fresh oversize subject", async ({ scratch }) => {
  const config = await eslint.calculateConfigForFile(join(ROOT, "tests/tooling/size.test.ts"));
  expect(config.rules[RULE]).toBeDefined();
  const suppressions = join(scratch, "eslint-suppressions.json");
  writeFileSync(suppressions, JSON.stringify({ "old.test.ts": { [RULE]: { count: 1 } } }));
  const native = new ESLint({
    cwd: scratch,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
        rules: { [RULE]: config.rules[RULE] },
      },
    ],
    applySuppressions: true,
    suppressionsLocation: suppressions,
  });
  const [existing] = await native.lintText(lines(1001), { filePath: join(scratch, "old.test.ts") });
  expect(existing?.errorCount).toBe(0);
  expect(existing?.suppressedMessages).toMatchObject([{ ruleId: RULE }]);
  const [fresh] = await native.lintText(lines(1001), { filePath: join(scratch, "fresh.test.ts") });
  expect(fresh?.errorCount).toBe(1);
  expect(fresh?.messages).toMatchObject([{ ruleId: RULE, line: 1001 }]);
  const [corrected] = await native.lintText(lines(1000), { filePath: join(scratch, "old.test.ts") });
  expect(corrected?.messages).toEqual([]);
  expect(corrected?.suppressedMessages).toEqual([]);
});
