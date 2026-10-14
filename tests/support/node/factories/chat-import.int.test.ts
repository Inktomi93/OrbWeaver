// @subject tests/support/node/factories/chat.ts
// @subject packages/server/src/domain/import/verbs/import-chat-bundle.ts
// @subject packages/server/src/domain/export/verbs/export-chat-bundle.ts

import { chatInjectionInputSchema } from "@orb/contracts/chat";
import { chatImportClaims, chats, messages } from "@orb/db";
import { contentSpanRaw } from "@orb/kit/content";
import { ID_PREFIX } from "@orb/kit/ids";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusConnections, seedRecallRoom } from "@orb/testkit/node/corpus-seed.ts";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { seedImportedChatRows } from "@orb/testkit/node/factories/chat.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";

test("native chat import captures returned claims, injections and owned attachments without forging dedup or refusal IDs", async () => {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The ledger traveller remembers the actual imported scene.",
    structuredReplies: new Map(),
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal, partial: { privateEndpointAllowlist: ["127.0.0.1"] } });
  await seedCorpusConnections(root, principal);
  const chatId = await seedRecallRoom(caller);
  const injection = chatInjectionInputSchema.parse({ position: "in_chat", depth: 0, role: "system", content: "Keep the ledger scene factual.", order: 2 });
  await root.services.chat.setChatInjection({ principal, chatId, ...injection });
  const asset = await root.app.assets.store({
    principal,
    kind: "attachment",
    mime: "image/png",
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
  });
  const content = `The recorded ledger scene. ${contentSpanRaw({ kind: "image", ref: { kind: "asset", assetId: asset.assetId }, alt: "Ledger scene" })}`;
  const turn = await root.services.chat.send({ principal, chatId, content, attachmentAssetIds: [asset.assetId] });
  expect(turn.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  const file = await root.app.exportService.exportChatBundle({ principal, chatId });
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (file === null || descriptor === undefined) {
    throw new Error("the real native chat export/import graph produced no file or descriptor");
  }
  const imported = await seedImportedChatRows(root.db, descriptor.importFile, [root.ownerId, file]);
  expect(imported.outcome).toMatchObject({ ok: true, created: true });
  expect(imported.claims).toHaveLength(1);
  const importedId = imported.outcome.memoryChatIds?.[0];
  expect(importedId).not.toBe(chatId);
  expect(imported.claims.map((row) => row.chatId)).toEqual(imported.outcome.memoryChatIds);
  expect(imported.injections).toMatchObject([{ chatId: importedId, ...injection }]);
  expect(imported.attachments.map((row) => row.assetId)).toEqual([asset.assetId]);
  expect(imported.attachments.map((row) => row.origin)).toEqual(["attached"]);
  if (importedId === undefined) {
    throw new Error("the real conversation import returned no written chat identity");
  }
  const restored = await caller.chat.listMessages({ chatId: importedId });
  expect(restored.messages.map((message) => message.content)).toEqual(turn.messages.map((message) => message.content));
  expect(imported.attachments.every((row) => restored.messages.some((message) => message.id === row.messageId))).toBe(true);
  const allClaims = await root.db.select().from(chatImportClaims).orderBy(chatImportClaims.chatId);
  const repeated = await seedImportedChatRows(root.db, descriptor.importFile, [root.ownerId, file]);
  expect(repeated).toMatchObject({ outcome: { ok: true, created: false }, claims: [], injections: [], attachments: [] });
  expect(await root.db.select().from(chatImportClaims).orderBy(chatImportClaims.chatId)).toEqual(allClaims);
  const foreign = await root.actor();
  const beforeRooms = await root.db.select().from(chats);
  const refused = await seedImportedChatRows(root.db, descriptor.importFile, [foreign.id, file]);
  expect(refused.outcome).toMatchObject({ ok: false });
  expect(refused.outcome.error).toContain("no character on this account matches this chat");
  expect(refused.claims).toEqual([]);
  expect(await root.db.select().from(chats)).toEqual(beforeRooms);
  expect(await root.db.select().from(chatImportClaims).orderBy(chatImportClaims.chatId)).toEqual(allClaims);
  expect(await root.db.select().from(messages).where(eq(messages.chatId, importedId))).toHaveLength(turn.messages.length);
});
