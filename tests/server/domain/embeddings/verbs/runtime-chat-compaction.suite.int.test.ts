// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/compaction.ts
// @subject packages/server/src/domain/chat/verbs/quiet-generate.ts
// @subject packages/inference/src/roles/executor.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { expect } from "@orb/testkit/node";
import { captureSdkSessionRows } from "@orb/testkit/node/composed";
import { fundingConnection, test } from "./runtime-funding.fixtures.ts";

test("a native funding turn captures only its genuine canon-seeded session lineage", async ({ app, harness, db, ownerCaller, nativeSdk }) => {
  const key = await ownerCaller.credentials.add({ provider: "claude-sub", key: "corpus-native-sdk-token", metadata: { auth: "oauthToken" } });
  const connection = await fundingConnection({
    ownerCaller,
    harness,
    task: "chat",
    providerId: "claude-sub",
    credentialId: key.id,
    baseUrl: null,
    cachedFacts: true,
  });
  await ownerCaller.connection.setBinding({ task: "chat", connectionId: connection.connectionId });
  const preset = await ownerCaller.preset.create({ name: "SDK lineage witness", kind: "custom" });
  await ownerCaller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const character = await ownerCaller.character.create({
    input: createCharacterSchema.parse({
      handle: "sdk-lineage-witness",
      name: "The native archivist",
      description: "An archivist of completed SDK turns.",
      greetings: [{ text: "The archivist opens the orbital ledger." }],
    }),
  });
  const started = await ownerCaller.chat.startChat({ characterIds: [character.id], opening: "first-message" });
  const chatId = started.chat.id;
  expect(started.opening?.messages.map((message) => [message.role, message.characterId, message.content])).toEqual([
    ["assistant", character.id, "The archivist opens the orbital ledger."],
  ]);
  expect(await captureSdkSessionRows(db, chatId, connection.connectionId)).toEqual([]);
  const principal = await harness.principalFor(harness.ownerId);
  const outcome = await app.services.chat.send({
    principal,
    chatId,
    content: "post-compaction lineage witness",
    intent: { maxContextTokens: 32_000, maxOutputTokens: 64 },
  });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual(["native funding reply"]);
  const captured = await captureSdkSessionRows(db, chatId, connection.connectionId);
  expect(captured.length).toBeGreaterThan(0);
  expect(
    captured.every((row) => row.chatId === chatId && row.connectionId === connection.connectionId && row.canonHash !== "" && row.seededThroughSeq > 0),
  ).toBe(true);
  expect(captured.filter((row) => row.isPrimary)).toHaveLength(1);
  const otherChatId = (await ownerCaller.chat.startChat({ characterIds: [character.id], opening: "none" })).chat.id;
  expect(await captureSdkSessionRows(db, otherChatId, connection.connectionId)).toEqual([]);
  const fresh = await app.services.chat.send({
    principal,
    chatId: otherChatId,
    content: "post-compaction fresh empty-seed witness",
    intent: { maxContextTokens: 32_000, maxOutputTokens: 64 },
  });
  expect(fresh.aborted).toBe(false);
  expect(fresh.messages.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual(["native funding reply"]);
  expect(await captureSdkSessionRows(db, otherChatId, connection.connectionId)).toEqual([]);
  expect(await captureSdkSessionRows(db, chatId, connection.connectionId)).toEqual(captured);
  expect(nativeSdk.children.every((child) => child.exitCode === 0)).toBe(true);
});
