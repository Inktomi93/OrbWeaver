// Unit: the render-trust resolver (features/chat/lib/render-trust) — the ONE place the per-message render
// trust tier + external-media gate are decided (D44 §12.0, UNTRUSTED BY DEFAULT). Pins the exact rule that
// replaced the pre-#25 hardcoded `trust="trusted"`: trusted ONLY for the viewer's own input OR an opted-in
// character; everything else untrusted; fail-CLOSED when no resolved policy is present.

import type { ParticipantView, RenderPolicy } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveRowRenderPolicy } from "../../../../../packages/client/src/features/chat/lib/render-trust";
import { expect, test } from "../../../../support/fixtures";

const VIEWER = castId<UserId>("user_viewer");
const OTHER = castId<UserId>("user_other");
const CHAR = castId<CharacterId>("char_speaker");

function participant(
  renderPolicy: RenderPolicy | undefined,
  characterId: CharacterId = CHAR,
): ReadonlyMap<CharacterId, ParticipantView> {
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
