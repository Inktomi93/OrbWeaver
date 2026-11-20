// The ST `settings.json` → `power_user` ⇄ orb `appearance` mapper, both directions over one seat table. Pure: an
// already-JSON-parsed settings blob in, a partial `appearance` patch out, and back. Never throws.
//
// WHY THIS EXISTS BESIDE THE THEME PARSER. ST puts a theme's PALETTE and the viewer's ERGONOMICS in the same
// file; orb splits them (D63/D71 + the card-embeddable partition) — colour goes on a theme, size/density/
// what-is-shown goes on the VIEWER's `appearance` namespace. `themes/*.json` therefore imports the palette
// (substrate/theme.ts) and the ACTIVE ergonomics import from here, because `power_user` is the only place the
// SELECTED values live (a theme file is one of five saved palettes; `power_user` is what ST was rendering).
//
// EACH KEY HAS AN EXACT ORB SEAT — nothing is invented. A `power_user` key with no orb field is
// NOT patched.
// One is INVERTED (ST states the negative), three are enum
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
  ["auto_fix_generated_markdown", "autoFixMarkdown"],
];

/** ST states these as the NEGATIVE of the orb field, so the value flips. */
const INVERTED_BOOLEAN_SEATS: ReadonlyArray<readonly [stKey: string, orbKey: string]> = [
  // ST hides avatars; orb shows them.
  ["hideChatAvatars_enabled", "showInChatAvatars"],
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

// Each ST enum value with the orb fields it IS; the reads below and the write in {@link stPowerUserOf} share them.
// RECTANGULAR is ST's tall big-avatar mode, which orb expresses as a square-cornered avatar on the PORTRAIT aspect.
const AVATAR_STYLE_SEATS: ReadonlyArray<readonly [stValue: number, seat: Readonly<Record<string, string>>]> = [
  [ST_AVATAR_RECTANGULAR, { avatarShape: "square", avatarAspect: "portrait" }],
  [ST_AVATAR_ROUND, { avatarShape: "round" }],
  [ST_AVATAR_SQUARE, { avatarShape: "square" }],
  [ST_AVATAR_ROUNDED, { avatarShape: "rounded" }],
];

/** One ST enum key, its values with the orb value each IS, and the orb field it seats. ST's `chat_display` modes are
 *  three orb row skins by the same name; ST's `reduced_motion: false` defers to the device, which orb calls `system`. */
const ENUM_SEATS: ReadonlyArray<readonly [stKey: string, orbKey: string, values: ReadonlyArray<readonly [stValue: unknown, orbValue: string]>]> = [
  [
    "chat_display",
    "chatStyle",
    [
      [ST_CHAT_DEFAULT, "flat"],
      [ST_CHAT_BUBBLES, "bubble"],
      [ST_CHAT_DOCUMENT, "document"],
    ],
  ],
  [
    "expand_message_actions",
    "messageActions",
    [
      [true, "expanded"],
      [false, "hover"],
    ],
  ],
  [
    "reduced_motion",
    "reducedMotion",
    [
      [true, "on"],
      [false, "system"],
    ],
  ],
];

const AVATAR_KEY = "avatar_style";

function putEnums(pu: Record<string, unknown>, patch: Record<string, unknown>): void {
  const avatar = AVATAR_STYLE_SEATS.find(([stValue]) => stValue === pu[AVATAR_KEY]);
  for (const [key, value] of Object.entries(avatar?.[1] ?? {})) {
    patch[key] = value;
  }
  for (const [stKey, orbKey, values] of ENUM_SEATS) {
    const seat = values.find(([stValue]) => stValue === pu[stKey]);
    if (seat !== undefined) {
      patch[orbKey] = seat[1];
    }
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
  putEnums(pu, patch);
  return patch;
}

/**
 * The ST `power_user` keys an orb `appearance` namespace carries, the inverse of {@link stAppearancePatch}: each
 * returned key reads back to the orb value it came from. `carried` names the orb fields that found a key, so the
 * caller can name the rest.
 */
export function stPowerUserOf(appearance: Readonly<Record<string, unknown>>): {
  readonly powerUser: Record<string, unknown>;
  readonly carried: ReadonlySet<string>;
} {
  const powerUser: Record<string, unknown> = {};
  const carried = new Set<string>();
  const seat = (stKey: string, orbKeys: readonly string[], value: unknown): void => {
    powerUser[stKey] = value;
    for (const key of orbKeys) {
      carried.add(key);
    }
  };
  for (const [stKey, orbKey] of BOOLEAN_SEATS) {
    if (typeof appearance[orbKey] === "boolean") {
      seat(stKey, [orbKey], appearance[orbKey]);
    }
  }
  for (const [stKey, orbKey] of INVERTED_BOOLEAN_SEATS) {
    if (typeof appearance[orbKey] === "boolean") {
      seat(stKey, [orbKey], !appearance[orbKey]);
    }
  }
  for (const [stKey, orbKey] of NUMBER_SEATS) {
    if (typeof appearance[orbKey] === "number") {
      seat(stKey, [orbKey], appearance[orbKey]);
    }
  }
  // The first seat whose every field matches: RECTANGULAR is listed first, so a portrait square avatar finds it.
  const avatar = AVATAR_STYLE_SEATS.find(([, fields]) => Object.entries(fields).every(([key, value]) => appearance[key] === value));
  if (avatar !== undefined) {
    seat(AVATAR_KEY, Object.keys(avatar[1]), avatar[0]);
  }
  for (const [stKey, orbKey, values] of ENUM_SEATS) {
    const value = values.find(([, orbValue]) => orbValue === appearance[orbKey]);
    if (value !== undefined) {
      seat(stKey, [orbKey], value[0]);
    }
  }
  return { powerUser, carried };
}
