import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const DATA = "orb/baseui-derives-not-respells";
const HANDLER = "orb/baseui-derives-not-respells-health";
const STATE = "orb/baseui-state-data-attributes";

async function messages(root: string, rule: string, source: string, path = "packages/ui/src/primitives/probe.tsx"): Promise<readonly Linter.LintMessage[]> {
  const hard = rule === HANDLER;
  const filename = join(root, path);
  const eslint = new ESLint({ cwd: root, ...(hard ? { overrideConfigFile: join(root, "eslint-hard.config.js") } : {}) });
  const config = await eslint.calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { noInlineConfig: hard, reportUnusedDisableDirectives: hard ? "off" : "error" },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename, allowInlineConfig: !hard },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

for (const [name, rule, source] of [
  [
    "data prop",
    DATA,
    'import {Select as Base} from "@base-ui/react/select";export interface SealProps{disabled?:boolean}export const Seal=(p:SealProps)=><Base.Root {...p}/>;',
  ],
  [
    "handler",
    HANDLER,
    'import {Select as Base} from "@base-ui/react/select";export interface SealProps{onValueChange?:(value:string)=>void}export const Seal=(p:SealProps)=><Base.Root {...p}/>;',
  ],
  [
    "parallel state",
    STATE,
    'import {Popover as Base} from "@base-ui/react/popover";export function Seal(){const [open]=useState(false);return <Base.Popup className={open?"a":"b"}/>;}',
  ],
] as const) {
  test(`native Base UI founding ${name}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, rule, source)).toMatchObject([{ ruleId: rule }]);
  });
}

const SELECT_IMPORTS = 'import type {SelectRootProps} from "@base-ui/react/select";import {Select as Base} from "@base-ui/react/select";';
function selectSource(member: string, name = "SealProps"): string {
  return `${SELECT_IMPORTS}export interface ${name}{${member}}export const Seal=(p:${name})=><Base.Root {...p}/>;`;
}
function popoverSource(body: string): string {
  return `import {Popover as Base} from "@base-ui/react/popover";export function Seal({side}:{side:string}){${body}}`;
}

for (const [name, rule, source, count] of [
  ["root items respell", DATA, selectSource("items?:readonly string[]"), 1],
  [
    "lookalike is not imported type",
    DATA,
    `${SELECT_IMPORTS}type NotSelectRootProps={items:readonly string[]};export interface SealProps{items:NotSelectRootProps["items"]}export const Seal=(p:SealProps)=><Base.Root {...p}/>;`,
    1,
  ],
  ["indexed data derive", DATA, selectSource('items?:SelectRootProps<string>["items"]'), 0],
  [
    "non-root data collision",
    DATA,
    `${SELECT_IMPORTS}export interface SealProps{placeholder?:string}export const Seal=(p:SealProps)=><Base.Root {...p}><Base.Value placeholder={p.placeholder}/></Base.Root>;`,
    0,
  ],
  ["plain data is not props", DATA, selectSource("items?:readonly string[]", "SelectOption"), 0],
  ["no value binding", DATA, "export interface SealProps{items?:readonly string[]}", 0],
  ["data does not judge handler", DATA, selectSource("onValueChange?:(v:string)=>void"), 0],
  ["equal arity is still a copy", HANDLER, selectSource("onValueChange?:(v:string,details:unknown)=>void"), 1],
  ["indexed handler derive", HANDLER, selectSource('onValueChange?:SelectRootProps<string>["onValueChange"]'), 0],
  [
    "one-hop details alias",
    HANDLER,
    `${SELECT_IMPORTS}type Details=Parameters<NonNullable<SelectRootProps<string>["onValueChange"]>>[1];export interface SealProps{onValueChange?:(v:string,d?:Details)=>void}export const Seal=(p:SealProps)=><Base.Root {...p}/>;`,
    0,
  ],
  [
    "own callback is not forwarded",
    HANDLER,
    `${SELECT_IMPORTS}export interface SealProps{onValueChange?:(v:string)=>void}export const Seal=(p:SealProps)=><Base.Root items={[]} render={<button onClick={()=>p.onValueChange?.("x")}/>}/>;`,
    0,
  ],
  ["handler does not judge data", HANDLER, selectSource("items?:readonly string[]"), 0],
  ["handler in non-Props interface", HANDLER, selectSource("onValueChange?:(v:string)=>void", "SealOptions"), 1],
  ["function union and type parentheses", HANDLER, selectSource("onValueChange?:((v:string)=>void)|undefined"), 1],
  ["methods remain outside property-signature claim", HANDLER, selectSource("onValueChange(v:string):void"), 0],
  ["unforwarded root data", DATA, `${SELECT_IMPORTS}export interface SealProps{items?:readonly string[]}export const Seal=()=><Base.Root/>;`, 0],
  [
    "named forwarding without spread",
    DATA,
    `${SELECT_IMPORTS}export interface SealProps{disabled?:boolean}export const Seal=(p:SealProps)=><Base.Root disabled={p.disabled}/>;`,
    1,
  ],
  [
    "renamed import retains origin spelling",
    DATA,
    'import {Select as Renamed} from "@base-ui/react/select";export interface SealProps{disabled?:boolean}export const Seal=(p:SealProps)=><Renamed.Root {...p}/>;',
    1,
  ],
  [
    "type-only binding is not a rendered component",
    DATA,
    'import type {Select as Base} from "@base-ui/react/select";export interface SealProps{disabled?:boolean}export const Seal=(p:SealProps)=><Base.Root {...p}/>;',
    0,
  ],
  [
    "specifier type-only derive",
    DATA,
    'import {Select as Base,type SelectRootProps as Props} from "@base-ui/react/select";export interface SealProps{disabled?:Props<string>["disabled"]}export const Seal=(p:SealProps)=><Base.Root {...p}/>;',
    0,
  ],
  [
    "export-list alias",
    DATA,
    `${SELECT_IMPORTS}interface SealProps{disabled?:boolean}export type{SealProps as Published};export const Seal=(p:SealProps)=><Base.Root {...p}/>;`,
    1,
  ],
  [
    "default interface export",
    DATA,
    `${SELECT_IMPORTS}export default interface SealProps{disabled?:boolean}export const Seal=(p:SealProps)=><Base.Root {...p}/>;`,
    1,
  ],
  [
    "default export-list alias",
    DATA,
    `${SELECT_IMPORTS}interface SealProps{disabled?:boolean}export type{SealProps as default};export const Seal=(p:SealProps)=><Base.Root {...p}/>;`,
    1,
  ],
  [
    "private interface remains private",
    DATA,
    `${SELECT_IMPORTS}interface SealProps{disabled?:boolean}export const Seal=(p:SealProps)=><Base.Root {...p}/>;`,
    0,
  ],
  [
    "exported unrelated same-name nested type",
    DATA,
    `${SELECT_IMPORTS}interface SealProps{disabled?:boolean}export namespace Other{export interface SealProps{x:number}}export const Seal=(p:SealProps)=><Base.Root {...p}/>;`,
    0,
  ],
  [
    "second alias hop is not derivation",
    DATA,
    `${SELECT_IMPORTS}type First=SelectRootProps<string>["disabled"];type Second=First;export interface SealProps{disabled?:Second}export const Seal=(p:SealProps)=><Base.Root {...p}/>;`,
    1,
  ],
  ["data attributes replace parallel state", STATE, popoverSource('return <Base.Popup className="data-[open]:opacity-100"/>;'), 0],
  ["controlled prop is not hook state", STATE, popoverSource("return <Base.Popup className={variants({side})}/>;"), 0],
  ["member name is not binding read", STATE, popoverSource("const[open]=useState(false);return <Base.Popup className={slots.open()} data-x={open}/>;"), 0],
  ["object key is not binding read", STATE, popoverSource("const[open]=useState(false);return <Base.Popup className={cn({open:other})}/>;"), 0],
  ["shorthand is one binding read", STATE, popoverSource("const[open]=useState(false);return <Base.Popup className={cn({open})}/>;"), 1],
  ["computed key reads binding", STATE, popoverSource("const[open]=useState(false);return <Base.Popup className={cn({[open]:true})}/>;"), 1],
  ["optional member name is not binding read", STATE, popoverSource("const[open]=useState(false);return <Base.Popup className={slots?.open()}/>;"), 0],
  ["computed optional member reads binding", STATE, popoverSource("const[open]=useState(false);return <Base.Popup className={slots?.[open]}/>;"), 1],
  ["unrelated local state", STATE, popoverSource('const[count]=useState(0);return <Base.Popup className={count?"a":"b"}/>;'), 0],
  [
    "paired JSX and string before identifier",
    STATE,
    popoverSource('const[open]=useState(false);return <Base.Popup className={cn("data-open:x",open&&"y")}>{null}</Base.Popup>;'),
    1,
  ],
  ["multiple reads remain distinct", STATE, popoverSource('const[open]=useState(false);return <Base.Popup className={open?open:"b"}/>;'), 2],
  [
    "simple initializer parentheses strengthen equivalent syntax",
    STATE,
    popoverSource('const[open]=(useState(false));return <Base.Popup className={open?"a":"b"}/>;'),
    1,
  ],
  [
    "simple callee parentheses strengthen equivalent syntax",
    STATE,
    popoverSource('const[open]=(useState)(false);return <Base.Popup className={open?"a":"b"}/>;'),
    1,
  ],
  [
    "TS assertion initializer retains existing limit",
    STATE,
    popoverSource('const[open]=useState(false) as [boolean];return <Base.Popup className={open?"a":"b"}/>;'),
    0,
  ],
  [
    "TS satisfies initializer retains existing limit",
    STATE,
    popoverSource('const[open]=useState(false) satisfies [boolean];return <Base.Popup className={open?"a":"b"}/>;'),
    0,
  ],
  [
    "namespace hook retains existing text-name limit",
    STATE,
    popoverSource('const[open]=React.useState(false);return <Base.Popup className={open?"a":"b"}/>;'),
    0,
  ],
  ["optional hook call", STATE, popoverSource('const[open]=useState?.(false);return <Base.Popup className={open?"a":"b"}/>;'), 1],
] as const) {
  test(`native Base UI claim: ${name}`, async ({ repoRoot }) => {
    const found = await messages(repoRoot, rule, source);
    expect(found, source).toHaveLength(count);
    expect(found.every(({ ruleId }) => ruleId === rule)).toBe(true);
  });
}

for (const [rule, source] of [
  [DATA, selectSource("disabled?:boolean")],
  [HANDLER, selectSource("onValueChange?:(v:string)=>void")],
  [STATE, popoverSource('const[open]=useState(false);return <Base.Popup className={open?"a":"b"}/>;')],
] as const) {
  test(`native Base UI scope remains UI only: ${rule}`, async ({ repoRoot }) => {
    for (const path of ["packages/client/src/probe.tsx", "tests/ui/primitives/probe.tsx", "tests/legacy/ui/probe.tsx", "tooling/src/probe.tsx"]) {
      expect(await messages(repoRoot, rule, source, path), path).toEqual([]);
    }
    for (const path of ["packages/ui/src/probe.gen.tsx"]) {
      expect(await messages(repoRoot, rule, source, path), path).toMatchObject([{ ruleId: rule }]);
    }
    const eslint = new ESLint({ cwd: repoRoot, ...(rule === HANDLER ? { overrideConfigFile: join(repoRoot, "eslint-hard.config.js") } : {}) });
    for (const path of ["packages/ui/src/probe.d.ts", "packages/ui/src/tokens/index.ts"]) {
      const config = await eslint.calculateConfigForFile(join(repoRoot, path));
      expect(config?.rules[rule], path).toEqual([2]);
      expect(await messages(repoRoot, rule, `${SELECT_IMPORTS}export interface SealProps{disabled?:boolean}`, path)).toEqual([]);
    }
  });
}

for (const path of ["packages/ui/src/primitives/combobox/combobox.tsx", "packages/ui/src/primitives/select/select.tsx"]) {
  test(`actual item-model permission is minimal and live: ${path}`, async ({ repoRoot }) => {
    const source = readFileSync(join(repoRoot, path), "utf8");
    expect(await messages(repoRoot, DATA, source, path)).toEqual([]);
    const unlicensed = source.replace(/^.*eslint-disable-next-line orb\/baseui-derives-not-respells[^\n]*\n/mu, "");
    expect(await messages(repoRoot, DATA, unlicensed, path)).toMatchObject([{ ruleId: DATA }]);
    const fresh =
      source +
      "\nexport interface FreshProps{disabled?:boolean}export const Fresh=(p:FreshProps)=><Base" +
      (path.includes("combobox") ? "Combobox" : "Select") +
      ".Root {...p}/>;";
    expect(await messages(repoRoot, DATA, fresh, path)).toMatchObject([{ ruleId: DATA }]);
    const stale = source.replace(/(eslint-disable-next-line orb\/baseui-derives-not-respells[^\n]*\n) {2}items\??:[^\n]+;/u, "$1");
    expect(await messages(repoRoot, DATA, stale, path)).toMatchObject([{ message: expect.stringContaining("Unused eslint-disable directive") }]);
  });
}

test("the actual HARD profile ignores every native disable spelling", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, "eslint-hard.config.js"), allowInlineConfig: false });
  for (const directive of [
    "/* eslint-disable */",
    "/* eslint-disable orb/baseui-derives-not-respells-health */",
    "// eslint-disable-next-line orb/baseui-derives-not-respells-health -- No authority to remove event details.",
  ]) {
    const [result] = await eslint.lintText(`${directive}\n${selectSource("onValueChange?:(value:string)=>void")}`, {
      filePath: "packages/ui/src/primitives/probe.tsx",
    });
    expect(result?.messages).toMatchObject([{ ruleId: HANDLER }]);
    expect(result?.messages).toHaveLength(1);
  }
});
