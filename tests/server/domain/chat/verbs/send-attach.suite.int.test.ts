// @subject packages/server/src/domain/chat/verbs/turn.ts

import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { makeAssetBytes, readRoomCanon } from "@orb/testkit/node/composed";
import { ChatNotFoundError } from "#server/domain/chat/contract/errors.ts";
import { room } from "./send-attach.fixtures.ts";

test("a non-member attaching to a foreign chat is a leak-free NOT_FOUND (the post gate wins first)", async () => {
  await using h = await room();
  const outsider = await h.root.principalFor(h.secondUserId);
  const asset = await h.root.app.assets.store({
    principal: outsider,
    kind: "attachment",
    mime: "image/png",
    bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)),
  });

  await expect(
    h.root.services.chat.send({ principal: outsider, chatId: h.chatId, content: "intrude", attachmentAssetIds: [asset.assetId] }),
  ).rejects.toBeInstanceOf(ChatNotFoundError);
  expect(await readRoomCanon(h.root, h.owner, h.chatId)).toHaveLength(0);
});
