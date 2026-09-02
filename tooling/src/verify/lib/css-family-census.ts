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
  [THEME]: 297,
  // +2 (2026-09-02, #1128): `--scroll-fade-depth` / `--scroll-fade-floor` on `.scroll-fade-y`. The block
  // -axis fade ramped to ZERO alpha over 10% of the pane and measured two live buttons at 1.75:1 at the
  // shipped 1280x800 default; a bounded band plus an alpha floor needs two locals, and they deliberately
  // mint no `--fade-*` family (that one is generated — see LOCAL_FADE_STOP_RE below).
  [UI_GLOBALS]: 189,
  [TIERS]: 45,
  // +1 (2026-09-02, #1120): the collapsed panel's `backdrop-filter: none`. A section that declares a pane
  // "unavailable" still renders it collapsed (owner decision H3 / arm L-b), and the off-screen box was
  // keeping the most expensive paint primitive in the browser for a box that blurs nothing.
  // +7 more (2026-09-02, #1154): the pane's glass moved off `.shell-panel` onto a `.shell-panel::before`
  // fill layer, so the pane's TEXT is no longer inside a promoted layer (integer-line-boxes.md Law 3/4).
  // One 2-declaration rule became two rules of 1 + 8 — `background-color: transparent` on the pane, and on
  // the carrier the five that GENERATE it (`content`/`position`/`inset`/`z-index`/`pointer-events`, the
  // grain overlay's own shape one screen down), the two glass declarations, and `box-shadow: inherit` so
  // the pane's elevation highlight is not blurred away by the carrier's backdrop-filter.
  [CLIENT_GLOBALS]: 119,
  // +2 (2026-09-02, #1154): the band's separator moved from `border-block-end` to two composed box-shadow
  // stops (`--shell-band-rule` / `--shell-band-ember` + the `box-shadow` that reads them), so the 48px band
  // stops being a 47px CONTENT box that lands every occupant on a half pixel. The ramp / floating-context
  // overrides are one declaration each before and after — they now answer their own stop, not the property.
  [SHELL]: 337,
};
export const EXPECTED_DECLARATION_TOTAL = 987;
export const EXPECTED_DIRECT_THEME_DECLARATIONS = 194;
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
