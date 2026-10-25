// The client DOM and style locks (docs/law/client-architecture-lockdown.md §0 and §4, motion-and-animation-guide.md §5.3):
// a static value never rides a style prop, a feature never looks DOM up by id or selector outside a named home, no
// class is toggled by hand, no client string names a sealed library's internals, and no layout read runs in render.
// Each control drives the configured rule through the real flat config, so a config that stops enabling a rule fails here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { domLookupRule } from "@orb/tooling/eslint";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const STYLE = "orb/no-static-style-prop";
const LOOKUP = "orb/no-dom-lookup-in-features";
const CLASS_LIST = "orb/no-class-list-write";
const SEALED = "orb/no-sealed-library-internals";
const RENDER_READ = "orb/no-render-layout-read";

const FEATURE_TSX = "packages/client/src/features/chat/components/probe.tsx";
const FEATURE_TS = "packages/client/src/features/chat/lib/probe.ts";
const COMPONENT = "packages/client/src/components/probe.tsx";
const CLIENT_LIB = "packages/client/src/lib/probe.ts";
const UI = "packages/ui/src/primitives/probe/probe.tsx";

const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE_TSX));
}, 120_000);

async function findings(rule: string, source: string, path: string, force = false): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: force ? "error" : (config?.rules?.[rule] ?? "off") },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule);
}

const jsx = (body: string, preamble = ""): string =>
  `${preamble}export function P(props: { readonly n: number; readonly flag: boolean }) {\n  return ${body};\n}\n`;

/** A template placeholder spelled without a literal `$` + `{` in this file's own strings. */
const interp = (expression: string): string => `$${"{"}${expression}}`;

// [rule, label, source, path, expected finding count]
const CASES = [
  [
    STYLE,
    "a block memo initializer",
    "export function P() { const skin = useMemo(function () { return { opacity: 1 }; }, []); return <Stack style={skin} />; }",
    FEATURE_TSX,
    1,
  ],

  [
    RENDER_READ,
    "reducer initializer layout",
    "export function P({ el }) { const [w] = useReducer(reduce, el, n => n.getBoundingClientRect().width); return <div>{w}</div>; }",
    FEATURE_TSX,
    1,
  ],

  [LOOKUP, "apply lookup", "document.querySelector.apply(document, ['.x']);", FEATURE_TS, 1],
  [LOOKUP, "call inert marker", "export const f = (el: HTMLElement) => el.closest.call(el, '[inert]');", FEATURE_TS, 0],
  [CLASS_LIST, "called class attribute writer", "export const f = (el: HTMLElement) => el.setAttribute.call(el, 'class', 'x');", FEATURE_TS, 1],
  [
    CLASS_LIST,
    "bound class attribute name",
    "export const f = (el: HTMLElement) => { const write = el.setAttribute.bind(el, 'class'); write('x'); };",
    FEATURE_TS,
    1,
  ],

  [LOOKUP, "destructured lookup", "const { querySelector: select } = document; select('.x');", FEATURE_TS, 1],
  [CLASS_LIST, "destructured classList", "export const f = (el: HTMLElement) => { const { classList: classes } = el; classes.add('x'); };", FEATURE_TS, 1],
  [CLASS_LIST, "destructured class writer", "export const f = (el: HTMLElement) => { const { add } = el.classList; add('x'); };", FEATURE_TS, 1],

  [SEALED, "descendant selector", "document.querySelector('main .cm-line');", FEATURE_TS, 1],
  [SEALED, "held class-name lookup", "const NAME = 'cm-line'; document.getElementsByClassName(NAME);", FEATURE_TS, 1],

  [
    STYLE,
    "a skin table CSSProperties declaration",
    "import type { CSSProperties } from 'react'; export const SKIN: CSSProperties = { borderLeftStyle: 'solid' };",
    FEATURE_TS,
    1,
  ],
  [
    STYLE,
    "a measured CSSProperties declaration",
    "import type { CSSProperties } from 'react'; export function size(n: number) { const skin: CSSProperties = { width: n }; return skin; }",
    FEATURE_TS,
    0,
  ],

  [LOOKUP, "bound lookup", "const select = document.querySelector.bind(document); export const f = () => select('.x');", FEATURE_TS, 1],
  [LOOKUP, "call lookup", "document.querySelector.call(document, '.x');", FEATURE_TS, 1],
  [LOOKUP, "constant inert marker", "const INERT = '[inert]'; export const f = (n: HTMLElement) => n.closest(INERT);", FEATURE_TS, 0],
  [CLASS_LIST, "aliased classList", "export const f = (el: HTMLElement) => { const classes = el.classList; classes.add('x'); };", FEATURE_TS, 1],
  [CLASS_LIST, "classList value", "export const f = (el: HTMLElement) => { el.classList.value = 'x'; };", FEATURE_TS, 1],
  [CLASS_LIST, "class attribute", "export const f = (el: HTMLElement) => el.setAttribute('class', 'x');", FEATURE_TS, 1],
  [STYLE, "module member", jsx("<Stack style={SKIN.base} />", "const SKIN = { base: { opacity: 1 } };"), FEATURE_TSX, 1],
  [STYLE, "memo initializer", "export function P() { const skin = useMemo(() => ({ opacity: 1 }), []); return <Stack style={skin} />; }", FEATURE_TSX, 1],
  [STYLE, "prop default", "export function P({ opacity = 1 }) { return <Stack style={{ opacity }} />; }", FEATURE_TSX, 1],
  [RENDER_READ, "memo layout", "export function P({ el }) { const w = useMemo(() => el.offsetWidth, []); return <div>{w}</div>; }", FEATURE_TSX, 1],
  [
    RENDER_READ,
    "state initializer layout",
    "export function P({ el }) { const [w] = useState(() => el.getBoundingClientRect().width); return <div>{w}</div>; }",
    FEATURE_TSX,
    1,
  ],
  [SEALED, "class-name lookup", "export const f = (el: HTMLElement) => el.getElementsByClassName('cm-line');", FEATURE_TS, 1],
  [SEALED, "prose names vendor hooks", "export const text = 'The cmdk-input attribute and .cm-line are private';", FEATURE_TS, 0],
  // --- a static value on a style prop
  [STYLE, "a literal property", jsx('<Stack style={{ maxWidth: "100%" }} />'), FEATURE_TSX, 1],
  [STYLE, "a token calc() literal", jsx('<Row style={{ width: "calc(var(--a) + var(--b))" }} />'), FEATURE_TSX, 1],
  [STYLE, "a named module constant", jsx("<Menu style={BOUND} />", 'const BOUND = { maxHeight: "calc(var(--a) - var(--b))" };\n'), FEATURE_TSX, 1],
  [STYLE, "a template of constants", jsx(`<Stack style={{ minBlockSize: \`${interp("PX")}px\` }} />`, "const PX = 12;\n"), FEATURE_TSX, 1],
  [STYLE, "an imported constant", jsx("<Stack style={{ minBlockSize: RECENTS }} />", 'import { RECENTS } from "./x.ts";\n'), FEATURE_TSX, 1],
  [
    STYLE,
    "a spread of a module constant beside a literal",
    jsx('<Stack style={{ ...BASE, colorScheme: "dark" }} />', 'import { BASE } from "./x.ts";\n'),
    FEATURE_TSX,
    2,
  ],
  [STYLE, "a static object chosen by a runtime condition", jsx("<Stack style={props.flag ? { opacity: 1 } : undefined} />"), FEATURE_TSX, 1],
  [STYLE, "a static property beside a measured one", jsx('<Stack style={{ aspectRatio: props.n, maxWidth: "100%" }} />'), FEATURE_TSX, 1],
  [STYLE, "a static style in the components tier", jsx('<Stack style={{ overflow: "clip" }} />'), COMPONENT, 1],
  [STYLE, "a value measured at runtime", jsx("<Stack style={{ width: props.n }} />"), FEATURE_TSX, 0],
  [STYLE, "a value derived from data", jsx(`<Stack style={{ blockSize: \`${interp("Math.round(props.n)")}px\` }} />`), FEATURE_TSX, 0],
  [
    STYLE,
    "a local derived from a parameter",
    "export function P(props: { readonly n: number }) {\n  const reserved = size(props.n);\n  return <Row style={{ minInlineSize: reserved }} />;\n}\n",
    FEATURE_TSX,
    0,
  ],
  [STYLE, "a runtime arm beside an absent one", jsx(`<Stack style={props.flag ? undefined : { height: \`${interp("props.n")}px\` }} />`), FEATURE_TSX, 0],
  [STYLE, "a member of a parameter", jsx("<Stack style={props.n} />"), FEATURE_TSX, 0],
  [STYLE, "a computed custom property from data", jsx("<Stack style={{ [`--hue`]: props.n }} />"), FEATURE_TSX, 0],
  [STYLE, "a style prop in @orb/ui, which is not judged", jsx('<div style={{ maxWidth: "100%" }} />'), UI, 0],
  // --- DOM lookup in a feature
  [LOOKUP, "getElementById", "export const f = () => document.getElementById('x');\n", FEATURE_TS, 1],
  [LOOKUP, "document.querySelector", "export const f = () => document.querySelector('.a');\n", FEATURE_TS, 1],
  [
    LOOKUP,
    "a typed querySelectorAll on a ref",
    "export const f = (r: { current: HTMLElement | null }) => r.current?.querySelectorAll<HTMLElement>('b');\n",
    FEATURE_TS,
    1,
  ],
  [LOOKUP, "an optional-call querySelector", "export const f = (n: HTMLElement | null) => n?.querySelector('c');\n", FEATURE_TS, 1],
  [LOOKUP, "a computed-name lookup", "export const f = () => document['getElementById']('x');\n", FEATURE_TS, 1],
  [LOOKUP, "getElementsByClassName", "export const f = (n: HTMLElement) => n.getElementsByClassName('a');\n", FEATURE_TS, 1],
  [LOOKUP, "a lookup in the components tier", "export const f = () => document.querySelector('.a');\n", COMPONENT, 1],
  [LOOKUP, "a lookup in @orb/ui", "export const f = () => document.querySelector('.a');\n", UI, 0],
  [LOOKUP, "closest on the inert marker", "export const f = (n: HTMLElement) => n.closest('[inert]');\n", FEATURE_TS, 0],
  [LOOKUP, "closest by a selector", "export const f = (n: HTMLElement) => n.closest('[data-slot=\"x\"]');\n", FEATURE_TS, 1],
  [LOOKUP, "a ref focus", "export const f = (r: { current: HTMLElement | null }) => r.current?.focus();\n", FEATURE_TS, 0],
  // --- a class toggled by hand
  [CLASS_LIST, "classList.add", "export const f = (el: HTMLElement) => el.classList.add('a');\n", FEATURE_TS, 1],
  [CLASS_LIST, "classList.remove", "export const f = (el: HTMLElement) => el.classList.remove('a', 'b');\n", FEATURE_TS, 1],
  [CLASS_LIST, "classList.toggle", "export const f = (el: HTMLElement, on: boolean) => el.classList.toggle('a', on);\n", CLIENT_LIB, 1],
  [CLASS_LIST, "classList.replace", "export const f = (el: HTMLElement) => el.classList.replace('a', 'b');\n", FEATURE_TS, 1],
  [CLASS_LIST, "an optional classList write", "export const f = (el: HTMLElement | null) => el?.classList.add('a');\n", FEATURE_TS, 1],
  [CLASS_LIST, "a className assignment", "export const f = (el: HTMLElement) => { el.className = 'a'; };\n", FEATURE_TS, 1],
  [CLASS_LIST, "a classList read", "export const f = (el: HTMLElement) => el.classList.contains('a');\n", FEATURE_TS, 0],
  [CLASS_LIST, "classList.item", "export const f = (el: HTMLElement) => el.classList.item(0);\n", CLIENT_LIB, 0],
  [CLASS_LIST, "a data attribute toggle", "export const f = (el: HTMLElement) => el.toggleAttribute('data-flash', true);\n", FEATURE_TS, 0],
  // --- a sealed library's internals
  [SEALED, "an attribute selector on cmdk", "export const s = 'input[cmdk-input]';\n", FEATURE_TS, 1],
  [SEALED, "a bare cmdk item selector", "export const s = '[cmdk-item]';\n", FEATURE_TS, 1],
  [SEALED, "a cmdk attribute in a template", `export const s = (id: string) => \`#${interp("id")} [cmdk-list]\`;\n`, FEATURE_TS, 1],
  [SEALED, "a Base UI hook attribute", "export const s = '[data-base-ui-inert]';\n", FEATURE_TS, 1],
  [SEALED, "a CodeMirror class", "export const s = '.cm-content';\n", FEATURE_TS, 1],
  [SEALED, "the seal's own data-slot", "export const s = '[data-slot=\"command-input\"]';\n", FEATURE_TS, 0],
  [SEALED, "the cmdk import specifier", "import { Command } from 'cmdk';\nexport const C = Command;\n", FEATURE_TS, 0],
  [SEALED, "a cmdk attribute inside @orb/ui", "export const s = 'input[cmdk-input]';\n", UI, 0],
  // --- a layout read in render
  [
    RENDER_READ,
    "a rect read in a component body",
    "export function P(props: { el: HTMLElement }) {\n  const w = props.el.getBoundingClientRect().width;\n  return <div>{w}</div>;\n}\n",
    FEATURE_TSX,
    1,
  ],
  [
    RENDER_READ,
    "a computed style read in a hook body",
    "export function useW(el: HTMLElement) {\n  return getComputedStyle(el).columnGap;\n}\n",
    FEATURE_TS,
    1,
  ],
  [
    RENDER_READ,
    "an offset size read in a component body",
    "export function P(props: { el: HTMLElement }) {\n  return <div>{props.el.offsetWidth}</div>;\n}\n",
    FEATURE_TSX,
    1,
  ],
  [
    RENDER_READ,
    "a rect read in an effect",
    "export function P(props: { el: HTMLElement }) {\n  useLayoutEffect(() => {\n    props.el.getBoundingClientRect();\n  }, []);\n  return <div />;\n}\n",
    FEATURE_TSX,
    0,
  ],
  [
    RENDER_READ,
    "a rect read in an event handler",
    "export function P() {\n  return <button onClick={(e) => e.currentTarget.getBoundingClientRect()} />;\n}\n",
    FEATURE_TSX,
    0,
  ],
  [
    RENDER_READ,
    "a rect read in a ResizeObserver callback",
    "export function useW(el: HTMLElement) {\n  useEffect(() => {\n    new ResizeObserver(() => el.getBoundingClientRect()).observe(el);\n  }, []);\n}\n",
    FEATURE_TS,
    0,
  ],
  [
    RENDER_READ,
    "a rect read in a plain measuring helper",
    "export function measure(el: HTMLElement) {\n  return el.getBoundingClientRect().width;\n}\n",
    FEATURE_TS,
    0,
  ],
] as const;

test.for(CASES)("%s: %s", { timeout: 120_000 }, async ([rule, , source, path, count]) => {
  expect(await findings(rule, source, path)).toHaveLength(count);
});

test("the locks judge the client only, and the render read lock also judges @orb/ui", { timeout: 120_000 }, async () => {
  const severity = async (rule: string, path: string): Promise<unknown> => (await eslint.calculateConfigForFile(join(ROOT, path)))?.rules?.[rule]?.[0];
  for (const rule of [STYLE, LOOKUP, CLASS_LIST, SEALED]) {
    expect(await severity(rule, UI), rule).toBeUndefined();
  }
  expect(await severity(LOOKUP, COMPONENT)).toBe(2);
  expect(await severity(LOOKUP, FEATURE_TS)).toBe(2);
  expect(await severity(STYLE, FEATURE_TSX)).toBe(2);
  expect(await severity(CLASS_LIST, CLIENT_LIB)).toBe(2);
  expect(await severity(SEALED, CLIENT_LIB)).toBe(2);
  expect(await severity(RENDER_READ, UI)).toBe(2);
});

test("an approved boundary call does not permit another lookup in its file", { timeout: 120_000 }, async () => {
  const path = "packages/client/src/components/skip-to-first-row.tsx";
  const source = readFileSync(join(ROOT, path), "utf8");
  expect(await findings(LOOKUP, source, path)).toHaveLength(0);
  expect(await findings(LOOKUP, `${source}\nexport const planted = () => document.querySelector('.unowned');`, path)).toHaveLength(1);
});

test("a boundary permission belongs to its function and operation", { timeout: 120_000 }, async () => {
  const path = "packages/client/src/components/skip-to-first-row.tsx";
  const source = readFileSync(join(ROOT, path), "utf8");
  const call = "containerRef.current?.querySelector<HTMLElement>(FIRST_ROW)";
  expect(await findings(LOOKUP, `${source}\nexport function Other(containerRef) { return ${call}; }`, path)).toHaveLength(1);
  expect(await findings(LOOKUP, source.replace("  return (", `  document.querySelector('.unowned');\n  return (`), path)).toHaveLength(1);
  expect(await findings(LOOKUP, source.replace("  return (", `  ${call};\n  return (`), path)).toHaveLength(1);
  expect(await findings(LOOKUP, "export {};", path)).toHaveLength(1);
});

test("duplicate DOM boundary permissions refuse instead of hiding an added call", () => {
  const home = { file: FEATURE_TS, function: "f", receiver: "document", method: "querySelector", selector: ".x", reason: "A named boundary operation." };
  expect(() =>
    new Linter({ cwd: ROOT }).verify(
      "export const f = () => document.querySelector('.x');",
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tseslint.parser },
        plugins: { probe: { rules: { lookup: domLookupRule([home, home]) } } },
        rules: { "probe/lookup": "error" },
      },
      { filename: join(ROOT, FEATURE_TS) },
    ),
  ).toThrow("Duplicate DOM home");
});

test("configured DOM homes stay live and preserve selector semantics", { timeout: 120_000 }, async () => {
  const { DOM_LOOKUP_HOMES } = await import("../../eslint.config.ts");
  const paths = [...new Set(DOM_LOOKUP_HOMES.map(({ file }) => file))];
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    expect(await findings(LOOKUP, readFileSync(join(ROOT, path), "utf8"), path), path).toHaveLength(0);
  }
  const path = "packages/client/src/features/tag/lib/labels-focus-targets.ts";
  const source = readFileSync(join(ROOT, path), "utf8");
  expect(await findings(LOOKUP, source.replace('"] [data-slot=', '"][data-slot='), path)).toHaveLength(2);
  expect(await findings(LOOKUP, source.replace(interp("tagId"), interp(" tagId ")), path)).toHaveLength(0);
});
