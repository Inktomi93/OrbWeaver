// Unit: the chatStyle variant table (features/chat/lib/message-row-variants). Pins the ONE-surface,
// eight-appearance dispatch (bubble/flat/document + the 5 §B.2 immersive modes) — the table covers
// EXACTLY the render-side chatStyle vocabulary (so a new member can't ship unpainted), each skin emits
// the role-correct token utilities, and the Phase-4 additions (avatarTreatment/bubbleDecoration/
// bubbleLayout) resolve per §B.2's mandate: hide-user-portrait (a `kind !== "character"` row never gets
// bled/banner art) and each mode's OWN mechanic.

import type { BubbleDecorationArgs } from "../../../../../packages/client/src/features/chat/lib/message-row-variants";
import { MESSAGE_ROW_SKINS } from "../../../../../packages/client/src/features/chat/lib/message-row-variants";
import { THEME_SCOPE_CHAT_STYLES } from "../../../../../packages/ui/src/content/theme-scope/clamp";
// Deep imports, NOT the @orb/ui barrels: this is a NODE-lane test, and a barrel import drags browser
// TSX + #lib (which re-exports portal-container's ShadowRoot) into the dom-less typecheck:graph program.
import { avatarFallbackHueVar } from "../../../../../packages/ui/src/primitives/avatar/hue";
import { expect, test } from "../../../../support/fixtures";

/** A `bubbleDecoration` argument builder — the two no-image FALLBACK fields (`hueSeed`/`initial`, the
 *  owner-ruled first-class tile inputs) default to fixed test values; a case overrides what it asserts. */
function decoArgs(
  kind: BubbleDecorationArgs["kind"],
  avatarHash: string | null,
  extra?: Partial<BubbleDecorationArgs>,
): BubbleDecorationArgs {
  return { kind, avatarHash, hueSeed: "char_alice", initial: "AL", ...extra };
}

test("the skin table covers exactly the chatStyle vocabulary", () => {
  expect(Object.keys(MESSAGE_ROW_SKINS).sort()).toEqual([...THEME_SCOPE_CHAT_STYLES].sort());
});

test("bubble skin paints role-specific bubble tokens + alignment", () => {
  const bubble = MESSAGE_ROW_SKINS.bubble;
  expect(bubble.inner("user")).toContain("bg-user-bubble");
  expect(bubble.inner("assistant")).toContain("bg-ai-bubble");
  expect(bubble.inner("system")).toContain("bg-system-bubble");
  expect(bubble.outer("user")).toContain("items-end");
  expect(bubble.outer("assistant")).toContain("items-start");
});

test("document skin uses the prose-body treatment, not bubbles", () => {
  const doc = MESSAGE_ROW_SKINS.document;
  expect(doc.inner("assistant")).toContain("text-prose-body");
  expect(doc.inner("assistant")).not.toContain("bg-ai-bubble");
});

test("every mode but tide renders a single bubble; tide trains", () => {
  for (const [name, skin] of Object.entries(MESSAGE_ROW_SKINS)) {
    expect(skin.bubbleLayout, name).toBe(name === "tide" ? "trains" : "single");
  }
});

test("the 3 clean modes + hush/tide never special-case avatar art (icon-left always)", () => {
  for (const name of ["bubble", "flat", "document", "hush", "tide"] as const) {
    const skin = MESSAGE_ROW_SKINS[name];
    expect(skin.avatarTreatment("character"), name).toBe("icon-left");
    expect(skin.avatarTreatment("persona"), name).toBe("icon-left");
    expect(skin.avatarTreatment(null), name).toBe("icon-left");
  }
});

test("echo/whisper keep the plain icon-left chip (their art is a bubbleDecoration, not an avatarTreatment); ripple welds", () => {
  // Echo/Whisper's bled/banner art is a SEPARATE, independently kind-gated `bubbleDecoration` (below) —
  // the sibling `<Avatar>` chip stays "icon-left" for every mode but Ripple (the file header: Moonlit's
  // own preview screenshots show the chip ALONGSIDE the bubble art, not replaced by it).
  for (const name of ["echo", "whisper"] as const) {
    const skin = MESSAGE_ROW_SKINS[name];
    expect(skin.avatarTreatment("character"), name).toBe("icon-left");
    expect(skin.avatarTreatment("persona"), name).toBe("icon-left");
    expect(skin.avatarTreatment(null), name).toBe("icon-left");
  }
  const ripple = MESSAGE_ROW_SKINS.ripple;
  expect(ripple.avatarTreatment("character")).toBe("sticky-portrait");
  expect(ripple.avatarTreatment("persona")).toBe("icon-left");
  expect(ripple.avatarTreatment(null)).toBe("icon-left");
});

test("echo's bled decoration requests the sharp-cropped 2:3 portrait, pads text clear of it, and never paints the viewer's own", () => {
  const echo = MESSAGE_ROW_SKINS.echo;
  const painted = echo.bubbleDecoration?.(decoArgs("character", "abababab"));
  // The sharp `portrait` variant (not the raw original) — the reading-surface fix.
  expect(painted?.style?.backgroundImage).toContain("/api/blob/abababab?v=portrait&w=");
  // Text is padded clear of the art zone with the SAME token that drives the fade — one number, not two.
  expect(painted?.style?.paddingRight).toBe("var(--immersive-echo-feather)");
  // The with-image path carries NO fallback tile.
  expect(painted?.edgeTile).toBeUndefined();
  // Hide-user-portrait: a persona (the viewer's own) row never bleeds art, imaged or not.
  expect(echo.bubbleDecoration?.(decoArgs("persona", "abababab"))).toBeNull();
});

test("echo's no-image character row paints the first-class FALLBACK tile (owner ruling 2026-07-09), not nothing", () => {
  const echo = MESSAGE_ROW_SKINS.echo;
  const fallback = echo.bubbleDecoration?.(decoArgs("character", null, { hueSeed: "char_alice" }));
  // The tile IS the art source now — the mode no longer degrades to a plain bubble for an imageless
  // character. Reading geometry is IDENTICAL to the with-image case (same padding-right token).
  expect(fallback).not.toBeNull();
  expect(fallback?.style?.paddingRight).toBe("var(--immersive-echo-feather)");
  expect(fallback?.edgeTile?.initial).toBe("AL");
  // The tile field is the entity's DETERMINISTIC hue (seeded off the id, matching the chip everywhere).
  expect(fallback?.edgeTile?.style.backgroundColor).toBe(avatarFallbackHueVar("char_alice"));
  // No portrait <img> in the tile fallback — it's a flat hue field feathered into the bubble.
  expect(fallback?.edgeTile?.style.backgroundImage).not.toContain("?v=portrait");
});

test("whisper's stripe always paints (speaker-color chrome); the header band is a real child, only for a character", () => {
  const whisper = MESSAGE_ROW_SKINS.whisper;
  const userDecoration = whisper.bubbleDecoration?.(decoArgs("persona", "x"));
  expect(userDecoration?.style?.borderTopColor).toBe("var(--color-speaker)");
  expect(userDecoration?.headerBand).toBeUndefined();
  const characterDecoration = whisper.bubbleDecoration?.(decoArgs("character", "x"));
  expect(characterDecoration?.style?.borderTopColor).toBe("var(--color-speaker)");
  // No background-image on the bubble's OWN style — the art lives on the headerBand's style instead (a
  // real block child, never a layer on the bubble's own message-length-dependent box — the squish fix).
  expect(characterDecoration?.style?.backgroundImage).toBeUndefined();
  expect(characterDecoration?.headerBand?.style.backgroundImage).toContain(
    "/api/blob/x?v=banner&w=",
  );
  // A fixed height drifted the box aspect off 3:1 as the fluid bubble width changed — the band is now
  // an aspect-ratio box so its height derives from width and always matches the server's 3:1 crop.
  expect(characterDecoration?.headerBand?.style.aspectRatio).toBe("var(--aspect-banner)");
  // An IMAGED band carries no initial — the banner IS the art.
  expect(characterDecoration?.headerBand?.initial).toBeUndefined();
});

test("whisper's no-image character band is the first-class FALLBACK tile (hue field + initial), not a bare stripe", () => {
  const whisper = MESSAGE_ROW_SKINS.whisper;
  const fallback = whisper.bubbleDecoration?.(
    decoArgs("character", null, { hueSeed: "char_alice" }),
  );
  // The stripe still paints AND a band now renders (the mode no longer collapses to a bare stripe for an
  // imageless character) — at the SAME 3:1 geometry as the imaged band.
  expect(fallback?.style?.borderTopColor).toBe("var(--color-speaker)");
  expect(fallback?.headerBand?.style.aspectRatio).toBe("var(--aspect-banner)");
  expect(fallback?.headerBand?.initial).toBe("AL");
  expect(fallback?.headerBand?.style.backgroundColor).toBe(avatarFallbackHueVar("char_alice"));
  // A hue FIELD, never a banner <img>.
  expect(fallback?.headerBand?.style.backgroundImage).not.toContain("?v=banner");
});

test("hush's stripe paints for every kind (chrome, not portrait art — not hide-user-portrait's concern)", () => {
  const hush = MESSAGE_ROW_SKINS.hush;
  for (const kind of ["character", "persona", null] as const) {
    expect(hush.bubbleDecoration?.(decoArgs(kind, null))?.style?.borderLeftColor).toBe(
      "var(--color-speaker)",
    );
  }
});
