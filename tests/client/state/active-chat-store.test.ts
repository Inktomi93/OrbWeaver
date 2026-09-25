import { __migrateActiveChatForTest } from "@orb/client/state";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("active chat persistence restores only a valid room handle", () => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  expect(__migrateActiveChatForTest({ handle: { kind: "committed", id: chatId } })).toEqual({
    handle: { kind: "committed", id: chatId },
    newChatIntent: undefined,
    createdChatId: null,
    inviteChatId: null,
  });
});

test("active chat persistence drops corrupt ids and transient creation and invite state", () => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  expect(
    __migrateActiveChatForTest({
      handle: { kind: "committed", id: "chat_not-a-typeid" },
      newChatIntent: { temporary: true },
      createdChatId: "chat_not-a-typeid",
      inviteChatId: chatId,
    }),
  ).toEqual({ handle: { kind: "landing" }, newChatIntent: undefined, createdChatId: null, inviteChatId: null });
  // A reload never reopens an invite dialog, even for a valid room.
  expect(__migrateActiveChatForTest({ handle: { kind: "committed", id: chatId }, inviteChatId: chatId })).toMatchObject({ inviteChatId: null });
});
