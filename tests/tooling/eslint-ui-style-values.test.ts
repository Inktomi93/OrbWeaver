import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const ROOT = join(import.meta.dirname, "../..");
const UI = "packages/ui/src/charts/histogram/option.tsx";
const CLIENT = "packages/client/src/features/chat/components/style-probe.tsx";
const RAW = "orb/no-off-token-inline-style";
const STATIC = "orb/no-static-style-prop";
const THEME = "orb/theme-override-only-via-scope";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

async function findings(rule: string, source: string, path = UI): Promise<readonly string[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const messages = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config?.rules?.[rule] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(messages.filter(({ fatal }) => fatal === true)).toEqual([]);
  return messages.filter(({ ruleId }) => ruleId === rule).map(({ message }) => message);
}

test.for([
  'export const C = () => <div style={{ borderRadius: "7px" }} />;',
  'const skin = { borderRadius: "7px" }; export const C = () => <div style={skin} />;',
  'const skins = { small: { borderRadius: "7px" }, large: { borderRadius: "var(--radius-card)" } }; export const C = ({size}) => <div style={skins[size]} />;',
  'export const C = () => <div {...{ style: { borderRadius: "7px" } }} />;',
  'import type { CSSProperties } from "react"; export const skin: CSSProperties = { borderRadius: "7px" };',
  'export const C = () => <div style={{ marginInlineStart: "calc(var(--spacing-row) + 7px)" }} />;',
  'export const C = ({n}) => <div style={{ height: "calc(" + n + " * 1lh + var(--spacing-field) + 2px)" }} />;',
  "export const C = ({height = 240}) => <div style={{height}} />;",
  "const sizes = { small: 200, large: 320 }; export const C = ({size}) => <div style={{height: sizes[size]}} />;",
  'import { EditorView } from "codemirror"; export const theme = EditorView.theme({".marker": {borderRadius: "9999px"}});',
  'import { EditorView as View } from "codemirror"; export const theme = View.theme({".marker": {padding: "7px"}});',
  'import * as CM from "codemirror"; export const theme = CM.EditorView.theme({".marker": {fontFamily: "Arial"}});',
  'import type { OrbChartOption } from "../chart/echarts-setup.ts"; export function chart(): OrbChartOption { return {textStyle: {fontSize: 12}}; }',
  'import { Histogram } from "@orb/ui/histogram"; export const C = () => <Histogram height={200} />;',
  'import { Histogram as Plot } from "@orb/ui/histogram"; const sizes = { small: 200 }; export const C = ({size}) => <Plot height={sizes[size]} />;',
] as const)("raw design values are refused in %s", async (source) => {
  expect(await findings(RAW, source)).toHaveLength(1);
});

test.for([
  "export const C = ({width}) => <div style={{width}} />;",
  'export const C = ({width}) => <div style={{width: width + "px"}} />;',
  'export const C = () => <div style={{width: "100%", minWidth: 0}} />;',
  'const skins = { bad: {width: "7px"}, good: {width: "var(--width-content-col)"} }; export const C = () => <div style={skins.good} />;',
  'export const C = () => <div style={{color: "oklch(from var(--color-primary) l c h / 0.5)"}} />;',
  "const EditorView = { theme: (options) => options }; export const value = EditorView.theme({record: {height: 12}});",
  'import type { OrbChartOption } from "../chart/echarts-setup.ts"; export function chart(fontSize: number): OrbChartOption { return {textStyle: {fontSize}}; }',
  'import { Histogram } from "@orb/ui/histogram"; export const C = ({height}) => <Histogram height={height} />;',
  'import { Histogram } from "@orb/ui/histogram"; export const C = () => <Histogram height="100%" />;',
  "const Histogram = (props) => <div />; export const C = () => <Histogram height={200} />;",
] as const)("runtime and structural values remain admitted in %s", async (source) => {
  expect(await findings(RAW, source)).toEqual([]);
});

test.for([
  'export const C = () => <Stack {...{style: {overflow: "clip"}}} />;',
  'import { STYLE } from "./skin.ts"; export const C = () => <Stack style={STYLE} />;',
  "const sizes = { small: 200, large: 320 }; export const C = ({size}) => <Stack style={{height: sizes[size]}} />;",
] as const)("client static style carriers are refused in %s", async (source) => {
  expect(await findings(STATIC, source, CLIENT)).toHaveLength(1);
});

test("a measured style in a JSX spread remains runtime", async () => {
  expect(await findings(STATIC, "export const C = ({width}) => <Stack {...{style: {width}}} />;", CLIENT)).toEqual([]);
});

test("a theme override cannot hide in a JSX spread", async () => {
  expect(await findings(THEME, 'export const C = ({color}) => <Stack {...{style: {"--color-primary": color}}} />;', CLIENT)).toHaveLength(1);
});

test("an ordinary class field is not a vendor stylesheet", async () => {
  expect(await findings(RAW, "export class Boundary { state = { error: null }; }")).toEqual([]);
});

test("full viewport extents are structural but do not license arbitrary fractions or client static styles", async () => {
  expect(await findings(RAW, 'export const C = ({chrome}) => <div style={{width: "calc(100vw - " + chrome + "px)", height: "100dvh"}} />;')).toEqual([]);
  expect(await findings(RAW, 'export const C = () => <div style={{width: "37vw"}} />;')).toHaveLength(1);
  expect(await findings(STATIC, 'export const C = () => <Stack style={{width: "100vw"}} />;', CLIENT)).toHaveLength(1);
});

test("gradient syntax is not an easing token", async () => {
  expect(await findings(RAW, 'export const C = () => <div style={{background: "linear-gradient(var(--color-primary), var(--color-card))"}} />;')).toEqual([]);
  expect(await findings(RAW, 'export const C = () => <div style={{transitionTimingFunction: "linear"}} />;')).toHaveLength(1);
});

test("a runtime gradient cannot hide a source-authored hex color", async () => {
  const source = (start: string): string => `export const C = ({color}) => <div style={{background: \`linear-gradient(${start}, ${"$"}{color})\`}} />;`;
  expect(await findings(RAW, source("#fff"))).toHaveLength(1);
  expect(await findings(RAW, source("var(--color-primary)"))).toEqual([]);
  expect(await findings(RAW, 'export const C = ({width}) => <div style={{width: width + "px"}} />;')).toEqual([]);
});
