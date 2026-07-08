// The CSS-structure gate (UI-Gates §11.4(e), WS0) — never built until now. Two invariants that no
// TypeScript gate can see (they live in raw CSS text, outside the ts-morph AST the other gates walk):
//   1. globals.css's three "one edit silently breaks it" footguns (D43 §11.4e) stay intact: the
//      reduced-motion floor stays UNLAYERED, color-scheme is declared, and theme.css is imported.
//   2. shell.css's structural geometry (rail/chrome-row/panel) consumes ONLY the DTCG dimension.*
//      tokens (WS0) — no raw rem/px literal reintroduced into the tracked properties.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "../../support/fixtures";

const GLOBALS_CSS_PATH = join(import.meta.dirname, "../../../packages/ui/src/styles/globals.css");
const SHELL_CSS_PATH = join(
  import.meta.dirname,
  "../../../packages/client/src/features/app-shell/surfaces/shell.css",
);

/** Balanced-brace scan: returns the index of the `}` that closes the `{` at `openBraceIndex`. */
function findBlockEnd(css: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < css.length; i++) {
    if (css[i] === "{") {
      depth++;
    } else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  throw new Error("unbalanced braces in CSS fixture");
}

const LAYER_RE = /@layer[^{]*\{/gu;
const COLOR_SCHEME_RE = /color-scheme:\s*\S+;/u;
const COLOR_SCHEME_LIGHT_RE = /color-scheme:\s*light;/u;
const COMMENT_RE = /\/\*[\s\S]*?\*\//gu;
// The Light palette BLOCK opener (a rule), distinct from the `[data-theme="light"]` reference inside the
// `@custom-variant dark (…)` line — this one is immediately followed by the block `{`.
const LIGHT_BLOCK_RE = /\[data-theme="light"\]\s*\{/u;

test("globals.css: the reduced-motion floor is unlayered (D43 §11.4e footgun #1)", () => {
  // Strip comments FIRST — a doc comment mentioning "@layer" (as this file's own header does) would
  // otherwise be mistaken for a real at-rule by the brace scan below.
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8").replace(COMMENT_RE, "");
  const mediaIndex = css.indexOf("@media (prefers-reduced-motion: reduce)");
  expect(mediaIndex, "the reduced-motion @media block must exist").toBeGreaterThanOrEqual(0);

  // Every `@layer ... { ... }` block in the file — the reduced-motion block must fall OUTSIDE all of them.
  // A fresh clone (not the shared top-level LAYER_RE) so the `g`-flag lastIndex never leaks across tests.
  const layerRe = new RegExp(LAYER_RE);
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec-loop idiom
  while ((match = layerRe.exec(css)) !== null) {
    const openBrace = match.index + match[0].length - 1;
    const closeBrace = findBlockEnd(css, openBrace);
    expect(
      mediaIndex < match.index || mediaIndex > closeBrace,
      "the reduced-motion @media block must not be nested inside an @layer",
    ).toBe(true);
  }
});

test("globals.css: color-scheme is declared", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8");
  expect(css).toMatch(COLOR_SCHEME_RE);
});

test("globals.css: theme.css is imported", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8");
  expect(css).toContain('@import "./theme.css"');
});

// Multi-palette machinery (WS2, D44 §12.1) — the seed value-sets ship as [data-theme=…] custom-property
// redefinitions + an enumerated `dark` variant. These are the WS0 css-structure footguns for the
// multi-palette surface: a missing block silently means "the palette never applies", a missing
// color-scheme flip on Light means native controls stay dark (footgun #3), and a naive "default = dark"
// variant would apply dark-variant styles under Light.
test("globals.css: the @custom-variant dark is enumerated (not default-dark)", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8");
  expect(css).toContain("@custom-variant dark");
  // It must reference the light palette (to EXCLUDE it) — proving it's enumerated, not "everything is dark".
  const variantLine = css.split("\n").find((l) => l.includes("@custom-variant dark")) ?? "";
  expect(variantLine, "the dark variant must exclude the light palette").toContain(
    '[data-theme="light"]',
  );
});

test("globals.css: the Mocha + Light seed palettes ship as [data-theme] value-sets", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8");
  expect(css).toContain('[data-theme="mocha"]');
  expect(css).toContain('[data-theme="light"]');
});

test("globals.css: the Light palette flips color-scheme to light (footgun #3)", () => {
  // Strip comments so a doc-comment mention of "color-scheme: light" can't satisfy this.
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8").replace(COMMENT_RE, "");
  const blockMatch = LIGHT_BLOCK_RE.exec(css);
  expect(blockMatch, "the Light palette block must exist").not.toBeNull();
  const lightIdx = (blockMatch as RegExpExecArray).index;
  const blockEnd = findBlockEnd(css, css.indexOf("{", lightIdx));
  const lightBlock = css.slice(lightIdx, blockEnd);
  expect(lightBlock, "the Light palette must declare color-scheme: light").toMatch(
    COLOR_SCHEME_LIGHT_RE,
  );
});

// shell.css geometry — the properties that carry the shell's structural dimensions. A raw rem/px
// literal in one of these VALUES (outside var()) is exactly the drift WS0 closed off: the whole point
// of promoting dimension.rail/chrome-row/panel into tokens.json is that shell.css never hand-writes
// the number again.
const TARGET_PROPS = ["height", "width", "inset-block", "--rail-w", "--panel-w"];

// Literals that ARE allowed to stay raw even inside a tracked property, because they are not shell
// STRUCTURAL geometry (a stroke width, a track reset, or the one breakpoint literal that can't be a
// var() — @media conditions don't evaluate custom properties):
const ALLOWED_LITERALS = new Set([
  "48rem", // dimension.shell-breakpoint's OWN doc: @media can't consume var(), so the literal must repeat here
  "1px", // hairline borders (a stroke width, not a shell dimension)
  "0px", // --list-track/--context-track collapsed-track resets
  "0.125rem", // the mobile tab icon/label gap (a spacing intent, not shell geometry)
]);
const LITERAL_RE = /\d*\.?\d+(?:rem|px)/gu;

test("shell.css: tracked geometry properties (height/width/inset-block/--rail-w/--panel-w) consume only var(--dimension-*) or an allowlisted literal", () => {
  const css = readFileSync(SHELL_CSS_PATH, "utf8");
  const propAlt = TARGET_PROPS.map((p) => p.replace(/[[\]/{}()*+?.\\^$|]/gu, "\\$&")).join("|");
  const declRe = new RegExp(`^[ \\t]*(${propAlt}):\\s*([^;]+);`, "gmu");

  let match: RegExpExecArray | null;
  let checked = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec-loop idiom
  while ((match = declRe.exec(css)) !== null) {
    const [, prop = "", rawValue = ""] = match;
    checked++;
    const withoutVars = rawValue.replace(/var\([^)]*\)/gu, "");
    const literals = withoutVars.match(LITERAL_RE) ?? [];
    for (const literal of literals) {
      expect(
        ALLOWED_LITERALS.has(literal),
        `${prop}: ${rawValue} — raw literal "${literal}" must be var(--dimension-*) or added to the allowlist deliberately`,
      ).toBe(true);
    }
  }
  // Guard against the regex silently matching nothing (a rename of these properties would go undetected).
  expect(checked, "expected to find tracked geometry declarations in shell.css").toBeGreaterThan(0);
});
