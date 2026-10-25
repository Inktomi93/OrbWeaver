import { expect, test } from "@orb/testkit/node";
import type { OwnerCssHook, OwnerCssRename } from "#client/owner-css/hook.ts";
import { rewriteRenamedHooks } from "#client/owner-css/rewrite.ts";
import { themeCssHookWarnings } from "#client/owner-css/warnings.ts";

const SURFACE: readonly OwnerCssHook[] = [
  { kind: "slot", name: "message-bubble" },
  { kind: "slot", name: "composer" },
  { kind: "shell-class", name: "shell-rail" },
  { kind: "token", name: "--color-primary" },
  { kind: "token", name: "--color-border" },
];

const RENAMES: readonly OwnerCssRename[] = [
  { kind: "slot", name: "bubble", to: "message-bubble" },
  { kind: "shell-class", name: "shell-sidebar", to: "shell-rail" },
  { kind: "token", name: "--color-accent-fill", to: "--color-primary" },
  { kind: "slot", name: "old-chip", to: null },
];

test("a recorded old name is rewritten to its successor wherever the sheet spells it", () => {
  const css = ['[data-slot="bubble"] { color: var(--color-accent-fill); }', ".shell-sidebar { --color-accent-fill: red; }"].join("\n");
  expect(rewriteRenamedHooks(css, RENAMES)).toBe(
    ['[data-slot="message-bubble"] { color: var(--color-primary); }', ".shell-rail { --color-primary: red; }"].join("\n"),
  );
});

test("the rewrite leaves comments, retired hooks, current names and look-alike prefixes alone", () => {
  const css =
    '/* [data-slot="bubble"] */ [data-slot="old-chip"], [data-slot="bubble-extra"], [data-slot^="bubble"], .shell-sidebar-wide, [data-slot="composer"] {}';
  expect(rewriteRenamedHooks(css, RENAMES)).toBe(css);
});

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
  expect(warning?.message).not.toContain("Closest");
});

test("a recorded rename warns that it still applies, and a retirement warns that it matches nothing", () => {
  const renamed = themeCssHookWarnings('[data-slot="bubble"] {}', SURFACE, RENAMES);
  expect(renamed).toHaveLength(1);
  expect(renamed[0]?.message).toContain("message-bubble");
  expect(renamed[0]?.message).toContain("still applies");
  const retired = themeCssHookWarnings('[data-slot="old-chip"] {}', SURFACE, RENAMES);
  expect(retired[0]?.message).toContain("removed");
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
