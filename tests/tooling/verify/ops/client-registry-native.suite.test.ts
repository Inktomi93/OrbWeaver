import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const SECTION = "orb/section-route-registry-map";
const MODAL = "orb/modal-route-registry-map";

async function messages(eslint: ESLint, filename: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  return new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: Object.fromEntries([SECTION, MODAL].map((rule) => [rule, config.rules[rule] ?? "off"])),
    },
    { filename },
  );
}

for (const [name, rule] of [
  ["sections", SECTION],
  ["modals", MODAL],
] as const) {
  test(`actual native route restriction rejects the ${name} override map`, async ({ repoRoot }) => {
    const eslint = new ESLint({ cwd: repoRoot });
    expect(await messages(eslint, join(repoRoot, "packages/client/src/routes/probe.tsx"), `const view = <Shell ${name}={{ x: 1 }} />;`)).toMatchObject([
      { ruleId: rule },
    ]);
    expect(await messages(eslint, join(repoRoot, "packages/client/src/routes/probe.tsx"), `const view = <Shell ${name}={({ x: 1 })} />;`)).toMatchObject([
      { ruleId: rule },
    ]);
  });
}

test("registry forwarding and unrelated route props retain the old exact syntax boundary", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const filename = join(repoRoot, "packages/client/src/routes/probe.tsx");
  for (const source of [
    "const view = <Shell sections={registry} modals={modals} />;",
    "const view = <Shell overrides={{ x: 1 }} />;",
    "const view = <Shell sections={({ x: 1 } as const)} />;",
    "const view = <Shell modals={({ x: 1 } satisfies Record<string, number>)} />;",
    "const view = <Shell sections={(registry)} modals={(lookup())} />;",
  ]) {
    expect(await messages(eslint, filename, source), source).toEqual([]);
  }
});

test("the same object props outside routes are not registry override maps", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const filename of [
    "packages/client/src/features/probe/components/probe.tsx",
    "packages/client/src/compose/probe.tsx",
    "tests/client/features/probe/probe.ct.tsx",
    "packages/server/src/probe.tsx",
  ]) {
    expect(await messages(eslint, join(repoRoot, filename), "const view = <Shell sections={{ x: 1 }} modals={{ y: 2 }} />;"), filename).toEqual([]);
  }
});
