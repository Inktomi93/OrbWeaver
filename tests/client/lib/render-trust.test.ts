// Unit: the render-trust resolver (client lib/render-trust) — the ONE place the per-message render
// trust tier + external-media gate are decided (docs/law/UI-Theming-and-Content.md §12.2). Pins the exact rule that replaced the pre-#25
// hardcoded `trust="trusted"`: trusted ONLY for the viewer's own input OR a character whose resolved step is
// at or above `trusted`; everything else untrusted; fail-CLOSED when no resolved policy is present.

import type { ParticipantView, RenderPolicy } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveRowRenderPolicy } from "../../../packages/client/src/lib/render-trust.ts";
import { expect, test } from "../../support/fixtures.ts";

const VIEWER = castId<UserId>("user_viewer");
const OTHER = castId<UserId>("user_other");
const CHAR = castId<CharacterId>("char_speaker");

function participant(renderPolicy: RenderPolicy | undefined, characterId: CharacterId = CHAR): ReadonlyMap<CharacterId, ParticipantView> {
  const view: ParticipantView = {
    id: castId("participant_1"),
    chatId: castId("chat_1"),
    kind: "character",
    userId: null,
    characterId,
    role: "member",
    activePersonaId: null,
    talkativeness: 1,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: "Speaker",
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
    ...(renderPolicy === undefined ? {} : { renderPolicy }),
  };
  return new Map([[characterId, view]]);
}

test("the viewer's OWN user message is trusted (role=user + authorUserId === viewerUserId)", () => {
  const r = resolveRowRenderPolicy({
    role: "user",
    authorUserId: VIEWER,
    characterId: null,
    viewerUserId: VIEWER,
  });
  expect(r.trust).toBe("trusted");
});

test("ANOTHER human's user message is UNTRUSTED (authorUserId !== viewerUserId)", () => {
  const r = resolveRowRenderPolicy({
    role: "user",
    authorUserId: OTHER,
    characterId: null,
    viewerUserId: VIEWER,
  });
  expect(r.trust).toBe("untrusted");
});

test("an assistant message whose character resolved to the untrusted step is UNTRUSTED", () => {
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ htmlTrust: "untrusted", forbidExternalMedia: true }),
  });
  expect(r.trust).toBe("untrusted");
  expect(r.allowExternal).toBe(false);
});

test("an assistant message whose character resolved to the trusted step is trusted", () => {
  // Every server-side route to that step (an explicit per-character step, the deployment `trustHtml`
  // default, or an inheriting character) lands as the same `renderPolicy.htmlTrust` the client reads here
  // (the client never re-resolves).
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ htmlTrust: "trusted", forbidExternalMedia: false }),
  });
  expect(r.trust).toBe("trusted");
  expect(r.allowExternal).toBe(true);
});

test("a system message is UNTRUSTED (never own-input, and no character policy to read)", () => {
  const r = resolveRowRenderPolicy({
    role: "system",
    authorUserId: null,
    characterId: null,
    viewerUserId: VIEWER,
  });
  expect(r.trust).toBe("untrusted");
});

test("FAIL-CLOSED: absent renderPolicy ⇒ untrusted + external media gated (the safe floor)", () => {
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant(undefined), // character present, but NO resolved policy on the payload
  });
  expect(r.trust).toBe("untrusted");
  expect(r.allowExternal).toBe(false);
});

test("FAIL-CLOSED: a null viewer can never match own-input (unauthenticated ⇒ untrusted)", () => {
  const r = resolveRowRenderPolicy({
    role: "user",
    authorUserId: VIEWER,
    characterId: null,
    viewerUserId: null,
  });
  expect(r.trust).toBe("untrusted");
});

// The quoted-speech tint pref rides this same policy object (the `lenientCards` precedent). Its default
// is the ONLY inversion here: absent means ON (matching the contract default), not fail-closed — it is a
// display preference, not a trust decision, and a mount that threads no pref must render what the user's
// settings say rather than silently drop the tint.
test("colorQuotes defaults ON when no pref is threaded (the contract default, not fail-closed)", () => {
  const r = resolveRowRenderPolicy({ role: "assistant", authorUserId: null, characterId: CHAR, viewerUserId: VIEWER });
  expect(r.colorQuotes).toBe(true);
});

test("colorQuotes OFF is carried through verbatim (the knob really reaches the row policy)", () => {
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    colorQuotedSpeech: false,
  });
  expect(r.colorQuotes).toBe(false);
});

// ── The CARD TIER (docs/law/UI-Theming-and-Content.md §12.2) — TWO independent consent axes ─────────────────────────────────────
// tierB is the sandboxed ImmersiveCard (card CSS applied); tierA is the inert allowlist, which
// forbids `<style>` and therefore cannot render a card AS a card. The mapping was inverted until
// 2026-08-04 — trusted rows were sent to tierA — so these pin the direction explicitly.

test("an UNTRUSTED author in a non-game room gets tierA — the inert default", () => {
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ htmlTrust: "untrusted", forbidExternalMedia: false }),
  });
  expect(r.trust).toBe("untrusted");
  expect(r.cardTier).toBe("tierA");
});

test("AXIS 1 — a character resolved to the trusted step gets tierB", () => {
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ htmlTrust: "trusted", forbidExternalMedia: false }),
  });
  expect(r.cardTier).toBe("tierB");
});

test("AXIS 2 — the ROOM's immersive-HTML switch grants tierB even to an UNTRUSTED author", () => {
  // Turning on immersive HTML is what makes the engine TEACH the model to emit `:::card` fences. A room
  // that asks for cards and then renders them inert is a toggle that lies, so the host flipping it IS the
  // consent — independent of the authoring character's resolved step.
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ htmlTrust: "untrusted", forbidExternalMedia: false }),
    lenientHtmlCards: true,
  });
  expect(r.trust).toBe("untrusted");
  expect(r.cardTier).toBe("tierB");
});

test("the card tier is a HOST decision — a fail-closed row with neither consent stays tierA", () => {
  // No participant entry ⇒ SAFE_FLOOR ⇒ untrusted, and no room consent. Nothing the MODEL emits can move
  // this: both axes are host-set config, never anything asserted in the message body.
  const r = resolveRowRenderPolicy({ role: "assistant", authorUserId: null, characterId: CHAR, viewerUserId: VIEWER });
  expect(r.cardTier).toBe("tierA");
});
