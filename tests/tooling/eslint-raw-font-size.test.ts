// A literal font size in the client or @orb/ui never meets the type ramp and ignores the font-scale setting, so each carrier refuses one.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "no-restricted-syntax";
const CLIENT_PROBE = "packages/client/src/features/auth/components/probe.tsx";
const UI_PROBE = "packages/ui/src/primitives/probe/probe.tsx";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, CLIENT_PROBE));
}, 120_000);

async function findings(source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.tsx"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
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

const PLANTED = [
  ["a numeric style fontSize", "export const A = () => <Box style={{ fontSize: 13 }} />;"],
  ["a string style fontSize", 'export const A = () => <Box style={{ fontSize: "0.8125rem" }} />;'],
  ["a template style fontSize", "export const A = () => <Box style={{ fontSize: `13px` }} />;"],
  ["a quoted font-size key", 'export const STYLE = { "font-size": "13px" };'],
  ["a chart option fontSize", "export const OPTION = { axisLabel: { fontSize: 11 } };"],
  ["an SVG fontSize attribute", 'export const A = () => <text fontSize="10">x</text>;'],
  ["an SVG fontSize expression", "export const A = () => <text fontSize={10}>x</text>;"],
  ["a canvas font", 'export function paint(context) { context.font = "600 12px Geist"; }'],
  ["a style fontSize write", 'export function size(node) { node.style.fontSize = "12px"; }'],
  ["a font-size property write", 'export function size(node) { node.style.setProperty("font-size", "12px"); }'],
] as const;

test.for(PLANTED.flatMap(([name, source]) => [[`${name} in the client`, source, CLIENT_PROBE] as const, [`${name} in @orb/ui`, source, UI_PROBE] as const]))(
  "%s is a finding",
  async ([, source, path]) => {
    expect(await findings(source, path)).toHaveLength(1);
  },
);

test.for([
  ["a token-resolved fontSize", 'export const theme = { fontSize: cssVar("text.code-field") };'],
  ["a text token path", 'export const CHART_LENGTHS = { fontSize: "text.label" } as const;'],
  ["a measured chart fontSize", "export const OPTION = (colors) => ({ axisLabel: { fontSize: colors.metrics.fontSize } });"],
  [
    "a canvas font from resolved metrics",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source is itself a template literal.
    "export function paint(context, theme) { context.font = `${theme.fontWeight} ${theme.metrics.fontSize}px ${theme.fontFamily}`; }",
  ],
  ["a font family field", 'export const DEFAULT_THEME_FORM = { font: "Geist" };'],
  ["a font-size token write", 'export function size(node, token) { node.style.setProperty("font-size", token); }'],
] as const)("%s passes", async ([, source]) => {
  expect(await findings(source, UI_PROBE)).toEqual([]);
});
