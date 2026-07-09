// Unit: the chatStyle variant table (features/chat/lib/message-row-variants). Pins the ONE-surface,
// eight-appearance dispatch (bubble/flat/document + the 5 §B.2 immersive modes) — the table covers
// EXACTLY the render-side chatStyle vocabulary (so a new member can't ship unpainted), each skin emits
// the role-correct token utilities, and the Phase-4 additions (avatarTreatment/bubbleDecoration/
// bubbleLayout) resolve per §B.2's mandate: hide-user-portrait (a `kind !== "character"` row never gets
// bled/banner art) and each mode's OWN mechanic.

import { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import { MESSAGE_ROW_SKINS } from "../../../../../packages/client/src/features/chat/lib/message-row-variants";
import { expect, test } from "../../../../support/fixtures";

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
  const painted = echo.bubbleDecoration?.({ kind: "character", avatarHash: "abababab" });
  // The sharp `portrait` variant (not the raw original) — the reading-surface fix.
  expect(painted?.style?.backgroundImage).toContain("/api/blob/abababab?v=portrait&w=");
  // Text is padded clear of the art zone with the SAME token that drives the fade — one number, not two.
  expect(painted?.style?.paddingRight).toBe("var(--immersive-echo-feather)");
  expect(echo.bubbleDecoration?.({ kind: "persona", avatarHash: "abababab" })).toBeNull();
  expect(echo.bubbleDecoration?.({ kind: "character", avatarHash: null })).toBeNull();
});

test("whisper's stripe always paints (speaker-color chrome); the header band is a real child, only for a character", () => {
  const whisper = MESSAGE_ROW_SKINS.whisper;
  const userDecoration = whisper.bubbleDecoration?.({ kind: "persona", avatarHash: "x" });
  expect(userDecoration?.style?.borderTopColor).toBe("var(--color-speaker)");
  expect(userDecoration?.headerBand).toBeUndefined();
  const characterDecoration = whisper.bubbleDecoration?.({ kind: "character", avatarHash: "x" });
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
  expect(
    whisper.bubbleDecoration?.({ kind: "character", avatarHash: null })?.headerBand,
  ).toBeUndefined();
});

test("hush's stripe paints for every kind (chrome, not portrait art — not hide-user-portrait's concern)", () => {
  const hush = MESSAGE_ROW_SKINS.hush;
  for (const kind of ["character", "persona", null] as const) {
    expect(hush.bubbleDecoration?.({ kind, avatarHash: null })?.style?.borderLeftColor).toBe(
      "var(--color-speaker)",
    );
  }
});
