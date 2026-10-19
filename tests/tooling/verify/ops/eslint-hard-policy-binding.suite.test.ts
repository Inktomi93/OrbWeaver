// Gate modules resolve no binding or origin themselves; the ban runs through the non-suppressible native profile.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint } from "eslint";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { scaledBudget } from "../../_load-budget.ts";

const RULE = "orb/policy-binding-resolution";
const GATE = "tooling/src/verify/gates/probe.ts";
const HARD_CONFIG = "eslint-hard.config.js";
const NODE_IMPORT = 'import type { Node } from "ts-morph";\n';

const NODE_SIDE = ["getDefinitionNodes", "getDefinitions", "findReferences", "findReferencesAsNodes", "getImplementations"] as const;
const SYMBOL_SIDE = ["getValueDeclaration", "getValueDeclarationOrThrow", "getAliasedSymbol", "getAliasedSymbolOrThrow"] as const;

const probe = (body: string): string => `${NODE_IMPORT}${body}\n`;

const flagged: readonly { readonly name: string; readonly source: string; readonly errors: number }[] = [
  ...NODE_SIDE.map((member) => ({
    name: `node-side ${member}`,
    source: probe(`export const probe = (node: Node): unknown => node.${member}();`),
    errors: 1,
  })),
  {
    name: "getSymbol()?.getDeclarations() chain",
    source: probe("export const probe = (node: Node): unknown => node.getSymbol()?.getDeclarations();"),
    errors: 1,
  },
  {
    name: "getSymbol().getDeclarations() without the optional chain",
    source: probe("export const probe = (node: Node): unknown => node.getSymbol().getDeclarations();"),
    errors: 1,
  },
  {
    name: "bracket spelling of the chain",
    source: probe('export const probe = (node: Node): unknown => node.getSymbol()?.["getDeclarations"]();'),
    errors: 1,
  },
  ...SYMBOL_SIDE.map((member) => ({
    name: `symbol-side ${member}`,
    source: probe(`export const probe = (node: Node): unknown => node.getSymbol()?.${member}();`),
    errors: 1,
  })),
  {
    name: "const alias invoked through call",
    source: probe("export const probe = (node: Node): unknown => {\n  const walk = node.getDefinitionNodes;\n  return walk.call(node);\n};"),
    errors: 1,
  },
  {
    name: "destructured member",
    source: probe("export const probe = (node: Node): unknown => {\n  const { getDefinitionNodes } = node;\n  return getDefinitionNodes;\n};"),
    errors: 1,
  },
  {
    name: "two sites are two findings",
    source: probe("export const probe = (node: Node): unknown => [node.getDefinitionNodes(), node.getSymbol()?.getAliasedSymbol()];"),
    errors: 2,
  },
  {
    name: "inline disable cannot suppress the hard rule",
    source: `// eslint-disable-next-line ${RULE} -- Attempted hard bypass.\n${probe("export const probe = (node: Node): unknown => node.getDefinitionNodes();")}`,
    errors: 1,
  },
];

const passing: readonly { readonly name: string; readonly source: string; readonly path?: string }[] = [
  {
    name: "a syntax accessor of the same name as the symbol member",
    source:
      'import type { SourceFile } from "ts-morph";\nexport const probe = (file: SourceFile): unknown => file.getVariableStatements().flatMap((statement) => statement.getDeclarations());\n',
  },
  {
    name: "a local class carrying getDeclarations",
    source:
      "class Registry {\n  getDeclarations(): string[] {\n    return [];\n  }\n}\nexport const probe = (): unknown => new Registry().getDeclarations();\n",
  },
  { name: "getSymbol alone resolves nothing", source: probe("export const probe = (node: Node): unknown => node.getSymbol();") },
  {
    name: "a symbol compared for identity",
    source: probe("export const same = (a: Node, b: Node): boolean => a.getSymbol() === b.getSymbol();"),
  },
  {
    name: "the shared proof fixtures stay outside the ban",
    path: "tooling/src/verify/gates/_proof/probe.ts",
    source: probe("export const probe = (node: Node): unknown => node.getDefinitionNodes();"),
  },
  {
    name: "other tooling modules are outside the gate population",
    path: "tooling/src/verify/lib/probe.ts",
    source: probe("export const probe = (node: Node): unknown => node.getDefinitionNodes();"),
  },
];

async function lint(repoRoot: string, path: string, source: string): Promise<ESLint.LintResult | undefined> {
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, HARD_CONFIG), allowInlineConfig: false });
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, path) });
  return result;
}

test.for(flagged)("native hard binding resolution flags $name", { timeout: scaledBudget(60_000) }, async (row, { repoRoot }) => {
  const result = await lint(repoRoot, GATE, row.source);
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages).toHaveLength(row.errors);
  expect(result?.messages.every(({ ruleId }) => ruleId === RULE)).toBe(true);
});

test.for(passing)("native hard binding resolution passes $name", { timeout: scaledBudget(60_000) }, async (row, { repoRoot }) => {
  const result = await lint(repoRoot, row.path ?? GATE, row.source);
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages).toEqual([]);
});

test(
  "the rule is hard-only: the ordinary profile never enables it",
  async ({ repoRoot }) => {
    const path = join(repoRoot, GATE);
    const ordinary = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(path);
    const hard = await new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, HARD_CONFIG), allowInlineConfig: false }).calculateConfigForFile(path);
    expect(ordinary?.rules?.[RULE]).toBeUndefined();
    expect(hard?.rules?.[RULE]).toEqual([2]);
    expect(hard?.linterOptions?.noInlineConfig).toBe(true);
    expect(hard?.languageOptions?.parserOptions).toMatchObject({ project: false, projectService: false, programs: null });
  },
  scaledBudget(60_000),
);

test(
  "the real scoped runner refuses a planted gate module through the production HARD profile",
  async ({ plantedTree, repoRoot, runCli }) => {
    const root = await plantedTree({
      "package.json": '{"name":"native-hard-binding-fixture","type":"module","private":true}',
      "eslint.config.js": 'export default [{ files: ["**/*.ts"] }];',
      [HARD_CONFIG]: `import { hardConfig } from ${JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href)}; export default [...hardConfig];`,
      "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
      // The fixture's ordinary config has no TypeScript parser, so the planted module stays plain JavaScript syntax.
      [GATE]: `/* eslint "no-restricted-syntax":"off", "@eslint-community/eslint-comments/no-use":"off" */\nexport const probe = (node) => node.getDefinitionNodes();\n`,
    });
    execFixtureGit(root, ["init", "-q"]);
    execFixtureGit(root, ["add", "."]);
    const result = await runCli("verify", ["eslint-scoped", GATE], { cwd: root });
    await expect(result).toExitWith(1);
    expect(result.stdout).toContain(RULE);
    expect(result.stdout).toContain("1 error, 0 warnings");
  },
  scaledBudget(60_000),
);
