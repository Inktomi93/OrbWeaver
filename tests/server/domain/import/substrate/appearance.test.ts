// biome-ignore-all lint/style/useNamingConvention: ST `power_user` field names (snake_case) appear verbatim
// in these fixtures — they ARE the format.
// Mirror test for domain/import/substrate/appearance — the ST `power_user` → orb `appearance` mapper.
// Pins the two classes a wrong answer inverts silently (ST states two of these as the NEGATIVE of orb's
// field), the two enum re-spellings taken from ST's own `avatar_styles`/`chat_styles` tables, and the
// never-patch-what-ST-did-not-say contract (an absent key must NOT stamp orb's default over a user's choice).

import { describe } from "vitest";
import { stAppearancePatch } from "../../../../../packages/server/src/domain/import/substrate/appearance.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const patchOf = (powerUser: Record<string, unknown>): Record<string, unknown> => stAppearancePatch({ power_user: powerUser });

describe("stAppearancePatch", () => {
  test("no `power_user` section ⇒ patches NOTHING (never stamps defaults over a user's own choices)", () => {
    expect(stAppearancePatch(null)).toEqual({});
    expect(stAppearancePatch({})).toEqual({});
    expect(stAppearancePatch({ power_user: "nope" })).toEqual({});
    // A section present but empty still patches nothing — absence of a key is not a value.
    expect(patchOf({})).toEqual({});
  });

  test("carries the direct booleans and numbers", () => {
    expect(patchOf({ timestamps_enabled: true, timer_enabled: false, font_scale: 1.2, chat_width: 60 })).toEqual({
      showTimestamps: true,
      showGenerationTimer: false,
      fontScale: 1.2,
      chatWidthPct: 60,
    });
  });

  test("INVERTS the two ST keys stated as the negative of orb's field", () => {
    // ST hides avatars / turns shadows OFF; orb shows avatars / turns the effect ON. A missed flip here is
    // invisible in a type check and produces the exact opposite of the user's ST setup.
    expect(patchOf({ hideChatAvatars_enabled: true, noShadows: true })).toEqual({ showInChatAvatars: false, shadowEffects: false });
    expect(patchOf({ hideChatAvatars_enabled: false, noShadows: false })).toEqual({ showInChatAvatars: true, shadowEffects: true });
  });

  test("re-spells ST's `avatar_styles` — and splits RECTANGULAR across orb's two axes", () => {
    // ST: ROUND 0, RECTANGULAR 1, SQUARE 2, ROUNDED 3 (public/scripts/power-user.js). orb splits avatar SHAPE
    // from avatar ASPECT, so ST's tall big-avatar mode needs both fields.
    expect(patchOf({ avatar_style: 0 })).toEqual({ avatarShape: "round" });
    expect(patchOf({ avatar_style: 2 })).toEqual({ avatarShape: "square" });
    expect(patchOf({ avatar_style: 3 })).toEqual({ avatarShape: "rounded" });
    expect(patchOf({ avatar_style: 1 })).toEqual({ avatarShape: "square", avatarAspect: "portrait" });
    // An unknown value patches nothing rather than guessing.
    expect(patchOf({ avatar_style: 9 })).toEqual({});
  });

  test("re-spells ST's `chat_styles`", () => {
    // ST: DEFAULT 0 (flat rows), BUBBLES 1, DOCUMENT 2 — orb's three row skins by the same meaning.
    expect(patchOf({ chat_display: 0 })).toEqual({ chatStyle: "flat" });
    expect(patchOf({ chat_display: 1 })).toEqual({ chatStyle: "bubble" });
    expect(patchOf({ chat_display: 2 })).toEqual({ chatStyle: "document" });
    expect(patchOf({ chat_display: 7 })).toEqual({});
  });

  test("maps the boolean `expand_message_actions` onto orb's two-valued enum", () => {
    expect(patchOf({ expand_message_actions: true })).toEqual({ messageActions: "expanded" });
    expect(patchOf({ expand_message_actions: false })).toEqual({ messageActions: "hover" });
  });

  test("ignores a wrong-typed value rather than writing garbage into the blob", () => {
    expect(patchOf({ timestamps_enabled: "yes", font_scale: "big", chat_width: Number.NaN })).toEqual({});
  });
});
