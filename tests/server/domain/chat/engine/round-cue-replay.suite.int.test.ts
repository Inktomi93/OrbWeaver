// @subject packages/server/src/domain/chat/engine/round.ts
// Signed thinking and cue replay are observed on the actual Anthropic converter, not a prepared-turn double.
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import type { TurnOutcome } from "@orb/contracts/chat";
import { builtinProvider, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import type { CarryReasoning } from "@orb/contracts/preset";
import { messages, messageVariants } from "@orb/db";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { ChatRoot } from "@orb/testkit/node/chat/composed.ts";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedMessage } from "@orb/testkit/node/factories/message.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq, gt } from "drizzle-orm";

const MODEL = "claude-opus-5-5";
const THINKING = "The signed group thought.";
const SIGNATURE = "controlled-group-thinking-signature";

function signedReply(): Response {
  const event = (type: string, data: string): string => `event: ${type}\ndata: ${data}\n\n`;
  return new Response(
    [
      event(
        "message_start",
        `{"type":"message_start","message":{"id":"msg_group","type":"message","role":"assistant","model":${JSON.stringify(MODEL)},"content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}`,
      ),
      event("content_block_start", '{"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}'),
      event("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":${JSON.stringify(THINKING)}}}`),
      event("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":${JSON.stringify(SIGNATURE)}}}`),
      event("content_block_stop", '{"type":"content_block_stop","index":0}'),
      event("content_block_start", '{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}'),
      event("content_block_delta", '{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"A signed group reply."}}'),
      event("content_block_stop", '{"type":"content_block_stop","index":1}'),
      event("message_delta", '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}'),
      event("message_stop", '{"type":"message_stop"}'),
    ].join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

async function room(): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly round: (carryReasoning: CarryReasoning) => Promise<TurnOutcome>;
    readonly inputs: () => Promise<JsonValue[][]>;
  }
> {
  await using construction = new AsyncDisposableStack();
  const endpoint = builtinProvider("anthropic")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("the canonical Anthropic provider has no fixed endpoint");
  }
  const hostname = new URL(endpoint).hostname;
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused corpus chat",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({
      server: {
        secretBoxKey: Buffer.alloc(32, 1),
        networkExecution: {
          resolver: (host): Promise<readonly string[]> =>
            host === hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error(`unscripted signed-group address resolution: ${host}`)),
        },
      },
      group: { output: "per-speaker", cardScope: "merged", policy: "list", allowSelfResponses: true },
      characters: ["Aria", "Bran"].map((name) => createCharacterSchema.parse({ handle: name.toLowerCase(), name, description: `${name}'s distinct card.` })),
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method === "POST" && new URL(request.url).pathname.endsWith("/messages")) {
          request.signal.throwIfAborted();
          return signedReply();
        }
        return await physical.execute(request);
      },
    }),
  );
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "anthropic", key: "controlled-group-replay-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "anthropic",
    credentialId: credential.id,
    baseUrl: null,
    model: MODEL,
    promptCache: { ...SHIPPED_PROMPT_CACHE, enabled: false },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const [aria, bran] = h.characters;
  if (aria === undefined || bran === undefined) {
    throw new Error("the real signed group has no character roster");
  }
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 1, characterId: aria.id, content: "Aria waves." }, h.root.idSource);
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 2, characterId: bran.id, content: "Bran nods." }, h.root.idSource);
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 3, role: "user", authorUserId: h.owner.userId, content: "Where to?" }, h.root.idSource);
  const round = async (carryReasoning: CarryReasoning): Promise<TurnOutcome> =>
    await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on.", intent: { carryReasoning } });
  const inputs = async (): Promise<JsonValue[][]> =>
    await Promise.all(
      h.requests
        .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/messages"))
        .map(async (request) => {
          const body = jsonValueSchema.parse(JSON.parse(await request.clone().text()));
          if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
            throw new Error("the physical signed-group request has no messages");
          }
          return body["messages"];
        }),
    );
  const lifetime = construction.move();
  return { h, round, inputs, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test("each committed reply carries its delivered cue, and every request opens with the one before it", async () => {
  await using fixture = await room();
  const { h } = fixture;
  const firstRound = await fixture.round("conversation");
  expect(firstRound.aborted).toBe(false);
  expect(firstRound.messages.filter(({ role }) => role === "assistant")).toHaveLength(2);
  const first = await fixture.inputs();
  expect(first).toHaveLength(2);
  const cues = await h.root.db
    .select({ cue: messageVariants.cue, role: messageVariants.cueRole, reasoning: messageVariants.reasoning })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(and(eq(messages.chatId, h.chatId), eq(messages.role, "assistant"), gt(messages.seq, 3)))
    .orderBy(messages.seq);
  expect(cues).toHaveLength(2);
  expect(cues.map(({ role }) => role)).toEqual(["turn-scoped-system", "user"]);
  expect(cues.every(({ reasoning }) => reasoning === THINKING)).toBe(true);
  for (const [index, cue] of cues.entries()) {
    if (cue.cue === null) {
      throw new Error("the actual signed group reply has no persisted delivered cue");
    }
    expect(JSON.stringify(first[index]?.at(-1))).toContain(cue.cue);
  }
  expect(first[0]?.at(-1)).toMatchObject({ role: "system", ["clear_at"]: "next_user_message" });
  expect(JSON.stringify(first[1])).toContain(SIGNATURE);
  const secondRound = await fixture.round("conversation");
  expect(secondRound.aborted).toBe(false);
  expect(secondRound.messages.filter(({ role }) => role === "assistant")).toHaveLength(2);
  const requests = await fixture.inputs();
  expect(requests).toHaveLength(4);
  for (const later of [1, 2, 3]) {
    const before = requests[later - 1] ?? [];
    expect(requests[later]?.slice(0, before.length), `request ${later} opens with request ${later - 1}`).toEqual(before);
  }
});

test("a cue replays in the role it was delivered in after the carry changes mid-chat", async () => {
  await using fixture = await room();
  const firstRound = await fixture.round("off");
  expect(firstRound.aborted).toBe(false);
  expect(firstRound.messages.filter(({ role }) => role === "assistant")).toHaveLength(2);
  const secondRound = await fixture.round("conversation");
  expect(secondRound.aborted).toBe(false);
  expect(secondRound.messages.filter(({ role }) => role === "assistant")).toHaveLength(2);
  const requests = await fixture.inputs();
  expect(requests).toHaveLength(4);
  const before = requests[0] ?? [];
  expect(before.at(-1)).toMatchObject({ role: "user" });
  expect(requests[2]?.slice(0, before.length)).toEqual(before);
  expect(requests[3]?.slice(0, before.length)).toEqual(before);
});
