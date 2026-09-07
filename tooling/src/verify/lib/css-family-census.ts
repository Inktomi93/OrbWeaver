// Shared census, constants, and ownership records for the declaration-level CSS family wall.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProductStylesheet } from "../contract/css-family.ts";
import { CLIENT_GLOBALS, PRODUCT_STYLESHEETS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";
import type { Finding, GateRunCtx } from "../contract/gate.ts";
import { blankCssComments } from "./comment-spans.ts";
import { parseCssRules } from "./css-rules.ts";

export interface DirectDeclaration {
  readonly prop: string;
  readonly value: string;
  readonly line: number;
}

export interface StylesheetCensus {
  readonly rel: ProductStylesheet;
  readonly raw: string;
  readonly rules: ReturnType<typeof parseCssRules>;
  readonly directTheme: readonly DirectDeclaration[];
  readonly declarations: number;
}

export interface HookOwners {
  readonly ui: boolean;
  readonly client: boolean;
}

export const DENSITY_SPACING = new Set(["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"]);
export const DENSITY_SELECTORS = new Set(['[data-density="comfortable"]', '[data-density="compact"]']);
export const CLIENT_BLUR_FILL = new Set(["--blur-fill-chrome", "--blur-fill-dense"]);
export const CLIENT_COLORIZATION = new Set(["--color-border", "--color-sidebar-border"]);
export const LOCAL_FADE_STOP_RE = /^--fade-(?:start|end|top|bottom)-stop$/u;
export const KEYFRAME_STEP_RE = /^(?:from|to|\d+%(?:\s*,\s*\d+%)*)$/u;
export const KNOWN_DENSITY_FLOOR = '[data-slot="list-row-subtitle"][data-subtitle-step="label"]';
const CLASS_TOKEN_RE = /^[A-Za-z_][\w-]*$/u;
export const EXPECTED_RUNTIME_WRITERS = {
  density: DENSITY_SPACING.size * DENSITY_SELECTORS.size,
  blur: CLIENT_BLUR_FILL.size * 2,
  colorization: CLIENT_COLORIZATION.size * 2,
  fade: 12,
} as const;
export const EXPECTED_DIRECT_CLIENT_UI_MECHANISMS = {
  "slot:dialog-popup": 1,
  "slot:alert-dialog-popup": 1,
  "slot:message-list-scroll": 3,
} as const;
const SOURCE_OWNERS = [
  { prefix: "packages/ui/src/", owner: "ui" },
  { prefix: "packages/client/src/", owner: "client" },
] as const;
export const EXPECTED_DECLARATION_CENSUS: Readonly<Record<ProductStylesheet, number>> = {
  // +2 over the #938 baseline: leading.micro + leading.label-relaxed (docs/design/integer-line-boxes.md).
  // +1 more: --color-accolade, the polarity-aware distinction ink minted 2026-09-01 when the seed
  // ink-duty audit measured the crown gold as TEXT at 1.41-1.71:1 on the light seed (tokens.json
  // color.accolade; the mark token color.highlight stays background-only).
  // +1 more (2026-09-02, #1120): --dimension-device-pixel, the DPR-1 grid quantum the shell's panel
  // tracks round to (tokens.json dimension.device-pixel; a viewport-derived clamp resolves 307.1875 and
  // takes the promoted panel layer off the grid). It is a round() STEP, never a width or a spacing.
  // +6 (2026-09-02, #1109 + #1145): `--spacing-switch-track-height` + `--spacing-switch-inset` (the switch
  // knob is now proportional AND inset on four sides — three direct tokens + their three fine-pointer arms
  // with `--spacing-switch-thumb`, which gained its pointer arm) and `--reading-measure-prose` (the ruled
  // 47ch prose measure; `--reading-measure` stays the transcript's 75ch).
  // +2 more (2026-09-02, #1110): the `--color-selection-quiet` PAIR — the opaque, polarity-aware ground a
  // bulk-default selection control paints when it is ON, and the mark on it. Minted because the first cut
  // (`bg-foreground/55` + `text-background`) forced an INVERTED ink whose ground is the control's own fill,
  // which `seed-theme-ink-contrast` can only judge against the eight surface GROUNDS — 48 findings,
  // unpassable by tuning. A `-foreground` pair is the shape that census can read (tokens.json).
  // +1 (2026-09-02, #1204): `--dimension-shell-content-floor` — the chat-width dial's floor derived from the
  // Geist reading measure (650 + 40 gutter + 48 flat insets = 738px) instead of the pre-Geist 680px literal.
  // +5 (2026-09-04): the density-selected fixed grid cell — `width.cell-fixed` + `width.cell-fixed-compact`
  // (2 direct @theme, tokens.json) and `--orb-grid-cell-fixed` with its comfortable/compact density aliases
  // (3 rules), so Grid `cellFixed` reads one density-selected track instead of a raw minmax literal
  // (tests/ui/tokens/index.test.ts pins the pair; `cellShelf` keeps its independent 8.5rem track).
  // +1 (2026-09-05, D159): `--color-input-border` — the opaque FORM-CONTROL edge. `--color-border` is an
  // 8%-alpha decorative hairline measuring 1.19-1.32:1 around every input, select trigger and textarea, and
  // WCAG 1.4.11's 3:1 governs a control's boundary while saying nothing about a divider; raising the shared
  // token would have moved 72 consumers to satisfy a floor binding on a dozen. One `light-dark()` token, both
  // arms measured floor-and-ceiling per seed (tokens.json color.input-border).
  // −2 (2026-09-06, #1684): `--spacing-switch-thumb`'s two arms — see the note on
  // EXPECTED_DIRECT_THEME_DECLARATIONS below.
  // +8 (2026-09-07, #1868): the FIELD TYPE STEP, minted pointer-conditional — `text.field` /
  // `text.field-dense` and their paired `leading.*`, four tokens each emitting a base (coarse) declaration
  // and an `@media (pointer: fine)` arm. iOS Safari zooms the viewport in when a control under 16px takes
  // focus and never zooms back out, so the platform floor is 16px at coarse; the fine arms are the design's
  // own 15px/13px steps. The arm rides `$extensions["orb.pointerFine"]`, the `spacing.touch-target`
  // mechanism (§4b axis 3: a capability is baked into the TOKEN so the call site carries no variant) —
  // which is what let the interim `@media (any-pointer: coarse)` blocks in ui globals.css AND tiers.css
  // both be DELETED in the same commit rather than left as a second home for one platform fact.
  // NOT an arm on `text.body`: `[data-slot="message-bubble"]` reads that for transcript prose, and a coarse
  // arm there would enlarge all reading prose on touch and collide with `--reading-body-scale`.
  [THEME]: 312,
  // +2 (2026-09-02, #1128): `--scroll-fade-depth` / `--scroll-fade-floor` on `.scroll-fade-y`. The block
  // -axis fade ramped to ZERO alpha over 10% of the pane and measured two live buttons at 1.75:1 at the
  // shipped 1280x800 default; a bounded band plus an alpha floor needs two locals, and they deliberately
  // mint no `--fade-*` family (that one is generated — see LOCAL_FADE_STOP_RE below).
  // +1 (2026-09-07, #1868): the coarse-pointer 16px FIELD FLOOR — one `font-size: var(--text-title)` on
  // `[data-slot="input-root"|"textarea-root"|"select-trigger"]` inside `@media (any-pointer: coarse)`.
  // iOS Safari zooms the viewport on focus for any control under 16px and never zooms back out, and every
  // field in the app computed 15px (`--text-body`) or 13px (`--text-label`). This is the UN-TIERED half of
  // a two-home floor; the TIERED half is the `--orb-tier-field-size` pair in tiers.css below, and the split
  // is SPECIFICITY, not duplication (the tier map is unlayered at (0,2,0) and must keep out-ranking this
  // (0,1,0) rule so a tier can still retune itself). It mints no family and no token: `--text-title` is the
  // existing 1rem step. It is CSS rather than a utility on FIELD_CONTROL because Base UI's own spelling,
  // `any-pointer-coarse:text-base`, imports TAILWIND's default scale — `no-raw-typography-in-features` reds
  // it, correctly.
  [UI_GLOBALS]: 189,
  // +2 (2026-09-04): `[data-density="comfortable"]` / `[data-density="compact"]` each set
  // `--orb-grid-cell-fixed` to its density alias — the tier map is where the density selection lives.
  // +2 (2026-09-07, #1868): the coarse-pointer arm of the FIELD FLOOR — `--orb-tier-field-size` and
  // `--orb-tier-field-leading` re-pointed at the `--text-title`/`--leading-title` step under
  // `@media (any-pointer: coarse)`. It is HERE and not only in ui globals.css because this file is
  // unlayered by design: `[data-surface-tier] [data-slot="input-root"]` at (0,2,0) out-ranks both the
  // primitive's utility default AND the (0,1,0) un-tiered floor, so a field inside ANY `<Surface>` — every
  // LIST pane search box, every settings field — would otherwise have kept its 13px/15px step and gone on
  // zooming iOS on focus. Two declarations because the tier map always maps size and leading as a pair.
  // No family minted: both values are existing generated tokens.
  [TIERS]: 47,
  // +1 (2026-09-02, #1120): the collapsed panel's `backdrop-filter: none`. A section that declares a pane
  // "unavailable" still renders it collapsed (owner decision H3 / arm L-b), and the off-screen box was
  // keeping the most expensive paint primitive in the browser for a box that blurs nothing.
  // +7 more (2026-09-02, #1154): the pane's glass moved off `.shell-panel` onto a `.shell-panel::before`
  // fill layer, so the pane's TEXT is no longer inside a promoted layer (integer-line-boxes.md Law 3/4).
  // One 2-declaration rule became two rules of 1 + 8 — `background-color: transparent` on the pane, and on
  // the carrier the five that GENERATE it (`content`/`position`/`inset`/`z-index`/`pointer-events`, the
  // grain overlay's own shape one screen down), the two glass declarations, and `box-shadow: inherit` so
  // the pane's elevation highlight is not blurred away by the carrier's backdrop-filter.
  // +6 more (2026-09-02, #1173): `.shell-main`'s reading-surface glass took the SAME carrier move, one
  // surface over — it promotes and it contains the reading column's text (Law 3/4), and only escaped
  // #1154's own measurement because the audited arm carries no wallpaper. One 2-declaration rule became
  // two rules of 1 + 7: `background: none` on the pane, and on the carrier the five that GENERATE it plus
  // the two glass declarations. No `box-shadow: inherit` on this one — `.shell-main` authors no elevation
  // and clips nothing, so the pane rule's shadow clause has no subject here (stated at the rule).
  // +2 (2026-09-05, #1362): `.orb-chat-track`'s two margin declarations — the room's ONE horizontal track
  // stopped centring with `mx-auto`, whose halving of an ODD remainder landed the track (and every
  // `backdrop-filter` layer inside it) on a half pixel. Measured on the isolated stage: content pane 893px,
  // track 768px, margin 62.5 — `left -0.500 device px` on FOUR promoted layers at once (`composer`,
  // `swipe-strip`, two `message-bubble`s) plus the `off-grid-text` their glyphs inherit. The replacement is
  // `margin-inline-start: round(down, …, 1px)` + `margin-inline-end: auto`, the horizontal twin of Law 1's
  // leading belt (integer-line-boxes.md §3b / Law 3). Same Law 3/4 family as the #1154 and #1173 rows above.
  [CLIENT_GLOBALS]: 127,
  // +2 (2026-09-02, #1154): the band's separator moved from `border-block-end` to two composed box-shadow
  // stops (`--shell-band-rule` / `--shell-band-ember` + the `box-shadow` that reads them), so the 48px band
  // stops being a 47px CONTENT box that lands every occupant on a half pixel. The ramp / floating-context
  // overrides are one declaration each before and after — they now answer their own stop, not the property.
  // +6 (2026-09-05, #1316): the panel FLIP's END-PINNED COUNTER. `.shell-main` RESIZES rather than
  // translates, so its single counter-translate is the right distance only for START-aligned content; the
  // topbar TRAIL is pinned to the end edge (delta zero) and the FLIP was throwing it a full track outside
  // the viewport and sweeping it back. Two `from`-only keyframes (1 declaration each) + the two
  // `data-list-flip` counter rules + the two `data-list-settle` counter rules. The mobile-block cancels
  // widen existing selector lists and mint no declaration.
  // +6 (2026-09-06, #1646): the FLIP's THIRD counter, for the CENTRED class — `[data-slot=message-row]`'s
  // honest delta is HALF the track (`.shell-main` resizes; a centred child moves by half of what a
  // start-aligned one does), so it takes its own pair of `from`-only keyframes at `calc(track / 2)`, its own
  // two `data-list-flip` counter rules and its two `data-list-settle` twins — the exact #1316 shape one
  // alignment class over. The mobile cancel again widens a selector list and mints nothing.
  // +2 (2026-09-07, #1868): the DEVICE INSETS became the grid's on all four edges — `padding-block-start:
  // env(safe-area-inset-top)` and `padding-inline: env(…-left) env(…-right)` replacing the lone
  // `padding-inline-start`. `viewport-fit=cover` makes notch/Island/home-indicator avoidance OURS, and
  // three of the four edges were unkept: TOP was invisible in a browser tab (Safari's own chrome sits
  // there) but real in the `display: standalone` PWA, where the 48px topbar rendered under the status bar
  // and the Island; END was unkept in landscape. Paying them on the GRID rather than per region is what
  // preserves the D66 A1 chrome-row horizon, and `box-sizing: border-box` means the block padding comes out
  // of the existing `100dvh` rather than adding to it. The topbar's own `max(--spacing-block,
  // env(…-right))` collapsed back to a plain `padding-inline` in the same commit (that was the
  // single-region half of this job, now double-counting), so the net is +2 and not +3.
  [SHELL]: 351,
};
// −2 (2026-09-06, #1684): `--spacing-switch-thumb`'s base and `@media (pointer: fine)` arms. The Switch
// knob became a token-driven calc of the other three dimensions (`track-height − 2×border − 2×inset`) so
// the centred block gap is an EVEN difference by construction and the resting thumb lands on a whole
// device pixel at every `--font-scale` — the vault token had no consumer left and is retired in
// packages/ui/src/tokens/removed.json. Same family as the #1362 row below: a half-pixel landing repaired
// at the length that produces it (docs/design/integer-line-boxes.md §2, amended there).
// +10 (2026-09-07, #1868): 8 theme (the four pointer-conditional field tokens, base + fine arm each) and
// 2 shell (the four-edge device insets). ui globals and tiers are NET ZERO — each briefly carried an
// `@media (any-pointer: coarse)` block while the floor was being built in CSS, and both were deleted when
// the token layer took the capability; that is the shape §4b axis 3 asks for and the reason the two CSS
// homes do not appear in this delta at all. Each half is annotated at its own sheet above.
export const EXPECTED_DECLARATION_TOTAL = 1026;
// +4 (2026-09-07, #1868): the four field tokens' BASE declarations. Their `pointer: fine` arms live in a
// generated @media block, which is a themeRule and not a direct @theme declaration — hence +4 here against
// +8 on the sheet total above.
export const EXPECTED_DIRECT_THEME_DECLARATIONS = 203;
export const CENSUS_TOKEN: Readonly<Record<ProductStylesheet, string>> = {
  [THEME]: "census:theme",
  [UI_GLOBALS]: "census:ui-globals",
  [TIERS]: "census:tiers",
  [CLIENT_GLOBALS]: "census:client-globals",
  [SHELL]: "census:shell",
};

export const MESSAGE =
  "a declaration is inside a sanctioned CSS path but belongs to another semantic family (#951 / client-architecture-lockdown.md §4.3): legal path is not responsibility";

export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    line += text.charCodeAt(index) === 10 ? 1 : 0;
  }
  return line;
}

function nextQuote(current: string, char: string, escaped: boolean): string {
  if (current !== "") {
    return char === current && !escaped ? "" : current;
  }
  return char === '"' || char === "'" ? char : "";
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let quote = "";
  for (let index = open + 1; index < text.length; index += 1) {
    const char = text[index] ?? "";
    const beforeQuote = quote;
    quote = nextQuote(quote, char, text[index - 1] === "\\");
    if (beforeQuote !== "" || quote !== "") {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      if (depth === 0) {
        return index;
      }
      depth -= 1;
    }
  }
  return -1;
}

/** Preserve direct text/line offsets while erasing nested blocks. A line-anchored declaration regex by
 * itself cannot distinguish a direct `@theme` declaration from one nested inside a future at-rule. */
function nestedChar(char: string, depth: number): string {
  return depth > 0 && char !== "\n" ? " " : char;
}

function blankNestedBlocks(text: string): string {
  const chars = [...text];
  let depth = 0;
  let quote = "";
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index] ?? "";
    const beforeQuote = quote;
    quote = nextQuote(quote, char, text[index - 1] === "\\");
    if (beforeQuote !== "" || quote !== "") {
      chars[index] = nestedChar(char, depth);
      continue;
    }
    if (char === "{") {
      depth += 1;
    }
    chars[index] = nestedChar(char, depth);
    if (char === "}") {
      depth -= 1;
    }
  }
  return chars.join("");
}

/** Direct declarations of the generated `@theme` block. `parseCssRules` correctly descends through
 *  at-rules to STYLE rules, but direct declarations in an at-rule are intentionally not style rules. */
function readDirectThemeDeclarations(raw: string): readonly DirectDeclaration[] {
  const text = blankCssComments(raw);
  const match = /@theme\s*\{/u.exec(text);
  if (match === null) {
    return [];
  }
  const open = match.index + match[0].lastIndexOf("{");
  const close = matchingBrace(text, open);
  if (close === -1) {
    return [];
  }
  const body = blankNestedBlocks(text.slice(open + 1, close));
  const out: DirectDeclaration[] = [];
  for (const declaration of body.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gmu)) {
    const prop = declaration[1];
    const value = declaration[2];
    if (prop !== undefined && value !== undefined) {
      out.push({ prop, value: value.trim(), line: lineAt(text, open + 1 + declaration.index + declaration[0].indexOf(prop)) });
    }
  }
  return out;
}

export function readCensus(root: string): readonly StylesheetCensus[] {
  return PRODUCT_STYLESHEETS.flatMap((rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      return [];
    }
    const raw = readFileSync(abs, "utf8");
    const rules = parseCssRules(raw);
    const directTheme = rel === THEME ? readDirectThemeDeclarations(raw) : [];
    return [{ rel, raw, rules, directTheme, declarations: directTheme.length + rules.reduce((sum, rule) => sum + rule.declarations.length, 0) }];
  });
}

export function cssFamilyFinding(file: string, line: number, token: string, message: string): Finding {
  // @finding-overload-ok: CSS is filesystem text, not a ts-morph node; the depth-aware parser supplies the exact file/line/token and CSS has no @orb-gate-ignore grammar to preserve. Ends if the gate runner exposes CSS nodes with the shared suppression contract.
  return { file, line, column: 1, token, message };
}

export function sourceOwner(rel: string): "ui" | "client" | undefined {
  return SOURCE_OWNERS.find((row) => rel.startsWith(row.prefix))?.owner;
}

export function recordOwner(map: Map<string, HookOwners>, hook: string, owner: "ui" | "client"): void {
  const before = map.get(hook) ?? { ui: false, client: false };
  map.set(hook, { ui: before.ui || owner === "ui", client: before.client || owner === "client" });
}

export function recordClassTokens(map: Map<string, HookOwners>, text: string, owner: "ui" | "client"): void {
  for (const token of text.split(/\s+/u)) {
    if (CLASS_TOKEN_RE.test(token)) {
      recordOwner(map, `class:${token}`, owner);
    }
  }
}

export function themeFamilyPrefixes(directTheme: readonly DirectDeclaration[]): ReadonlySet<string> {
  const prefixes = new Set<string>();
  for (const { prop } of directTheme) {
    const family = /^--([a-z0-9]+)-/u.exec(prop)?.[1];
    if (family !== undefined) {
      prefixes.add(`--${family}-`);
    }
  }
  return prefixes;
}

export function reportDensityArmCompleteness(row: StylesheetCensus, ctx: GateRunCtx): void {
  if (row.rel !== TIERS) {
    return;
  }
  const densityRules = row.rules.filter((rule) => rule.selectors.some((selector) => DENSITY_SELECTORS.has(selector)));
  if (densityRules.length === 0) {
    return;
  }
  for (const selector of DENSITY_SELECTORS) {
    const declarations = densityRules
      .filter((rule) => rule.selectors.includes(selector))
      .flatMap((rule) => rule.declarations)
      .filter((declaration) => DENSITY_SPACING.has(declaration.prop));
    if (declarations.length !== DENSITY_SPACING.size) {
      ctx.report(
        cssFamilyFinding(
          TIERS,
          densityRules[0]?.line ?? 1,
          `density-arm:${selector}`,
          `${selector} must write all ${DENSITY_SPACING.size} density spacing intents; found ${declarations.length}`,
        ),
      );
    }
  }
}
