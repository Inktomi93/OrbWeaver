import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const SITE = join(ROOT, "packages/ui/src/primitives/tabs/tabs.tsx");
const REF_RULE = "orb/no-overwritten-ref";
const PROP_RULE = "orb/no-native-callback-narrowing";
const STYLE_RULE = "orb/no-unresolved-style-spread";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });
const IMPORTS = `import { useRef, useRef as reactRef, useImperativeHandle } from "react";
import * as React from "react";
import { RadioGroup as NativeRadio } from "@base-ui/react/radio-group";
import type { RadioGroupProps as NativeRadioProps } from "@base-ui/react/radio-group";
import type { CSSProperties, ComponentPropsWithRef } from "react";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { TabsIndicatorProps, PopoverPopupProps, PopoverPopupState, SwitchRootProps } from "@base-ui/react";`;

beforeAll(async () => {
  await eslint.calculateConfigForFile(SITE);
}, 120_000);

async function findings(scratch: string, source: string, rule: string): Promise<readonly Linter.LintMessage[]> {
  const file = join(scratch, "probe.tsx");
  const code = `${IMPORTS}\n${source}`;
  writeFileSync(file, code);
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: {
        react: [join(ROOT, "node_modules/@types/react/index.d.ts")],
        "react/*": [join(ROOT, "node_modules/@types/react/*")],
        "@base-ui/react": [join(ROOT, "packages/ui/node_modules/@base-ui/react/index.d.ts")],
        "@base-ui/react/*": [join(ROOT, "packages/ui/node_modules/@base-ui/react/*")],
      },
      types: [],
    },
  });
  const config = await resolvedConfig(eslint, SITE);
  const messages = new Linter({ cwd: scratch }).verify(
    code,
    {
      files: ["**/*.tsx"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename: file },
  );
  expect(messages.filter(({ fatal }) => fatal === true)).toEqual([]);
  return messages.filter(({ ruleId }) => ruleId === rule);
}

for (const [name, source] of [
  [
    "a DOM-node state setter overwritten by a caller ref",
    "export function Probe(props: NativeRadioProps<string>) { const [root, setRoot] = React.useState<HTMLDivElement | null>(null); return <NativeRadio ref={setRoot} {...props} />; }",
  ],
  [
    "an aliased React ref",
    "export function Probe(props: TabsIndicatorProps) { const node = reactRef<HTMLSpanElement>(null); return <BaseTabs.Indicator {...props} ref={node} />; }",
  ],
  [
    "a namespace React ref",
    "export function Probe(props: TabsIndicatorProps) { const node = React.useRef<HTMLSpanElement>(null); return <BaseTabs.Indicator {...props} ref={node} />; }",
  ],
  [
    "the native ref overwritten after a spread",
    "export function Probe(props: TabsIndicatorProps) { const node = useRef<HTMLSpanElement>(null); return <BaseTabs.Indicator {...props} ref={node} />; }",
  ],
  [
    "the internal ref overwritten by a spread",
    "export function Probe(props: TabsIndicatorProps) { const node = useRef<HTMLSpanElement>(null); return <BaseTabs.Indicator ref={node} {...props} />; }",
  ],
  [
    "a rest binding that still includes ref",
    "export function Probe({ ...rest }: TabsIndicatorProps) { const node = useRef<HTMLSpanElement>(null); return <BaseTabs.Indicator {...rest} ref={node} />; }",
  ],
] as const) {
  test(`ref contract reports ${name}`, async ({ scratch }) => {
    expect(await findings(scratch, source, REF_RULE)).toHaveLength(1);
  });
}

for (const [name, source] of [
  [
    "a non-React function named useRef",
    "export function Probe(props: TabsIndicatorProps) { function useRef<T>(current: T) { return { current }; } const node = useRef<HTMLSpanElement | null>(null); return <BaseTabs.Indicator {...props} ref={node} />; }",
  ],
  [
    "outer wiring around a render callback",
    "export function Probe(props: TabsIndicatorProps) { const node = useRef<HTMLSpanElement>(null); useImperativeHandle<HTMLSpanElement | null, HTMLSpanElement | null>(props.ref, () => node.current); return (() => <BaseTabs.Indicator {...props} ref={node} />)(); }",
  ],
  [
    "an opaque spread alias",
    "export function Probe(props: TabsIndicatorProps) { const node = useRef<HTMLSpanElement>(null); const spread = props; useImperativeHandle<HTMLSpanElement | null, HTMLSpanElement | null>(props.ref, () => node.current); return <BaseTabs.Indicator {...spread} ref={node} />; }",
  ],
  [
    "an intentionally omitted ref",
    `export function Probe(props: Omit<TabsIndicatorProps, "ref">) { const node = useRef<HTMLSpanElement>(null); return <BaseTabs.Indicator {...props} ref={node} />; }`,
  ],
  [
    "an extracted caller ref with its native handle",
    "export function Probe({ ref, ...rest }: TabsIndicatorProps) { const node = useRef<HTMLSpanElement>(null); useImperativeHandle<HTMLSpanElement | null, HTMLSpanElement | null>(ref, () => node.current); return <BaseTabs.Indicator {...rest} ref={node} />; }",
  ],
  [
    "a caller ref consumed through an alias",
    "export function Probe(props: TabsIndicatorProps) { const node = useRef<HTMLSpanElement>(null); const caller = props.ref; useImperativeHandle<HTMLSpanElement | null, HTMLSpanElement | null>(caller, () => node.current); return <BaseTabs.Indicator {...props} ref={node} />; }",
  ],
  [
    "a component with no caller ref contract",
    "export function Probe(props: { renderBeforeHydration?: boolean }) { const node = useRef<HTMLSpanElement>(null); return <BaseTabs.Indicator {...props} ref={node} />; }",
  ],
] as const) {
  test(`ref contract retains ${name}`, async ({ scratch }) => {
    expect(await findings(scratch, source, REF_RULE)).toEqual([]);
  });
}

for (const [name, source] of [
  [
    "a method losing native change details",
    `export interface Probe extends Omit<SwitchRootProps, "onCheckedChange"> { onCheckedChange(checked: boolean): void }`,
  ],
  ["an interface losing style callbacks", `export interface Probe extends Omit<PopoverPopupProps, "style"> { style?: CSSProperties }`],
  ["an intersection losing style callbacks", `export type Probe = Omit<PopoverPopupProps, "style"> & { style?: CSSProperties };`],
  [
    "a callback losing native change details",
    `export interface Probe extends Omit<SwitchRootProps, "onCheckedChange"> { onCheckedChange?: (checked: boolean) => void }`,
  ],
] as const) {
  test(`callback contract reports ${name}`, async ({ scratch }) => {
    expect(await findings(scratch, source, PROP_RULE)).toHaveLength(1);
  });
}

for (const [name, source] of [
  ["a DOM composite with its own action", `export interface Probe extends Omit<ComponentPropsWithRef<"button">, "onClick"> { onClick?: () => void }`],
  ["the derived native style type", `export interface Probe extends Omit<PopoverPopupProps, "style"> { style?: PopoverPopupProps["style"] }`],
  [
    "the derived native event callback",
    `export type Probe = Omit<SwitchRootProps, "onCheckedChange"> & { onCheckedChange?: SwitchRootProps["onCheckedChange"] };`,
  ],
  ["an unchanged object-only DOM style", `export interface Probe extends Omit<ComponentPropsWithRef<"span">, "style"> { style?: CSSProperties }`],
  ["an unrelated omission", `export interface Probe extends Omit<PopoverPopupProps, "className"> { className?: string }`],
] as const) {
  test(`callback contract retains ${name}`, async ({ scratch }) => {
    expect(await findings(scratch, source, PROP_RULE)).toEqual([]);
  });
}

test("style spread resolves callback-capable values before merging", async ({ scratch }) => {
  expect(await findings(scratch, `export function Probe(style: PopoverPopupProps["style"]): CSSProperties { return { ...style }; }`, STYLE_RULE)).toHaveLength(
    1,
  );
});
for (const [name, source] of [
  [
    "a resolved native style",
    `export function Probe(style: PopoverPopupProps["style"], state: PopoverPopupState): CSSProperties { return { ...(typeof style === "function" ? style(state) : style) }; }`,
  ],
  ["an object-only style", "const style: CSSProperties = { opacity: 0.5 }; export const merged: CSSProperties = { ...style };"],
  ["a function object outside a CSS context", `const factory = Object.assign(() => 1, { label: "factory" }); export const metadata = { ...factory };`],
] as const) {
  test(`style spread retains ${name}`, async ({ scratch }) => {
    expect(await findings(scratch, source, STYLE_RULE)).toEqual([]);
  });
}

test("native contract rules are errors in the production UI and client configs", { timeout: 120_000 }, async () => {
  for (const file of [SITE, join(ROOT, "packages/client/src/features/chat/components/composer.tsx")]) {
    const config = await resolvedConfig(eslint, file);
    expect(config.rules[REF_RULE]).toEqual([2]);
    expect(config.rules[PROP_RULE]).toEqual([2]);
    expect(config.rules[STYLE_RULE]).toEqual([2]);
  }
});
