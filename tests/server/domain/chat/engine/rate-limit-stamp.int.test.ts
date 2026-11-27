// @subject packages/server/src/domain/chat/engine/provider-bridge.ts
// @subject packages/server/src/domain/chat/persistence/queries.ts
// A reply the provider answered under a rate-limit warning carries the reset moment on the committed view and on every
// later read of the room; a reply under no pressure carries nothing.

import { builtinProvider, modelIdSchema } from "@orb/contracts/inference";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  createChatRoot,
  createCorpusProviderExecution,
  SECRET_BOX_TEST_KEY,
} from "@orb/testkit/node/composed";
import { anthropicTextReply } from "@orb/testkit/node/helpers";

const MODEL = modelIdSchema.parse("claude-opus-5");
const REQUESTS_LIMIT = 100;
const RESET_AT = "2026-06-01T12:00:00.000Z";

test("a warned reply keeps the provider's reset moment and a relaxed reply keeps none", async () => {
  const endpoint = builtinProvider("anthropic")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("Anthropic provider has no endpoint");
  }
  const provider = createCorpusProviderExecution({
    baseUrl: endpoint,
    modelIds: [MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    images: [],
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    anthropicMessages: () => anthropicTextReply(MODEL, "The lamp is lit."),
  });
  // Only the provider's response headers are scripted: the first call is near its limit, the second has headroom.
  let remaining = 5;
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: { secretBoxKey: SECRET_BOX_TEST_KEY, networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) } },
    providerFetch: async (input, init) => {
      const reply = await provider.execute(new Request(input, init));
      const headers = new Headers(reply.headers);
      headers.set("anthropic-ratelimit-requests-limit", String(REQUESTS_LIMIT));
      headers.set("anthropic-ratelimit-requests-remaining", String(remaining));
      headers.set("anthropic-ratelimit-requests-reset", RESET_AT);
      return new Response(reply.body, { status: reply.status, headers });
    },
  });
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "anthropic", key: "controlled-corpus-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "anthropic",
    credentialId: credential.id,
    baseUrl: null,
    model: MODEL,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });

  const warned = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } });
  remaining = REQUESTS_LIMIT;
  const relaxed = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } });

  const resetsAt = Date.parse(RESET_AT);
  expect(warned.messages.at(-1)?.rateLimit).toEqual({ status: "allowed_warning", resetsAt });
  expect(relaxed.messages.at(-1)?.rateLimit).toBeNull();
  const listed = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.filter((row) => row.role === "assistant");
  expect(listed.map((row) => row.rateLimit)).toEqual([{ status: "allowed_warning", resetsAt }, null]);
});
