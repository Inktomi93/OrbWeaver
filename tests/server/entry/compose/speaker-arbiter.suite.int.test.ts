import "../../../support/composed-real.ts";
import assert from "node:assert/strict";
import { modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { chatGenerationObservations, connectionBindings, messages, messageVariants, ownerStats, userConnections } from "@orb/db";
import { GenerationObservationPersistenceError } from "@orb/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { reconcileStats } from "@orb/server/domain/stats";
import { eq, sql } from "drizzle-orm";
import type { RecordedRequest } from "../../../inference/backends/_hosted-support.ts";
import { openAiTextStream, scriptedSseFetch } from "../../../inference/backends/_hosted-support.ts";
import { principal } from "../../../support/factories/principal.ts";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../support/factories/user.ts";
import type { Fixtures } from "../../../support/fixtures.ts";
import { test as base, expect } from "../../../support/fixtures.ts";
import { seedCharacter } from "../../domain/chat/_support.ts";

const test = base.extend<{ requests: RecordedRequest[]; providerFetch: typeof fetch }>({
  requests: async ({}, use): Promise<void> => {
    await use([]);
  },
  providerFetch: async ({ requests }, use): Promise<void> => {
    const scripted = scriptedSseFetch([openAiTextStream('{"responders":["Aria"]}'), openAiTextStream("A retained reply.")], requests);
    await use((input, init) =>
      String(input).endsWith("/models") ? Promise.resolve(Response.json({ data: [{ id: "arbiter-fixture" }] })) : scripted(input, init),
    );
  },
});

interface SmartExecution {
  readonly ownerId: UserId;
  readonly connectionId: UserConnectionId;
  readonly failure: unknown;
  readonly posts: readonly RecordedRequest[];
  readonly facts: readonly (typeof chatGenerationObservations.$inferSelect)[];
  readonly assistant: readonly (typeof messages.$inferSelect)[];
}

async function runSmart(
  brokenSink: boolean,
  { app, db, services, requests, clock }: Pick<Fixtures, "app" | "db" | "services" | "clock"> & { readonly requests: RecordedRequest[] },
): Promise<SmartExecution> {
  const owner = await seedUser(db, { handle: castId("smart_accounting") });
  const who = principal(owner.id, { handle: owner.handle });
  await services.settings.updateUserSettingsSection({ principal: who, input: { section: "memory", patch: { enabled: false } } });
  const connectionId = mintTypeId(ID_PREFIX.userConnection);
  await db.insert(userConnections).values({
    id: connectionId,
    ownerId: owner.id,
    label: "Hermetic Smart",
    providerId: providerIdSchema.parse("custom-openai"),
    model: modelIdSchema.parse("arbiter-fixture"),
    baseUrl: "https://arbiter.example/v1",
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] } }),
      features: { detectServer: false, pricing: { inputPerMTok: 12_500, outputPerMTok: 0 } },
    },
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  for (const task of ["chat", "summarize"] as const) {
    await db.insert(connectionBindings).values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: owner.id, task, connectionId });
  }
  const aria = await seedCharacter(db, owner.id, "Aria", { id: mintTypeId(ID_PREFIX.character) });
  const bran = await seedCharacter(db, owner.id, "Bran", { id: mintTypeId(ID_PREFIX.character) });
  const { chat } = await services.chat.startChat({ principal: who, characterIds: [aria, bran], opening: "none" });
  await services.chat.setGroupConfig({ principal: who, chatId: chat.id, config: { policy: "smart", smartPicker: "utility", output: "per-speaker" } });
  if (brokenSink) {
    await db.run(
      sql.raw(
        "create trigger reject_smart_fixture_observation before insert on chat_generation_observations begin select raise(abort, 'fixture durable Smart append failed'); end",
      ),
    );
  }
  const online = new AbortController();
  app.presence.connect(owner.id, online.signal);
  let failure: unknown;
  try {
    await services.chat.send({ principal: who, chatId: chat.id, content: "What happens next?" });
  } catch (error) {
    failure = error;
  } finally {
    online.abort();
  }
  return {
    ownerId: owner.id,
    connectionId,
    failure,
    posts: requests.filter((request) => request.url.endsWith("/chat/completions")),
    facts: await db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, chat.id)),
    assistant: await db.select().from(messages).where(sql`${messages.chatId} = ${chat.id} and ${messages.role} = 'assistant'`),
  };
}

test("real Smart composition retains its own paid SDK facts separately from the generated transcript", async ({ app, db, services, requests, clock }) => {
  const { ownerId, connectionId, failure, facts, assistant, posts } = await runSmart(false, { app, db, services, requests, clock });
  expect(posts).toHaveLength(2);
  expect(posts[0]?.body).toHaveProperty("response_format");
  expect(failure).toBeUndefined();
  expect(facts).toHaveLength(1);
  expect(assistant).toHaveLength(1);
  expect(facts[0]).toMatchObject({
    sourceMessageId: null,
    sourceVariantId: null,
    funderUserId: ownerId,
    connectionId,
    tokensIn: 10,
    tokensOut: 5,
    costUsd: 0.125,
    wire: "openai-compat",
  });
  const [slot] = assistant;
  assert(slot !== undefined);
  const variants = await db.select().from(messageVariants).where(eq(messageVariants.messageId, slot.id));
  expect(variants[0]?.metadata?.usageLegs).toHaveLength(1);
  const live = (await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0];
  expect(live).toMatchObject({ costUsd: 0.25, costSamples: 2, userTurns: 1, assistantTurns: 1, tokensIn: 20, tokensOut: 10 });
  await reconcileStats(db, { ownerId, now: clock.now });
  expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, ownerId)))[0]).toMatchObject({
    costUsd: live?.costUsd,
    costSamples: 2,
    userTurns: 1,
    assistantTurns: 1,
    tokensIn: 20,
    tokensOut: 10,
  });
});

test("real Smart composition refuses a broken durable sink before any fallback or second purchase", async ({ app, db, services, requests, clock }) => {
  const { failure, facts, assistant, posts } = await runSmart(true, { app, db, services, requests, clock });
  expect(posts).toHaveLength(1);
  expect(posts[0]?.body).toHaveProperty("response_format");
  assert(failure instanceof GenerationObservationPersistenceError);
  assert(failure.cause instanceof Error);
  expect(failure.cause.message).toContain("fixture durable Smart append failed");
  expect(facts).toEqual([]);
  expect(assistant).toEqual([]);
});
