import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const RULE = "orb/receded-ink-integrity";
const SUBJECT = "packages/client/src/features/a/control.tsx";
const IMPORT = 'import { RECEDED_INK } from "@orb/ui/lib";\n';
const eslint = new ESLint({ cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SUBJECT));
}, 120_000);

/** A control whose className is a template carrying `classText`, which may hold `${…}` spans. */
function control(classText: string, prelude = IMPORT): string {
  return `${prelude}export const T = <button className={\`${classText}\`} type="button" />;\n`;
}

async function findings(source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
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

/** A fixture template span `${inner}`, composed so this module carries no literal placeholder text. */
const span = (inner: string): string => `\${${inner}}`;
const SPAN = span("RECEDED_INK");

test.for([
  ["a hover prefix", control(`hover:${SPAN}`)],
  ["a responsive prefix", control(`md:${SPAN}`)],
  ["an arbitrary variant with a colon inside its brackets", control(`[&:hover]:${SPAN}`)],
  ["a prefix that is the last token after layout classes", control(`min-w-0 group-hover:${SPAN}`)],
  ["the namespace import spelling", control(`hover:${span("ui.RECEDED_INK")}`, 'import * as ui from "@orb/ui/lib";\n')],
] as const)("the rule reports %s", async ([, source]) => {
  expect(await findings(source)).toHaveLength(1);
});

test.for([
  ["the bare constant", `${IMPORT}export const T = <button className={RECEDED_INK} type="button" />;\n`],
  [
    "the constant leading a variant-carrying sibling",
    control(`${SPAN} ${span("ROW_REVEAL")}`, `${IMPORT}const ROW_REVEAL = "opacity-0 group-hover:opacity-100";\n`),
  ],
  ["layout classes then the constant", control(`max-w-full justify-start ${SPAN}`)],
  ["a record field", `${IMPORT}export const P = { off: { restingInk: RECEDED_INK } };\n`],
  ["a later overriding ink (declared limit)", control(`${SPAN} text-foreground`)],
  ["the same colour as a literal", 'export const T = <button className="hover:text-muted-foreground" type="button" />;\n'],
  ["a same-named local constant", control(`hover:${SPAN}`, 'const RECEDED_INK = "text-muted-foreground";\n')],
] as const)("the rule passes %s", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test("the rule judges client and ui source", async () => {
  const configOf = async (path: string): Promise<unknown> => (await eslint.calculateConfigForFile(join(ROOT, path)))?.rules?.[RULE]?.[0];
  expect(await configOf(SUBJECT)).toBe(2);
  expect(await configOf("packages/ui/src/primitives/a/control.tsx")).toBe(2);
  expect(await configOf("packages/server/src/domain/a/x.ts")).toBeUndefined();
});
