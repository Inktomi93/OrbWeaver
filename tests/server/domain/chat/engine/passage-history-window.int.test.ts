// @subject packages/server/src/domain/chat/substrate/wire-history.ts
// @subject packages/inference/src/backends/openai-compat/tokens.ts
import { modelIdSchema } from "@orb/contracts/inference";
import { appendedBy } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { TranscriptLine } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  createChatRoot,
  createCorpusProviderExecution,
  loadCorpusPassageEncoder,
} from "@orb/testkit/node/composed";
import { z } from "zod";

const WINDOW = 4096;
const OUTPUT = 128;
const ledgerModel = modelIdSchema.parse("Qwen3.8-27B-Orca-Uncensored-INT8");
const passage = z.object({ model: z.literal(ledgerModel), prompt: z.string(), ["add_special_tokens"]: z.literal(false) });
const sentMessage = z.object({ content: z.union([z.string(), z.array(z.object({ text: z.string() }))]) });
const sent = z.object({ messages: z.array(sentMessage) });

test("a tokenizing connection fits the delivered numeric ledger inside its declared hard window", { timeout: 60_000 }, async () => {
  const corpusTokenIds = await loadCorpusPassageEncoder(new URL("./fixtures/qwen3.8-27b-tokenizer.json.gz", import.meta.url));
  const transcript = Array.from(
    { length: 48 },
    (_, row): TranscriptLine => ({
      role: row % 2 === 0 ? "user" : "assistant",
      content: `Ledger ${row} | ${Array.from({ length: 24 }, (_cell, col) => String((row + 1) * (col + 1) * 10_007)).join(" ")}`,
    }),
  );
  const requests: string[][] = [];
  const corpus = createCorpusProviderExecution({
    modelIds: [ledgerModel],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: (body) => {
      const { messages } = sent.parse(JSON.parse(body));
      const texts = messages.map(({ content }) => (typeof content === "string" ? content : content.map(({ text }) => text).join("")));
      requests.push(texts);
      const delivered = texts.reduce((total, text) => total + corpusTokenIds(text).length, 0);
      return String(delivered);
    },
  });
  const measured: string[] = [];
  await using h = await createChatRoot({
    memoryEnabled: false,
    transcript,
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname !== "/tokenize") {
        return await corpus.execute(request);
      }
      const { prompt } = passage.parse(await request.json());
      measured.push(prompt);
      return Response.json({ tokens: corpusTokenIds(prompt) });
    },
  });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "vllm",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: ledgerModel,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: WINDOW } }, features: { detectServer: false } },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const { newest: messages } = await appendedBy(requests, () =>
    h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { maxOutputTokens: OUTPUT } }),
  );
  const inputTokens = messages.reduce((total, text) => total + corpusTokenIds(text).length, 0);
  expect(inputTokens + OUTPUT).toBeLessThanOrEqual(WINDOW);
  expect(messages.join("\n")).toContain(transcript.at(-1)?.content);
  expect(measured.some((text) => text.includes("Ledger "))).toBe(true);
});
