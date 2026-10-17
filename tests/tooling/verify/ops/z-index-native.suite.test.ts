import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Z_TOKEN_SCOPES } from "@orb/ui/z-scope";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const RAW = "orb/no-raw-z-index";
const SEMANTIC = "orb/no-unknown-z-index-token";

async function messages(eslint: ESLint, filename: string, source: string, rules: readonly string[] = [RAW, SEMANTIC]): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  return new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: Object.fromEntries(rules.map((id) => [id, config.rules[id] ?? "off"])),
    },
    { filename },
  );
}

for (const row of [
  { name: "direct JSX", source: 'export const x=<div className="z-50"/>;', count: 1 },
  { name: "named composer", source: 'export const x=cn("z-[60]");', count: 1 },
  { name: "inert data", source: 'export const RELEASE_LABEL="z-50";', count: 0 },
  { name: "foreign call inside className", source: 'export const x=<div className={forward("z-50")}/>;', count: 1 },
  { name: "nearest foreign call blocks an outer cn", source: 'export const x=cn(forward("z-50"));', count: 0 },
  { name: "inner named composer survives outer foreign call", source: 'export const x=forward(cn("z-50"));', count: 1 },
  { name: "object values", source: 'export const x=cn({value:"z-50"});', count: 1 },
  { name: "conditional test remains inside the syntactic carrier", source: 'export const x=<div className={"z-50"===value?"a":"b"}/>;', count: 1 },
  { name: "arrow callback", source: 'export const x=cn(()=>"z-50");', count: 1 },
  { name: "nonreturn callback body", source: 'export const x=cn(()=>{const value="z-50";return value;});', count: 1 },
  { name: "non-class attribute can still have a named call carrier", source: 'export const x=cn(<div title="z-50"/>);', count: 1 },
  { name: "nearest non-class attribute does not inherit outer className", source: 'export const x=<div className={<div title="z-50"/>}/>;', count: 0 },
  { name: "nested className reports once", source: 'export const x=<div className={<div className="z-50"/>}/>;', count: 1 },
  { name: "attribute case stays exact", source: 'export const x=<Demo ClassName="z-50"/>;', count: 0 },
  { name: "interpolated raw templates remain outside scope", source: "export const x=cn(`z-50 ${tone}`);", count: 0 },
  { name: "static tagged template", source: "export const x=cn(tag`z-50`);", count: 1 },
  {
    name: "important negative and substring spellings retain one carrier finding",
    source: 'export const x=<div className="!z-50 z-50! -z-10 size-z-50-wide"/>;',
    count: 1,
  },
  { name: "two raw tokens retain one carrier finding", source: 'export const x=<div className="z-50 z-[60]"/>;', count: 1 },
  { name: "type string below className", source: 'export const x=<div className={null as "z-50"}/>;', count: 1 },
  { name: "local composer name is intentionally syntactic", source: 'function cn(value:string){return value;} export const x=cn("z-50");', count: 1 },
  { name: "renamed composer remains outside the name-only envelope", source: 'import {cn as join} from "@orb/ui/lib"; export const x=join("z-50");', count: 0 },
  { name: "namespace composer remains outside the name-only envelope", source: 'export const x=utils.cn("z-50");', count: 0 },
  { name: "simple composer parentheses strengthen detection", source: 'export const x=(cn)("z-50");', count: 1 },
  { name: "raw escapes are not cooked", source: String.raw`export const x=cn("z-\u0035");`, count: 0 },
  { name: "nested arbitrary data retains the existing raw regex envelope", source: `export const x=cn("content-['z-50']");`, count: 1 },
  { name: "new expressions are not call-expression carriers", source: 'export const x=new cn("z-50");', count: 0 },
]) {
  test(`native raw z-index carrier: ${row.name}`, async ({ repoRoot }) => {
    const found = await messages(new ESLint({ cwd: repoRoot }), join(repoRoot, "packages/client/src/probe.tsx"), row.source, [RAW]);
    expect(found, row.source).toHaveLength(row.count);
    expect(found.every(({ ruleId }) => ruleId === RAW)).toBe(true);
  });
}

for (const row of [
  { name: "bare producer", source: 'export const x="z-(--z-foreign)";', count: 1 },
  { name: "type string", source: 'export type X="z-(--z-foreign)";', count: 1 },
  { name: "object key", source: 'export const x={"z-(--z-foreign)":true};', count: 1 },
  { name: "known prefix is not a known complete name", source: 'export const x="z-(--z-base-wide)";', count: 1 },
  { name: "multiple unknowns become one finding per carrier", source: 'export const x="z-(--z-foreign) z-(--z-other) z-(--z-foreign)";', count: 1 },
  { name: "separate carriers remain separate", source: 'export const x="z-(--z-foreign)",y="z-(--z-other)";', count: 2 },
  { name: "substring scope is not a new terminal-token parser", source: 'export const x="not-z-(--z-foreign)";', count: 1 },
  { name: "uppercase remains outside the old alphabet", source: 'export const x="z-(--z-Foreign)";', count: 0 },
  { name: "incomplete spelling remains outside scope", source: 'export const x="z-(--z-foreign";', count: 0 },
  { name: "raw semantic escape remains raw", source: String.raw`export const x="z-(--z-\u0066oreign)";`, count: 0 },
  { name: "interpolated head middle and tail", source: "export const x=`z-(--z-foreign) ${a} z-(--z-other) ${b} z-(--z-last)`;", count: 3 },
  { name: "assembled name remains outside lexical scope", source: "export const x=`z-(--z-${name})`;", count: 0 },
]) {
  test(`native semantic z-index vocabulary: ${row.name}`, async ({ repoRoot }) => {
    const found = await messages(new ESLint({ cwd: repoRoot }), join(repoRoot, "packages/ui/src/probe.tsx"), row.source, [SEMANTIC]);
    expect(found, row.source).toHaveLength(row.count);
    expect(found.every(({ ruleId }) => ruleId === SEMANTIC)).toBe(true);
  });
}

test("governed vocabulary comes from the actual production scope map", async ({ repoRoot }) => {
  const values = Object.keys(Z_TOKEN_SCOPES)
    .map((path) => `z-(--${path.replace(".", "-")})`)
    .join(" ");
  expect(await messages(new ESLint({ cwd: repoRoot }), join(repoRoot, "packages/client/src/probe.ts"), `export const x=${JSON.stringify(values)};`)).toEqual(
    [],
  );
});

test("implementation homes retain their exact path boundaries", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const source = 'export const x=cn("z-50 z-(--z-foreign)");';
  for (const path of ["packages/ui/src/layout/probe.ts", "packages/ui/src/layout/nested/probe.ts", "packages/ui/src/markdown/probe.tsx"]) {
    expect(await messages(eslint, join(repoRoot, path), source), path).toEqual([]);
  }
  for (const path of ["packages/ui/src/layout-wide/probe.ts", "packages/ui/src/markdown-wide/probe.ts", "packages/client/src/features/app-shell/probe.ts"]) {
    expect(await messages(eslint, join(repoRoot, path), source), path).toMatchObject([{ ruleId: RAW }, { ruleId: SEMANTIC }]);
  }
});

test("generated declarations and compiler-world fences keep distinct raw and semantic scopes", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["packages/ui/src/tokens/index.ts", "packages/client/src/probe.gen.ts", "packages/ui/src/probe.ts"]) {
    expect(await messages(eslint, join(repoRoot, path), 'export const x=cn("z-50");'), path).toMatchObject([{ ruleId: RAW }]);
  }
  expect(await messages(eslint, join(repoRoot, "packages/ui/src/probe.d.ts"), 'export type X="z-(--z-foreign)";')).toMatchObject([{ ruleId: SEMANTIC }]);
  for (const path of ["tests/ui/probe.test.ts", "tests/legacy/ui/probe.test.ts", "packages/server/src/probe.ts", "tooling/src/probe.ts"]) {
    expect(await messages(eslint, join(repoRoot, path), 'export const x=cn("z-50 z-(--z-foreign)");'), path).toEqual([]);
  }
});

test("native semantic permissions cannot license another carrier and unused directives fail", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const filename = join(repoRoot, "packages/client/src/probe.ts");
  const permission = "// eslint-disable-next-line orb/no-unknown-z-index-token -- Native control input; remove with this fixture.\n";
  expect(await messages(eslint, filename, `${permission}export const x="z-(--z-foreign)";`)).toEqual([]);
  expect(await messages(eslint, filename, `${permission}export const x="z-(--z-foreign)";\nexport const fresh="z-(--z-other)";`)).toMatchObject([
    { ruleId: SEMANTIC },
  ]);
  expect(await messages(eslint, filename, `${permission}export const x="governed";`)).toMatchObject([
    { message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
});
