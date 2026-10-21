// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/rpg/tools/rounds/tool-round.ts
import "@orb/testkit/node/composed-real.ts";
import { RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const SENT_WINDOW = 16_384;
const TRAINED_WINDOW = 32_768;
const NARRATIVE = "The keeper waits for the state round.";

function nativeCatalogReply(path: string): Response | undefined {
  if (path.endsWith("/api/version")) {
    return Response.json({ version: "0.15.5" });
  }
  if (path.endsWith("/api/ps")) {
    return Response.json({ models: [] });
  }
  if (path.endsWith("/api/show")) {
    return Response.json({
      parameters: "num_ctx 4096",
      ["model_info"]: { ["general.architecture"]: "orb_fixture", ["orb_fixture.context_length"]: TRAINED_WINDOW },
      capabilities: ["completion", "tools"],
    });
  }
  return undefined;
}

function nativeChatReply(story: boolean, stream: boolean): Response {
  const message = story
    ? { role: "assistant", content: NARRATIVE }
    : { role: "assistant", content: "", ["tool_calls"]: [{ function: { name: RPG_NO_CHANGES_TOOL, arguments: {} } }] };
  const frame = { model: CORPUS_TEXT_MODEL, message, done: true, ["done_reason"]: "stop", ["prompt_eval_count"]: 4, ["eval_count"]: 2 };
  return new Response(`${JSON.stringify(frame)}\n`, { headers: { "content-type": stream ? "application/x-ndjson" : "application/json" } });
}

test("the real post-commit state round sends the character turn's resolved native window rather than its saved floor", async () => {
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const sent: JsonValue[] = [];
  let qualifying = false;
  await using h = await createChatRoot({
    memoryEnabled: false,
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
    providerFetch: async (input, init): Promise<Response> => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      const advertised = nativeCatalogReply(path);
      if (advertised !== undefined) {
        return advertised;
      }
      if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/api/chat")) {
        return await corpus.execute(request);
      }
      const body = jsonValueSchema.parse(JSON.parse(await request.clone().text()));
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("the native window control received no actual request object");
      }
      if (qualifying) {
        sent.push(body);
      }
      if (sent.length > 2) {
        throw new Error("the finite native window script has no third generation");
      }
      return nativeChatReply(!qualifying || sent.length === 1, body["stream"] === true);
    },
  });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "ollama",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: {
        input: ["text"],
        context: { window: 4096, windowEstimated: true },
        tools: { parallel: true, silencesProse: true, requiredChoice: false },
      },
      features: { detectServer: false, nativeChat: "ollama" },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  await h.root.services.rpg.createGame({ principal: h.owner, chatId: h.chatId, mode: "lite" });
  await h.root.services.rpg.updateConfig({ principal: h.owner, chatId: h.chatId, extractionMode: "cheap", patch: { stateCaptureVehicle: "tools" } });
  expect(await h.caller.connection.capabilities({ connectionId: connection.id })).toMatchObject({
    capability: { kind: "generation", generation: { context: { window: 4096, settable: { max: TRAINED_WINDOW } } } },
  });
  qualifying = true;
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { maxContextTokens: SENT_WINDOW } });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ content: NARRATIVE }]);
  await h.root.settleBackground();
  expect(sent).toHaveLength(2);
  expect(sent).toMatchObject([{ options: { ["num_ctx"]: SENT_WINDOW } }, { options: { ["num_ctx"]: SENT_WINDOW } }]);
  expect(await h.root.services.rpg.listTurnToolCalls({ principal: h.owner, chatId: h.chatId })).toMatchObject([
    { messageId: outcome.messages[0]?.id, calls: [{ name: RPG_NO_CHANGES_TOOL }], failure: null },
  ]);
});
