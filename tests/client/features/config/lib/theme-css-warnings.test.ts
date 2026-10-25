import { expect, test } from "@orb/testkit/node";
import { themeCssHookWarnings } from "#client/features/config/lib/theme-css-warnings.ts";
import { OWNER_CSS_RENAMES } from "#client/owner-css/renames.ts";
import { OWNER_CSS_APPEARANCE_ATTRIBUTES, OWNER_CSS_SURFACE } from "../../../../../packages/client/owner-css-surface.ts";

type Surface = Parameters<typeof themeCssHookWarnings>[1];
type Renames = Parameters<typeof themeCssHookWarnings>[2];

const SURFACE: Surface = [
  { kind: "slot", name: "message-bubble" },
  { kind: "slot", name: "composer" },
  { kind: "shell-class", name: "shell-rail" },
  { kind: "token", name: "--color-primary" },
  { kind: "token", name: "--color-border" },
];

const RENAMES: Renames = [
  { kind: "slot", name: "bubble", to: "message-bubble" },
  { kind: "slot", name: "old-chip", to: null },
];

test("a name that left the surface unrecorded warns at its span and suggests the closest current name", () => {
  const css = 'a {}\n[data-slot="message-bubbel"] { color: red }';
  const [warning, ...rest] = themeCssHookWarnings(css, SURFACE, RENAMES);
  expect(rest).toEqual([]);
  expect(warning?.severity).toBe("warning");
  expect(css.slice(warning?.from, warning?.to)).toBe("message-bubbel");
  expect(warning?.message).toContain("message-bubble");
});

test("an unknown name with nothing near it warns without a suggestion", () => {
  const [warning] = themeCssHookWarnings(".shell-zzzzzzzzzzzzzz {}", SURFACE, RENAMES);
  expect(SURFACE.filter((hook) => warning?.message.includes(hook.name))).toEqual([]);
});

test("a recorded rename names its successor, and a retirement names none", () => {
  const renamed = themeCssHookWarnings('[data-slot="bubble"] {}', SURFACE, RENAMES);
  expect(renamed).toHaveLength(1);
  expect(renamed[0]?.message).toContain("message-bubble");
  const retired = themeCssHookWarnings('[data-slot="old-chip"] {}', SURFACE, RENAMES);
  expect(retired).toHaveLength(1);
  expect(retired[0]?.message).not.toContain("message-bubble");
});

test("current hooks, the sheet's own custom properties, partial slot matches and comments raise nothing", () => {
  const css = [
    '[data-slot="composer"] .shell-rail { color: var(--color-primary); border-color: var(--color-border); }',
    ":root { --mine: 1px; } a { margin: var(--mine); }",
    '[data-slot^="comp"] {}',
    '/* [data-slot="gone"] var(--color-gone) */',
  ].join("\n");
  expect(themeCssHookWarnings(css, SURFACE, RENAMES)).toEqual([]);
});

test("hooks inside strings and comments raise nothing, and a string holding /* does not hide a later stale hook", () => {
  const css = [
    "a::before { content: '[data-slot=\"gone\"]'; }",
    'b::before { content: "var(--color-gone) .shell-gone"; }',
    'c::before { content: "/*"; }',
    '[data-slot="gonez"] {}',
  ].join("\n");
  const warnings = themeCssHookWarnings(css, SURFACE, RENAMES);
  expect(warnings.map((warning) => css.slice(warning.from, warning.to))).toEqual(["gonez"]);
});

test("an unquoted url() body is one token: /* in it hides nothing, and a hook-shaped file name raises nothing", () => {
  const css = [
    "a { background: url(img/*.png); }",
    '[data-slot="gonez"] { color: var(--color-gonez); }',
    "b { background: URL( img/x.shell-gone.png ); }",
  ].join("\n");
  const warnings = themeCssHookWarnings(css, SURFACE, RENAMES);
  expect(warnings.map((warning) => css.slice(warning.from, warning.to))).toEqual(["gonez", "--color-gonez"]);
});

test("a stale hook before an unterminated comment still warns, and the comment hides only its own text", () => {
  const css = '[data-slot="gonez"] {} /* never closed [data-slot="goney"]';
  expect(themeCssHookWarnings(css, SURFACE, RENAMES).map((warning) => css.slice(warning.from, warning.to))).toEqual(["gonez"]);
});

test("var() with a fallback is the author's own knob, but a nested var() is still checked", () => {
  expect(themeCssHookWarnings("a { color: var(--author-knob, red); }", SURFACE, RENAMES)).toEqual([]);
  const nested = "a { color: var(--mine, var(--color-gone)); }";
  expect(themeCssHookWarnings(nested, SURFACE, RENAMES).map((warning) => nested.slice(warning.from, warning.to))).toEqual(["--color-gone"]);
  expect(themeCssHookWarnings("a { color: var(--mine, var(--color-primary)); }", SURFACE, RENAMES)).toEqual([]);
  expect(themeCssHookWarnings("a { color: var(--author-knob); }", SURFACE, RENAMES)).toHaveLength(1);
});

test("an @supports condition is a feature query, but the rules inside its block are scanned", () => {
  const css = [
    "@supports (color: var(--color-gone)) { a{} }",
    '@supports selector([data-slot="gone"]) { [data-slot="gonez"] {} }',
    "@supports (--css-var: 1) { a{} }",
  ].join("\n");
  expect(themeCssHookWarnings(css, SURFACE, RENAMES).map((warning) => css.slice(warning.from, warning.to))).toEqual(["gonez"]);
});

test("a retired appearance attribute warns and points at its replacement; an author's own data attribute does not", () => {
  const retired = OWNER_CSS_RENAMES.find((row) => row.kind === "appearance-attribute");
  if (retired?.see === undefined) {
    throw new Error("The rename table records no retired appearance attribute with a successor");
  }
  const css = `[${retired.name}] { color: red; } [data-mine] { color: red; }`;
  const warnings = themeCssHookWarnings(css, SURFACE, OWNER_CSS_RENAMES);
  expect(warnings.map((warning) => css.slice(warning.from, warning.to))).toEqual([retired.name]);
  expect(warnings[0]?.message).toContain(retired.see);
});

test("a data-appearance attribute the surface lacks warns with the closest current one", () => {
  const real = OWNER_CSS_APPEARANCE_ATTRIBUTES[0].name;
  const stale = `${real}z`;
  const css = `[${stale}="true"] {}`;
  const [warning] = themeCssHookWarnings(css, OWNER_CSS_SURFACE, []);
  expect(css.slice(warning?.from, warning?.to)).toBe(stale);
  expect(warning?.message).toContain(real);
});

test("a value outside the attribute's list, or the presence-only form, warns and names the allowed values", () => {
  const [attribute] = OWNER_CSS_APPEARANCE_ATTRIBUTES;
  const [allowed] = attribute.values;
  const badValue = `[${attribute.name}="${allowed}z"] {}`;
  const [wrong] = themeCssHookWarnings(badValue, OWNER_CSS_SURFACE, []);
  expect(badValue.slice(wrong?.from, wrong?.to)).toBe(`${allowed}z`);
  for (const value of attribute.values) {
    expect(wrong?.message).toContain(value);
  }
  const presence = `[${attribute.name}] {}`;
  const [bare] = themeCssHookWarnings(presence, OWNER_CSS_SURFACE, []);
  expect(presence.slice(bare?.from, bare?.to)).toBe(attribute.name);
  for (const value of attribute.values) {
    expect(bare?.message).toContain(value);
  }
  for (const value of attribute.values) {
    expect(themeCssHookWarnings(`[${attribute.name}="${value}"], [${attribute.name}~='${value}'] {}`, OWNER_CSS_SURFACE, [])).toEqual([]);
  }
  expect(themeCssHookWarnings(`[${attribute.name}^="${allowed}z"] {}`, OWNER_CSS_SURFACE, [])).toEqual([]);
});

const single = OWNER_CSS_APPEARANCE_ATTRIBUTES.find((attribute) => !attribute.members);
const list = OWNER_CSS_APPEARANCE_ATTRIBUTES.find((attribute) => attribute.members);
const escapedFirst = (value: string): string => `\\${(value.codePointAt(0) ?? 0).toString(16)} ${value.slice(1)}`;

test("the i flag compares a value case-insensitively and the s flag, or none, does not", () => {
  const name = single?.name ?? "";
  const value = single?.values[0] ?? "";
  expect(themeCssHookWarnings(`[${name}="${value.toUpperCase()}" i] {}`, OWNER_CSS_SURFACE, [])).toEqual([]);
  expect(themeCssHookWarnings(`[${name}=${value.toUpperCase()} I] {}`, OWNER_CSS_SURFACE, [])).toEqual([]);
  expect(themeCssHookWarnings(`[${name}="${value.toUpperCase()}"] {}`, OWNER_CSS_SURFACE, [])).toHaveLength(1);
  expect(themeCssHookWarnings(`[${name}="${value.toUpperCase()}" s] {}`, OWNER_CSS_SURFACE, [])).toHaveLength(1);
});

test("CSS escapes in a value are decoded before it is compared, quoted or not", () => {
  const name = single?.name ?? "";
  const value = single?.values[0] ?? "";
  expect(themeCssHookWarnings(`[${name}=${escapedFirst(value)}] {}`, OWNER_CSS_SURFACE, [])).toEqual([]);
  expect(themeCssHookWarnings(`[${name}="${escapedFirst(value)}"] {}`, OWNER_CSS_SURFACE, [])).toEqual([]);
  const [stale] = themeCssHookWarnings(`[${name}=${escapedFirst(`${value}z`)}] {}`, OWNER_CSS_SURFACE, []);
  expect(stale?.from).toBeGreaterThan(name.length);
});

test("selectors that can never match their attribute warn", () => {
  const singleName = single?.name ?? "";
  const listName = list?.name ?? "";
  const [first, second] = single?.values ?? [];
  expect(themeCssHookWarnings(`[${singleName}=""] {}`, OWNER_CSS_SURFACE, [])).toHaveLength(1);
  expect(themeCssHookWarnings(`[${singleName}="${first} ${second}"] {}`, OWNER_CSS_SURFACE, [])).toHaveLength(1);
  expect(themeCssHookWarnings(`[${listName}=""] {}`, OWNER_CSS_SURFACE, [])).toEqual([]);
  expect(themeCssHookWarnings(`[${listName}~="${list?.values.join(" ")}"] {}`, OWNER_CSS_SURFACE, [])).toHaveLength(1);
  expect(themeCssHookWarnings(`[${listName}~=""] {}`, OWNER_CSS_SURFACE, [])).toHaveLength(1);
});

test("a list attribute's = value must be the writer's own join: single spaces, no edge spaces, listed members", () => {
  const listName = list?.name ?? "";
  const [first, second] = list?.values ?? [];
  for (const never of [`"  "`, `" ${first}"`, `"${first} "`, `"${first}  ${second}"`, `"${first},${second}"`]) {
    expect(themeCssHookWarnings(`[${listName}=${never}] {}`, OWNER_CSS_SURFACE, []), never).toHaveLength(1);
  }
  for (const writable of [`""`, `"${first}"`, `"${first} ${second}"`, `"${second} ${first}"`]) {
    expect(themeCssHookWarnings(`[${listName}=${writable}] {}`, OWNER_CSS_SURFACE, []), writable).toEqual([]);
  }
});

test("attribute names are matched case-insensitively, as HTML matches them", () => {
  const [attribute] = OWNER_CSS_APPEARANCE_ATTRIBUTES;
  const css = `[${attribute.name.toUpperCase()}="nope"] {}`;
  expect(themeCssHookWarnings(css, OWNER_CSS_SURFACE, [])).toHaveLength(1);
  const retired = "[DATA-SHADOW] {}";
  expect(themeCssHookWarnings(retired, OWNER_CSS_SURFACE, OWNER_CSS_RENAMES)).toHaveLength(1);
  expect(themeCssHookWarnings(`[${attribute.name.toUpperCase()}="${attribute.values[0]}"] {}`, OWNER_CSS_SURFACE, [])).toEqual([]);
});

test("a var() of an undeclared name outside the surface warns, with the closest token", () => {
  const css = "a { color: var(--color-primry); }";
  const [warning] = themeCssHookWarnings(css, SURFACE, RENAMES);
  expect(css.slice(warning?.from, warning?.to)).toBe("--color-primry");
  expect(warning?.message).toContain("--color-primary");
});
