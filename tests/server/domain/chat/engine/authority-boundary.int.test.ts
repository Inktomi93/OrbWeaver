// @subject packages/server/src/domain/chat/service.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/memory/generate/turn.ts
// @subject packages/server/src/domain/chat/memory/recall/recall.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { chatDigests, chatSegments, messages, messageVariants } from "@orb/db";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors } from "@orb/testkit/node/corpus-seed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";
import { vi } from "vitest";

const FUNDING_HEADER = "x-orb-corpus-funder";
const HOST_FUNDING = "frozen-host-connection";
const MEMBER_FUNDING = "triggering-member-connection";
const TURN_REPLY = "The orbital marker remains with its host.";
const FIRST_CARD = "Only the first orbital witness carries this card.";
const SECOND_CARD = "Only the second orbital witness carries this card.";
const MEMORY_INTENT = { maxContextTokens: 4096, maxOutputTokens: 64 } as const;
const MEMORY_PHASES = [
  { input: "Before the second witness joined", memory: "DIGEST_BEFORE_SECOND_JOIN" },
  { input: "While both witnesses were present", memory: "DIGEST_BOTH_PRESENT" },
  { input: "While the second witness was absent", memory: "DIGEST_SECOND_ABSENT" },
  { input: "After the second witness returned", memory: "DIGEST_SECOND_RETURNED" },
] as const;

interface PhysicalRequest {
  readonly request: Request;
  readonly body: string;
}

interface RecordedExecution {
  readonly execute: typeof fetch;
  readonly requests: PhysicalRequest[];
}

type MemoryActors = Awaited<ReturnType<typeof seedCorpusActors>> & {
  readonly member: Principal;
  readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
};

function recordedExecution(chatText: Parameters<typeof createCorpusProviderExecution>[0]["chatText"]): RecordedExecution {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    usage: { promptTokens: 40, completionTokens: 15 },
  });
  const requests: PhysicalRequest[] = [];
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const body = request.method === "POST" ? await request.clone().text() : "";
    requests.push({ request, body });
    return await provider.execute(request);
  };
  return { requests, execute };
}

async function markFundingConnections(root: ServerTestHarness, owner: Principal, member: Principal): Promise<void> {
  for (const [principal, marker] of [
    [owner, HOST_FUNDING],
    [member, MEMBER_FUNDING],
  ] as const) {
    for (const connection of await root.services.connection.list({ principal })) {
      await root.services.connection.update({
        principal,
        connectionId: connection.id,
        patch: { transport: { headers: { [FUNDING_HEADER]: marker } } },
      });
    }
  }
}

async function memoryActors(root: ServerTestHarness): Promise<MemoryActors> {
  const actors = await seedCorpusActors(root);
  const member = await root.principalFor(actors.secondUserId);
  await markFundingConnections(root, actors.owner, member);
  const caller = await root.internalCallerFor(actors.owner.userId);
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  await caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixA", blockSize: 1, verbatimWindow: 0, maxTier: 0 } } });
  return { ...actors, member, caller };
}

function memoryReply(body: string): string {
  if (!body.includes("Transcript block:")) {
    return TURN_REPLY;
  }
  // Summary-only sentinels distinguish recalled memory from the same scene still present in raw canon.
  const facts = MEMORY_PHASES.filter((phase) => body.includes(phase.input)).map((phase) => phase.memory);
  return `Orbital ledger memory\n${facts.length === 0 ? "A keeper answered." : `${facts.join(". ")}.`}\nKeywords: ledger`;
}

test("a member's actual turn uses the frozen host connection while keeping the member's message attribution", async () => {
  const provider = recordedExecution(TURN_REPLY);
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner, secondUserId, connections } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  await markFundingConnections(root, owner, member);
  const card = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "engine-authority-host", name: "Ledger keeper", description: "An orbital witness." }),
  });
  const room = await root.services.chat.startChat({ principal: owner, characterIds: [card.id], opening: "none" });
  const invite = await root.services.chat.createInvite({ principal: owner, chatId: room.chat.id, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const completed = vi.spyOn(root.app.rpgChatOps, "onTurnCompleted");
  const hostOnline = new AbortController();
  root.app.presence.connect(owner.userId, hostOnline.signal);
  try {
    const outcome = await root.services.chat.send({ principal: member, chatId: room.chat.id, content: "Witness the orbital marker.", intent: {} });
    await root.settleBackground();
    const assistant = outcome.messages.find((message) => message.role === "assistant");
    if (assistant === undefined) {
      throw new Error("the actual member turn did not commit its assistant variant");
    }
    const requests = provider.requests.filter(({ body }) => body.includes('"stream":true') && body.includes("Witness the orbital marker."));
    expect(outcome.aborted).toBe(false);
    expect(requests).not.toEqual([]);
    expect(requests.map(({ request }) => request.headers.get(FUNDING_HEADER))).toEqual(requests.map(() => HOST_FUNDING));
    expect(assistant.content).toBe(TURN_REPLY);
    expect(assistant.connectionId).toBe(connections.text.id);
    expect(assistant.connectionAttributionProvenance).toBe("recorded");
    const variants = await root.db.select().from(messageVariants).where(eq(messageVariants.id, assistant.selectedVariantId));
    expect(variants.map((variant) => variant.connectionId)).toEqual([connections.text.id]);
    expect(completed).toHaveBeenCalledOnce();
    const terminal = completed.mock.calls[0];
    if (terminal === undefined) {
      throw new Error("the committed turn did not reach the actual root's RPG terminal hook");
    }
    expect(terminal.slice(0, 3)).toEqual([room.chat.id, assistant.id, assistant.selectedVariantId]);
    expect(terminal[4]).toMatchObject({ kind: "send", triggeredBy: member.userId, connection: { ownerId: owner.userId } });
    expect(terminal[4].transcript.map((message) => message.content)).toContain(TURN_REPLY);
    const canon = await root.db.select().from(messages).where(eq(messages.chatId, room.chat.id));
    expect(canon.filter((message) => message.role === "user")).toMatchObject([{ authorUserId: member.userId }]);
    expect(canon.map((message) => message.createdAt)).toEqual(canon.map(() => root.clock.now()));
    expect(variants.map((variant) => variant.createdAt)).toEqual([root.clock.now()]);
  } finally {
    hostOnline.abort();
    completed.mockRestore();
  }
});

test("bound memory ports retain shared buckets and enforce real join, leave and rejoin horizons on scoped recall", async () => {
  const provider = recordedExecution(memoryReply);
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner, member, caller } = await memoryActors(root);
  const first = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "first-orbital-witness", name: "First witness", description: FIRST_CARD }),
  });
  const second = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "second-orbital-witness", name: "Second witness", description: SECOND_CARD }),
  });
  await root.settleBackground();
  const room = await caller.chat.startChat({ characterIds: [first.id], opening: "none" });
  const chatId = room.chat.id;
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  const invite = await root.services.chat.createInvite({ principal: owner, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const hostOnline = new AbortController();
  root.app.presence.connect(owner.userId, hostOnline.signal);
  const send = async (content: string): Promise<void> => {
    const outcome = await root.services.chat.send({ principal: member, chatId, content, intent: MEMORY_INTENT });
    expect(outcome.aborted).toBe(false);
    await root.settleBackground();
  };
  try {
    const ballast = "orbital ledger ballast ".repeat(640);
    await send(`${MEMORY_PHASES[0].input}\n${ballast}`);
    await root.services.chat.addCharacterToChat({ principal: owner, chatId, characterId: second.id });
    await send(`${MEMORY_PHASES[1].input}\n${ballast}`);
    await root.services.chat.removeCharacterFromChat({ principal: owner, chatId, characterId: second.id });
    await send(`${MEMORY_PHASES[2].input}\n${ballast}`);
    await root.services.chat.addCharacterToChat({ principal: owner, chatId, characterId: second.id });
    await send(`${MEMORY_PHASES[3].input}\n${ballast}`);

    const stored = await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId));
    const buckets = [...new Set(stored.map((row) => row.scopedCharacterId))];
    expect(buckets).toEqual(expect.arrayContaining([first.id, second.id]));
    const sharedId = buckets.find((id) => id !== first.id && id !== second.id);
    if (sharedId === undefined) {
      throw new Error("the actual group build did not produce its shared bucket");
    }
    expect(buckets).toHaveLength(3);
    const shared = stored.filter((row) => row.scopedCharacterId === sharedId);
    const scoped = stored.filter((row) => row.scopedCharacterId === second.id);
    for (const phase of MEMORY_PHASES) {
      expect(
        shared.some((row) => row.text.includes(phase.memory)),
        phase.memory,
      ).toBe(true);
    }
    expect(scoped.some((row) => row.text.includes(MEMORY_PHASES[1].memory))).toBe(true);
    expect(scoped.some((row) => row.text.includes(MEMORY_PHASES[3].memory))).toBe(true);
    expect(scoped.some((row) => row.text.includes(MEMORY_PHASES[0].memory) || row.text.includes(MEMORY_PHASES[2].memory))).toBe(false);
    expect(await root.db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId))).not.toEqual([]);

    const priorRecall = root.app.recallRecorder.recent({ chatId }).at(-1)?.seq ?? 0;
    const priorRequests = provider.requests.length;
    for (const characterId of [first.id, second.id]) {
      const outcome = await root.services.chat.forceCharacterTurn({ principal: owner, chatId, characterId, intent: MEMORY_INTENT });
      expect(outcome.aborted).toBe(false);
      expect(outcome.messages.map((message) => message.characterId)).toEqual([characterId]);
      await root.settleBackground();
    }
    const recalls = root.app.recallRecorder.recent({ chatId }).filter((record) => record.seq > priorRecall && record.scopedCharacterId === second.id);
    expect(recalls).toHaveLength(1);
    const recall = recalls[0];
    if (recall === undefined) {
      throw new Error("the actual second speaker did not record its scoped recall");
    }
    const absent = shared.filter((row) => row.text.includes(MEMORY_PHASES[0].memory) || row.text.includes(MEMORY_PHASES[2].memory));
    const witnessed = shared.filter((row) => row.text.includes(MEMORY_PHASES[1].memory));
    expect(absent).not.toEqual([]);
    for (const row of absent) {
      expect(recall.trace.candidates).toEqual(
        expect.arrayContaining([expect.objectContaining({ blockIdx: row.blockIdx, scopedCharacterId: sharedId, verdict: "unwitnessed" })]),
      );
    }
    expect(recall.trace.candidates.some((candidate) => candidate.verdict === "admitted" && witnessed.some((row) => row.blockIdx === candidate.blockIdx))).toBe(
      true,
    );
    const prompts = provider.requests.slice(priorRequests).filter(({ body }) => body.includes('"stream":true'));
    const secondPrompts = prompts.filter(({ body }) => body.includes(SECOND_CARD));
    expect(secondPrompts).toHaveLength(1);
    const prompt = secondPrompts[0]?.body ?? "";
    expect(prompt).toContain(MEMORY_PHASES[1].memory);
    expect(prompt).not.toContain(MEMORY_PHASES[0].memory);
    expect(prompt).not.toContain(MEMORY_PHASES[2].memory);
    expect(prompts.some(({ body }) => body.includes(FIRST_CARD) && body.includes(MEMORY_PHASES[0].memory) && body.includes(MEMORY_PHASES[2].memory))).toBe(
      true,
    );
    const funded = provider.requests.filter(({ request }) => request.method === "POST");
    expect(funded).not.toEqual([]);
    expect(funded.every(({ request }) => request.headers.get(FUNDING_HEADER) === HOST_FUNDING)).toBe(true);
  } finally {
    hostOnline.abort();
  }
});

test("post-turn memory detaches from the reply and physically unwinds with its production root lifetime", async ({ db }) => {
  const provider = recordedExecution(memoryReply);
  const entered = Promise.withResolvers<AbortSignal>();
  const barrierEntered = Promise.withResolvers<void>();
  const barrierAborted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const cue = "Hold the detached orbital memory write.";
  let held = false;
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (new URL(request.url).hostname === "memory-lifetime.test") {
      const interrupted = Promise.withResolvers<never>();
      const onAbort = (): void => {
        barrierAborted.resolve();
        interrupted.reject(request.signal.reason);
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
      try {
        request.signal.throwIfAborted();
        barrierEntered.resolve();
        await Promise.race([release.promise, interrupted.promise]);
        throw new Error("the lifetime barrier was released by proof cleanup");
      } finally {
        request.signal.removeEventListener("abort", onAbort);
      }
    }
    if (!held && new URL(request.url).pathname.endsWith("/embeddings") && (await request.clone().text()).includes(cue)) {
      held = true;
      const interrupted = Promise.withResolvers<never>();
      const onAbort = (): void => interrupted.reject(request.signal.reason);
      request.signal.addEventListener("abort", onAbort, { once: true });
      try {
        request.signal.throwIfAborted();
        entered.resolve(request.signal);
        await Promise.race([release.promise, interrupted.promise]);
      } finally {
        request.signal.removeEventListener("abort", onAbort);
      }
    }
    return await provider.execute(request);
  };
  await using root = await createServerHarness({
    db,
    providerFetch: execute,
    networkExecution: { fetch: execute, resolver: () => Promise.resolve(["93.184.215.14"]) },
  });
  const { owner, caller } = await memoryActors(root);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "detached-memory-witness", name: "Detached witness", description: FIRST_CARD }),
  });
  await root.settleBackground();
  const room = await caller.chat.startChat({ characterIds: [card.id], opening: "none" });
  const hostOnline = new AbortController();
  root.app.presence.connect(owner.userId, hostOnline.signal);
  try {
    root.app.supervise("memory-lifetime-barrier", "memory.lifetimeControl", {}, async () => {
      await root.app.egress.configuredEndpointFetch("https://memory-lifetime.test/held");
    });
    await barrierEntered.promise;
    const sending = root.services.chat.send({ principal: owner, chatId: room.chat.id, content: cue, intent: MEMORY_INTENT });
    const signal = await entered.promise;
    const outcome = await sending;
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages.map((message) => message.content)).toContain(TURN_REPLY);
    expect(signal.aborted).toBe(false);
    const before = await db.select().from(chatSegments).where(eq(chatSegments.chatId, room.chat.id));
    const disposed = root[Symbol.asyncDispose]();
    try {
      // A separate real supervised request marks cancellation even if the memory port is miswired.
      await barrierAborted.promise;
      expect(signal.aborted).toBe(true);
    } finally {
      release.resolve();
      await expect(disposed).resolves.toBeUndefined();
    }
    expect(await db.select().from(chatSegments).where(eq(chatSegments.chatId, room.chat.id))).toEqual(before);
  } finally {
    hostOnline.abort();
    release.resolve();
  }
});
