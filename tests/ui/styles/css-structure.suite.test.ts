// The CSS-structure gate (UI-Gates §11.4(e), WS0) — never built until now. Two invariants that no
// TypeScript gate can see (they live in raw CSS text, outside the ts-morph AST the other gates walk):
//   1. globals.css's three "one edit silently breaks it" footguns (D43 §11.4e) stay intact: the
//      reduced-motion floor stays UNLAYERED, color-scheme is declared, and theme.css is imported.
//   2. shell.css's structural geometry (rail/chrome-row/panel) consumes ONLY the DTCG dimension.*
//      tokens (WS0) — no raw rem/px literal reintroduced into the tracked properties.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BLUR_SURFACES } from "@orb/contracts/settings";
import { expect, test } from "../../support/fixtures.ts";

const GLOBALS_CSS_PATH = join(import.meta.dirname, "../../../packages/ui/src/styles/globals.css");
// The seed [data-theme] palettes + the base color-scheme are GENERATED into theme.css from
// src/tokens/themes/*.json (W1) — the palette-block assertions read theme.css, not globals.css.
const THEME_CSS_PATH = join(import.meta.dirname, "../../../packages/ui/src/styles/theme.css");
const THEMES_DIR = join(import.meta.dirname, "../../../packages/ui/src/tokens/themes");
const SHELL_CSS_PATH = join(import.meta.dirname, "../../../packages/client/src/features/app-shell/surfaces/shell.css");
// @orb/client's single stylesheet — home of the four hand-listed BLUR_SURFACES blocks (W5).
const CLIENT_GLOBALS_CSS_PATH = join(import.meta.dirname, "../../../packages/client/src/styles/globals.css");

/** Basenames of every seed value-set whose `$colorScheme` is "light" (drives the dark-variant exclusion). */
function lightSeedThemeNames(): string[] {
  return readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => (JSON.parse(readFileSync(join(THEMES_DIR, f), "utf8")) as { $colorScheme?: string }).$colorScheme === "light")
    .map((f) => f.slice(0, -".json".length));
}

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
// Any `[data-theme=…] {` block opener — a hand-written palette block reappearing in globals.css.
const DATA_THEME_BLOCK_RE = /\[data-theme=[^\]]*\]\s*\{/u;

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
    expect(mediaIndex < match.index || mediaIndex > closeBrace, "the reduced-motion @media block must not be nested inside an @layer").toBe(true);
  }
});

test("theme.css: color-scheme is declared (the base :root scheme, moved here from globals.css in W1)", () => {
  const css = readFileSync(THEME_CSS_PATH, "utf8");
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
// The @custom-variant is the ONE hand-authored piece that stays in globals.css (the palette blocks
// themselves are generated into theme.css). Strengthened past a bare `[data-theme="light"]` literal:
// it must EXCLUDE every light seed value-set discovered in src/tokens/themes/*.json — so a NEW light
// palette that isn't wired into the variant (dark-variant styles would leak under it) goes red here.
test("globals.css: the @custom-variant dark is enumerated and excludes every light seed value-set", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8");
  expect(css).toContain("@custom-variant dark");
  const variantLine = css.split("\n").find((l) => l.includes("@custom-variant dark")) ?? "";
  const lightThemes = lightSeedThemeNames();
  expect(lightThemes.length, "expected at least one light seed value-set to enforce against").toBeGreaterThan(0);
  for (const name of lightThemes) {
    expect(variantLine, `the dark variant must exclude the "${name}" light palette`).toContain(`[data-theme="${name}"]`);
  }
});

test("globals.css: no [data-theme=…] palette block remains (the seed palettes moved to theme.css in W1)", () => {
  // Strip comments so the header's own prose mentioning [data-theme=…] can't trip this. A hand-written
  // block reappearing here (a re-drift of a generated palette back into globals) is the regression.
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8").replace(COMMENT_RE, "");
  expect(css, "globals.css must not carry a hand-written [data-theme=…] { … } palette block").not.toMatch(DATA_THEME_BLOCK_RE);
});

test("theme.css: the Mocha + Light seed palettes ship as generated [data-theme] value-sets", () => {
  const css = readFileSync(THEME_CSS_PATH, "utf8");
  expect(css).toContain('[data-theme="mocha"]');
  expect(css).toContain('[data-theme="light"]');
});

test("theme.css: the Light palette flips color-scheme to light (footgun #3)", () => {
  // Strip comments so a doc-comment mention of "color-scheme: light" can't satisfy this.
  const css = readFileSync(THEME_CSS_PATH, "utf8").replace(COMMENT_RE, "");
  const blockMatch = LIGHT_BLOCK_RE.exec(css);
  expect(blockMatch, "the Light palette block must exist").not.toBeNull();
  const lightIdx = (blockMatch as RegExpExecArray).index;
  const blockEnd = findBlockEnd(css, css.indexOf("{", lightIdx));
  const lightBlock = css.slice(lightIdx, blockEnd);
  expect(lightBlock, "the Light palette must declare color-scheme: light").toMatch(COLOR_SCHEME_LIGHT_RE);
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
  "1.25rem", // the topbar chip/toggle divider LENGTH (a decorative stroke, not shell geometry — N1)
  "2px", // the rail brand's active accent bar (a decorative stroke width, not shell geometry — home F5, mock home.html:45)
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

// Blur-surface selector sync (W5) — the glass feature gates on html[data-blur-<surface>] attrs, and
// four CSS blocks hand-list them. A drift here (a surface renamed/added in BLUR_SURFACES but not
// mirrored into one of these blocks) is silent: the gate simply never fires for that surface.
/** Finds the `{`-opened block immediately following `anchor` in `css`, and returns its full text (including braces). */
function findAnchoredBlock(css: string, anchor: string, label: string): string {
  const anchorIndex = css.indexOf(anchor);
  expect(anchorIndex, `expected to find the "${label}" anchor`).toBeGreaterThanOrEqual(0);
  const openBrace = css.indexOf("{", anchorIndex);
  expect(openBrace, `expected an opening brace after the "${label}" anchor`).toBeGreaterThanOrEqual(0);
  const closeBrace = findBlockEnd(css, openBrace);
  return css.slice(anchorIndex, closeBrace + 1);
}

test("blur-surface selectors stay in sync with BLUR_SURFACES across all four hand-listed CSS blocks", () => {
  const clientGlobalsCss = readFileSync(CLIENT_GLOBALS_CSS_PATH, "utf8");
  const shellCss = readFileSync(SHELL_CSS_PATH, "utf8");

  const blocks = [
    { label: "client globals.css @supports backdrop-filter block", css: clientGlobalsCss, anchor: "@supports (backdrop-filter: blur(1px)) {" },
    {
      label: "client globals.css prefers-reduced-transparency block",
      css: clientGlobalsCss,
      anchor: "@media (prefers-reduced-transparency: reduce) {",
    },
    { label: "client globals.css prefers-contrast: high block", css: clientGlobalsCss, anchor: "@media (prefers-contrast: high) {" },
    { label: "shell.css mobile blur kill-switch block", css: shellCss, anchor: "/* Mobile blur kill-switch" },
  ];

  expect(blocks.length, "expected exactly four hand-listed blur-surface CSS blocks").toBe(4);

  for (const { label, css, anchor } of blocks) {
    const block = findAnchoredBlock(css, anchor, label);
    for (const surface of BLUR_SURFACES) {
      expect(block, `${label} must reference data-blur-${surface}`).toContain(`data-blur-${surface}`);
    }
  }
});

// PART A pin (W5): the reading-scale vars are runtime-stamped by use-appearance-root-effects and
// REMOVED on cleanup — without a fallback the calc() goes invalid-at-computed-value and font-size
// silently reverts to inherited, instead of behaving like the already-fallback-guarded --font-scale.
test("client globals.css: reading-scale calc()s carry a `, 1` fallback (unset-var invalid-calc footgun)", () => {
  const css = readFileSync(CLIENT_GLOBALS_CSS_PATH, "utf8");
  expect(css).toContain("var(--reading-body-scale, 1)");
  expect(css).toContain("var(--reading-name-scale, 1)");
});
