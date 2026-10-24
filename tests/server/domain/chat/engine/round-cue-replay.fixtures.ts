// A signed Anthropic group room on the real converter, with the opening history every round replays.

import { createCharacterSchema } from "@orb/contracts/character";
import type { TurnOutcome } from "@orb/contracts/chat";
import { builtinProvider, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import type { CarryReasoning } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";

const MODEL = "claude-opus-5-5";
export const THINKING = "The signed group thought.";
export const SIGNATURE = "controlled-group-thinking-signature";

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

export async function room(): Promise<
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
      transcript: [
        { role: "assistant", speakerHandle: "aria", content: "Aria waves." },
        { role: "assistant", speakerHandle: "bran", content: "Bran nods." },
        { role: "user", content: "Where to?" },
      ],
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

// The first request's seeded history as the converter sends it: the new-chat marker, then both seeded assistant lines
// (the first speaker's included) folded into one assistant turn. The seeded owner line follows, joined with the live send.
export const OPENING_HISTORY = [
  { role: "user", content: [{ type: "text", text: resolveProseText("preset.format.newChatMarker", {}) }] },
  { role: "assistant", content: [{ type: "text", text: "Aria: Aria waves.\n\nBran: Bran nods." }] },
];
export const OPENING_OWNER_LINE = "Where to?\n\nGo on.";
