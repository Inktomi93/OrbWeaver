import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { scaledBudget } from "../../_load-budget.ts";

// The first call in a process pays the repo ESLint config load.
const LOAD = { timeout: scaledBudget(120_000) };
const HOST = "packages/client/src/features/config/surfaces/config-content-surface.tsx";

async function messages(eslint: ESLint, filename: string, source: string, rule: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  return new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
}

const DEFINITIONS = [
  { rule: "orb/chrome-definition-home", type: "ChromeEntry", slot: "chrome", value: '{ id: "x" }' },
  { rule: "orb/home-tile-definition-home", type: "HomeTileContribution", slot: "tile", value: '{ id: "x" }' },
  { rule: "orb/section-definition-home", type: "SectionDefinition", slot: "section", value: '{ id: "x" }' },
  { rule: "orb/config-group-definition-home", type: "ConfigGroupDefinition", slot: "group", value: '{ id: "x" }' },
  { rule: "orb/collection-definition-home", type: "CollectionContribution", slot: "collection", value: '{ emptyText: "x" }' },
] as const;

for (const { rule, type, slot, value } of DEFINITIONS) {
  test(`${type} is declared only in its co-located ${slot} home`, LOAD, async ({ repoRoot }) => {
    const eslint = new ESLint({ cwd: repoRoot });
    const source = `export const x: ${type} = ${value};`;
    for (const filename of [
      `packages/client/src/features/x/lib/not-a-${slot}-file.ts`,
      `packages/client/src/features/x/components/x-${slot}.tsx`,
      `packages/client/src/features/x/lib/nested/x-${slot}.ts`,
      "packages/client/src/state/stray.ts",
      "packages/client/src/compose/stray.ts",
    ]) {
      expect(await messages(eslint, join(repoRoot, filename), source, rule), filename).toMatchObject([{ ruleId: rule }]);
    }
    for (const filename of [`packages/client/src/features/x/lib/x-${slot}.ts`, `packages/client/src/features/x/lib/x-${slot}.tsx`]) {
      expect(await messages(eslint, join(repoRoot, filename), source, rule), filename).toEqual([]);
    }
  });

  test(`${type} is an object literal written in its ${slot} file`, LOAD, async ({ repoRoot }) => {
    const eslint = new ESLint({ cwd: repoRoot });
    const literal = "orb/registry-definition-literal";
    const home = join(repoRoot, `packages/client/src/features/x/lib/x-${slot}.tsx`);
    for (const source of [
      `import { shared } from "../../shared/lib/shared.ts";\nexport const x: ${type} = shared;`,
      `declare const built: { readonly id: string };\nexport const x: ${type} = built;`,
      `declare function make(): { readonly id: string };\nexport const x: ${type} = make();`,
      `const def = ${value};\nexport const x: ${type} = def;`,
    ]) {
      expect(await messages(eslint, home, source, literal), source).toMatchObject([{ ruleId: literal }]);
    }
    expect(await messages(eslint, home, `export const x: ${type} = ${value};`, literal)).toEqual([]);
    expect(await messages(eslint, home, `export const LIST: readonly ${type}[] = [];`, literal)).toEqual([]);
    // Outside a home the co-location rule judges the declaration; this rule has no scope there.
    const stray = join(repoRoot, `packages/client/src/features/x/lib/not-a-${slot}-file.ts`);
    expect(await messages(eslint, stray, `import { shared } from "./shared.ts";\nexport const x: ${type} = shared;`, literal)).toEqual([]);
  });

  test(`${type} lists and assembly annotations are not definitions`, LOAD, async ({ repoRoot }) => {
    const eslint = new ESLint({ cwd: repoRoot });
    const filename = join(repoRoot, "packages/client/src/compose/assembly.ts");
    for (const source of [
      `export const LIST: readonly ${type}[] = [];`,
      `export const ENTRIES: ${type}[] = [];`,
      `export function use(entry: ${type}): void {}`,
    ]) {
      expect(await messages(eslint, filename, source, rule), source).toEqual([]);
    }
  });

  test(`${type} outside the client source is not governed`, LOAD, async ({ repoRoot }) => {
    const eslint = new ESLint({ cwd: repoRoot });
    const source = `export const x: ${type} = ${value};`;
    for (const filename of ["tests/support/browser/stray.tsx", "packages/server/src/stray.ts"]) {
      expect(await messages(eslint, join(repoRoot, filename), source, rule), filename).toEqual([]);
    }
  });
}

test("a section factory is a definition by its return type", LOAD, async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const rule = "orb/section-definition-home";
  const declared = "export function makeXSection(): SectionDefinition { return { id: 'x' }; }";
  const arrow = "export const makeXSection = (): SectionDefinition => ({ id: 'x' });";
  for (const source of [declared, arrow]) {
    expect(await messages(eslint, join(repoRoot, "packages/client/src/features/x/lib/stray.ts"), source, rule), source).toMatchObject([{ ruleId: rule }]);
    expect(await messages(eslint, join(repoRoot, "packages/client/src/features/x/lib/x-section.tsx"), source, rule), source).toEqual([]);
  }
});

test("the config content host reads bodies off the registries instead of importing a feature", LOAD, async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const rule = "orb/config-host-no-feature-import";
  // The rule is keyed by this path; a moved host would leave it judging nothing, so the move reds here.
  expect(existsSync(join(repoRoot, HOST)), `${HOST} moved: update CLIENT_CONFIG_HOST in eslint.config.js`).toBe(true);
  for (const source of ['import { Panel } from "#features/persona";', 'import { Panel } from "../../persona/index.ts";']) {
    expect(await messages(eslint, join(repoRoot, HOST), source, rule), source).toMatchObject([{ ruleId: rule }]);
  }
  for (const source of ['import type { ConfigGroupRegistry } from "#state";', 'import { Placeholder } from "../components/config-group-placeholder.tsx";']) {
    expect(await messages(eslint, join(repoRoot, HOST), source, rule), source).toEqual([]);
  }
  expect(
    await messages(eslint, join(repoRoot, "packages/client/src/features/config/surfaces/other.tsx"), 'import { Panel } from "#features/persona";', rule),
  ).toEqual([]);
});
