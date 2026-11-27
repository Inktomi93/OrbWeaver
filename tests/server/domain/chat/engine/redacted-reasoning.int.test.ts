// @subject packages/server/src/domain/chat/persistence/queries.ts
// @subject packages/server/src/domain/chat/persistence/canon-write.ts
// A reply whose provider redacted its reasoning reads as redacted from the room read and the committed view the turn
// returns, a reply with ordinary reasoning does not, and the opaque payload never reaches the view.

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
import { messageEnd, messageStart, redactedThinkingBlock, textBlock, thinkingBlock } from "@orb/testkit/node/helpers";

const MODEL = modelIdSchema.parse("claude-opus-5");
const REDACTED_PAYLOAD = "REDACTED-PAYLOAD";
const THOUGHT = "The keeper weighs the lamp.";
const SIGNATURE = "sig-1";

test("a redacted thinking block marks the stored reply redacted on every read, and ordinary reasoning does not", async () => {
  const endpoint = builtinProvider("anthropic")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("Anthropic provider has no endpoint");
  }
  let redactNext = true;
  const provider = createCorpusProviderExecution({
    baseUrl: endpoint,
    modelIds: [MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    images: [],
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    anthropicMessages: () => [
      messageStart(MODEL),
      ...(redactNext ? redactedThinkingBlock(0, REDACTED_PAYLOAD) : thinkingBlock(0, THOUGHT, SIGNATURE)),
      ...textBlock(1, "The lamp is lit."),
      ...messageEnd({ stopReason: "end_turn" }),
    ],
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: { secretBoxKey: SECRET_BOX_TEST_KEY, networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) } },
    providerFetch: provider.execute,
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

  const redacted = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } });
  redactNext = false;
  const ordinary = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } });
  const [first, second] = redacted.messages.concat(ordinary.messages);
  // The committed views the two turns return, then the same rows as a fresh room read hands them back.
  expect(first).toMatchObject({ reasoningRedacted: true });
  expect(second).toMatchObject({ reasoningRedacted: false, reasoning: THOUGHT });
  const listed = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages.filter((row) => row.role === "assistant");
  expect(listed.map((row) => row.reasoningRedacted)).toEqual([true, false]);
  expect(JSON.stringify(listed)).not.toContain(REDACTED_PAYLOAD);
});
