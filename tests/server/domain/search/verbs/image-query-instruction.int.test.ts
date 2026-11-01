// A text-to-image query carries the image scope's retrieval instruction to an embedder that honours one, and only the
// query side moves: stored image vectors keep their document instruction, so the space is unchanged.
// @subject packages/server/src/domain/search/verbs/images.ts
// @subject packages/server/src/domain/embeddings/verbs/runtime-connection.ts
// @subject packages/inference/src/backends/openai-compat/image-embed.ts
import { readFile } from "node:fs/promises";
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { z } from "zod";

const QUERY = "a silver-haired archivist";
const conversationSchema = z.array(z.object({ role: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })) }));

async function imageSearch(instructionAware: boolean): Promise<{ readonly system: string | undefined; readonly stored: readonly (string | undefined)[] }> {
  const conversations: z.infer<typeof conversationSchema>[] = [];
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: (input) => {
      conversations.push(conversationSchema.parse(JSON.parse(input)));
      return CORPUS_EMBEDDING_VECTOR;
    },
    chatText: "unused",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  const { embed } = await seedCorpusConnections(root, principal);
  await root.services.connection.update({
    principal,
    connectionId: embed.id,
    patch: {
      declared: {
        kind: "embedding",
        embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: 8192, input: ["text", "image"], instructionAware },
        features: { detectServer: false },
      },
    },
  });
  await root.services.connection.setBinding({ principal, task: "imageEmbed", connectionId: embed.id });
  const bytes = await readFile(new URL(import.meta.resolve("@orb/default-content/avatars/birdie.png")));
  const avatar = await root.services.assets.store({ principal, kind: "avatar", mime: "image/png", bytes });
  await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ name: "birdie", handle: "birdie", description: "An avatar-bearing card.", avatarAssetId: avatar.assetId }),
  });
  await root.app.embeddings.indexAsset(avatar.assetId, { force: true });
  await root.app.embeddings.embedAssets({ ownerId: principal.userId, force: false, signal: new AbortController().signal });
  await root.settleBackground();
  const hits = await root.services.search.images({ ownerId: principal.userId, query: QUERY, topN: 1, lens: "image-raw" });
  expect(hits).toHaveLength(1);
  const isQuery = (conversation: z.infer<typeof conversationSchema>): boolean => conversation.at(-1)?.content.some((part) => part.text === QUERY) === true;
  const systemOf = (conversation: z.infer<typeof conversationSchema> | undefined): string | undefined => conversation?.[0]?.content[0]?.text;
  return { system: systemOf(conversations.find(isQuery)), stored: conversations.filter((conversation) => !isQuery(conversation)).map(systemOf) };
}

test("an instruction-aware embedder receives a scope instruction in place of the wire default, and stored images keep theirs", async () => {
  const aware = await imageSearch(true);
  const unaware = await imageSearch(false);
  expect(unaware.system).toBeDefined();
  expect(aware.system).toBeDefined();
  expect(aware.system).not.toBe(unaware.system);
  expect(aware.stored).toEqual(unaware.stored);
  expect(aware.stored.length).toBeGreaterThan(0);
  expect(aware.stored).not.toContain(aware.system);
});
