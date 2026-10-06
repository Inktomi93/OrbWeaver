import "../../../support/composed-real.ts";
import assert from "node:assert/strict";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import {
  characterStats,
  chatParticipants,
  connectionBindings,
  dailyStats,
  messages,
  modelStats,
  ownerStats,
  statsCanonVersions,
  userConnections,
} from "@orb/db";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { reconcileStats } from "@orb/server/domain/stats";
import { eq } from "drizzle-orm";
import type { RecordedRequest } from "../../../inference/backends/_hosted-support.ts";
import { openAiTextStream, scriptedSseFetch } from "../../../inference/backends/_hosted-support.ts";
import { principal } from "../../../support/factories/principal.ts";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { test as base, expect } from "../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedParticipant } from "../../domain/chat/_support.ts";

const test = base.extend<{ requests: RecordedRequest[]; providerFetch: typeof fetch }>({
  requests: async ({}, use): Promise<void> => {
    await use([]);
  },
  providerFetch: async ({ requests }, use): Promise<void> => {
    const frames = openAiTextStream("A retained reply.").map((frame) => ({
      ...frame,
      data: {
        ...frame.data,
        ...(frame.data["usage"] === undefined ? {} : { usage: { ["prompt_tokens"]: 10, ["completion_tokens"]: 5, ["total_tokens"]: 15, cost: 0.125 } }),
      },
    }));
    const scripted = scriptedSseFetch([frames], requests);
    await use((input, init) =>
      String(input).endsWith("/models") ? Promise.resolve(Response.json({ data: [{ id: "openai/gpt-4.1" }] })) : scripted(input, init),
    );
  },
});

test.override("secretBoxKey", Buffer.alloc(32, 7));

test("a fresh paid turn after no-copy handoff and its signed inverse retain every canonical owner exactly once", async ({
  app,
  db,
  services,
  requests,
  clock,
}) => {
  const a = await seedUser(db, { handle: castId("departing_owner") });
  const b = await seedUser(db, { handle: castId("incoming_owner") });
  const pa = principal(a.id, { handle: a.handle });
  const pb = principal(b.id, { handle: b.handle });
  const chatId = await seedChat(db, "fresh_cohort", { id: mintTypeId(ID_PREFIX.chat) });
  const oldVoice = await seedCharacter(db, a.id, "Old Voice", { id: mintTypeId(ID_PREFIX.character) });
  const newVoice = await seedCharacter(db, b.id, "New Voice", { id: mintTypeId(ID_PREFIX.character) });
  await seedParticipant(db, { chatId, key: "departing_host", userId: a.id, role: "host" });
  await seedParticipant(db, { chatId, key: "incoming_member", userId: b.id, role: "member" });
  await seedParticipant(db, { chatId, key: "old_voice", characterId: oldVoice, role: "member" });
  const duplicateOwnerVoice = await seedCharacter(db, a.id, "Second Old Voice", { id: mintTypeId(ID_PREFIX.character) });
  await seedParticipant(db, { chatId, key: "second_old_voice", characterId: duplicateOwnerVoice, role: "member" });
  await services.chat.nominateHostHandoff({ principal: pa, chatId, userId: b.id });
  await services.chat.acceptHostHandoff({ principal: pb, chatId });
  await services.chat.addCharacterToChat({ principal: pb, chatId, characterId: newVoice });
  const departed = (await db.select().from(chatParticipants).where(eq(chatParticipants.characterId, oldVoice)))[0];
  expect(departed?.leftSeq).not.toBeNull();
  await services.settings.updateUserSettingsSection({ principal: pb, input: { section: "memory", patch: { enabled: false } } });
  const credential = await services.credentials.add({ principal: pb, provider: "openrouter", key: "fixture-not-a-provider-key" });
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  await db.insert(userConnections).values({
    id: connectionId,
    credentialId: credential.id,
    ownerId: b.id,
    label: "Hermetic OR",
    providerId: providerIdSchema.parse("openrouter"),
    model: modelIdSchema.parse("openai/gpt-4.1"),
    allowBackground: true,
    declared: { kind: "generation", generation: makeGenerationCapability(), features: { detectServer: false } },
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  await db.insert(connectionBindings).values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: b.id, task: "chat", connectionId });
  for (const ownerId of [a.id, b.id]) {
    await reconcileStats(db, { ownerId, now: clock.now });
  }
  const versions = await db.select().from(statsCanonVersions);
  const online = new AbortController();
  app.presence.connect(b.id, online.signal);
  try {
    await services.chat.generate({ principal: pb, chatId, speakerCharacterId: newVoice });
  } finally {
    online.abort();
  }
  expect(requests.filter((r) => r.url.endsWith("/chat/completions"))).toHaveLength(1);
  const slot = (await db.select().from(messages).where(eq(messages.chatId, chatId)))[0];
  assert(slot !== undefined);
  expect(slot.characterId).toBe(newVoice);
  for (const ownerId of [a.id, b.id]) {
    const live = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(live).toMatchObject({ assistantTurns: 1, costUsd: 0.125, costSamples: 1, tokensIn: 10, tokensOut: 5 });
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, ownerId)))[0]?.version).toBeGreaterThan(
      versions.find((v) => v.ownerId === ownerId)?.version ?? 0,
    );
    const daily = await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId));
    const model = await db.select().from(modelStats).where(eq(modelStats.ownerId, ownerId));
    await reconcileStats(db, { ownerId, now: clock.now });
    const rebuilt = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(rebuilt).toEqual(live);
    expect((await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId))).map(({ id: _id, ...row }) => row)).toEqual(
      daily.map(({ id: _id, ...row }) => row),
    );
    expect((await db.select().from(modelStats).where(eq(modelStats.ownerId, ownerId))).map(({ id: _id, ...row }) => row)).toEqual(
      model.map(({ id: _id, ...row }) => row),
    );
  }
  expect((await db.select().from(characterStats).where(eq(characterStats.characterId, newVoice)))[0]).toMatchObject({ assistantTurns: 1, costUsd: 0.125 });
  const copy = await services.chat.duplicateMessage({ principal: pb, chatId, messageId: slot.id });
  for (const ownerId of [a.id, b.id]) {
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0]?.costUsd).toBe(0.25);
  }
  await services.chat.deleteMessages({ principal: pb, chatId, messageIds: [copy.id] });
  for (const ownerId of [a.id, b.id]) {
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0]).toMatchObject({ assistantTurns: 1, costUsd: 0.125 });
    const live = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    const daily = await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId));
    const models = await db.select().from(modelStats).where(eq(modelStats.ownerId, ownerId));
    await reconcileStats(db, { ownerId, now: clock.now });
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0]).toEqual(live);
    expect((await db.select().from(dailyStats).where(eq(dailyStats.ownerId, ownerId))).map(({ id: _id, ...row }) => row)).toEqual(
      daily.map(({ id: _id, ...row }) => row),
    );
    expect((await db.select().from(modelStats).where(eq(modelStats.ownerId, ownerId))).map(({ id: _id, ...row }) => row)).toEqual(
      models.map(({ id: _id, ...row }) => row),
    );
  }
  expect((await db.select().from(characterStats).where(eq(characterStats.characterId, newVoice)))[0]).toMatchObject({ assistantTurns: 1, costUsd: 0.125 });
  const posted = await services.chat.commitMessage({ principal: pa, chatId, content: "A member's retained line." });
  expect(posted.messages[0]?.authorUserId).toBe(a.id);
  for (const ownerId of [a.id, b.id]) {
    const live = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
    expect(live).toMatchObject({ assistantTurns: 1, userTurns: 1, costUsd: 0.125 });
    await reconcileStats(db, { ownerId, now: clock.now });
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0]).toEqual(live);
  }
  const beforeDeleteVersions = await db.select().from(statsCanonVersions);
  await services.chat.delete({ principal: pb, chatId });
  for (const ownerId of [a.id, b.id]) {
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, ownerId)))[0]?.version).toBeGreaterThan(
      beforeDeleteVersions.find((v) => v.ownerId === ownerId)?.version ?? 0,
    );
    await reconcileStats(db, { ownerId, now: clock.now });
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0]).toMatchObject({ userTurns: 0, assistantTurns: 0, costUsd: 0 });
  }
  expect(requests.filter((r) => r.url.endsWith("/chat/completions"))).toHaveLength(1);
});
