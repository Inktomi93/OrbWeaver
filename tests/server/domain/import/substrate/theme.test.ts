// biome-ignore-all lint/style/useNamingConvention: ST theme-file field names (snake_case) appear verbatim in
// these fixtures — they ARE the format.
// Mirror test for domain/import/substrate/theme — the ST theme→orb palette converter.
//
// The load-bearing thing here is the SAFETY GATE (owner ruling: convert "if we can do it safely"). Each of
// its three arms gets a PLANTED POSITIVE CONTROL — a fixture built specifically to trip it — because the real
// ST corpus trips none of them (all five shipped themes are dark and convert cleanly), so a gate proven only
// against the corpus would be a gate that has never been shown to fire.

import { describe } from "vitest";
import type { ParsedStTheme } from "../../../../../packages/server/src/domain/import/contract/views.ts";
import { parseStThemeFile, stThemeFromJson, stThemeName } from "../../../../../packages/server/src/domain/import/substrate/theme.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The real `themes/Azure.json` from the corpus, verbatim (trimmed to the keys that matter here). */
const AZURE = {
  name: "Azure",
  blur_strength: 11,
  main_text_color: "rgba(171, 198, 223, 1)",
  italics_text_color: "rgba(255, 255, 255, 1)",
  underline_text_color: "rgba(188, 231, 207, 1)",
  quote_text_color: "rgba(111, 133, 253, 1)",
  blur_tint_color: "rgba(23, 30, 33, 0.61)",
  chat_tint_color: "rgba(23, 23, 23, 0)",
  user_mes_blur_tint_color: "rgba(0, 28, 174, 0.2)",
  bot_mes_blur_tint_color: "rgba(0, 13, 57, 0.22)",
  shadow_color: "rgba(0, 0, 0, 1)",
  shadow_width: 5,
  border_color: "rgba(0, 0, 0, 0.5)",
  font_scale: 1,
  custom_css: "",
  chat_width: 50,
} as const;

/** A measured contrast ratio inside a refusal reason (`4.31:1`) — the actionable half of "dropped as unsafe". */
const MEASURED_RATIO = /\d+\.\d+:1/u;

/** `parsed` or a thrown assertion — the arrange step for the happy-path cases. */
function converted(raw: unknown, stem = "fixture"): ParsedStTheme {
  const result = stThemeFromJson(raw, stem);
  if (!result.ok) {
    throw new Error(`expected a converted theme, got refusal: ${result.reason}`);
  }
  return result.parsed;
}

/** The refusal REASON, or a thrown assertion when the fixture unexpectedly converted. Keeps every refusal
 *  assertion unconditional (a conditional `expect` can silently assert nothing). */
function refusedBecause(raw: unknown, stem = "fixture"): string {
  const result = stThemeFromJson(raw, stem);
  if (result.ok) {
    throw new Error(`expected a refusal, got the converted theme "${result.parsed.name}"`);
  }
  return result.reason;
}

describe("stThemeName", () => {
  test("QUALIFIES every imported name so an owner's own theme can never be merged over", () => {
    // The settings theme-import op merges on (ownerId, name); ST ships a `Dark Lite` and an `Azure`.
    expect(stThemeName("Dark Lite")).toBe("Dark Lite (SillyTavern)");
  });
});

describe("stThemeFromJson — the mapping", () => {
  test("maps the seven palette keys and nothing else", () => {
    const parsed = converted(AZURE) as { name: string; override: Record<string, unknown> };
    expect(parsed.name).toBe("Azure (SillyTavern)");
    expect(Object.keys(parsed.override).toSorted()).toEqual(
      ["aiBubble", "background", "bodyColor", "borderColor", "dialogueColor", "narrationColor", "userBubble"].toSorted(),
    );
  });

  test("FLATTENS each ST tint onto the surface ST painted it on", () => {
    const parsed = converted(AZURE) as { override: { background: string; userBubble: { bg: string } } };
    // The base surface drops its alpha (ST's backdrop is a photo orb does not reproduce)…
    expect(parsed.override.background).toBe("oklch(0.2293 0.0118 225.71)");
    // …and the 0.2α user tint is composited onto it rather than persisted translucent, which would leave
    // `--color-background` see-through while every derived ramp surface came out opaque.
    expect(parsed.override.userBubble.bg).toBe("oklch(0.2424 0.0623 267.03)");
  });

  test("falls back to `chat_tint_color` when only it is readable", () => {
    const parsed = converted({ name: "Chat only", chat_tint_color: "rgb(20,20,20)", main_text_color: "rgb(240,240,240)" }) as {
      override: { background: string };
    };
    expect(parsed.override.background).toBe("oklch(0.1913 0.0000 0.00)");
  });

  test("reports an ST key that carries a MEANINGFUL value, and stays quiet about defaults", () => {
    const parsed = converted(AZURE) as { unmapped: readonly { field: string }[] };
    const fields = parsed.unmapped.map((u) => u.field);
    // Present with a real value → reported…
    expect(fields).toContain("underline_text_color");
    expect(fields).toContain("shadow_width");
    expect(fields).toContain("font_scale");
    // …but an EMPTY `custom_css` is a default, and listing it would bury the rows that matter.
    expect(fields).not.toContain("custom_css");
    // A key the converter CONSUMES emits no token, so it is reported with that reason rather than silently.
    expect(parsed.unmapped.find((u) => u.field === "chat_tint_color")?.field).toBe("chat_tint_color");
  });

  test("never carries ST custom CSS into the theme's `css` slot", () => {
    // ST CSS targets ST's DOM (#chat/.mes); the reason rides the report instead. Pinned via the reported key.
    const parsed = converted({ ...AZURE, custom_css: "#chat .mes { color: red }" }) as { unmapped: readonly { field: string }[] };
    expect(parsed.unmapped.map((u) => u.field)).toContain("custom_css");
  });
});

describe("stThemeFromJson — the SAFETY GATE (planted positive controls)", () => {
  test("REFUSES a theme whose base surface sits in the derivation's pivot mid-band", () => {
    // PLANTED CONTROL: L≈0.62 is exactly the pivot the derived-foreground flip turns on, so orb would derive
    // a mid-tone foreground and every chrome pairing would be low-contrast. rgb(128,128,128) lands there.
    const reason = refusedBecause({ name: "Mid grey", blur_tint_color: "rgb(128,128,128)", main_text_color: "rgb(255,255,255)" }, "mid");
    expect(reason).toContain("pivot mid-band");
    // NEGATIVE CONTROL: the same fixture one step darker converts — proving the gate discriminates rather
    // than refusing everything.
    expect(stThemeFromJson({ name: "Dark", blur_tint_color: "rgb(30,30,30)", main_text_color: "rgb(255,255,255)" }, "dark").ok).toBe(true);
  });

  test("DROPS an authored text colour that would be illegible on the surface it renders on", () => {
    // PLANTED CONTROL: near-black narration on a near-black bubble — legible in ST only because ST painted it
    // over a light background image. orb cannot rescue it (both sides are authored), so it must not import.
    const parsed = converted({
      name: "Illegible narration",
      blur_tint_color: "rgb(20,20,20)",
      bot_mes_blur_tint_color: "rgb(24,24,24)",
      main_text_color: "rgb(240,240,240)",
      italics_text_color: "rgb(28,28,28)",
    }) as { override: Record<string, unknown>; unmapped: readonly { field: string; reason: string }[] };
    expect(parsed.override["narrationColor"]).toBeUndefined();
    // The legible sibling on the SAME fixture still lands — the drop is per-token, not per-theme.
    expect(parsed.override["bodyColor"]).toBeDefined();
    const note = parsed.unmapped.find((u) => u.field === "italics_text_color");
    expect(note?.reason).toContain("dropped as unsafe");
    // The measured ratio rides the reason so the operator can act on it, not just be told "no".
    expect(note?.reason).toMatch(MEASURED_RATIO);
  });

  test("DROPS a bubble tint whose DERIVED foreground could not clear AA on it", () => {
    // PLANTED CONTROL: a bubble sitting on the pivot — the foreground orb derives for it is mid-tone.
    const parsed = converted({
      name: "Mid bubble",
      blur_tint_color: "rgb(20,20,20)",
      user_mes_blur_tint_color: "rgb(128,128,128)",
      bot_mes_blur_tint_color: "rgb(30,30,30)",
    }) as { override: Record<string, unknown>; unmapped: readonly { field: string; reason: string }[] };
    expect(parsed.override["userBubble"]).toBeUndefined();
    // NEGATIVE CONTROL inside the same fixture: the dark AI bubble survives.
    expect(parsed.override["aiBubble"]).toBeDefined();
    expect(parsed.unmapped.find((u) => u.field === "user_mes_blur_tint_color")?.reason).toContain("dropped as unsafe");
  });
});

describe("stThemeFromJson / parseStThemeFile — refusals carry reasons", () => {
  test("every refusal names WHY, so the report never says just 'skipped'", () => {
    expect(refusedBecause([])).toBe("not a JSON object");
    // A JSON object under `themes/` with no readable colour is not a theme — refused, never imported blank.
    expect(refusedBecause({ name: "Nothing", chat_width: 50 })).toContain("no base surface colour");
    const notJson = parseStThemeFile(new TextEncoder().encode("{ not json"), "x");
    expect(notJson.ok ? "converted" : notJson.reason).toBe("not readable as JSON");
  });

  test("falls back to the file stem when the theme carries no `name`", () => {
    const parsed = converted({ blur_tint_color: "rgb(20,20,20)" }, "My Palette") as { name: string };
    expect(parsed.name).toBe("My Palette (SillyTavern)");
  });
});
