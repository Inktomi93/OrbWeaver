import "../../../support/composed-real.ts";
import type { Principal } from "@orb/contracts/identity";
import type { PromptCacheSettings } from "@orb/contracts/inference";
import { clampRoleHandling, turnsLevelFor, USER_ROLE_HANDLING } from "@orb/contracts/inference";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import {
  chatGenerationObservations,
  chatParticipants,
  connectionBindings,
  dailyStats,
  messages,
  messageVariants,
  modelStats,
  ownerStats,
  userConnections,
} from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { reconcileStats } from "../../../../packages/server/src/domain/stats/index.ts";
import type { RecordedRequest, SseEvent } from "../../../inference/backends/_hosted-support.ts";
import { anthropicTextStream, openAiTextStream, scriptedSseFetch } from "../../../inference/backends/_hosted-support.ts";
import { seedUser } from "../../../support/factories/user.ts";
import type { Fixtures } from "../../../support/fixtures.ts";
import { test as base, expect } from "../../../support/fixtures.ts";
import { seedCharacter } from "../../domain/chat/_support.ts";

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const SCRIPTED_SECRET_BOX_KEY = Buffer.from("00".repeat(32), "hex");
const CACHE_ACCOUNTING_SENTINEL = "REPLAY_ACCOUNTING_REQUEST";
const QWEN_CATALOG_FIXTURE = {
  id: "qwen/qwen3-coder-plus",
  ["context_length"]: 1_000_000,
  ["top_provider"]: { ["max_completion_tokens"]: 65_536 },
  architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] },
};
const IMPLICIT_ROUTE_CATALOG_FIXTURES = [
  { id: "x-ai/grok-4.7", ["context_length"]: 500_000, ["top_provider"]: { ["max_completion_tokens"]: 450_000 } },
  { id: "moonshotai/kimi-k3", ["context_length"]: 1_048_576, ["top_provider"]: { ["max_completion_tokens"]: 943_718 } },
  { id: "openai/gpt-oss-120b", ["context_length"]: 131_072, ["top_provider"]: { ["max_completion_tokens"]: 117_964 } },
  { id: "deepseek/deepseek-v4.1-flash", ["context_length"]: 1_048_576, ["top_provider"]: { ["max_completion_tokens"]: 943_718 } },
  { id: "z-ai/glm-5.3", ["context_length"]: 1_048_576, ["top_provider"]: { ["max_completion_tokens"]: 943_718 } },
];

const shapedMessagesSchema = z.array(
  z.object({
    role: z.string(),
    content: z.union([z.string(), z.array(z.object({ text: z.string().optional() }))]),
  }),
);

function replayAccountingStream(text: string, hit: boolean): readonly SseEvent[] {
  return openAiTextStream(text).map((frame) => {
    const { usage: _usage, ...data } = frame.data;
    return {
      ...frame,
      data: {
        ...data,
        id: hit ? "gen-replay-current" : "gen-paid-current",
        ...(hit || frame.data["usage"] === undefined ? {} : { usage: { ["prompt_tokens"]: 10, ["completion_tokens"]: 5, ["total_tokens"]: 15, cost: 0.125 } }),
      },
    };
  });
}

const test = base.extend<{ requests: RecordedRequest[]; providerFetch: typeof fetch; secretBoxKey: Buffer }>({
  secretBoxKey: async ({}, use): Promise<void> => {
    await use(SCRIPTED_SECRET_BOX_KEY);
  },
  requests: async ({}, use): Promise<void> => {
    await use([]);
  },
  providerFetch: async ({ requests }, use): Promise<void> => {
    await use((input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/models")) {
        if (url.hostname === "generativelanguage.googleapis.com") {
          return Promise.resolve(Response.json({ models: [] }));
        }
        return Promise.resolve(
          Response.json({ data: url.hostname === "openrouter.ai" && url.search === "" ? [QWEN_CATALOG_FIXTURE, ...IMPLICIT_ROUTE_CATALOG_FIXTURES] : [] }),
        );
      }
      const text = `CACHE_REPLY_${requests.length}`;
      if (String(input).includes(":streamGenerateContent")) {
        requests.push({
          url: String(input),
          body: JSON.parse(String(init?.body)) as RecordedRequest["body"],
          headers: Object.fromEntries(new Headers(init?.headers)),
        });
        const chunks = [
          { candidates: [{ content: { role: "model", parts: [{ text }] } }] },
          {
            candidates: [{ content: { role: "model", parts: [] }, finishReason: "STOP" }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
          },
        ];
        return Promise.resolve(
          new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } }),
        );
      }
      const stream = String(input).endsWith("/messages") ? anthropicTextStream(text) : openAiTextStream(text);
      return scriptedSseFetch([stream], requests)(input, init);
    });
  },
});

const replayAccountingTest = test.extend<{ providerFetch: typeof fetch }>({
  providerFetch: async ({ requests }, use): Promise<void> => {
    await use((input, init) => {
      if (new URL(String(input)).pathname.endsWith("/models")) {
        return Promise.resolve(Response.json({ data: [] }));
      }
      const hit = requests.length === 0;
      return scriptedSseFetch([replayAccountingStream(`CACHE_REPLY_${requests.length}`, hit)], requests, {
        "x-openrouter-cache-status": hit ? "HIT" : "MISS",
        "x-openrouter-cache-source-id": "gen-original",
      })(input, init);
    });
  },
});

for (const enabled of [false, true]) {
  test(`two persisted human messages retain block ends only for an admitted marker plan (enabled=${String(enabled)})`, async ({
    app,
    db,
    services,
    clock,
    requests,
  }) => {
    const host = await seedUser(db, { id: newId<UserId>(), handle: castId("shapehost") });
    const member = await seedUser(db, { id: newId<UserId>(), handle: castId("shapemember") });
    const hostPrincipal: Principal = { userId: host.id, handle: host.handle, role: host.role, externalId: null, via: "header" };
    const memberPrincipal: Principal = { userId: member.id, handle: member.handle, role: member.role, externalId: null, via: "header" };
    await services.settings.updateUserSettingsSection({ principal: hostPrincipal, input: { section: "memory", patch: { enabled: false } } });
    const preset = await services.preset.create({
      userId: host.id,
      name: "Strict named history",
      kind: "custom",
      config: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "content", params: { advanced: { roleHandling: "strict" } } },
    });
    await services.settings.updateUserSettingsSection({ principal: hostPrincipal, input: { section: "seeds", patch: { defaultPresetId: preset.id } } });
    const credential = await services.credentials.add({ principal: hostPrincipal, provider: "openrouter", key: "scripted-shaping-host-key" });
    const connectionId = mintTypeId(ID_PREFIX.userConnection);
    await db.insert(userConnections).values({
      id: connectionId,
      ownerId: host.id,
      credentialId: credential.id,
      providerId: castId("openrouter"),
      label: "Scripted Qwen marker route",
      model: castId("qwen/qwen3-coder-plus"),
      promptCache: { enabled, cacheSystem: true, historyDepth: null, ttl: "5m" },
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await db.insert(connectionBindings).values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: host.id, task: "chat", connectionId });
    const characterId = await seedCharacter(db, host.id, "shapearia", { id: mintTypeId(ID_PREFIX.character) });
    const { chat } = await services.chat.startChat({ principal: hostPrincipal, characterIds: [characterId], opening: "none" });
    await db.insert(chatParticipants).values({
      id: mintTypeId(ID_PREFIX.chatParticipant),
      chatId: chat.id,
      kind: "human",
      userId: member.id,
      role: "member",
      joinedAt: clock.now(),
      joinSeq: 0,
    });
    const live = new AbortController();
    app.presence.connect(host.id, live.signal);
    try {
      await services.chat.commitMessage({ principal: memberPrincipal, chatId: chat.id, content: "CACHE_FIRST_HUMAN" });
      await services.chat.commitMessage({ principal: hostPrincipal, chatId: chat.id, content: "CACHE_SECOND_HUMAN" });
      const preview = await services.chat.previewAssembly({ principal: hostPrincipal, chatId: chat.id });
      expect(preview.budget.sources.find((source) => source.source === "history")?.detail).toBe(enabled ? "2 turns" : "1 turn");
      await services.chat.forceCharacterTurn({ principal: hostPrincipal, chatId: chat.id, characterId });
      const turns = requests.filter((request) => request.url === CHAT_COMPLETIONS_URL);
      expect(turns).toHaveLength(1);
      expect(turns[0]?.headers?.["authorization"]).toBe("Bearer scripted-shaping-host-key");
      const shaped = shapedMessagesSchema.parse(turns[0]?.body["messages"]);
      const human = shaped
        .filter((row) => row.role === "user")
        .flatMap((row) => (typeof row.content === "string" ? [row.content] : row.content.flatMap((part) => (part.text === undefined ? [] : [part.text]))));
      expect(human.join("\n")).toContain("CACHE_FIRST_HUMAN");
      expect(human.join("\n")).toContain("CACHE_SECOND_HUMAN");
      const joined = human.some((part) => part.includes("CACHE_FIRST_HUMAN") && part.includes("CACHE_SECOND_HUMAN"));
      expect(joined).toBe(!enabled);
      expect(turns[0]?.headers?.["x-openrouter-cache"]).toBe("false");
      expect(turns[0]?.headers).not.toHaveProperty("x-openrouter-cache-clear");
    } finally {
      live.abort();
    }
  });
}

replayAccountingTest(
  "H/K composed replay and fresh accounting retain normalized legs and live rebuild parity",
  async ({ app, db, services, clock, requests }) => {
    const host = await seedUser(db, { id: newId<UserId>(), handle: castId("cachehost") });
    const member = await seedUser(db, { id: newId<UserId>(), handle: castId("cachemember") });
    const principal = (user: typeof host): Principal => ({ userId: user.id, handle: user.handle, role: user.role, externalId: null, via: "header" });
    const hostPrincipal = principal(host);
    const memberPrincipal = principal(member);
    await services.settings.updateUserSettingsSection({ principal: hostPrincipal, input: { section: "memory", patch: { enabled: false } } });
    const credential = await services.credentials.add({ principal: hostPrincipal, provider: "openrouter", key: "scripted-host-cache-key" });
    const connectionId = mintTypeId(ID_PREFIX.userConnection);
    await db.insert(userConnections).values({
      id: connectionId,
      ownerId: host.id,
      credentialId: credential.id,
      label: "Scripted caching",
      providerId: castId("openrouter"),
      model: castId("anthropic/claude-sonnet-5"),
      transport: { headers: { "X-OpenRouter-Cache": "true" } },
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await db.insert(connectionBindings).values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: host.id, task: "chat", connectionId });
    const preset = await services.preset.create({ userId: host.id, name: "Inherited cache controls", kind: "custom", config: DEFAULT_PROMPT_CONFIG });
    const effective = await services.preset.resolveEffective({ principal: hostPrincipal, id: preset.id });
    expect(effective.cache.replay).toMatchObject({ supported: true, enabled: true, provenance: "connection", refresh: false });
    expect(effective).not.toHaveProperty("responseCache");
    const characterId = await seedCharacter(db, host.id, "cachearia", { id: mintTypeId(ID_PREFIX.character) });
    const { chat } = await services.chat.startChat({ principal: hostPrincipal, characterIds: [characterId], opening: "none" });
    await db.insert(chatParticipants).values({
      id: mintTypeId(ID_PREFIX.chatParticipant),
      chatId: chat.id,
      kind: "human",
      userId: member.id,
      role: "member",
      joinedAt: clock.now(),
      joinSeq: 0,
    });
    const live = new AbortController();
    app.presence.connect(host.id, live.signal);
    try {
      await services.chat.send({ principal: memberPrincipal, chatId: chat.id, content: CACHE_ACCOUNTING_SENTINEL });
      const [reply] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.chatId, chat.id), eq(messages.role, "assistant")));
      if (reply === undefined) {
        throw new Error("The composed member turn did not persist a character reply.");
      }
      const replay = (await db.select().from(messageVariants).where(eq(messageVariants.messageId, reply.id)))[0];
      expect(replay).toMatchObject({
        costUsd: 0,
        costProvenance: "measured",
        tokensIn: null,
        tokensOut: null,
        responseCache: { status: "hit", sourceGenerationId: "gen-original" },
        metadata: { usageLegs: [{ generationId: "gen-replay-current", costUsd: 0, tokensIn: null, tokensOut: null, responseCache: { status: "hit" } }] },
      });
      expect(replay?.metadata?.usageLegs).toHaveLength(1);
      expect(replay?.metadata?.usageLegs?.[0]).not.toHaveProperty("funderUserId");
      expect(replay?.metadata?.usageLegs?.[0]).not.toHaveProperty("connectionId");
      expect(await db.select().from(chatGenerationObservations)).toEqual([]);
      await services.chat.swipe({ principal: hostPrincipal, chatId: chat.id, messageId: reply.id });
      const turns = requests.filter((request) => request.url === CHAT_COMPLETIONS_URL);
      expect(turns).toHaveLength(2);
      expect(turns[0]?.headers?.["x-openrouter-cache"]).toBe("true");
      expect(turns[1]?.headers?.["x-openrouter-cache"]).toBe("false");
      expect(turns[1]?.headers).not.toHaveProperty("x-openrouter-cache-clear");
      for (const turn of turns) {
        expect(turn.headers?.["authorization"]).toBe("Bearer scripted-host-cache-key");
        expect(turn.body["session_id"]).toBe(chat.id);
        expect(JSON.stringify(turn.body)).toContain(CACHE_ACCOUNTING_SENTINEL);
      }
      const variants = await db.select().from(messageVariants).where(eq(messageVariants.messageId, reply.id)).orderBy(messageVariants.idx);
      expect(variants).toHaveLength(2);
      expect(variants[1]).toMatchObject({
        costUsd: 0.125,
        costProvenance: "measured",
        tokensIn: 10,
        tokensOut: 5,
        responseCache: { status: "miss", sourceGenerationId: "gen-original" },
        metadata: { usageLegs: [{ generationId: "gen-paid-current", costUsd: 0.125, tokensIn: 10, tokensOut: 5, responseCache: { status: "miss" } }] },
      });
      expect(variants[1]?.metadata?.usageLegs).toHaveLength(1);
      expect(await db.select().from(chatGenerationObservations)).toEqual([]);
      const liveStats = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, host.id));
      expect(liveStats).toMatchObject([{ costUsd: 0.125, tokensIn: 10, tokensOut: 5 }]);
      const daily = await db.select().from(dailyStats).where(eq(dailyStats.ownerId, host.id));
      const models = await db.select().from(modelStats).where(eq(modelStats.ownerId, host.id));
      await reconcileStats(db, { ownerId: host.id, now: clock.now });
      expect(await db.select().from(ownerStats).where(eq(ownerStats.ownerId, host.id))).toEqual(liveStats);
      expect((await db.select().from(dailyStats).where(eq(dailyStats.ownerId, host.id))).map(({ id: _id, ...row }) => row)).toEqual(
        daily.map(({ id: _id, ...row }) => row),
      );
      expect((await db.select().from(modelStats).where(eq(modelStats.ownerId, host.id))).map(({ id: _id, ...row }) => row)).toEqual(
        models.map(({ id: _id, ...row }) => row),
      );
    } finally {
      live.abort();
    }
  },
);

const CACHE_OFF = { enabled: false, cacheSystem: true, historyDepth: null, ttl: "5m" } as const satisfies PromptCacheSettings;
const CACHE_5M = { ...CACHE_OFF, enabled: true } as const;
const CACHE_1H = { ...CACHE_5M, ttl: "1h" } as const;
const ANTHROPIC_CACHE_CASES = [
  { label: "manual-off", settings: CACHE_OFF, action: "none", ttl: null },
  { label: "manual-5m", settings: CACHE_5M, action: "markers", ttl: "5m" },
  { label: "manual-1h", settings: CACHE_1H, action: "markers", ttl: "1h" },
  { label: "request-automatic", settings: { ...CACHE_5M, requestAutomatic: true }, action: "automatic-request", ttl: "5m" },
] as const;
const OPENAI_CACHE_CASES = [
  { label: "implicit-no-markers", settings: CACHE_OFF, action: "none", ttl: null },
  { label: "implicit-plus-markers", settings: CACHE_5M, action: "markers", ttl: null },
  { label: "explicit-only", settings: { ...CACHE_5M, disableImplicit: true }, action: "markers", ttl: null },
  { label: "implicit-disabled-no-markers", settings: { ...CACHE_OFF, disableImplicit: true }, action: "none", ttl: null },
] as const;
const FIXED_CACHE_CASES = [
  { label: "manual-off", settings: CACHE_OFF, action: "none", ttl: null },
  { label: "manual-5m", settings: CACHE_5M, action: "markers", ttl: "5m" },
  { label: "requested-1h-applied-5m", settings: CACHE_1H, action: "markers", ttl: "5m" },
] as const;
const IMPLICIT_CACHE_CASES = [
  { label: "no-app-markers", settings: CACHE_OFF, action: "none", ttl: null },
  { label: "unsupported-markers-and-disable", settings: { ...CACHE_5M, disableImplicit: true }, action: "none", ttl: null },
] as const;

const APP_CACHE_ROUTES = [
  { provider: "anthropic", model: "claude-sonnet-5", api: "anthropic-messages", cases: ANTHROPIC_CACHE_CASES },
  { provider: "openrouter", model: "anthropic/claude-sonnet-5", api: "chat-completions", cases: ANTHROPIC_CACHE_CASES },
  { provider: "openai", model: "gpt-6-sol", api: "chat-completions", cases: OPENAI_CACHE_CASES },
  { provider: "openrouter", model: "openai/gpt-6-sol", api: "chat-completions", cases: OPENAI_CACHE_CASES },
  { provider: "google", model: "gemini-3.8-flash", api: "google-generative-ai", cases: IMPLICIT_CACHE_CASES },
  { provider: "openrouter", model: "google/gemini-3.8-flash", api: "chat-completions", cases: FIXED_CACHE_CASES },
  { provider: "openrouter", model: "qwen/qwen3-coder-plus", api: "chat-completions", cases: FIXED_CACHE_CASES },
  { provider: "openrouter", model: "x-ai/grok-4.7", api: "chat-completions", upstream: "xAI", cases: IMPLICIT_CACHE_CASES },
  { provider: "openrouter", model: "moonshotai/kimi-k3", api: "chat-completions", upstream: "Moonshot AI", cases: IMPLICIT_CACHE_CASES },
  { provider: "openrouter", model: "openai/gpt-oss-120b", api: "chat-completions", upstream: "Groq", cases: IMPLICIT_CACHE_CASES },
  { provider: "openrouter", model: "deepseek/deepseek-v4.1-flash", api: "chat-completions", upstream: "DeepSeek", cases: IMPLICIT_CACHE_CASES },
  { provider: "openrouter", model: "z-ai/glm-5.3", api: "chat-completions", upstream: "Z.AI", cases: IMPLICIT_CACHE_CASES },
] as const;
const APP_CACHE_COHORTS = [
  { label: "1H-1C", humans: 1, characters: 1 },
  { label: "2H-1C", humans: 2, characters: 1 },
  { label: "3H-2C", humans: 3, characters: 2 },
] as const;
const APP_CACHE_NAMES = ["default", "content"] as const;
const APP_CACHE_STABLE_TEXT = `CACHE_ORDINARY_HUMAN ${"stable ".repeat(3000)}`;
const googleMessagesSchema = z.array(z.object({ role: z.string(), parts: z.array(z.object({ text: z.string().optional() })) }));

function wireTextParts(request: RecordedRequest): string[] {
  if (request.body["contents"] !== undefined) {
    return googleMessagesSchema.parse(request.body["contents"]).flatMap((row) => row.parts.flatMap((part) => (part.text === undefined ? [] : [part.text])));
  }
  return shapedMessagesSchema
    .parse(request.body["messages"])
    .flatMap((row) => (typeof row.content === "string" ? [row.content] : row.content.flatMap((part) => (part.text === undefined ? [] : [part.text]))));
}

const APP_CACHE_SHAPES = APP_CACHE_COHORTS.flatMap((cohort) =>
  APP_CACHE_NAMES.flatMap((namesBehavior) => USER_ROLE_HANDLING.map((requestedFloor) => ({ cohort, namesBehavior, requestedFloor }))),
).map((shape, index) => ({ ...shape, cell: index + 1 }));
type MatrixRoute = (typeof APP_CACHE_ROUTES)[number];
type MatrixMode = MatrixRoute["cases"][number];
type MatrixShape = (typeof APP_CACHE_SHAPES)[number];
type MatrixFixture = Pick<Fixtures, "app" | "db" | "services"> & { readonly requests: RecordedRequest[] };
interface MatrixRoom {
  readonly host: Awaited<ReturnType<typeof seedUser>>;
  readonly humans: Awaited<ReturnType<typeof seedUser>>[];
  readonly hostPrincipal: Principal;
  readonly principals: Principal[];
  readonly key: string;
  readonly characterIds: CharacterId[];
  readonly firstCharacter: CharacterId;
  readonly chat: Awaited<ReturnType<Fixtures["services"]["chat"]["startChat"]>>["chat"];
  readonly effective: Awaited<ReturnType<Fixtures["services"]["preset"]["resolveEffective"]>>;
  readonly effectiveFloor: ReturnType<typeof clampRoleHandling>;
  readonly caseName: string;
  readonly firstCharacterName: string;
  readonly lastCharacterName: string;
  readonly route: MatrixRoute;
  readonly mode: MatrixMode;
  readonly shape: MatrixShape;
}

async function createMatrixRoom(fixtures: MatrixFixture, route: MatrixRoute, mode: MatrixMode, shape: MatrixShape): Promise<MatrixRoom> {
  const { db, services } = fixtures;
  const { cohort, namesBehavior, requestedFloor, cell } = shape;
  const caseName = `${cohort.label}/${namesBehavior}/${requestedFloor}`;
  const humans = await Promise.all(
    Array.from({ length: cohort.humans }, (_, index) => seedUser(db, { id: newId<UserId>(), handle: castId(`cacheh${cell}x${index}`) })),
  );
  const [host] = humans;
  if (host === undefined) {
    throw new Error("A matrix cohort must contain its host.");
  }
  const principals = humans.map((user): Principal => ({ userId: user.id, handle: user.handle, role: user.role, externalId: null, via: "header" }));
  const [hostPrincipal] = principals;
  if (hostPrincipal === undefined) {
    throw new Error("A matrix cohort must contain its host principal.");
  }
  await services.settings.updateUserSettingsSection({ principal: hostPrincipal, input: { section: "memory", patch: { enabled: false } } });
  const key = `scripted-cache-key-${cell}`;
  const credential = await services.credentials.add({ principal: hostPrincipal, provider: route.provider, key });
  const connection = await services.connection.create({
    principal: hostPrincipal,
    providerId: route.provider,
    credentialId: credential.id,
    baseUrl: null,
    model: route.model,
    api: route.api,
    promptCache: mode.settings,
    ...("upstream" in route ? { extras: { provider: { order: [route.upstream], ["allow_fallbacks"]: false } } } : {}),
    transport: route.provider === "openrouter" ? { headers: { "X-OpenRouter-Cache": "true" } } : null,
  });
  await services.connection.setBinding({ principal: hostPrincipal, task: "chat", connectionId: connection.id });
  const preset = await services.preset.create({
    userId: host.id,
    name: caseName,
    kind: "custom",
    config: { ...DEFAULT_PROMPT_CONFIG, namesBehavior, params: { advanced: { roleHandling: requestedFloor } } },
  });
  await services.settings.updateUserSettingsSection({ principal: hostPrincipal, input: { section: "seeds", patch: { defaultPresetId: preset.id } } });
  const resolved = await services.connection.resolveChatCacheContext({ principal: hostPrincipal });
  if (resolved.capability.kind !== "generation") {
    throw new Error(`The matrix chat route resolved to ${resolved.capability.kind}.`);
  }
  const floor = turnsLevelFor(resolved.capability.generation, requestedFloor).roleHandlingFloor;
  const effectiveFloor = clampRoleHandling(floor, requestedFloor);
  const effective = await services.preset.resolveEffective({ principal: hostPrincipal, id: preset.id });
  expect(effective.cache.prefix.ttl, caseName).toBe(mode.ttl);
  expect(effective.cache.prefix.preservesBlockEnds, caseName).toBe(mode.action !== "none" && effectiveFloor !== "none");
  const characterIds = await Promise.all(
    Array.from({ length: cohort.characters }, (_, index) => seedCharacter(db, host.id, `cachec${cell}x${index}`, { id: mintTypeId(ID_PREFIX.character) })),
  );
  const [firstCharacter] = characterIds;
  if (firstCharacter === undefined) {
    throw new Error("A matrix cohort must contain a character.");
  }
  const { chat } = await services.chat.startChat({ principal: hostPrincipal, characterIds, opening: "none" });
  await services.chat.setGroupConfig({
    principal: hostPrincipal,
    chatId: chat.id,
    config: { output: "per-speaker", policy: "natural", cardScope: "merged" },
  });
  for (const memberPrincipal of principals.slice(1)) {
    const { token } = await services.chat.createInvite({ principal: hostPrincipal, chatId: chat.id, input: {} });
    await services.chat.redeemInvite({ principal: memberPrincipal, input: { token } });
  }
  for (const principal of principals) {
    const persona = await services.persona.create({ principal, input: { name: principal.handle, description: "A distinct matrix participant." } });
    await services.persona.setActivePersona({ principal, chatId: chat.id, personaId: persona.id });
  }

  return {
    route,
    mode,
    shape,
    host,
    hostPrincipal,
    humans,
    principals,
    key,
    characterIds,
    firstCharacter,
    chat,
    effective,
    effectiveFloor,
    caseName,
    firstCharacterName: `cachec${cell}x0`,
    lastCharacterName: `cachec${cell}x${cohort.characters - 1}`,
  };
}

function wireRows(request: RecordedRequest): z.infer<typeof shapedMessagesSchema> {
  return request.body["contents"] === undefined
    ? shapedMessagesSchema.parse(request.body["messages"])
    : googleMessagesSchema.parse(request.body["contents"]).map((row) => ({ role: row.role, content: row.parts }));
}

function assertHumanHistory(humanCall: RecordedRequest, room: MatrixRoom): void {
  const { shape, mode } = room;
  const { caseName, effectiveFloor, effective, host, humans } = room;
  const { cohort, namesBehavior } = shape;
  const humanParts = wireTextParts(humanCall);
  const humanText = humanParts.join("\n");
  expect(humanText, caseName).toContain("CACHE_ORDINARY_HUMAN");
  expect(humanText, caseName).toContain("CACHE_ADJACENT_HUMAN_A");
  expect(humanText, caseName).toContain("CACHE_ADJACENT_HUMAN_B");
  expect(humanText.indexOf("CACHE_ADJACENT_HUMAN_A"), caseName).toBeLessThan(humanText.indexOf("CACHE_ADJACENT_HUMAN_B"));
  expect(
    humanParts.some((part) => part.includes("CACHE_ADJACENT_HUMAN_A") && part.includes("CACHE_ADJACENT_HUMAN_B")),
    caseName,
  ).toBe(effectiveFloor !== "none" && !effective.cache.prefix.preservesBlockEnds);
  const humanBody = JSON.stringify(humanCall.body);
  expect(humanBody.includes('"cache_control"') || humanBody.includes('"prompt_cache_breakpoint"'), caseName).toBe(mode.action !== "none");
  const adjacentRows = wireRows(humanCall).filter((row) => {
    const text = typeof row.content === "string" ? row.content : row.content.map((part) => part.text ?? "").join("\n");
    return text.includes("CACHE_ADJACENT_HUMAN_A") || text.includes("CACHE_ADJACENT_HUMAN_B");
  });
  expect(
    adjacentRows.map((row) => row.role),
    caseName,
  ).toEqual(effectiveFloor === "none" ? ["user", "user"] : ["user"]);
  const labels = cohort.humans > 1 || namesBehavior === "content";
  expect(humanText.includes(`${(humans[1] ?? host).handle}: CACHE_ADJACENT_HUMAN_A`), caseName).toBe(labels);
  expect(humanText.includes(`${host.handle}: CACHE_ADJACENT_HUMAN_B`), caseName).toBe(labels);
}

function assertCharacterHistory(characterCall: RecordedRequest, replyA: string, replyB: string, room: MatrixRoom): void {
  const { caseName, shape } = room;
  const characterText = wireTextParts(characterCall).join("\n");
  expect(characterText, caseName).toContain(APP_CACHE_STABLE_TEXT);
  expect(characterText, caseName).toContain(replyA);
  expect(characterText, caseName).toContain(replyB);
  expect(characterText.indexOf(replyA), caseName).toBeLessThan(characterText.indexOf(replyB));
  expect(characterText.indexOf(replyB), caseName).toBeLessThan(characterText.indexOf("CACHE_CHANGED_HUMAN_SUFFIX"));
  const labels = shape.cohort.characters > 1 || shape.namesBehavior === "content";
  expect(characterText.includes(`${room.firstCharacterName}: ${replyA}`), caseName).toBe(labels);
  expect(characterText.includes(`${room.lastCharacterName}: ${replyB}`), caseName).toBe(labels);
}

const AUTH_HEADER_BY_PROVIDER = { anthropic: "x-api-key", google: "x-goog-api-key", openai: "authorization", openrouter: "authorization" } as const;
const HOST_BY_PROVIDER = {
  anthropic: "api.anthropic.com",
  google: "generativelanguage.googleapis.com",
  openai: "api.openai.com",
  openrouter: "openrouter.ai",
} as const;

function assertWireCall(call: RecordedRequest, room: MatrixRoom, send: boolean): void {
  const { caseName, chat, key, effective, route, mode } = room;
  const openrouter = route.provider === "openrouter";
  const bearer = route.provider === "openrouter" || route.provider === "openai";
  const openai = route.provider === "openai" || route.model === "openai/gpt-6-sol";
  expect(new URL(call.url).hostname, caseName).toBe(HOST_BY_PROVIDER[route.provider]);
  const paths = {
    anthropic: "/v1/messages",
    google: `/v1beta/models/${route.model}:streamGenerateContent`,
    openai: "/v1/chat/completions",
    openrouter: "/api/v1/chat/completions",
  };
  expect(new URL(call.url).pathname, caseName).toBe(paths[route.provider]);
  expect(call.body["model"], caseName).toBe(route.provider === "google" ? undefined : route.model);
  const requestedProvider = matrixProvider(route);
  expect(call.body["provider"], caseName).toEqual(requestedProvider === undefined ? undefined : { order: [requestedProvider], ["allow_fallbacks"]: false });
  expect(call.headers?.["x-openrouter-cache"], caseName).toBe(openrouter ? String(send) : undefined);
  expect(call.body["session_id"], caseName).toBe(openrouter ? chat.id : undefined);
  expect(call.headers, caseName).not.toHaveProperty("x-openrouter-cache-clear");
  expect(call.headers?.[AUTH_HEADER_BY_PROVIDER[route.provider]], caseName).toBe(bearer ? `Bearer ${key}` : key);
  expect(call.body["cache_control"], caseName).toEqual(mode.action === "automatic-request" ? expect.objectContaining({ type: "ephemeral" }) : undefined);
  expect(call.body["prompt_cache_options"], caseName).toEqual(
    openai ? { mode: effective.cache.implicit.disableApplied ? "explicit" : "implicit", ttl: "30m" } : undefined,
  );
  expect(call.body, caseName).not.toHaveProperty("cachedContent");
  const body = JSON.stringify(call.body);
  expect((openai || route.provider === "google") && body.includes('"cache_control"'), caseName).toBe(false);
}

function matrixProvider(route: MatrixRoute): string | undefined {
  if (route.provider === "openrouter" && route.model.startsWith("anthropic/")) {
    return "Anthropic";
  }
  return "upstream" in route ? route.upstream : undefined;
}

async function driveMatrixCell(fixtures: MatrixFixture, room: MatrixRoom): Promise<void> {
  const { db, services, requests } = fixtures;
  const { host, hostPrincipal, principals, characterIds, firstCharacter, chat, caseName, shape } = room;
  const { cohort } = shape;
  const firstCall = requests.length;
  await services.chat.send({ principal: principals.at(-1) ?? hostPrincipal, chatId: chat.id, content: APP_CACHE_STABLE_TEXT });
  const ordinaryCalls = requests.length - firstCall;
  expect(ordinaryCalls, caseName).toBeGreaterThanOrEqual(1);
  expect(ordinaryCalls, caseName).toBeLessThanOrEqual(cohort.characters);
  await services.chat.commitMessage({ principal: principals[1] ?? hostPrincipal, chatId: chat.id, content: "CACHE_ADJACENT_HUMAN_A" });
  await services.chat.commitMessage({ principal: hostPrincipal, chatId: chat.id, content: "CACHE_ADJACENT_HUMAN_B" });
  const fit = await services.chat.previewContextFit({ principal: hostPrincipal, chatId: chat.id, speakerCharacterId: firstCharacter });
  if ("unbound" in fit) {
    throw new Error("The persisted matrix room must have its host's chat connection.");
  }
  expect(fit.droppedCount, caseName).toBe(0);
  expect(fit.reserveOutputTokens, caseName).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  await services.chat.forceCharacterTurn({ principal: hostPrincipal, chatId: chat.id, characterId: firstCharacter });
  const humanCall = requests.at(-1);
  if (humanCall === undefined) {
    throw new Error("The adjacent-human turn produced no SDK request.");
  }
  assertHumanHistory(humanCall, room);
  const replyA = `CACHE_REPLY_${requests.length - 1}`;
  await services.chat.forceCharacterTurn({ principal: hostPrincipal, chatId: chat.id, characterId: characterIds.at(-1) ?? firstCharacter });
  const replyB = `CACHE_REPLY_${requests.length - 1}`;
  await services.chat.commitMessage({ principal: hostPrincipal, chatId: chat.id, content: "CACHE_CHANGED_HUMAN_SUFFIX" });
  await services.chat.forceCharacterTurn({ principal: hostPrincipal, chatId: chat.id, characterId: firstCharacter });
  const characterCall = requests.at(-1);
  if (characterCall === undefined) {
    throw new Error("The adjacent-character history produced no SDK request.");
  }
  assertCharacterHistory(characterCall, replyA, replyB, room);
  const replies = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.chatId, chat.id), eq(messages.role, "assistant")))
    .orderBy(asc(messages.seq));
  expect(replies, caseName).toHaveLength(ordinaryCalls + 3);
  const lastReply = replies.at(-1);
  if (lastReply === undefined) {
    throw new Error("The matrix did not persist its last character reply.");
  }
  await services.chat.swipe({ principal: hostPrincipal, chatId: chat.id, messageId: lastReply.id });
  await services.chat.continueTurn({ principal: hostPrincipal, chatId: chat.id, messageId: lastReply.id });
  await services.chat.generate({ principal: hostPrincipal, chatId: chat.id, speakerCharacterId: firstCharacter, afterAssistant: true });
  const draft: string[] = [];
  for await (const part of services.chat.impersonateStream({ principal: hostPrincipal, chatId: chat.id })) {
    draft.push(part.delta);
  }
  expect(draft.join(""), caseName).toContain("CACHE_REPLY_");
  const userRows = await db
    .select({ authorUserId: messages.authorUserId })
    .from(messages)
    .where(and(eq(messages.chatId, chat.id), eq(messages.role, "user")))
    .orderBy(asc(messages.seq));
  expect(
    userRows.map((row) => row.authorUserId),
    caseName,
  ).toEqual([principals.at(-1)?.userId, (principals[1] ?? hostPrincipal).userId, host.id, host.id]);
  await services.chat.setGroupConfig({
    principal: hostPrincipal,
    chatId: chat.id,
    config: {
      output: "per-speaker",
      policy: "pooled",
      cardScope: "merged",
      autoMode: true,
      autoModeMaxTurns: 1,
      autoModeDelayMs: 0,
      allowSelfResponses: true,
    },
  });
  const autoFirstCall = requests.length - firstCall;
  await services.chat.send({ principal: hostPrincipal, chatId: chat.id, content: "CACHE_AUTO_SEED" });
  const calls = requests.slice(firstCall);
  expect(calls, caseName).toHaveLength(ordinaryCalls + 8 + cohort.characters);

  for (const [index, call] of calls.entries()) {
    const send = index < ordinaryCalls || (index >= autoFirstCall && index < autoFirstCall + cohort.characters);
    assertWireCall(call, room, send);
  }
}

for (const route of APP_CACHE_ROUTES) {
  for (const mode of route.cases) {
    test(`persisted cache matrix ${route.provider}/${route.model}/${mode.label}`, async ({ app, db, services, requests }) => {
      const fixtures = { app, db, services, requests };
      for (const shape of APP_CACHE_SHAPES) {
        const room = await createMatrixRoom(fixtures, route, mode, shape);
        expect(room.effective.cache.prefix.action, room.caseName).toBe(mode.action);
        const live = new AbortController();
        app.presence.connect(room.host.id, live.signal);
        try {
          await driveMatrixCell(fixtures, room);
        } finally {
          live.abort();
        }
      }
    }, 240_000);
  }
}
