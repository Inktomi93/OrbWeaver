// Unit: the chatStyle variant table (features/chat/lib/message-row-variants). Pins the ONE-surface,
// eight-appearance dispatch (bubble/flat/document + the 5 §B.2 immersive modes) — the table covers
// EXACTLY the render-side chatStyle vocabulary (so a new member can't ship unpainted), each skin emits
// the role-correct token utilities, and the Phase-4 additions (avatarTreatment/bubbleDecoration/
// bubbleLayout) resolve per each mode's OWN mechanic.
//
// ⚑ A RECORDED RULING WAS PARTIALLY REVERSED HERE, and the fork is stated rather than hidden. This header
// used to read "§B.2's mandate: hide-user-portrait (a `kind !== \"character\"` row never gets bled/banner
// art)", and the tests below pinned it for echo (null decoration) and ripple (icon-left). The 2026-08-18
// skin-parity pass measured the consequence against the owner's own reference renders: ripple's user rows
// rendered as `bubble` and echo's took no decoration at all, so half of every transcript was not in the
// skin the reader chose ("ripple/echo are half-built", #212-4/-5; the references give BOTH roles the card
// and the art, mirrored to the outer edge per role). The new symptom is satisfied for echo + ripple; the
// old mechanism is preserved everywhere it was not measured wrong: hush's stripe stays chrome-for-every-kind,
// and the kind-gating MECHANISM (a decorator that reads `args.kind`) is untouched. Whisper's band now paints
// for both roles (owner ruling, as Moonlit paints both), and identity art paints only where there IS art.

import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { BubbleDecorationArgs } from "#client/features/chat/lib/message-row-variants.ts";
import { MESSAGE_ROW_SKINS } from "#client/features/chat/lib/message-row-variants.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A `bubbleDecoration` argument builder; a case overrides what it asserts. */
function decoArgs(kind: BubbleDecorationArgs["kind"], avatarHash: string | null, extra?: Partial<BubbleDecorationArgs>): BubbleDecorationArgs {
  return { kind, avatarHash, showInChatAvatars: true, ...extra };
}

test("the skin table covers exactly the chatStyle vocabulary", () => {
  expect(Object.keys(MESSAGE_ROW_SKINS).sort()).toEqual(THEME_CHAT_STYLES.toSorted());
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

// #288 — WHERE EACH SKIN PUTS ITS SPEAKER HEADER. The owner raised the split-header read three times on
// 2026-08-19 and its mechanism is one sentence: a row reads as TWO objects whenever the body carries a
// backing and the header carries a DIFFERENT one. That is true of the FILLED skins in every room
// (`--color-ai-bubble` under a header sitting on bare background) AND of the no-fill skins over a
// wallpaper (the body's `BG_PHOTO_READING_PLATE` under the header's own `BG_PHOTO_CHROME_PLATE` chip) —
// which is why the answer is not "the bubble family" but "every skin with a single container box".
// `tide` is the ONE exception on a structural fact, not a taste call: `bubbleLayout: "trains"` renders N
// per-paragraph pills, so there is no single container to be inside, and its ST reference names the
// speaker above the train anyway. The two conditions are asserted TOGETHER so the exception can never
// drift into a preference — a future trains skin gets `outside` for the same stated reason, and a future
// single-container skin cannot quietly opt out.
test("#288 every single-container skin homes its header INSIDE it; only a trains skin stays outside", () => {
  for (const [name, skin] of Object.entries(MESSAGE_ROW_SKINS)) {
    expect(skin.headerPlacement, name).toBe(skin.bubbleLayout === "trains" ? "outside" : "inside");
  }
  // Stated as a count as well, so a table that silently lost a row cannot pass the biconditional above.
  const inside = Object.values(MESSAGE_ROW_SKINS).filter((skin) => skin.headerPlacement === "inside");
  expect(inside).toHaveLength(THEME_CHAT_STYLES.length - 1);
  expect(MESSAGE_ROW_SKINS.tide.headerPlacement).toBe("outside");
});

test("bubble, flat, hush and tide never special-case avatar art (icon-left always); document shows none", () => {
  for (const name of ["bubble", "flat", "hush", "tide"] as const) {
    const skin = MESSAGE_ROW_SKINS[name];
    expect(skin.avatarTreatment("character"), name).toBe("icon-left");
    expect(skin.avatarTreatment("persona"), name).toBe("icon-left");
    expect(skin.avatarTreatment(null), name).toBe("icon-left");
  }
  // Stock SillyTavern's document names nobody and shows no identity art.
  for (const kind of ["character", "persona", null] as const) {
    expect(MESSAGE_ROW_SKINS.document.avatarTreatment(kind)).toBe("none");
  }
});

test("echo/whisper keep the plain icon-left chip (their art is a bubbleDecoration, not an avatarTreatment); ripple welds BOTH roles", () => {
  // Echo/Whisper's bled/banner art is a SEPARATE, independently kind-gated `bubbleDecoration` (below) —
  // the sibling `<Avatar>` chip stays "icon-left" for every mode but Ripple (the file header: Moonlit's
  // own preview screenshots show the chip ALONGSIDE the bubble art, not replaced by it).
  for (const name of ["echo", "whisper"] as const) {
    const skin = MESSAGE_ROW_SKINS[name];
    expect(skin.avatarTreatment("character"), name).toBe("icon-left");
    expect(skin.avatarTreatment("persona"), name).toBe("icon-left");
    expect(skin.avatarTreatment(null), name).toBe("icon-left");
  }
  // Ripple welds the portrait for every IDENTITY (#212-4 — a persona row used to fall back to the chip,
  // i.e. to `bubble`); an unattributed row has no identity to weld and keeps the chip path.
  const ripple = MESSAGE_ROW_SKINS.ripple;
  expect(ripple.avatarTreatment("character")).toBe("sticky-portrait");
  expect(ripple.avatarTreatment("persona")).toBe("sticky-portrait");
  expect(ripple.avatarTreatment(null)).toBe("icon-left");
});

test("echo's art pane sits OUTSIDE the prose measure, as its own tile on the role's side", () => {
  const echo = MESSAGE_ROW_SKINS.echo;
  const painted = echo.bubbleDecoration?.(decoArgs("character", "abababab"));
  // The sharp `portrait` variant (not the raw original) — the reading-surface fix — on the art tile, never
  // as a layer on the bubble's own box.
  expect(painted?.art?.style.backgroundImage).toContain("/api/blob/abababab?v=portrait&w=");
  expect(painted?.style?.backgroundImage).toBeUndefined();
  // THE MEASURE FIX (#212-2): the bubble grows by the art pane's FIXED width, so the prose keeps the
  // band's floor. One skin-owned value caps both the bubble and its containing column.
  expect(painted?.style?.maxWidth).toBeDefined();
  expect(painted?.style?.maxWidth).toBe(echo.columnStyle?.maxWidth);
  expect(painted?.style?.paddingRight).toBe("min(var(--immersive-echo-art-width), 25cqi)");
  expect(painted?.art?.side).toBe("right");
  // The user row mirrors to its own outer edge.
  const own = echo.bubbleDecoration?.(decoArgs("persona", "abababab"));
  expect(own?.style?.paddingLeft).toBe("min(var(--immersive-echo-art-width), 25cqi)");
  expect(own?.style?.paddingRight).toBeUndefined();
  expect(own?.art?.side).toBe("left");
  // An unattributed row still has no identity to paint.
  expect(echo.bubbleDecoration?.(decoArgs(null, "abababab"))).toBeNull();
});

test("the avatars-off reader gets NO identity art in any immersive skin (owner ruling 2026-08-18, #212-6)", () => {
  // One concept, one behaviour: `showInChatAvatars` used to govern the chip in six skins, ripple's whole
  // portrait, and NOTHING at all in echo/whisper — so turning avatars off still left two of eight modes
  // dominated by character art. Chrome that is not art of anybody (hush/whisper's speaker stripe) survives.
  const off = { showInChatAvatars: false } as const;
  expect(MESSAGE_ROW_SKINS.echo.bubbleDecoration?.(decoArgs("character", "abababab", off))).toBeNull();
  const whisperOff = MESSAGE_ROW_SKINS.whisper.bubbleDecoration?.(decoArgs("character", "abababab", off));
  expect(whisperOff?.headerBand).toBeUndefined();
  expect(whisperOff?.style?.borderTopColor).toBe("var(--color-speaker)");
  expect(MESSAGE_ROW_SKINS.hush.bubbleDecoration?.(decoArgs("character", null, off))?.style?.borderLeftColor).toBe("var(--color-speaker)");
});

test("without art, echo paints a clean card and whisper its stripe alone: no letter tiles", () => {
  expect(MESSAGE_ROW_SKINS.echo.bubbleDecoration?.(decoArgs("character", null))).toBeNull();
  expect(MESSAGE_ROW_SKINS.echo.bubbleDecoration?.(decoArgs("persona", null))).toBeNull();
  const whisper = MESSAGE_ROW_SKINS.whisper.bubbleDecoration?.(decoArgs("character", null));
  expect(whisper?.style?.borderTopColor).toBe("var(--color-speaker)");
  expect(whisper?.headerBand).toBeUndefined();
});

test("whisper's stripe always paints (speaker-color chrome); the header band is a real child for both roles", () => {
  const whisper = MESSAGE_ROW_SKINS.whisper;
  for (const kind of ["character", "persona"] as const) {
    const decoration = whisper.bubbleDecoration?.(decoArgs(kind, "x"));
    expect(decoration?.style?.borderTopColor, kind).toBe("var(--color-speaker)");
    // The art lives on the band, a real block child, never a layer on the bubble's own box (the squish fix).
    expect(decoration?.style?.backgroundImage, kind).toBeUndefined();
    expect(decoration?.headerBand?.style.backgroundImage, kind).toContain("/api/blob/x?v=banner&w=");
    // An aspect-ratio box, so its height derives from width and always matches the server's 3:1 crop.
    expect(decoration?.headerBand?.style.aspectRatio, kind).toBe("var(--aspect-banner)");
  }
});

test("owned renderer artwork uses the same geometry and respects identity-art admission", () => {
  const requests: Parameters<NonNullable<BubbleDecorationArgs["imageUrlFor"]>>[] = [];
  const art = "/illustrations/owned-preview.svg";
  const imageUrlFor: NonNullable<BubbleDecorationArgs["imageUrlFor"]> = (...request) => {
    requests.push(request);
    return art;
  };
  const args = decoArgs("character", null, { imageUrlFor });
  const echo = MESSAGE_ROW_SKINS.echo.bubbleDecoration?.(args);
  const whisper = MESSAGE_ROW_SKINS.whisper.bubbleDecoration?.(args);
  expect(echo?.art?.style.backgroundImage).toContain(art);
  expect(echo?.style?.maxWidth).toBe(MESSAGE_ROW_SKINS.echo.columnStyle?.maxWidth);
  expect(echo?.style?.paddingRight).toBe("min(var(--immersive-echo-art-width), 25cqi)");
  expect(whisper?.headerBand?.style.backgroundImage).toContain(art);
  expect(whisper?.headerBand?.style.aspectRatio).toBe("var(--aspect-banner)");
  expect(requests).toEqual([
    ["portrait", 400],
    ["banner", 800],
  ]);
  expect(MESSAGE_ROW_SKINS.echo.bubbleDecoration?.({ ...args, kind: null })).toBeNull();
  expect(MESSAGE_ROW_SKINS.echo.bubbleDecoration?.({ ...args, showInChatAvatars: false })).toBeNull();
  expect(MESSAGE_ROW_SKINS.whisper.bubbleDecoration?.({ ...args, kind: null })?.headerBand).toBeUndefined();
  expect(MESSAGE_ROW_SKINS.whisper.bubbleDecoration?.({ ...args, showInChatAvatars: false })?.headerBand).toBeUndefined();
  expect(requests).toHaveLength(2);
});

test("hush's stripe paints for every kind (chrome, not portrait art — not hide-user-portrait's concern)", () => {
  const hush = MESSAGE_ROW_SKINS.hush;
  for (const kind of ["character", "persona", null] as const) {
    expect(hush.bubbleDecoration?.(decoArgs(kind, null))?.style?.borderLeftColor).toBe("var(--color-speaker)");
  }
});
