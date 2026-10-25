import { expect, test } from "@orb/testkit/node";
import { OWNER_CSS_RENAMES } from "#client/owner-css/renames.ts";
import { rewriteRenamedHooks } from "#client/owner-css/rewrite.ts";

type Renames = Parameters<typeof rewriteRenamedHooks>[1];

const RENAMES: Renames = [
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

test("the rewrite skips strings, honours a string holding /* and never stops early on an unterminated comment", () => {
  const css = [
    "a::before { content: '[data-slot=\"bubble\"]'; }",
    'b::before { content: "/*"; }',
    '[data-slot="bubble"] {}',
    '/* open [data-slot="bubble"]',
  ].join("\n");
  expect(rewriteRenamedHooks(css, RENAMES)).toBe(css.replace('\n[data-slot="bubble"] {}', '\n[data-slot="message-bubble"] {}'));
});

test("the recorded retired appearance property is rewritten when unitless and left when its old value carried a unit", () => {
  const css = "a { font-size: calc(1rem * var(--font-scale)); filter: blur(var(--blur-strength)); }";
  expect(rewriteRenamedHooks(css, OWNER_CSS_RENAMES)).toBe("a { font-size: calc(1rem * var(--appearance-font-scale)); filter: blur(var(--blur-strength)); }");
});

test("the rewrite carries on past an unquoted url() holding /*", () => {
  const css = 'a { background: url(x/*y.png); } [data-slot="bubble"] {}';
  expect(rewriteRenamedHooks(css, RENAMES)).toBe('a { background: url(x/*y.png); } [data-slot="message-bubble"] {}');
});

test("the rewrite leaves comments, retired hooks, current names and look-alike prefixes alone", () => {
  const css =
    '/* [data-slot="bubble"] */ [data-slot="old-chip"], [data-slot="bubble-extra"], [data-slot^="bubble"], .shell-sidebar-wide, [data-slot="composer"] {}';
  expect(rewriteRenamedHooks(css, RENAMES)).toBe(css);
});
