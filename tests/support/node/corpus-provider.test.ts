// @subject tests/support/node/corpus-provider.ts
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_PROVIDER_ENDPOINT, createCorpusProviderExecution } from "./corpus-provider.ts";
import { expect, test } from "./fixtures.ts";

function postConversation(content: readonly object[]): Promise<Response> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  return provider.execute(`${CORPUS_PROVIDER_ENDPOINT}/embeddings`, {
    method: "POST",
    body: JSON.stringify({ model: CORPUS_EMBED_MODEL, dimensions: 3, ["add_generation_prompt"]: true, messages: [{ role: "user", content }] }),
  });
}

test.each([
  { name: "empty content", content: [] },
  { name: "malformed supplied image URL", content: [{ type: "image_url", ["image_url"]: { url: "not-an-image-url" } }] },
])("physical multimodal embedding admission refuses $name", async ({ content }) => {
  await expect(postConversation(content)).rejects.toThrow();
});

test("physical multimodal embedding admission preserves nonempty text conversations", async () => {
  const text = await postConversation([{ type: "text", text: "A nonempty embedding conversation." }]);
  expect(text.status).toBe(200);
  expect(await text.json()).toMatchObject({ model: CORPUS_EMBED_MODEL, data: [{ index: 0, embedding: [...CORPUS_EMBEDDING_VECTOR] }] });
});
