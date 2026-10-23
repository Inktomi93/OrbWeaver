// The `patches/@vitest__eslint-plugin@1.6.27.patch` contract. valid-expect accepts an async assertion stored in a
// variable only when every path after it awaits, returns or Promise.all-settles that variable; any path that can skip
// the await, any rebinding, and any declaration outside a block keeps the finding. expect-expect treats a listed
// wrapper that forwards its own, never rebound, last (body) parameter into a test call as a test-block definition.
import { expect, test } from "@orb/testkit/tooling";
import vitest from "@vitest/eslint-plugin";
import { Linter } from "eslint";

const VALID_EXPECT = "vitest/valid-expect";
const EXPECT_EXPECT = "vitest/expect-expect";
const HEAD = 'import { expect, test } from "vitest";\n';
const RULES: Readonly<Record<typeof VALID_EXPECT | typeof EXPECT_EXPECT, Linter.RuleEntry>> = {
  [VALID_EXPECT]: ["error", { maxArgs: 2 }],
  [EXPECT_EXPECT]: ["error", { assertFunctionNames: ["expect"], additionalTestBlockFunctions: ["cellTest"] }],
};

function findings(source: string, rule: typeof VALID_EXPECT | typeof EXPECT_EXPECT): readonly string[] {
  const messages = new Linter().verify(`${HEAD}${source}\n`, {
    plugins: { vitest },
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    rules: { [rule]: RULES[rule] },
  });
  return messages.map((message) => message.ruleId ?? `FATAL ${message.message}`);
}

const inTest = (body: string): string => `test("case", async () => {\n${body}\n});`;
const STORED = "let refused = expect(pending).rejects.toThrow();\n";

test.for([
  ["awaited later", `${STORED}await gate;\nawait refused;`],
  ["awaited in a finally", `${STORED}try {\n  await gate;\n} finally {\n  await refused;\n}`],
  ["awaited inside a catch-free try", `${STORED}try {\n  await gate;\n  await refused;\n} finally {\n  release();\n}`],
  [
    "awaited through Promise.all",
    "const first = expect(a).rejects.toThrow();\nconst second = expect(b).resolves.toBe(1);\nawait Promise.all([first, second]);",
  ],
  ["returned", `${STORED}return refused;`],
  ["awaited after an unrelated assignment", `${STORED}session.owner = false;\nawait refused;`],
  ["awaited on both branches", `${STORED}if (x) {\n  await refused;\n} else {\n  await refused;\n}`],
  ["awaited after a loop with its own break", `${STORED}for (const item of items) {\n  if (item) break;\n}\nawait refused;`],
  ["awaited after a loop with its own continue", `${STORED}for (const item of items) {\n  if (item) continue;\n}\nawait refused;`],
  ["awaited after a switch with its own break", `${STORED}switch (kind) {\n  case 1:\n    break;\n}\nawait refused;`],
] as const)("a stored assertion %s is accepted", ([, body]) => {
  expect(findings(inTest(body), VALID_EXPECT)).toEqual([]);
});

test.for([
  ["never awaited", `${STORED}await gate;`],
  ["awaited only in a catch", `${STORED}try {\n  await gate;\n} catch {\n  await refused;\n}`],
  ["awaited in a try whose catch swallows", `${STORED}try {\n  await gate;\n  await refused;\n} catch {}`],
  ["floating at the statement", "expect(pending).rejects.toThrow();"],
  ["behind an early return", `${STORED}if (skip) return;\nawait refused;`],
  ["behind an early throw", `${STORED}if (skip) {\n  throw new Error("skip");\n}\nawait refused;`],
  ["awaited only on one branch", `${STORED}if (x) {\n  await refused;\n}`],
  ["reassigned before the await", `${STORED}refused = other;\nawait refused;`],
  ["reassigned by destructuring", `${STORED}[refused] = [other];\nawait refused;`],
  ["reassigned inside a try", `${STORED}try {\n  refused = other;\n} finally {}\nawait refused;`],
  ["reassigned inside a block", `${STORED}{\n  refused = other;\n}\nawait refused;`],
  ["shadowed in a block", `${STORED}{\n  const refused = other;\n  await refused;\n}`],
  ["awaited only in a nested function", `${STORED}const later = async () => {\n  await refused;\n};`],
  ["settled only through Promise.allSettled", `${STORED}await Promise.allSettled([refused]);`],
] as const)("an assertion %s still flags", ([, body]) => {
  expect(findings(inTest(body), VALID_EXPECT)).toEqual([VALID_EXPECT]);
});

test.for([
  ["a switch case continues", "switch (kind) {\n  case 2:\n    continue;\n}"],
  ["an if continues", "if (kind) continue;"],
] as const)("an assertion in a loop body still flags when %s past its await", ([, jump]) => {
  expect(findings(inTest(`for (const kind of kinds) {\n${STORED}${jump}\nawait refused;\n}`), VALID_EXPECT)).toEqual([VALID_EXPECT]);
});

test.for([
  ["at module scope", "const refused = expect(pending).resolves.toBe(1);\nawait refused;"],
  ["in a static block", "class K {\n  static {\n    const refused = expect(pending).resolves.toBe(1);\n  }\n}"],
] as const)("an assertion stored %s keeps the unpatched finding without crashing", ([, source]) => {
  expect(findings(source, VALID_EXPECT)).toEqual([VALID_EXPECT]);
});

test.for([
  ["forwards its body to test", "export function cellTest(title, body) {\n  test(title, body);\n}"],
  ["forwards its body through a modifier", "export function cellTest(skip, title, body) {\n  test.skipIf(skip)(title, body);\n}"],
] as const)("a listed wrapper that %s is a test-block definition", ([, source]) => {
  expect(findings(source, EXPECT_EXPECT)).toEqual([]);
});

test.for([
  ["is not listed", "export function myCase(title, body) {\n  test(title, body);\n}"],
  ["drops the body", "export function cellTest(title, body) {\n  test(title, () => {});\n}"],
  ["forwards a module function instead", "const shared = () => {};\nexport function cellTest(title) {\n  test(title, shared);\n}"],
  ["forwards its title as the body", "export function cellTest(title, body) {\n  test(title, title);\n}"],
  ["reassigns its body parameter", "export function cellTest(title, body) {\n  body = () => {};\n  test(title, body);\n}"],
  ["shadows its body parameter", "export function cellTest(title, body) {\n  {\n    const body = () => {};\n    test(title, body);\n  }\n}"],
] as const)("a wrapper that %s still flags", ([, source]) => {
  expect(findings(source, EXPECT_EXPECT)).toEqual([EXPECT_EXPECT]);
});

test("a listed wrapper's call site with an empty body flags", () => {
  expect(findings("function cellTest(title, body) {\n  test(title, body);\n}\ncellTest('empty', () => {});", EXPECT_EXPECT)).toEqual([EXPECT_EXPECT]);
});
