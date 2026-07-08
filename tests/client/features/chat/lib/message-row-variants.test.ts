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

test("echo/whisper/ripple only apply their special avatar treatment to CHARACTER rows (hide-user-portrait)", () => {
  const cases: ReadonlyArray<
    readonly ["echo" | "whisper" | "ripple", "bled" | "banner" | "sticky-portrait"]
  > = [
    ["echo", "bled"],
    ["whisper", "banner"],
    ["ripple", "sticky-portrait"],
  ];
  for (const [name, treatment] of cases) {
    const skin = MESSAGE_ROW_SKINS[name];
    expect(skin.avatarTreatment("character"), name).toBe(treatment);
    expect(skin.avatarTreatment("persona"), name).toBe("icon-left");
    expect(skin.avatarTreatment(null), name).toBe("icon-left");
  }
});

test("echo's bled decoration paints the character's art and never the viewer's own", () => {
  const echo = MESSAGE_ROW_SKINS.echo;
  const painted = echo.bubbleDecoration?.({ kind: "character", avatarUrl: "/api/blob/deadbeef" });
  expect(painted?.style?.backgroundImage).toContain("deadbeef");
  expect(echo.bubbleDecoration?.({ kind: "persona", avatarUrl: "/api/blob/deadbeef" })).toBeNull();
  expect(echo.bubbleDecoration?.({ kind: "character", avatarUrl: null })).toBeNull();
});

test("whisper's stripe always paints (speaker-color chrome), the banner art only for a character", () => {
  const whisper = MESSAGE_ROW_SKINS.whisper;
  const userDecoration = whisper.bubbleDecoration?.({ kind: "persona", avatarUrl: "/api/blob/x" });
  expect(userDecoration?.style?.borderTopColor).toBe("var(--color-speaker)");
  expect(userDecoration?.style?.backgroundImage).toBeUndefined();
  const characterDecoration = whisper.bubbleDecoration?.({
    kind: "character",
    avatarUrl: "/api/blob/x",
  });
  expect(characterDecoration?.style?.backgroundImage).toContain("/api/blob/x");
  expect(characterDecoration?.style?.borderTopColor).toBe("var(--color-speaker)");
});

test("hush's stripe paints for every kind (chrome, not portrait art — not hide-user-portrait's concern)", () => {
  const hush = MESSAGE_ROW_SKINS.hush;
  for (const kind of ["character", "persona", null] as const) {
    expect(hush.bubbleDecoration?.({ kind, avatarUrl: null })?.style?.borderLeftColor).toBe(
      "var(--color-speaker)",
    );
  }
});
