// The CSS-structure gate (UI-Gates §11.4(e), WS0) — never built until now. Two invariants that no
// TypeScript gate can see (they live in raw CSS text, outside the ts-morph AST the other gates walk):
//   1. globals.css's three "one edit silently breaks it" footguns (D43 §11.4e) stay intact: the
//      reduced-motion floor stays UNLAYERED, color-scheme is declared, and theme.css is imported.
//   2. shell.css's structural geometry (rail/chrome-row/panel) consumes ONLY the DTCG dimension.*
//      tokens (WS0) — no raw rem/px literal reintroduced into the tracked properties.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BLUR_SURFACES } from "@orb/contracts/settings";
import { zScopeOfCssVar } from "@orb/ui/z-scope";
import { expect, test } from "../../support/fixtures.ts";

const GLOBALS_CSS_PATH = join(import.meta.dirname, "../../../packages/ui/src/styles/globals.css");
// The seed [data-theme] palettes + the base color-scheme are GENERATED into theme.css from
// src/tokens/themes/*.json (W1) — the palette-block assertions read theme.css, not globals.css.
const THEME_CSS_PATH = join(import.meta.dirname, "../../../packages/ui/src/styles/theme.css");
const SHELL_CSS_PATH = join(import.meta.dirname, "../../../packages/client/src/features/app-shell/surfaces/shell.css");
// @orb/client's single stylesheet — home of the four hand-listed BLUR_SURFACES blocks (W5).
const CLIENT_GLOBALS_CSS_PATH = join(import.meta.dirname, "../../../packages/client/src/styles/globals.css");

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

// Polarity has ONE mechanism: generated color-scheme plus light-dark(). A named-theme Tailwind variant
// cannot see custom-theme polarity and would create a second axis that can disagree with ThemeScope.
test("globals.css: no named-theme dark custom variant exists", () => {
  const css = readFileSync(GLOBALS_CSS_PATH, "utf8").replace(COMMENT_RE, "");
  expect(css).not.toContain("@custom-variant dark");
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

test("blur-surface selectors stay in sync with BLUR_SURFACES across both hand-listed CSS blocks", () => {
  const clientGlobalsCss = readFileSync(CLIENT_GLOBALS_CSS_PATH, "utf8");
  const shellCss = readFileSync(SHELL_CSS_PATH, "utf8");

  const blocks = [
    { label: "client globals.css @supports backdrop-filter block", css: clientGlobalsCss, anchor: "@supports (backdrop-filter: blur(1px)) {" },
    {
      label: "client globals.css prefers-reduced-transparency block",
      css: clientGlobalsCss,
      anchor: "@media (prefers-reduced-transparency: reduce) {",
    },
  ];
  // TWO now, and the arithmetic has a history. shell.css's mobile arm used to carry one (the blur
  // kill-switch), deleted at #135 — it re-declared these selectors at identical specificity in the sheet
  // the bundle emits FIRST, so it could never win, and the ruling moved into the glass block's own @media
  // condition (asserted by the breakpoint-complement test below). `shellCss` is still read here so a
  // re-added override reds rather than silently rejoining the tie. Comments stripped first: the tombstone
  // comment left in that arm NAMES the declaration it forbids.
  // The prefers-contrast arm LEFT this list at #138 and must not be re-added: its rules are deliberately
  // NOT gated on `data-blur-*` (accessibility must not depend on an aesthetic toggle) and deliberately
  // exclude `messages` (bubbles author no border, so a rule there mints one). It is surface-listed by
  // SLOT instead, asserted in the #138 test below — a blur-attr assertion here would demand exactly the
  // gating that review removed.
  const shellRules = shellCss.replace(COMMENT_RE, "");
  expect(shellRules.includes("backdrop-filter: none"), "shell.css must not re-declare a blur override — the ruling is the glass block's own @media").toBe(
    false,
  );
  expect(blocks.length, "expected exactly two hand-listed blur-surface CSS blocks").toBe(2);

  for (const { label, css, anchor } of blocks) {
    const block = findAnchoredBlock(css, anchor, label);
    for (const surface of BLUR_SURFACES) {
      expect(block, `${label} must reference data-blur-${surface}`).toContain(`data-blur-${surface}`);
    }
  }
});

// #137: the reduced-transparency arm delivers SOLID by driving the glass's two fill percentages to
// 100%, and kills the (now invisible, still paid-for) backdrop-filter with selectors that are exact
// specificity TIES with the glass rules. A tie is decided by source order, so the order is an
// invariant of the fix, not an accident of how the file happens to read — the arm must stay BELOW the
// @supports block. Nothing else can see this: both orders parse, and only a rendered assertion under an
// emulated preference (the app-shell CT's #137 block) catches the flipped one.
test("client globals.css: the reduced-transparency arm sits BELOW the glass block, and answers it with the fill tokens (never `revert`)", () => {
  const css = readFileSync(CLIENT_GLOBALS_CSS_PATH, "utf8");
  const glassIndex = css.indexOf("@supports (backdrop-filter: blur(1px)) {");
  const reduceIndex = css.indexOf("@media (prefers-reduced-transparency: reduce) {");
  expect(glassIndex, "the glass @supports block must exist").toBeGreaterThanOrEqual(0);
  expect(reduceIndex, "the reduced-transparency arm must exist").toBeGreaterThanOrEqual(0);
  expect(reduceIndex, "the reduced-transparency arm must come AFTER the glass block — its selectors tie on specificity").toBeGreaterThan(glassIndex);

  const reduceBlock = findAnchoredBlock(css, "@media (prefers-reduced-transparency: reduce) {", "client globals.css prefers-reduced-transparency block");
  // `revert` rolls back the whole AUTHOR origin, including each surface's own fill, so it resolves to the
  // UA default — transparent. That is the #137 defect verbatim, and #135 deleted the same spelling from
  // shell.css. It must not come back anywhere in this file.
  expect(
    css.replace(COMMENT_RE, "").includes("background-color: revert"),
    "`background-color: revert` resolves to TRANSPARENT — never use it to undo a fill",
  ).toBe(false);
  // The mechanism: the fill percentages go opaque, so every glass rule (including `.shell-main`, which
  // the old hand-listed arm missed) paints its own tint at full strength.
  expect(reduceBlock).toContain("--blur-fill-chrome: 100%");
  expect(reduceBlock).toContain("--blur-fill-dense: 100%");
});

// #138: the contrast arm had been spelled `prefers-contrast: high` — the WebKit-era value MQ5 renamed
// to `more` — so it matched in no browser we ship to and had never rendered. Two things must stay true
// now that it does: the value stays MQ5-correct, and its opacity half goes through the same fill knob
// #137 established instead of re-spelling a per-surface fill (the hand-written one flattened both modal
// slots to --color-sidebar and missed .shell-main). Only the rendered pin (app-shell.ct.tsx's #138
// block) can see the cascade; this test guards the SPELLING and the mechanism, which text can see.
test("client globals.css: the contrast arm uses the MQ5 value `more` and drives the fill tokens (never a hand-written fill)", () => {
  const css = readFileSync(CLIENT_GLOBALS_CSS_PATH, "utf8");
  const rules = css.replace(COMMENT_RE, "");
  expect(rules.includes("prefers-contrast: high"), "`high`/`low` are the WebKit-era values — MQ5 spells them `more`/`less`, and only `more` ever matches").toBe(
    false,
  );
  expect(rules, "the contrast arm must exist").toContain("@media (prefers-contrast: more) {");
  // The alpha half is a SEPARATE query carrying the exact negation of the reduce arm, so a user with
  // BOTH preferences keeps reduced-transparency's 100% — decided by condition, never by source order.
  expect(rules, "the contrast alpha arm must yield to reduced-transparency by CONDITION").toContain(
    "@media (prefers-contrast: more) and (not (prefers-reduced-transparency: reduce)) {",
  );
  const alphaArm = findAnchoredBlock(
    rules,
    "@media (prefers-contrast: more) and (not (prefers-reduced-transparency: reduce)) {",
    "client globals.css contrast alpha arm",
  );
  expect(alphaArm).toContain("--blur-fill-chrome: 92%");
  expect(alphaArm).toContain("--blur-fill-dense: 92%");
  // The defect the knob replaced: a hand-written 92% mix on four selectors, tinted --color-sidebar even
  // for the two modal slots the glass rule tints --color-popover.
  const contrastArm = findAnchoredBlock(rules, "@media (prefers-contrast: more) {", "client globals.css prefers-contrast: more block");
  expect(contrastArm.includes("background-color"), "the contrast arm must not re-spell a surface fill — drive --blur-fill-* instead").toBe(false);
});

// #138 (second pass, side-eye rendered review): the EDGE half. Every clause below is a defect that
// shipped in the first cut and is invisible to a parse — the rendered pins live in the app-shell CT; this
// test guards the SHAPE the pins depend on.
test("client globals.css: the contrast EDGE arm is per-side, colour-raised, un-gated, and width-scoped", () => {
  const rules = readFileSync(CLIENT_GLOBALS_CSS_PATH, "utf8").replace(COMMENT_RE, "");
  const edgeAnchor = "@media (prefers-contrast: more) and (width > 48rem) {";
  expect(rules, "the edge arm must be scoped to the desktop complement of shell.css's mobile arm").toContain(edgeAnchor);
  const edgeArm = findAnchoredBlock(rules, edgeAnchor, "client globals.css contrast edge arm");

  // 1. PER-SIDE. Tailwind preflight makes border-STYLE solid on all four sides, so the `border-width`
  // shorthand un-zeroes the three sides a panel never draws and paints them in currentColor (a near-white
  // stripe down the list panel, measured). Panels get exactly the side they author.
  expect(edgeArm).toContain("border-inline-end-width: 2px");
  expect(edgeArm).toContain("border-inline-start-width: 2px");
  const panelRules = edgeArm.slice(edgeArm.indexOf('.shell-panel[data-panel-side="list"]'), edgeArm.indexOf('[data-slot="composer"]'));
  expect(panelRules.includes("border-width:"), "a panel must never take the four-sided shorthand — it paints three currentColor edges").toBe(false);
  // Only the surfaces that author all four sides may use it.
  expect(edgeArm.includes('[data-slot="message-bubble"]'), "bubbles author no border at any viewport — a rule here MINTS one").toBe(false);

  // 2. COLOUR RAISED WITH THE WIDTH. A 2px 7%-alpha hairline measured 1.16:1 against its own panel; each
  // edge is mixed from the pair its own surface owns, through one dial.
  expect(edgeArm).toContain("--contrast-edge-mix");
  for (const pair of [
    "color-mix(in oklab, var(--color-sidebar-foreground) var(--contrast-edge-mix), var(--color-sidebar))",
    "color-mix(in oklab, var(--color-foreground) var(--contrast-edge-mix), var(--color-card))",
    "color-mix(in oklab, var(--color-popover-foreground) var(--contrast-edge-mix), var(--color-popover))",
  ]) {
    expect(edgeArm, "each edge colour mixes the pair its OWN surface owns, so a custom palette stays correct").toContain(pair);
  }

  // 3. NOT BLUR-GATED. Accessibility must not depend on the decorative glass toggle — the first cut gated
  // every rule on data-blur-*, so a contrast user with the glass off got nothing.
  expect(edgeArm.includes("data-blur-"), "the edge arm must not be gated on an aesthetic toggle").toBe(false);
  const edgeSlots = [
    '.shell-panel[data-panel-side="list"]',
    '.shell-panel[data-panel-side="context"]',
    '[data-slot="composer"]',
    '[data-slot="dialog-popup"]',
    '[data-slot="alert-dialog-popup"]',
  ];
  for (const slot of edgeSlots) {
    expect(edgeArm, `the edge arm must cover ${slot}`).toContain(slot);
  }
});

// The ONE viewport breakpoint, across every site that hand-writes it (#135). `dimension.shell-breakpoint`
// exists precisely so this assertion can be made — its own $description says an @media condition cannot
// consume a var(), so the literal must repeat, and "this token exists so a test asserts the CSS literal +
// the use-is-mobile-viewport.ts matchMedia twin agree". Until #135 that test did not exist. It matters more
// now than when the note was written: the client styles tier's glass block is scoped to the COMPLEMENT of
// shell.css's mobile arm (that is what makes the mobile-perf ruling order-proof rather than an override
// that loses to source order), so a breakpoint edited in one file and not the other opens a band where the
// shell is in its mobile layout and the glass is still painting — the exact defect #135 closed.
const USE_IS_MOBILE_VIEWPORT_PATH = join(import.meta.dirname, "../../../packages/client/src/features/app-shell/hooks/use-is-mobile-viewport.ts");
const TOKENS_JSON_PATH = join(import.meta.dirname, "../../../packages/ui/src/tokens/tokens.json");
const REM_LITERAL_RE = /^\d+(?:\.\d+)?rem$/u;

test("the shell breakpoint literal agrees across shell.css, the glass block's complement, the matchMedia twin, and its token", () => {
  const value = (
    JSON.parse(readFileSync(TOKENS_JSON_PATH, "utf8")) as {
      dimension: { "shell-breakpoint": { $value: { value: number; unit: "px" | "rem" } } };
    }
  ).dimension["shell-breakpoint"].$value;
  const breakpoint = `${value.value}${value.unit}`;
  expect(breakpoint, "dimension.shell-breakpoint must carry a rem literal").toMatch(REM_LITERAL_RE);

  // shell.css's mobile arm — the one viewport @media in the layout engine.
  expect(readFileSync(SHELL_CSS_PATH, "utf8")).toContain(`@media (max-width: ${breakpoint})`);
  // …and the glass block's EXACT complement (range syntax: `width > X` is `not (width <= X)`), which is
  // why the glass simply is not emitted on a phone.
  expect(readFileSync(CLIENT_GLOBALS_CSS_PATH, "utf8")).toContain(`@media (width > ${breakpoint})`);
  // The JS twin the shell's regime hooks read.
  expect(readFileSync(USE_IS_MOBILE_VIEWPORT_PATH, "utf8")).toContain(`"(max-width: ${breakpoint})"`);
});

// PART A pin (W5): the reading-scale vars are runtime-stamped by use-appearance-root-effects and
// REMOVED on cleanup — without a fallback the calc() goes invalid-at-computed-value and font-size
// silently reverts to inherited, instead of behaving like the already-fallback-guarded --font-scale.
test("client globals.css: reading-scale calc()s carry a `, 1` fallback (unset-var invalid-calc footgun)", () => {
  const css = readFileSync(CLIENT_GLOBALS_CSS_PATH, "utf8");
  expect(css).toContain("var(--reading-body-scale, 1)");
  expect(css).toContain("var(--reading-name-scale, 1)");
});

// #960: ThemeScope's inline custom palette sits above two siblings. A grid-only descendant arm makes
// colorization work in the shell while every themed portal keeps the uncolorized border family. Keep the
// provider-less seed arm and the paired custom-theme branches declaration-identical; the rendered app-shell
// CT proves Dialog/Drawer values, custom CSS consumption, nested-scope isolation, and no-remount toggling.
test("client globals.css: colorization pairs the shell grid and themed portal root below ThemeScope", () => {
  const rules = readFileSync(CLIENT_GLOBALS_CSS_PATH, "utf8").replace(COMMENT_RE, "");
  const rootAnchor = "html[data-theme-colorization] {";
  const scopedAnchor = 'html[data-theme-colorization] :is(.shell-grid, [data-slot="portal-root"]) {';
  const rootBlock = findAnchoredBlock(rules, rootAnchor, "provider-less colorization arm");
  const scopedBlock = findAnchoredBlock(rules, scopedAnchor, "ThemeScope descendant colorization arms");
  const declarations = (block: string): string =>
    block
      .slice(block.indexOf("{") + 1, -1)
      .replace(/\s+/gu, " ")
      .trim();

  expect(declarations(scopedBlock), "seed/provider-less and custom-theme branches must derive the same token family").toBe(declarations(rootBlock));
  expect(rules.match(/html\[data-theme-colorization\]/gu)?.length, "colorization has exactly one root arm and one paired descendant arm").toBe(2);
  expect(rules, "the historical grid-only arm strands Dialog/Drawer portals").not.toContain("html[data-theme-colorization] .shell-grid {");
});

// ── THE SHELL'S STACKING SCOPE (#1794) ────────────────────────────────────────────────────────────────
// `.shell-grid` is `isolation: isolate`, so every z-index in shell.css orders that box's own children and
// nothing else. A cross-boundary float escapes by being PORTALED to `[data-slot="portal-root"]` (the grid's
// `display: contents` sibling) — never by naming a higher token. So the shell may spell only the
// `in-context` and `app-frame` rungs; a `portal-float` token here claims a reach the scope cannot grant.
// (`no-raw-z-index` is green either way — it proves the token VOCABULARY, never the scope. The scope map
// itself is `packages/ui/src/tokens/z-scope.ts`, total by `satisfies`; this is its CSS-side reader.)
//
// COMMENTS ARE STRIPPED FIRST and that is load-bearing, not hygiene: the file's own scope block NAMES
// `--z-modal` while explaining why it may not be declared there, and a text scan that could not tell prose
// from a declaration would either red on the explanation or force the explanation to go unwritten.
const Z_VAR_RE = /var\(\s*(--z-[a-z0-9-]+)/gu;

/** Every `--z-*` this CSS declares a value from, with the scope each one claims. */
function zScopeClaims(css: string): readonly { readonly cssVar: string; readonly scope: string }[] {
  return [...css.replace(COMMENT_RE, "").matchAll(Z_VAR_RE)].map((match) => ({
    cssVar: match[1] ?? "",
    scope: zScopeOfCssVar(match[1] ?? "") ?? "UNKNOWN",
  }));
}

test("shell.css consumes only shell-scoped z rungs — a portal-float token there claims a reach it cannot have", () => {
  const claims = zScopeClaims(readFileSync(SHELL_CSS_PATH, "utf8"));
  // Empty would pass vacuously — the shell does stack things, and if this ever reads zero the scan broke.
  expect(claims.length, "shell.css declares z-index from the token scale").toBeGreaterThan(3);
  expect(claims.filter((claim) => claim.scope !== "app-frame" && claim.scope !== "in-context")).toEqual([]);

  // PLANTED POSITIVE CONTROL, same predicate, same invocation: the scan does bite on the drift it exists
  // for (the mobile sheet's pre-#1794 `--z-modal`) and on a name outside the governed vocabulary.
  const planted = zScopeClaims(".shell-panel { z-index: var(--z-modal); }\n.x { z-index: var(--z-nope); }");
  expect(planted).toEqual([
    { cssVar: "--z-modal", scope: "portal-float" },
    { cssVar: "--z-nope", scope: "UNKNOWN" },
  ]);
});
