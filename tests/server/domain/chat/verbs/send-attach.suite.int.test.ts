// @subject packages/server/src/domain/chat/verbs/turn.ts
import { messageAssets, messages } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedCorpusActors,
  seedRecallRoom,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

async function room(): Promise<
  AsyncDisposable &
    Pick<Awaited<ReturnType<typeof seedCorpusActors>>, "owner" | "secondUserId"> & {
      readonly root: ServerTestHarness;
      readonly chatId: Awaited<ReturnType<typeof seedRecallRoom>>;
    }
> {
  await using construction = new AsyncDisposableStack();
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "ok",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const root = construction.use(await createServerHarness({ providerFetch: provider.execute }));
  const { owner, secondUserId } = await seedCorpusActors(root);
  const chatId = await seedRecallRoom(await root.internalCallerFor(owner.userId));
  const lifetime = construction.move();
  return { root, owner, secondUserId, chatId, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("an OWNED attachment lands a message_assets row + an asset:<id> body ref on the user turn", async () => {
  await using h = await room();
  const asset = await h.root.app.assets.store({
    principal: h.owner,
    kind: "attachment",
    mime: "image/png",
    bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)),
  });
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "look at this", attachmentAssetIds: [asset.assetId] });

  const userRow = outcome.messages.find((message) => message.role === "user");
  expect(userRow?.content).toContain(`![attachment](asset:${asset.assetId})`);
  expect(userRow?.content).toContain("look at this");
  const rows = await h.root.db
    .select({ messageId: messageAssets.messageId, assetId: messageAssets.assetId })
    .from(messageAssets)
    .where(eq(messageAssets.assetId, asset.assetId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.messageId).toBe(userRow?.id);
});

test("a message with NO attachments writes NO message_assets rows (byte-identical to a plain send)", async () => {
  await using h = await room();
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "plain" });

  expect(outcome.messages.find((message) => message.role === "user")?.content).toBe("plain");
  expect(await h.root.db.select({ id: messageAssets.id }).from(messageAssets)).toHaveLength(0);
});

test("attaching ANOTHER user's asset is refused attachment_not_owned — no message, no row", async () => {
  await using h = await room();
  const stranger = await h.root.principalFor(h.secondUserId);
  const asset = await h.root.app.assets.store({
    principal: stranger,
    kind: "attachment",
    mime: "image/png",
    bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)),
  });

  await expect(
    h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "steal this", attachmentAssetIds: [asset.assetId] }),
  ).rejects.toMatchObject({ code: "attachment_not_owned" });
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toHaveLength(0);
  expect(await h.root.db.select({ id: messageAssets.id }).from(messageAssets)).toHaveLength(0);
});

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
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId))).toHaveLength(0);
});
