import { expect, test } from "../fixtures.ts";
import { makeChatDetail, makeRedeemInviteResult } from "./chat-view.ts";

test("invite redemption defaults return the viewer's human seat in the joined room", () => {
  const joined = makeRedeemInviteResult();

  expect(joined.participant.chatId).toBe(joined.chat.id);
  expect(joined.participant.userId).toBe(joined.chat.viewerUserId);
  expect(joined.participant.kind).toBe("human");
  expect(joined.participant.characterId).toBeNull();
  expect(joined.participant.activePersonaId).toBeNull();
  expect(joined.participant.displayName).toBe(joined.participant.handle);
  expect(joined.chat.viewerIsHost).toBe(false);
  expect(joined.chat.participants).toContainEqual(joined.participant);

  const selected = makeChatDetail();
  const redirected = makeRedeemInviteResult({ chat: selected });
  expect(redirected.participant.chatId).toBe(selected.id);
  expect(redirected.participant.userId).toBe(selected.viewerUserId);
});
