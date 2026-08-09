// domain/import/substrate/appearance — the ST `settings.json` → `power_user` → orb `appearance` mapper.
// Pure: an already-JSON-parsed settings blob in, a partial `appearance` patch out. Never throws.
//
// WHY THIS EXISTS BESIDE THE THEME PARSER. ST puts a theme's PALETTE and the viewer's ERGONOMICS in the same
// file; orb splits them (D63/D71 + the card-embeddable partition) — colour goes on a theme, size/density/
// what-is-shown goes on the VIEWER's `appearance` namespace. `themes/*.json` therefore imports the palette
// (substrate/theme.ts) and the ACTIVE ergonomics import from here, because `power_user` is the only place the
// SELECTED values live (a theme file is one of five saved palettes; `power_user` is what ST was rendering).
//
// FOURTEEN KEYS, EACH WITH AN EXACT ORB SEAT — nothing is invented. A `power_user` key with no orb field is
// NOT patched and is classified in `docs/design/st-import-plane-classification.md` (all 135 observed keys,
// with the reason each does or does not travel). Two are INVERTED (ST states the negative), two are enum
// re-spellings, and one ST value (RECTANGULAR avatars) needs two orb fields because orb splits avatar SHAPE
// from avatar ASPECT.
//
// Values are NOT range-clamped here: every `appearance` field is lenient (`.catch(default)`), so an ST value
// orb has no room for heals to orb's default on read instead of rendering something broken.

import { isPlainObject } from "@orb/kit/guards";

/** The `settings.json` section holding ST's live UI/behaviour preferences. */
export const ST_POWER_USER_KEY = "power_user";

// ST `avatar_styles` (ST `public/scripts/power-user.js`): ROUND 0, RECTANGULAR 1, SQUARE 2, ROUNDED 3.
const ST_AVATAR_ROUND = 0;
const ST_AVATAR_RECTANGULAR = 1;
const ST_AVATAR_SQUARE = 2;
const ST_AVATAR_ROUNDED = 3;
// ST `chat_styles`: DEFAULT 0 (flat rows), BUBBLES 1, DOCUMENT 2 — orb's `flat`/`bubble`/`document` exactly.
const ST_CHAT_DEFAULT = 0;
const ST_CHAT_BUBBLES = 1;
const ST_CHAT_DOCUMENT = 2;

/** One directly-carried boolean: the ST key and the orb `appearance` field it IS. */
const BOOLEAN_SEATS: ReadonlyArray<readonly [stKey: string, orbKey: string]> = [
  ["timestamps_enabled", "showTimestamps"],
  ["timer_enabled", "showGenerationTimer"],
  ["message_token_count_enabled", "showTokenCount"],
  ["mesIDDisplay_enabled", "showMessageId"],
  ["timestamp_model_icon", "showModelIcon"],
  ["reduced_motion", "reducedMotion"],
  ["auto_fix_generated_markdown", "autoFixMarkdown"],
];

/** ST states these as the NEGATIVE of the orb field, so the value flips. */
const INVERTED_BOOLEAN_SEATS: ReadonlyArray<readonly [stKey: string, orbKey: string]> = [
  // ST hides avatars; orb shows them.
  ["hideChatAvatars_enabled", "showInChatAvatars"],
  // ST turns shadows OFF; orb turns the effect ON.
  ["noShadows", "shadowEffects"],
];

/** One directly-carried number: the ST key and the orb `appearance` field it IS. */
const NUMBER_SEATS: ReadonlyArray<readonly [stKey: string, orbKey: string]> = [
  ["font_scale", "fontScale"],
  ["chat_width", "chatWidthPct"],
];

function putBooleans(pu: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [stKey, orbKey] of BOOLEAN_SEATS) {
    if (typeof pu[stKey] === "boolean") {
      patch[orbKey] = pu[stKey];
    }
  }
  for (const [stKey, orbKey] of INVERTED_BOOLEAN_SEATS) {
    const value = pu[stKey];
    if (typeof value === "boolean") {
      patch[orbKey] = !value;
    }
  }
}

function putNumbers(pu: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [stKey, orbKey] of NUMBER_SEATS) {
    const value = pu[stKey];
    if (typeof value === "number" && Number.isFinite(value)) {
      patch[orbKey] = value;
    }
  }
}

/** ST `avatar_style` → orb's TWO axes. RECTANGULAR is ST's tall big-avatar mode, which orb expresses as a
 *  square-cornered avatar on the PORTRAIT aspect — the only ST value that needs both fields. */
function putAvatarStyle(pu: Record<string, unknown>, patch: Record<string, unknown>): void {
  switch (pu["avatar_style"]) {
    case ST_AVATAR_ROUND:
      patch["avatarShape"] = "round";
      break;
    case ST_AVATAR_SQUARE:
      patch["avatarShape"] = "square";
      break;
    case ST_AVATAR_ROUNDED:
      patch["avatarShape"] = "rounded";
      break;
    case ST_AVATAR_RECTANGULAR:
      patch["avatarShape"] = "square";
      patch["avatarAspect"] = "portrait";
      break;
    default:
      break;
  }
}

/** ST `chat_display` → orb `appearance.chatStyle`. The three ST modes are three orb row skins by the same name. */
function putChatStyle(pu: Record<string, unknown>, patch: Record<string, unknown>): void {
  switch (pu["chat_display"]) {
    case ST_CHAT_DEFAULT:
      patch["chatStyle"] = "flat";
      break;
    case ST_CHAT_BUBBLES:
      patch["chatStyle"] = "bubble";
      break;
    case ST_CHAT_DOCUMENT:
      patch["chatStyle"] = "document";
      break;
    default:
      break;
  }
}

/** ST `expand_message_actions` → orb `appearance.messageActions` (`expanded` vs the default `hover`). */
function putMessageActions(pu: Record<string, unknown>, patch: Record<string, unknown>): void {
  const value = pu["expand_message_actions"];
  if (typeof value === "boolean") {
    patch["messageActions"] = value ? "expanded" : "hover";
  }
}

/**
 * The orb `appearance` patch an ST profile's `power_user` section carries. `{}` when the section is absent or
 * is not an object — a profile with no ST preferences patches nothing rather than stamping orb's defaults over
 * whatever the user already chose.
 */
export function stAppearancePatch(settingsRaw: unknown): Record<string, unknown> {
  if (!isPlainObject(settingsRaw)) {
    return {};
  }
  const pu = settingsRaw[ST_POWER_USER_KEY];
  if (!isPlainObject(pu)) {
    return {};
  }
  const patch: Record<string, unknown> = {};
  putBooleans(pu, patch);
  putNumbers(pu, patch);
  putAvatarStyle(pu, patch);
  putChatStyle(pu, patch);
  putMessageActions(pu, patch);
  return patch;
}
