// The client DOM and style locks (docs/law/client-architecture-lockdown.md §0 and §4, motion-and-animation-guide.md §5.3):
// a static value never rides a style prop, a feature never looks DOM up by id or selector outside a named home, no
// class is toggled by hand, no client string names a sealed library's internals, and no layout read runs in render.
// Each control drives the configured rule through the real flat config, so a config that stops enabling a rule fails here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
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
  [LOOKUP, "a lookup in the components tier", "export const f = () => document.querySelector('.a');\n", COMPONENT, 0],
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
  expect(await severity(LOOKUP, COMPONENT)).toBeUndefined();
  expect(await severity(LOOKUP, FEATURE_TS)).toBe(2);
  expect(await severity(STYLE, FEATURE_TSX)).toBe(2);
  expect(await severity(CLASS_LIST, CLIENT_LIB)).toBe(2);
  expect(await severity(SEALED, CLIENT_LIB)).toBe(2);
  expect(await severity(RENDER_READ, UI)).toBe(2);
});

// A home the rule no longer matches is a stale exemption: it would hide the next real finding in that file.
test("every DOM lookup home still holds a lookup", { timeout: 120_000 }, async () => {
  const { default: config } = await import("../../eslint.config.ts");
  const homes = config.flatMap((block) => (block.rules !== undefined && LOOKUP in block.rules ? (block.ignores ?? []) : []));
  expect(homes.length).toBeGreaterThan(0);
  for (const home of homes) {
    expect(await findings(LOOKUP, readFileSync(join(ROOT, home), "utf8"), home, true), home).not.toHaveLength(0);
  }
});
