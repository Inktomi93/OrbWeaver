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
// old mechanism is preserved everywhere it was not measured wrong — WHISPER's band stays character-only
// (its user row was at parity), hush's stripe stays chrome-for-every-kind, and the kind-gating MECHANISM
// (a decorator that reads `args.kind`) is untouched: only the answers for two skins changed.

import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { BubbleDecorationArgs } from "../../../../../packages/client/src/features/chat/lib/message-row-variants.ts";
import { MESSAGE_ROW_SKINS } from "../../../../../packages/client/src/features/chat/lib/message-row-variants.ts";
// Deep imports, NOT the @orb/ui barrels: this is a NODE-lane test, and a barrel import drags browser
// TSX + #lib (which re-exports portal-container's ShadowRoot) into the dom-less typecheck:graph program.
import { avatarFallbackHueColor } from "../../../../../packages/ui/src/primitives/avatar/hue.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A `bubbleDecoration` argument builder — the two no-image FALLBACK fields (`hueSeed`/`initial`, the
 *  owner-ruled first-class tile inputs) default to fixed test values; a case overrides what it asserts. */
function decoArgs(kind: BubbleDecorationArgs["kind"], avatarHash: string | null, extra?: Partial<BubbleDecorationArgs>): BubbleDecorationArgs {
  return { kind, avatarHash, hueSeed: "char_alice", initial: "AL", showInChatAvatars: true, ...extra };
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

test("the 3 clean modes + hush/tide never special-case avatar art (icon-left always)", () => {
  for (const name of ["bubble", "flat", "document", "hush", "tide"] as const) {
    const skin = MESSAGE_ROW_SKINS[name];
    expect(skin.avatarTreatment("character"), name).toBe("icon-left");
    expect(skin.avatarTreatment("persona"), name).toBe("icon-left");
    expect(skin.avatarTreatment(null), name).toBe("icon-left");
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

test("echo's art pane sits OUTSIDE the prose measure, is sized to the pane (never `cover`), and mirrors per role", () => {
  const echo = MESSAGE_ROW_SKINS.echo;
  const painted = echo.bubbleDecoration?.(decoArgs("character", "abababab"));
  // The sharp `portrait` variant (not the raw original) — the reading-surface fix.
  expect(painted?.style?.backgroundImage).toContain("/api/blob/abababab?v=portrait&w=");
  // THE MEASURE FIX (#212-2): the bubble grows by the art pane's FIXED width, so the prose keeps the
  // band's floor. The old shape spent 55% of the box on padding and rendered 28 chars/line.
  // One skin-owned CSSProperties value caps both the bubble and its containing column; equality prevents
  // the two copies of this geometry from drifting. Rendered width stays pinned in chat-room-track CT.
  expect(painted?.style?.maxWidth).toBeDefined();
  expect(painted?.style?.maxWidth).toBe(echo.columnStyle?.maxWidth);
  expect(painted?.style?.paddingRight).toBe("var(--immersive-echo-art-width)");
  // THE CROP FIX (#212-3): the art layer is sized to the PANE and anchored to its top outer corner. Sized
  // `cover` against the whole bubble it was a 4.94x upscale cropped past the subject on a long turn.
  expect(painted?.style?.backgroundSize).toBe("100% 100%, var(--immersive-echo-art-width) auto");
  expect(painted?.style?.backgroundPosition).toBe("0 0, right top");
  // The with-image path carries NO fallback tile.
  expect(painted?.edgeTile).toBeUndefined();
  // THE USER ROW IS DECORATED NOW (#212-5, reversing hide-user-portrait for this skin — see the header):
  // same geometry, mirrored to the row's own outer edge.
  const own = echo.bubbleDecoration?.(decoArgs("persona", "abababab"));
  expect(own?.style?.paddingLeft).toBe("var(--immersive-echo-art-width)");
  expect(own?.style?.paddingRight).toBeUndefined();
  expect(own?.style?.backgroundPosition).toBe("0 0, left top");
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

test("echo's no-image character row paints the first-class FALLBACK tile (owner ruling 2026-07-09), not nothing", () => {
  const echo = MESSAGE_ROW_SKINS.echo;
  const fallback = echo.bubbleDecoration?.(decoArgs("character", null, { hueSeed: "char_alice" }));
  // The tile IS the art source now — the mode no longer degrades to a plain bubble for an imageless
  // character. Reading geometry is IDENTICAL to the with-image case (same padding-right token).
  expect(fallback).not.toBeNull();
  expect(fallback?.style?.paddingRight).toBe("var(--immersive-echo-art-width)");
  expect(fallback?.edgeTile?.initial).toBe("AL");
  // The tile IS the art pane, so it names the same side the portrait would take.
  expect(fallback?.edgeTile?.side).toBe("right");
  expect(echo.bubbleDecoration?.(decoArgs("persona", null))?.edgeTile?.side).toBe("left");
  // The tile field is the entity's DETERMINISTIC hue (seeded off the id, matching the chip everywhere).
  expect(fallback?.edgeTile?.style.backgroundColor).toBe(avatarFallbackHueColor("char_alice"));
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
  expect(characterDecoration?.headerBand?.style.backgroundImage).toContain("/api/blob/x?v=banner&w=");
  // A fixed height drifted the box aspect off 3:1 as the fluid bubble width changed — the band is now
  // an aspect-ratio box so its height derives from width and always matches the server's 3:1 crop.
  expect(characterDecoration?.headerBand?.style.aspectRatio).toBe("var(--aspect-banner)");
  // An IMAGED band carries no initial — the banner IS the art.
  expect(characterDecoration?.headerBand?.initial).toBeUndefined();
});

test("whisper's no-image character band is the first-class FALLBACK tile (hue field + initial), not a bare stripe", () => {
  const whisper = MESSAGE_ROW_SKINS.whisper;
  const fallback = whisper.bubbleDecoration?.(decoArgs("character", null, { hueSeed: "char_alice" }));
  // The stripe still paints AND a band now renders (the mode no longer collapses to a bare stripe for an
  // imageless character) — at the SAME 3:1 geometry as the imaged band.
  expect(fallback?.style?.borderTopColor).toBe("var(--color-speaker)");
  expect(fallback?.headerBand?.style.aspectRatio).toBe("var(--aspect-banner)");
  expect(fallback?.headerBand?.initial).toBe("AL");
  expect(fallback?.headerBand?.style.backgroundColor).toBe(avatarFallbackHueColor("char_alice"));
  // A hue FIELD, never a banner <img>.
  expect(fallback?.headerBand?.style.backgroundImage).not.toContain("?v=banner");
});

test("hush's stripe paints for every kind (chrome, not portrait art — not hide-user-portrait's concern)", () => {
  const hush = MESSAGE_ROW_SKINS.hush;
  for (const kind of ["character", "persona", null] as const) {
    expect(hush.bubbleDecoration?.(decoArgs(kind, null))?.style?.borderLeftColor).toBe("var(--color-speaker)");
  }
});
