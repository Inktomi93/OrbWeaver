import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/evaluate-no-scope-capture";
const SUBJECT = "tooling/src/snap/ops/probe.ts";
const eslint = new ESLint({ cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SUBJECT));
}, 120_000);

async function findings(source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

const LOC = "loc: { evaluate: (fn: unknown) => Promise<void> }";
const SET = "el: { setAttribute: (n: string, v: string) => void }";

test.for([
  [
    "ARM A: an inline callback closing over a module const, at the captured name's use site",
    `const MARK = "data-mark";\nasync function tag(${LOC}): Promise<void> {\n  await loc.evaluate((${SET}) => el.setAttribute(MARK, "1"));\n}\n`,
    3,
    "MARK",
  ],
  [
    "ARM B: a module function passed by reference whose body closes over a sibling module const",
    `const PREFIX = "x-";\nfunction paint(el: { className: string }): void {\n  el.className = PREFIX;\n}\nasync function run(${LOC}): Promise<void> {\n  await loc.evaluate(paint);\n}\n`,
    3,
    "PREFIX",
  ],
  [
    "the computed spelling of the method",
    `const MARK = "data-mark";\nasync function tag(${LOC}): Promise<void> {\n  await loc["evaluate"]((${SET}) => el.setAttribute(MARK, "1"));\n}\n`,
    3,
    "MARK",
  ],
  [
    "the optional-chained method",
    `const MARK = "data-mark";\nasync function tag(loc?: { evaluate: (fn: unknown) => Promise<void> }): Promise<void> {\n  await loc?.evaluate((${SET}) => el.setAttribute(MARK, "1"));\n}\n`,
    3,
    "MARK",
  ],
  [
    "evaluateAll shares the hazard",
    `const MARK = "data-mark";\nasync function tag(loc: { evaluateAll: (fn: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluateAll((${SET}[]) => el.length + MARK.length);\n}\n`,
    3,
    "MARK",
  ],
  [
    "a top-level block binding is module-scope too",
    `declare const ${LOC};\nif (loc !== undefined) {\n  const MARK = "data-mark";\n  void loc.evaluate((${SET}) => el.setAttribute(MARK, "1"));\n}\n`,
    4,
    "MARK",
  ],
  [
    "a top-level loop binding is module-scope too",
    `declare const ${LOC};\nfor (const SEL of ["a"]) {\n  void loc.evaluate((${SET}) => el.setAttribute(SEL, "1"));\n}\n`,
    3,
    "SEL",
  ],
  [
    "an imported binding is a module-scope binding too",
    `import { MARK } from "./marks.ts";\nasync function tag(${LOC}): Promise<void> {\n  await loc.evaluate((${SET}) => el.setAttribute(MARK, "1"));\n}\n`,
    3,
    "MARK",
  ],
] as const)("flags %s", async ([, source, line, token]) => {
  const found = await findings(source);
  expect(found).toHaveLength(1);
  expect(found[0]?.line).toBe(line);
  const text = source.split("\n")[line - 1] ?? "";
  expect(text.slice((found[0]?.column ?? 1) - 1, (found[0]?.endColumn ?? 1) - 1)).toBe(token);
});

test.for([
  [
    "the fix shape: the module const travels through the evaluate argument",
    `const MARK = "data-mark";\nasync function tag(loc: { evaluate: (fn: unknown, arg: unknown) => Promise<void> }): Promise<void> {\n  await loc.evaluate((${SET}, args: { mark: string; idx: number }) => el.setAttribute(args.mark, String(args.idx)), { idx: 0, mark: MARK });\n}\n`,
  ],
  [
    "a raw string callback",
    'async function run(loc: { evaluate: (fn: string) => Promise<void> }): Promise<void> {\n  await loc.evaluate("(el) => el.click()");\n}\n',
  ],
  [
    "a browser global",
    "async function run(page: { evaluate: (fn: unknown) => Promise<unknown> }): Promise<unknown> {\n  return await page.evaluate(() => document.title);\n}\n",
  ],
  [
    "the built-in undefined",
    "async function run(page: { evaluate: (fn: unknown) => Promise<boolean> }): Promise<boolean> {\n  return await page.evaluate(() => document.body.dataset.ready !== undefined);\n}\n",
  ],
  [
    "a self-contained module function passed by reference",
    "function sweep(el: { getBoundingClientRect: () => { width: number } }, opts: { max: number }): boolean {\n  const scale = opts.max;\n  return el.getBoundingClientRect().width > scale;\n}\nasync function run(loc: { evaluate: (fn: unknown, arg: unknown) => Promise<boolean> }): Promise<boolean> {\n  return await loc.evaluate(sweep, { max: 10 });\n}\n",
  ],
  [
    "a module interface referenced only in a type position",
    "interface Meta { readonly count: number }\nasync function run(page: { evaluate: (fn: unknown) => Promise<number> }): Promise<number> {\n  return await page.evaluate(() => (globalThis as unknown as Meta).count);\n}\n",
  ],
  [
    "a block binding inside the enclosing function is a local, not module scope",
    `async function tag(${LOC}): Promise<void> {\n  if (loc !== undefined) {\n    const MARK = "data-mark";\n    await loc.evaluate((${SET}) => el.setAttribute(MARK, "1"));\n  }\n}\n`,
  ],
  [
    "a recursive named callback referencing its own binding",
    "function walk(n: number): number {\n  return n <= 0 ? 0 : walk(n - 1);\n}\nasync function run(loc: { evaluate: (fn: unknown, arg: unknown) => Promise<number> }): Promise<number> {\n  return await loc.evaluate(walk, 3);\n}\n",
  ],
  [
    "a non-Playwright evaluate with a non-function first argument",
    "const MARK = 1;\nfunction run(collector: { evaluate: (node: unknown, other: unknown) => void }, node: unknown): void {\n  collector.evaluate(node, MARK);\n}\n",
  ],
  [
    "the declared limit: a callback imported from another module is not judged (its declaring file is out of per-file reach)",
    'import { mark } from "./imported-callback.ts";\nexport async function run(page: { evaluate(fn: unknown): Promise<void> }): Promise<void> { await page.evaluate(mark); }\n',
  ],
  [
    "a callback bound to a non-function value",
    'const SCRIPT = "document.title";\nasync function run(page: { evaluate: (fn: unknown) => Promise<unknown> }): Promise<unknown> {\n  return await page.evaluate(SCRIPT);\n}\n',
  ],
] as const)("passes %s", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test("the population fence: only tooling drives browser pages", async () => {
  const source = `const MARK = "data-mark";\nasync function tag(${LOC}): Promise<void> {\n  await loc.evaluate((${SET}) => el.setAttribute(MARK, "1"));\n}\n`;
  expect(await findings(source, "tooling/src/snap/ops/other.ts")).toHaveLength(1);
  expect(await findings(source, "packages/client/src/features/x/app.ts")).toEqual([]);
});

test("a deliberate occurrence is waived at its site with a reasoned eslint-disable", async () => {
  const source = `const MARK = "data-mark";\nasync function tag(${LOC}): Promise<void> {\n  // eslint-disable-next-line ${RULE} -- the proof's stand-in reason.\n  await loc.evaluate((${SET}) => el.setAttribute(MARK, "1"));\n}\n`;
  expect(await findings(source)).toEqual([]);
});
