// `orb/ui-skin-fragment-purity` refuses a lib skin fragment hand-spelled outside `packages/ui/src/lib`, including a
// `(--token)` signature; `orb/no-floorless-control-in-wrap` accepts a row that floors its own block size.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const PURITY = "orb/ui-skin-fragment-purity";
const FLOORLESS = "orb/no-floorless-control-in-wrap";
const UI_VARIANTS = "packages/ui/src/primitives/probe/variants.ts";
const UI_LIB = "packages/ui/src/lib/probe.ts";
const FEATURE = "packages/client/src/features/probe/rows.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(rule: string, source: string, path: string): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config?.rules?.[rule] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule).map(({ message }) => message);
}

test.for([
  ["the touch-target pseudo's token form", 'export const BOX = "before:absolute before:block-(--size-touch-target) before:inline-full";\n'],
  ["the focus ring", 'export const BOX = "outline-none focus-visible:ring-2";\n'],
] as const)("the purity rule reports %s outside the lib", async ([, source]) => {
  expect(await findings(PURITY, source, UI_VARIANTS)).toHaveLength(1);
});

test("the purity rule leaves the lib home alone and passes a string with no fragment", async () => {
  expect(await findings(PURITY, 'export const BOX = "before:block-(--size-touch-target)";\n', UI_LIB)).toEqual([]);
  expect(await findings(PURITY, 'export const BOX = "relative block-auto";\n', UI_VARIANTS)).toEqual([]);
});

// Two rows of text-height Buttons in one Stack: each row lends its hit areas to the next unless it floors itself.
const stack = (rowAttributes: string): string =>
  `export const T = (\n  <Stack gap="field">\n    <Row ${rowAttributes}><Button size="inline">a</Button></Row>\n    <Row ${rowAttributes}><Button size="inline">b</Button></Row>\n  </Stack>\n);\n`;

test("the floorless rule reports a stack of unfloored rows", async () => {
  expect(await findings(FLOORLESS, stack('gap="field"'), FEATURE)).toHaveLength(1);
});

test.for([
  ["the touchFloor prop", 'touchFloor="block"'],
  ["a coarse min-block floor class", 'className="pointer-coarse:min-block-(--size-touch-target)"'],
  ["a control-height min-block floor class", 'className="min-block-(--size-control-sm)"'],
] as const)("the floorless rule accepts rows floored by %s", async ([, attributes]) => {
  expect(await findings(FLOORLESS, stack(attributes), FEATURE)).toEqual([]);
});
