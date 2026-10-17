import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const ESCAPE = "orb/platform-escape-mint";
const SOURCE = "orb/test-ambient-source-string";
const WAIT = "orb/test-wait-for-timeout";

async function messages(eslint: ESLint, filename: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  return new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx,mjs}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: Object.fromEntries([ESCAPE, SOURCE, WAIT].map((rule) => [rule, config.rules[rule] ?? "off"])),
    },
    { filename },
  );
}

for (const row of [
  { name: "declaration", source: "function escapeRegExp(s:string){return s}", count: 1 },
  { name: "arrow", source: "const escapeRegex=(s:string)=>s", count: 1 },
  { name: "parenthesized-arrow", source: "const escapeRegex=((s:string)=>s)", count: 1 },
  { name: "function-valued", source: "const escapeRegExp=function(s:string){return s}", count: 1 },
  { name: "object-method", source: "const bag={escapeRegExp(s:string){return s}}", count: 1 },
  { name: "object-property", source: "const bag={escapeRegex:(s:string)=>s}", count: 1 },
  { name: "parenthesized-object-property", source: "const bag={escapeRegex:((s:string)=>s)}", count: 1 },
  { name: "class-method", source: "class X{escapeRegExp(s:string){return s}}", count: 1 },
  { name: "static-method", source: "class X{static escapeRegExp(s:string){return s}}", count: 1 },
  { name: "declare-function", source: "declare function escapeRegExp(s:string):string;", count: 1 },
  { name: "abstract-method", source: "abstract class X{abstract escapeRegex(s:string):string;}", count: 1 },
  { name: "quoted-key", source: 'const bag={"escapeRegex":(s:string)=>s}', count: 0 },
  { name: "computed-key", source: 'const bag={["escapeRegex"]:(s:string)=>s}', count: 0 },
  { name: "getter", source: 'const bag={get escapeRegex(){return "x"}}', count: 0 },
  { name: "class-field", source: "class X{escapeRegex=(s:string)=>s}", count: 0 },
  { name: "named-expression", source: "const other=function escapeRegex(s:string){return s}", count: 0 },
  { name: "wrapped-arrow", source: "const escapeRegex=((s:string)=>s) as ((s:string)=>string)", count: 0 },
  { name: "string-property", source: 'const bag={escapeRegex:"RegExp.escape"}', count: 0 },
  { name: "native", source: 'RegExp.escape("held")', count: 0 },
  { name: "unrelated-regex", source: "export const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;", count: 0 },
]) {
  test(`native escape name fence: ${row.name}`, async ({ repoRoot }) => {
    const found = await messages(new ESLint({ cwd: repoRoot }), join(repoRoot, "packages/server/src/primitives/probe.ts"), row.source);
    expect(found, row.source).toHaveLength(row.count);
    expect(found.every(({ ruleId }) => ruleId === ESCAPE)).toBe(true);
  });
}

for (const row of [
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "Date.now()", source: 'export const code="Date.now()";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "new Date()", source: 'export const code="new Date()";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "Math.random()", source: 'export const code="Math.random()";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "crypto.randomUUID()", source: 'export const code="crypto.randomUUID()";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "performance.now()", source: 'export const code="performance.now()";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "process.hrtime.bigint()", source: 'export const code="process.hrtime.bigint()";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "performance.timeOrigin", source: 'export const code="performance.timeOrigin";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "vi.useFakeTimers()", source: 'export const code="vi.useFakeTimers()";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "locator.page().waitForTimeout(1)", source: 'export const code="locator.page().waitForTimeout(1)";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "same-line-two-carriers", source: 'const a="Date.now()",b="Date.now()";', count: 2 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "one-carrier-repeated", source: 'const a="Date.now();Date.now()";', count: 1 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "two-regex-kinds", source: 'const a="Date.now();Math.random()";', count: 2 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Source containing a comment is parsed to prove the inner comment fence, never executed; remove with this control.
  { name: "comment", source: "// Date.now()\nexport const ok=1;", count: 0 },
  // eslint-disable-next-line orb/test-ambient-source-string -- Native source-text self-proof input is parsed, not executed; remove with this control.
  { name: "template", source: "const a=`Date.now() ${x} Math.random()`;", count: 2 },
]) {
  test(`native source-text fence: ${row.name}`, async ({ repoRoot }) => {
    const found = await messages(new ESLint({ cwd: repoRoot }), join(repoRoot, "tests/support/node/probe.ts"), row.source);
    expect(found, row.source).toHaveLength(row.count);
    expect(found.every(({ ruleId }) => ruleId === SOURCE)).toBe(true);
  });
}

test("dotted waits reject every receiver and simple parentheses without claiming computed references", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const source of [
    // eslint-disable-next-line orb/test-ambient-source-string -- This dotted-wait control is parsed, never executed; remove with the native syntax control.
    "custom.waitForTimeout(1);",
    // eslint-disable-next-line orb/test-ambient-source-string -- This optional-wait control is parsed, never executed; remove with the native syntax control.
    "custom?.waitForTimeout(1);",
    // eslint-disable-next-line orb/test-ambient-source-string -- This chained-wait control is parsed, never executed; remove with the native syntax control.
    "locator.page().waitForTimeout(1);",
    "(custom.waitForTimeout)(1);",
  ]) {
    expect(await messages(eslint, join(repoRoot, "tests/client/probe.ct.tsx"), source), source).toMatchObject([{ ruleId: WAIT }]);
  }
  for (const source of ['custom["waitForTimeout"](1);', "const delay=custom.waitForTimeout;", "custom.waitForSelector('ready');"]) {
    expect(await messages(eslint, join(repoRoot, "tests/client/probe.ct.tsx"), source), source).toEqual([]);
  }
});

test("platform scope includes tests, showcase, generated declarations and native node helpers but not tooling or legacy", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["tests/e2e/probe.spec.ts", "tests/support/node/probe.mjs", "packages/showcase-plugins/src/probe.ts", "packages/ui/src/tokens/index.ts"]) {
    expect(await messages(eslint, join(repoRoot, path), "function escapeRegExp(s){return s}"), path).toMatchObject([{ ruleId: ESCAPE }]);
  }
  for (const path of ["tooling/src/probe.ts", "tests/legacy/probe.test.ts", "scripts/probe.ts"]) {
    expect(await messages(eslint, join(repoRoot, path), "function escapeRegExp(s){return s}"), path).toEqual([]);
  }
});

test("source scope includes type strings and node helpers but excludes product, e2e and legacy", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  for (const path of ["tests/support/node/probe.ts", "tests/support/node/probe.mjs", "tests/support/browser/probe.d.ts"]) {
    // eslint-disable-next-line orb/test-ambient-source-string -- Type-string self-proof input names an ambient call without executing it; remove with this control.
    expect(await messages(eslint, join(repoRoot, path), 'export type Input="Date.now()";'), path).toMatchObject([{ ruleId: SOURCE }]);
  }
  for (const path of ["packages/kit/src/probe.ts", "tests/e2e/probe.spec.ts", "tests/legacy/probe.test.ts"]) {
    // eslint-disable-next-line orb/test-ambient-source-string -- Scope-negative self-proof source is parsed, not executed; remove with this control.
    expect(await messages(eslint, join(repoRoot, path), 'export const Input="Date.now()";'), path).toEqual([]);
  }
});

test("native protocol timestamp builders and business clock seams are not ambient spellings", async ({ repoRoot }) => {
  expect(
    await messages(
      new ESLint({ cwd: repoRoot }),
      join(repoRoot, "tests/support/node/probe.ts"),
      "const token = new SignJWT(claims).setIssuedAt().setExpirationTime('300s'); const now=clock.now(); const id=mintTypeId('chat', seeded.next);",
    ),
  ).toEqual([]);
});

test("source-text permissions remain line-local and unused directives fail", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const filename = join(repoRoot, "tests/support/node/probe.ts");
  const permission = "// eslint-disable-next-line orb/test-ambient-source-string -- Parsed source-text fixture, never executed; remove with this control.";
  // eslint-disable-next-line orb/test-ambient-source-string -- The permitted inner source-text control is parsed, not executed; remove with this control.
  const source = 'const source="Date.now()";';
  expect(await messages(eslint, filename, `${permission}\n${source}`)).toEqual([]);
  expect(await messages(eslint, filename, `${permission}\nconst source="frozen";`)).toMatchObject([
    { message: expect.stringContaining("Unused eslint-disable directive") },
  ]);
  // eslint-disable-next-line orb/test-ambient-source-string -- The unlicensed inner source-text control is parsed, not executed; remove with this control.
  expect(await messages(eslint, filename, `${permission}\n${source}\nconst fresh="Math.random()";`)).toMatchObject([{ ruleId: SOURCE }]);
});
