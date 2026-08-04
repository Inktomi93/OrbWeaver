// Unit: the render-trust resolver (client lib/render-trust) — the ONE place the per-message render
// trust tier + external-media gate are decided (D44 §12.0, UNTRUSTED BY DEFAULT). Pins the exact rule that
// replaced the pre-#25 hardcoded `trust="trusted"`: trusted ONLY for the viewer's own input OR an opted-in
// character; everything else untrusted; fail-CLOSED when no resolved policy is present.

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

test("an assistant message with NO opt-in is UNTRUSTED (the safe default)", () => {
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ trustHtml: false, forbidExternalMedia: true }),
  });
  expect(r.trust).toBe("untrusted");
  expect(r.allowExternal).toBe(false);
});

test("an assistant message whose character OPTED IN (resolved trustHtml=true) is trusted", () => {
  // Covers BOTH the per-character override AND the deployment-global opt-in — both resolve server-side to
  // the same `renderPolicy.trustHtml` the client reads here (the client never re-resolves).
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ trustHtml: true, forbidExternalMedia: false }),
  });
  expect(r.trust).toBe("trusted");
  expect(r.allowExternal).toBe(true);
});

test("a system message is UNTRUSTED (never own-input, never a character opt-in)", () => {
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

// ── The CARD TIER (D44 §12.2) — TWO independent consent axes ──────────────────────────────────────
// tierB is the sandboxed ImmersiveCard (card CSS applied); tierA is the default inert allowlist, which
// forbids `<style>` and therefore cannot render a card AS a card. The mapping was inverted until
// 2026-08-04 — trusted rows were sent to tierA — so these pin the direction explicitly.

test("an UNTRUSTED author in a non-game room gets tierA — the inert default", () => {
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ trustHtml: false, forbidExternalMedia: false }),
  });
  expect(r.trust).toBe("untrusted");
  expect(r.cardTier).toBe("tierA");
});

test("AXIS 1 — a per-character trustHtml opt-in grants tierB", () => {
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ trustHtml: true, forbidExternalMedia: false }),
  });
  expect(r.cardTier).toBe("tierB");
});

test("AXIS 2 — the ROOM's immersive-HTML switch grants tierB even to an UNTRUSTED author", () => {
  // Turning on immersive HTML is what makes the engine TEACH the model to emit `:::card` fences. A room
  // that asks for cards and then renders them inert is a toggle that lies, so the host flipping it IS the
  // consent — independent of whether the authoring character opted in.
  const r = resolveRowRenderPolicy({
    role: "assistant",
    authorUserId: null,
    characterId: CHAR,
    viewerUserId: VIEWER,
    participants: participant({ trustHtml: false, forbidExternalMedia: false }),
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
