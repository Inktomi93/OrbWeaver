// The raw SillyTavern THEME grammar of the theme serde: one ST theme object in → an orb `ThemeOverride` out,
// plus the per-file list of ST keys that found no orb seat. A theme carries colour only (D63/D71); the viewer
// ergonomics keys ST bundles into a theme are homed on `appearance` and import from `power_user` instead.
//
// The seven that map, with ST's own CSS-variable names:
//   main_text_color            (--SmartThemeBodyColor)          → bodyColor
//   italics_text_color         (--SmartThemeEmColor)            → narrationColor   (ST italicises narration/action)
//   quote_text_color           (--SmartThemeQuoteColor)         → dialogueColor    (orb's `colorQuotedSpeech` is
//                                                                 documented ST parity for exactly this pairing)
//   blur_tint_color            (--SmartThemeBlurTintColor)      → background       (the base surface)
//   user_mes_blur_tint_color   (--SmartThemeUserMesBlurTintColor)→ userBubble.bg
//   bot_mes_blur_tint_color    (--SmartThemeBotMesBlurTintColor) → aiBubble.bg
//   border_color               (--SmartThemeBorderColor)        → borderColor      (the schema's own "(ST parity)")
// `chat_tint_color` is CONSUMED but emits no token — it is the surface ST paints the message tints onto, so it
// is the compositing backdrop (`./color.ts` says why every tint is flattened).
//
// THE SAFETY GATE (owner ruling: convert "if we can do it safely"): orb derives every semantic foreground
// against its actual surface, so flattened base and bubble intent is preserved whole. Each AUTHORED TEXT
// colour is kept only if it clears AA against the surface it renders on — the one pair the derivation cannot
// fix, because ST painted that text over a background PHOTO orb does not reproduce. A dropped colour is
// reported with its MEASURED ratio and the base palette's own value shows through.
//
// NAMES ARE QUALIFIED (`Azure (SillyTavern)`): ST ships themes called `Dark Lite` and `Azure`, and the import
// is additive by name, so an unqualified import would land beside an owner's own theme as a numbered copy.

import type { StDroppedField } from "@orb/contracts/preset";
import type { ThemeOverride } from "@orb/contracts/theme";
import { isPlainObject } from "@orb/kit/guards";
import type { Oklch } from "@orb/kit/theme-derivation";
import { AA_NORMAL_RATIO, oklchToSrgb, wcagContrastRatio } from "@orb/kit/theme-derivation";
import type { SrgbColor } from "./color.ts";
import { compositeOver, oklchLiteral, opaque, parseSrgb, toOklch } from "./color.ts";

/** One ST theme mapped to an orb theme: the QUALIFIED name, the clamped token set, and the ST keys that
 *  carry a meaningful value but produce no orb theme token. */
export interface ParsedStTheme {
  readonly name: string;
  readonly override: ThemeOverride;
  /** ST theme keys present with a meaningful value that orb's THEME model has no seat for — several are
   *  homed on the viewer's `appearance` namespace instead and import from `power_user` (see the reasons). */
  readonly unmapped: readonly StDroppedField[];
}

/** One ST theme's parse: the converted palette, or the REASON it could not convert ("not a JSON object",
 *  "no base surface colour"). A refusal always carries its reason; the report prints it verbatim. */
export type StThemeParse = { readonly ok: true; readonly parsed: ParsedStTheme } | { readonly ok: false; readonly reason: string };

/** Ratio decimals in a refusal reason — enough to act on, not enough to read as false precision. */
const RATIO_PRECISION = 2;

/** The name qualifier — see the module header for why every imported theme carries one. */
const SOURCE_LABEL = "SillyTavern";

/** The qualified orb theme name for one ST theme. */
export function stThemeName(label: string): string {
  return `${label} (${SOURCE_LABEL})`;
}

// The ST keys this parser reads for colour. Spelled once so the dropped-field sweep can exclude them.
const ST_BODY = "main_text_color";
const ST_NARRATION = "italics_text_color";
const ST_DIALOGUE = "quote_text_color";
const ST_SURFACE = "blur_tint_color";
const ST_CHAT_SURFACE = "chat_tint_color";
const ST_USER_BUBBLE = "user_mes_blur_tint_color";
const ST_AI_BUBBLE = "bot_mes_blur_tint_color";
const ST_BORDER = "border_color";

// Every OTHER key ST's `getThemeObject` emits, with the reason it produces no orb theme token. A key is only
// reported when it carries a MEANINGFUL value (the preset wave's `isMeaningful` rule) — an ST profile is mostly
// defaults, and listing 30 `false`s per theme would bury the two lines that matter.
/** The shared tail on every "orb homes this on the viewer, not on a theme" reason — one spelling, so the tail
 *  cannot drift between sixteen rows and the operator learns the ACTIVE value did travel. */
const ERGONOMICS_SUFFIX = "; viewer ergonomics, not a theme — the ACTIVE value imports from `power_user`";

const UNMAPPED_REASONS: readonly StDroppedField[] = [
  { field: "underline_text_color", reason: "no underline-text token — orb colours body, dialogue and narration only" },
  { field: ST_CHAT_SURFACE, reason: "used only as the compositing backdrop for the message/border tints — orb has no separate chat-panel surface token" },
  { field: "shadow_color", reason: "text/panel shadow is the viewer's `appearance.shadowEffects` toggle, not a theme colour" },
  { field: "shadow_width", reason: "text/panel shadow is the viewer's `appearance.shadowEffects` toggle, not a theme value" },
  { field: "blur_strength", reason: "glass blur is the viewer's own `appearance.blurSurfaces` treatment, not a theme value" },
  { field: "custom_css", reason: "ST custom CSS targets ST's own DOM (`#chat`, `.mes`, …), which orb never renders — it would be dead or hostile rules" },
  // Ergonomics: real orb settings, on the VIEWER's `appearance` namespace rather than on a theme (D63/D71).
  // The ACTIVE values of these import from `settings.json` → `power_user` (substrate/appearance.ts), which is
  // what `ERGONOMICS_SUFFIX` points the operator at.
  { field: "font_scale", reason: `type scale is \`appearance.fontScale\`, a reader's own choice${ERGONOMICS_SUFFIX}` },
  { field: "chat_width", reason: `\`appearance.chatWidthPct\`${ERGONOMICS_SUFFIX}` },
  { field: "avatar_style", reason: `\`appearance.avatarShape\`/\`avatarAspect\`${ERGONOMICS_SUFFIX}` },
  { field: "chat_display", reason: `row anatomy is \`appearance.chatStyle\` (a theme may not force a row skin — D71/TD O-4)${ERGONOMICS_SUFFIX}` },
  { field: "noShadows", reason: `\`appearance.shadowEffects\`${ERGONOMICS_SUFFIX}` },
  { field: "timer_enabled", reason: `\`appearance.showGenerationTimer\`${ERGONOMICS_SUFFIX}` },
  { field: "timestamps_enabled", reason: `\`appearance.showTimestamps\`${ERGONOMICS_SUFFIX}` },
  { field: "timestamp_model_icon", reason: `\`appearance.showModelIcon\`${ERGONOMICS_SUFFIX}` },
  { field: "mesIDDisplay_enabled", reason: `\`appearance.showMessageId\`${ERGONOMICS_SUFFIX}` },
  { field: "hideChatAvatars_enabled", reason: `\`appearance.showInChatAvatars\`${ERGONOMICS_SUFFIX}` },
  { field: "message_token_count_enabled", reason: `\`appearance.showTokenCount\`${ERGONOMICS_SUFFIX}` },
  { field: "expand_message_actions", reason: `\`appearance.messageActions\`${ERGONOMICS_SUFFIX}` },
  { field: "reduced_motion", reason: `\`appearance.reducedMotion\`${ERGONOMICS_SUFFIX}` },
  // ST-only affordances with no orb concept at all.
  { field: "fast_ui_mode", reason: "ST's no-blur performance mode — orb's glass is per-surface (`appearance.blurSurfaces`), with no global switch" },
  { field: "waifuMode", reason: "ST's full-screen visual-novel mode — no orb counterpart" },
  { field: "zoomed_avatar_magnification", reason: "ST avatar-zoom behaviour — no orb counterpart" },
  { field: "hotswap_enabled", reason: "ST's recent-character quick-swap bar — no orb counterpart" },
  { field: "bogus_folders", reason: "ST's tag-as-folder browsing mode — orb tags are labels, never a folder tree" },
  { field: "enableZenSliders", reason: "an ST sampler-UI mode — no orb counterpart" },
  { field: "enableLabMode", reason: "an ST experimental-UI mode — no orb counterpart" },
  { field: "compact_input_area", reason: "an ST composer layout toggle — no orb counterpart" },
  { field: "show_swipe_num_all_messages", reason: "an ST swipe-counter toggle — no orb counterpart (the swipe DATA imports with each chat)" },
  { field: "click_to_edit", reason: "an ST message-edit gesture — no orb counterpart" },
  { field: "media_display", reason: "an ST inline-media layout toggle — no orb counterpart" },
  { field: "toastr_position", reason: "ST toast placement — orb toasts have one placement" },
];

/** A dropped key is "meaningful" (worth reporting) when it carries a real value — the preset wave's rule. */
function isMeaningful(value: unknown): boolean {
  return (typeof value === "string" && value.trim().length > 0) || (typeof value === "boolean" && value) || (typeof value === "number" && value !== 0);
}

/** Read one ST colour key as sRGB, or null when absent/blank/an unreadable form. */
function colorAt(raw: Record<string, unknown>, key: string): SrgbColor | null {
  const value = raw[key];
  return typeof value === "string" ? parseSrgb(value) : null;
}

/** The ST paint stack, flattened: the opaque base surface, then the chat panel composited onto it. Message
 *  tints, the border and the text all sit on the chat panel. A profile missing either key falls back to the
 *  other; a profile missing BOTH gets `null` — there is nothing to composite against, and inventing a
 *  backdrop would silently change every colour, so such a theme is refused with that reason. */
function paintStack(raw: Record<string, unknown>): { readonly surface: SrgbColor; readonly chatSurface: SrgbColor } | null {
  const rawSurface = colorAt(raw, ST_SURFACE);
  const rawChat = colorAt(raw, ST_CHAT_SURFACE);
  if (rawSurface === null) {
    return rawChat === null ? null : { surface: opaque(rawChat), chatSurface: opaque(rawChat) };
  }
  const surface = opaque(rawSurface);
  return { surface, chatSurface: rawChat === null ? surface : compositeOver(rawChat, surface) };
}

/** Composite one ST tint onto `backdrop` and convert it to the OKLCH orb persists + derives from. */
function flatten(tint: SrgbColor | null, backdrop: SrgbColor): Oklch | null {
  return tint === null ? null : toOklch(compositeOver(tint, backdrop));
}

/** The ST keys that produced no orb token AND carried a meaningful value. */
function droppedKeys(raw: Record<string, unknown>): StDroppedField[] {
  return UNMAPPED_REASONS.filter(({ field }) => isMeaningful(raw[field]));
}

/** An AUTHORED text colour is keepable iff it clears AA against the surface it will render on. Both sides
 *  are authored here, so the derivation cannot rescue the pair — the honest answer is to drop the token and
 *  let the base palette's own (derived, provably safe) text colour show through. */
function safeText(text: Oklch | null, backdrop: Oklch, stKey: string, unmapped: StDroppedField[]): Oklch | null {
  if (text === null) {
    return null;
  }
  const ratio = wcagContrastRatio(oklchToSrgb(text), oklchToSrgb(backdrop));
  if (ratio >= AA_NORMAL_RATIO) {
    return text;
  }
  unmapped.push({
    field: stKey,
    reason: `dropped as unsafe — only ${ratio.toFixed(RATIO_PRECISION)}:1 against the surface it renders on in orb (WCAG AA needs ${AA_NORMAL_RATIO}:1); ST painted it over a background image orb does not reproduce`,
  });
  return null;
}

/** The theme's display label: its own `name`, else the file stem. */
function themeLabel(raw: Record<string, unknown>, stem: string): string {
  const named = raw["name"];
  return typeof named === "string" && named.trim().length > 0 ? named.trim() : stem;
}

/** Map an already-JSON-parsed ST theme object → the orb-native theme + its unmapped-key list, or null when it
 *  is not a recognizable theme. "Recognizable" = it yields at least ONE orb token: a JSON object that happens
 *  to live under `themes/` but carries no readable ST colour is reported unreadable, never imported blank. */
export function stThemeFromJson(raw: unknown, stem: string): StThemeParse {
  if (!isPlainObject(raw)) {
    return { ok: false, reason: "not a JSON object" };
  }
  const stack = paintStack(raw);
  if (stack === null) {
    return { ok: false, reason: `no base surface colour (neither \`${ST_SURFACE}\` nor \`${ST_CHAT_SURFACE}\` is a readable colour)` };
  }
  const background = toOklch(stack.surface);
  const unmapped = droppedKeys(raw);
  // Bubbles first: orb's total per-surface solver derives each bubble foreground, so every readable tint is
  // preserved rather than narrowed by an importer-only lightness band.
  const userBubbleBg = flatten(colorAt(raw, ST_USER_BUBBLE), stack.chatSurface);
  const aiBubbleBg = flatten(colorAt(raw, ST_AI_BUBBLE), stack.chatSurface);
  // Then the AUTHORED text colours — the one place ST can hand orb an unsafe pair the derivation cannot fix,
  // because BOTH sides are authored. They are measured against the surface they will actually render on: the
  // AI bubble when one survived, else the base surface (the pairs `palette-contrast.suite.test.ts` asserts
  // for orb's own palettes: `prose-body`/`dialogue`/`narration` on `ai-bubble`).
  const textBackdrop = aiBubbleBg ?? background;
  const bodyColor = safeText(flatten(colorAt(raw, ST_BODY), stack.chatSurface), textBackdrop, ST_BODY, unmapped);
  const narrationColor = safeText(flatten(colorAt(raw, ST_NARRATION), stack.chatSurface), textBackdrop, ST_NARRATION, unmapped);
  const dialogueColor = safeText(flatten(colorAt(raw, ST_DIALOGUE), stack.chatSurface), textBackdrop, ST_DIALOGUE, unmapped);
  // The border carries no text, so it has no AA floor — orb's OWN derived hairline is a 0.14α tint, far under
  // any contrast bar. Gating it would be stricter than the app is on itself.
  const borderColor = flatten(colorAt(raw, ST_BORDER), stack.chatSurface);

  // Absent keys stay ABSENT (never an explicit `undefined`): the CSS custom-property cascade does the merge,
  // so an unmapped token must inherit the base palette rather than persist as an empty slot.
  const override: ThemeOverride = {
    background: oklchLiteral(background),
    ...(bodyColor === null ? {} : { bodyColor: oklchLiteral(bodyColor) }),
    ...(narrationColor === null ? {} : { narrationColor: oklchLiteral(narrationColor) }),
    ...(dialogueColor === null ? {} : { dialogueColor: oklchLiteral(dialogueColor) }),
    ...(userBubbleBg === null ? {} : { userBubble: { bg: oklchLiteral(userBubbleBg) } }),
    ...(aiBubbleBg === null ? {} : { aiBubble: { bg: oklchLiteral(aiBubbleBg) } }),
    ...(borderColor === null ? {} : { borderColor: oklchLiteral(borderColor) }),
  };
  return { ok: true, parsed: { name: stThemeName(themeLabel(raw, stem)), override, unmapped } };
}
