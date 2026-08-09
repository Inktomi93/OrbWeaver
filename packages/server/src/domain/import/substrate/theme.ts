// domain/import/substrate/theme — the ST THEME-FILE parser: one `themes/<name>.json` in → an orb `ThemeOverride`
// out, plus the honest per-file list of the ST keys that found no orb seat. Pure: bytes in, data out, null on
// unparseable — never throws, so one bad theme is one skipped theme and never an aborted profile import.
//
// THE MAPPING IS SEVEN KEYS, AND THAT IS THE WHOLE PALETTE. ST's theme file (`getThemeObject` in ST's
// `public/scripts/power-user.js` — 45 keys) is a PALETTE plus a pile of viewer ERGONOMICS toggles. orb splits
// those two deliberately (D63/D71 + the card-embeddable partition): a THEME carries colour/atmosphere, the
// VIEWER's own `appearance` settings carry size/density/what-is-shown. So the ergonomics keys are not "lossy"
// here, they are HOMED ELSEWHERE — and the ACTIVE values of most of them DO import, out of `settings.json`'s
// `power_user` section (see `substrate/appearance.ts`). Each reported reason says which.
//
// The seven that map, with ST's own CSS-variable names as the semantic receipt:
//   main_text_color            (--SmartThemeBodyColor)          → bodyColor
//   italics_text_color         (--SmartThemeEmColor)            → narrationColor   (ST italicises narration/action)
//   quote_text_color           (--SmartThemeQuoteColor)         → dialogueColor    (orb's `colorQuotedSpeech` is
//                                                                 documented ST parity for exactly this pairing)
//   blur_tint_color            (--SmartThemeBlurTintColor)      → background       (the base surface)
//   user_mes_blur_tint_color   (--SmartThemeUserMesBlurTintColor)→ userBubble.bg
//   bot_mes_blur_tint_color    (--SmartThemeBotMesBlurTintColor) → aiBubble.bg
//   border_color               (--SmartThemeBorderColor)        → borderColor      (the schema's own "(ST parity)")
// `chat_tint_color` is CONSUMED but emits no token — it is the surface ST paints the message tints onto, so it
// is the compositing backdrop (see `substrate/color.ts` for why every tint is flattened).
//
// THE CONVERSION GOES THROUGH ORB'S OWN DERIVATION, AND CAN REFUSE (owner ruling: "if we can do it safely").
// orb never lets a foreground be PICKED — `@orb/ui` `content/theme-scope/clamp.ts` DERIVES one off the base
// surface (and off each bubble tint) through a steep pivot flip, and the whole neutral chrome ramp follows.
// So a converted palette is only as good as what that derivation produces from it, and this parser PREDICTS
// it in node through the shared `@orb/kit/theme-derivation` constants — the SAME numbers the clamp spells
// into CSS, now one-homed below both packages precisely so this file can ask the question. Three gates:
//   • the BASE surface must be derivable — outside the pivot mid-band, where the flip yields a mid-tone
//     foreground and every chrome pairing is inherently low-contrast. Not derivable ⇒ the whole theme is
//     REFUSED with that reason (never imported into an illegible app).
//   • each BUBBLE tint is kept only if the foreground orb derives for it clears WCAG AA on it.
//   • each AUTHORED TEXT colour is kept only if IT clears AA against the surface it will actually render on
//     — the one place ST can hand orb an unsafe pair the derivation cannot fix, because ST painted that text
//     over a background PHOTO orb does not reproduce.
// A dropped colour is reported with its MEASURED ratio and the base palette's own (provably safe) value shows
// through. Nothing is ever forced through raw.
//
// NAMES ARE QUALIFIED (`Azure (SillyTavern)`) for the same reason preset names are: the theme import op is
// idempotent on (ownerId, name) and MERGES a same-named theme IN PLACE. ST ships themes called `Dark Lite` and
// `Azure`; an unqualified import could silently overwrite an owner's own theme of that name. Seed palettes are
// `ownerId IS NULL` and unreachable by that write either way, so an orb default can never be clobbered.

import type { StDroppedField } from "@orb/contracts/preset";
import type { ThemeOverride } from "@orb/contracts/theme";
import { isPlainObject } from "@orb/kit/guards";
import type { Oklch } from "@orb/kit/theme-derivation";
import { AA_NORMAL_RATIO, derivedForeground, isDerivableBaseSurface, oklchToSrgb, wcagContrastRatio } from "@orb/kit/theme-derivation";
import type { SrgbColor, StThemeParse } from "../contract/views.ts";
import { compositeOver, oklchLiteral, opaque, parseSrgb, toOklch } from "./color.ts";

/** Ratio decimals in a refusal reason — enough to act on, not enough to read as false precision. */
const RATIO_PRECISION = 2;

/** The ST profile SUBDIRECTORY holding saved UI themes. */
export const ST_THEME_DIR = "themes";
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

/** A bubble tint is keepable iff the foreground orb WOULD derive for it clears AA on it. An unsafe one is
 *  dropped WITH its measured ratio — never forced through as a raw value the app then can't read. */
function safeBubble(bubble: Oklch | null, stKey: string, unmapped: StDroppedField[]): Oklch | null {
  if (bubble === null) {
    return null;
  }
  const ratio = wcagContrastRatio(oklchToSrgb(derivedForeground(bubble)), oklchToSrgb(bubble));
  if (ratio >= AA_NORMAL_RATIO) {
    return bubble;
  }
  unmapped.push({
    field: stKey,
    reason: `dropped as unsafe — the message text orb derives for this tint reaches only ${ratio.toFixed(RATIO_PRECISION)}:1 against it (WCAG AA needs ${AA_NORMAL_RATIO}:1)`,
  });
  return null;
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
  // THE SAFETY GATE (owner ruling: convert only if we can do it SAFELY). orb never lets a foreground be
  // PICKED — it DERIVES one off the base surface, and every neutral chrome pairing follows from that. The
  // derivation is a step flip through `fgPivotL`, so a base sitting in the pivot's mid-band derives a
  // mid-tone foreground and the whole palette is inherently low-contrast (the documented limitation in
  // `tests/ui/content/theme-scope/palette-contrast.suite.test.ts`). No hand-authored orb palette lands
  // there; a FOREIGN one can. Such a theme is refused rather than imported into an illegible app.
  if (!isDerivableBaseSurface(background)) {
    return {
      ok: false,
      reason: `its base surface (${oklchLiteral(background)}) sits in the theme derivation's pivot mid-band, where orb cannot derive a foreground that clears WCAG AA on the surface ramp`,
    };
  }

  const unmapped = droppedKeys(raw);
  // Bubbles first: orb DERIVES each bubble's foreground, so a bubble is safe iff that derived pair clears AA.
  const userBubbleBg = safeBubble(flatten(colorAt(raw, ST_USER_BUBBLE), stack.chatSurface), ST_USER_BUBBLE, unmapped);
  const aiBubbleBg = safeBubble(flatten(colorAt(raw, ST_AI_BUBBLE), stack.chatSurface), ST_AI_BUBBLE, unmapped);
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

/** Parse one `themes/<stem>.json`. Every refusal carries its reason — the report never says "skipped". */
export function parseStThemeFile(bytes: Uint8Array, stem: string): StThemeParse {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  } catch {
    return { ok: false, reason: "not readable as JSON" };
  }
  return stThemeFromJson(raw, stem);
}
