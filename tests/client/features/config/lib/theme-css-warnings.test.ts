import { expect, test } from "@orb/testkit/node";
import { themeCssHookWarnings } from "#client/features/config/lib/theme-css-warnings.ts";

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

test("a var() of an undeclared name outside the surface warns, with the closest token", () => {
  const css = "a { color: var(--color-primry); }";
  const [warning] = themeCssHookWarnings(css, SURFACE, RENAMES);
  expect(css.slice(warning?.from, warning?.to)).toBe("--color-primry");
  expect(warning?.message).toContain("--color-primary");
});
