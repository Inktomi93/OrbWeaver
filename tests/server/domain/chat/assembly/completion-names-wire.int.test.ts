// A `completion` preset on a vLLM row: the speaker rides the `name` field only when the turn does not merge same-role
// rows. An unmeasured model runs the merging floor unless the preset's role handling says otherwise, so the default inlines.
// @subject packages/server/src/domain/chat/assembly/names.ts

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { isPlainObject } from "@orb/kit/guards";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { wireOf } from "../scenario-physical.ts";

const PROBE = "Reply with exactly: names-probe-ok";

interface WireRow {
  readonly role: unknown;
  readonly content: unknown;
  readonly name: unknown;
}

async function room(promptConfig: PromptConfig): Promise<ChatRoot> {
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A named reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      promptConfig,
      providerFetch: async (input, init) => await corpus.execute(new Request(input, init)),
    }),
  );
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "vllm",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  construction.move();
  return h;
}

/** The user rows of the newest chat request the act sent the provider. */
async function userRowsOnWire(h: ChatRoot, act: () => Promise<unknown>): Promise<readonly WireRow[]> {
  const { newest } = await wireOf(h, act);
  const messages: unknown = isPlainObject(newest) ? newest["messages"] : undefined;
  if (!Array.isArray(messages)) {
    throw new Error("the provider received no chat request");
  }
  return messages.flatMap((row: unknown): WireRow[] =>
    isPlainObject(row) && row["role"] === "user" ? [{ role: row["role"], content: row["content"], name: row["name"] }] : [],
  );
}

test("role handling none carries the speaker in the name field and leaves the content alone", async () => {
  await using h = await room({
    ...DEFAULT_PROMPT_CONFIG,
    namesBehavior: "completion",
    params: { ...DEFAULT_PROMPT_CONFIG.params, advanced: { roleHandling: "none" } },
  });
  expect(await userRowsOnWire(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: PROBE }))).toContainEqual({
    role: "user",
    content: PROBE,
    name: DEFAULT_PERSONA_NAME,
  });
});

test("the default floor inlines the speaker, so no name field reaches the wire", async () => {
  await using h = await room({ ...DEFAULT_PROMPT_CONFIG, namesBehavior: "completion" });
  const rows = await userRowsOnWire(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: PROBE }));
  expect(rows.map(({ name }) => name)).toEqual(rows.map(() => undefined));
  expect(rows.some(({ content }) => typeof content === "string" && content.includes(`${DEFAULT_PERSONA_NAME}: ${PROBE}`))).toBe(true);
});
