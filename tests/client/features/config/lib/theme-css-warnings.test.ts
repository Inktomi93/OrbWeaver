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

test("a var() of an undeclared name outside the surface warns, with the closest token", () => {
  const css = "a { color: var(--color-primry); }";
  const [warning] = themeCssHookWarnings(css, SURFACE, RENAMES);
  expect(css.slice(warning?.from, warning?.to)).toBe("--color-primry");
  expect(warning?.message).toContain("--color-primary");
});
