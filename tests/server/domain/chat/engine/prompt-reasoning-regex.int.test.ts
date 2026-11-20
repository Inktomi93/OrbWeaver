// @subject packages/server/src/domain/chat/assembly/history-regex.ts
// @subject packages/inference/src/backends/v4/stream.ts
// Replayed thinking is only ever provider-signed: a thought with no provenance is not stored, so it never rides back,
// and a signed thought rides back byte-identical even under a live prompt-pass script on REASONING, because the
// provider checks the signature against the text. A controlled endpoint speaks native Google bytes, where a thought
// part carries its own signature.
import { providerDefSchema } from "@orb/contracts/inference";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { finiteReplies } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  SECRET_BOX_TEST_KEY,
  seedAdminProvider,
} from "@orb/testkit/node/composed";

const STREAM_PATH = ":streamGenerateContent";
const SIGNATURE = "provider-thought-signature";
const SIGNED_THOUGHT = "The kettle is cold.";
const PLAIN_THOUGHT = "The kettle is warm.";
const REPLY = "The kettle sings.";

function nativeReply(parts: readonly JsonValue[]): Response {
  const frames = [
    ...parts.map((part) => ({ candidates: [{ content: { role: "model", parts: [part] } }] })),
    {
      candidates: [{ content: { role: "model", parts: [] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
    },
  ];
  return new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

// Every thought part the request replays, in order.
function replayedThoughts(body: JsonValue): readonly JsonValue[] {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["contents"])) {
    throw new Error("the native request has no contents");
  }
  return body["contents"].flatMap((content) => {
    if (content === null || typeof content !== "object" || Array.isArray(content) || !Array.isArray(content["parts"])) {
      return [];
    }
    return content["parts"].filter((part) => part !== null && typeof part === "object" && !Array.isArray(part) && part["thought"] === true);
  });
}

test("a prompt-pass script on REASONING leaves a signed thought byte-identical, and an unsigned thought never rides back", async () => {
  using replies = finiteReplies("native thinking completion", [
    [{ text: SIGNED_THOUGHT, thought: true, thoughtSignature: SIGNATURE }, { text: REPLY }],
    [{ text: PLAIN_THOUGHT, thought: true }, { text: REPLY }],
    [{ text: REPLY }],
  ]);
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused corpus reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: { secretBoxKey: SECRET_BOX_TEST_KEY },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "POST" && new URL(request.url).pathname.endsWith(STREAM_PATH)) {
        return nativeReply(replies.take());
      }
      return await corpus.execute(request);
    },
  });
  const definition = providerDefSchema.parse({
    id: "controlled-thinking-native",
    label: "Controlled native thinking endpoint",
    wire: "google-generative-ai",
    auth: "endpoint",
    apis: ["google-generative-ai"],
    catalog: "url",
    metered: true,
  });
  await seedAdminProvider(h.root, definition, { admin: h.owner.userId });
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: definition.id, key: "controlled-thinking-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: definition.id,
    credentialId: credential.id,
    baseUrl: "http://127.0.0.1:8704/v1beta",
    model: "controlled-thinking-model",
    // The physical supplier's own reasoning: a thinking model whose thoughts ride back signed.
    declared: {
      kind: "generation",
      generation: {
        input: ["text"],
        context: { window: 128_000 },
        output: { modalities: ["text"], maxTokens: { min: 1, max: 8192 } },
        reasoning: { mode: "budget", enabled: true, budgetRange: { min: 1024, max: 32_000 }, replay: "signed" },
      },
      features: { detectServer: false },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const script = await h.root.services.regex.createScript({
    principal: h.owner,
    input: createRegexScriptSchema.parse({
      name: "Shout the kettle",
      findRegex: "kettle",
      replaceString: "KETTLE",
      targets: ["REASONING", "AI_OUTPUT"],
      passes: ["prompt"],
    }),
  });
  await h.root.services.regex.attachGlobal({ principal: h.owner, scriptId: script.id });

  const intent = { carryReasoning: "conversation" } as const;
  for (const content of ["First.", "Second."]) {
    await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content, intent });
  }
  const mark = h.requests.length;
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Third.", intent });
  await h.root.settleBackground();

  const [third, ...extra] = await Promise.all(
    h.requests
      .slice(mark)
      .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith(STREAM_PATH))
      .map(async (request) => jsonValueSchema.parse(JSON.parse(await request.clone().text()))),
  );
  if (third === undefined || extra.length > 0) {
    throw new Error("the third turn did not make exactly one native request");
  }
  expect(replayedThoughts(third)).toEqual([{ text: SIGNED_THOUGHT, thought: true, thoughtSignature: SIGNATURE }]);
  // The positive control: the same script rewrote both earlier replies in this prompt copy.
  expect(JSON.stringify(third).split("The KETTLE sings.")).toHaveLength(3);
});
