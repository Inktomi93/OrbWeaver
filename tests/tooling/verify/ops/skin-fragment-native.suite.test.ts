import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const RULE = "orb/ui-skin-fragment-purity";

async function messages(eslint: ESLint, filename: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  return new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename },
  );
}

for (const signature of [
  "focus-visible:ring-2",
  "before:size-touch-target",
  "rotate-45 border border-border bg-popover",
  "bg-backdrop",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
  "disabled:pointer-events-none disabled:opacity-50",
]) {
  test(`native skin restriction rejects the unfenced signature ${signature}`, async ({ repoRoot }) => {
    const eslint = new ESLint({ cwd: repoRoot });
    expect(
      await messages(eslint, join(repoRoot, "packages/ui/src/primitives/control.ts"), `export const recipe = ${JSON.stringify(signature)};`),
    ).toMatchObject([{ ruleId: RULE }]);
  });
}

test("distinct signatures report independently while repeating one signature is one finding per node", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const filename = join(repoRoot, "packages/ui/src/primitives/control.ts");
  expect(await messages(eslint, filename, 'export const x = "focus-visible:ring-2 bg-backdrop";')).toMatchObject([{ ruleId: RULE }, { ruleId: RULE }]);
  expect(await messages(eslint, filename, 'export const x = "bg-backdrop bg-backdrop";')).toMatchObject([{ ruleId: RULE }]);
});

test("literal, tagged template head-middle-tail, and substring scopes retain their raw source meanings", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const filename = join(repoRoot, "packages/ui/src/primitives/control.tsx");
  for (const source of [
    'export const x = <div className="bg-backdrop" />;',
    "export const x = `bg-backdrop`;",
    'export const x = "before:size-touch-target-wide";',
    'export const x = cn("bg-backdrop");',
  ]) {
    expect(await messages(eslint, filename, source), source).toMatchObject([{ ruleId: RULE }]);
  }
  expect(
    await messages(eslint, filename, "export const x = tagged`bg-backdrop ${value} before:size-touch-target ${value} focus-visible:ring-2`;"),
  ).toMatchObject([{ ruleId: RULE }, { ruleId: RULE }, { ruleId: RULE }]);
  expect(await messages(eslint, filename, String.raw`export const x = "bg\x2dbackdrop";`)).toEqual([]);
});

test("type strings and generated UI declarations remain inside this rule", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["packages/ui/src/primitives/control.ts", "packages/ui/src/tokens/index.ts", "packages/ui/src/primitives/control.d.ts"]) {
    const filename = join(repoRoot, path);
    expect(await messages(eslint, filename, 'export type X = "bg-backdrop";'), path).toMatchObject([{ ruleId: RULE }]);
  }
});

test("the canonical definition home and other packages remain outside the skin ban", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of [
    "packages/ui/src/lib/control.ts",
    "packages/ui/src/lib/nested/control.tsx",
    "packages/client/src/features/control.tsx",
    "packages/kit/src/control.ts",
    "tests/ui/primitives/control.test.ts",
  ]) {
    expect(await messages(eslint, join(repoRoot, path), 'export const x = "bg-backdrop";'), path).toEqual([]);
  }
});

test("composing imported recipes and naming signatures in comments does not re-spell a fragment", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  expect(
    await messages(
      eslint,
      join(repoRoot, "packages/ui/src/primitives/control.tsx"),
      '// bg-backdrop\nimport { SCRIM_BASE as shared } from "#lib"; export const x = <div className={`${shared}`} />;',
    ),
  ).toEqual([]);
});
