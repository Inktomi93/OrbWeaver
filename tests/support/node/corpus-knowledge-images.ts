// Valid bundled avatar pixels enter real storage, native GIF decoding and both image embedding lenses.
import { createCharacterSchema } from "@orb/contracts/character";
import { assets } from "@orb/db";
import { readSeedAvatar } from "@orb/default-content";
import { WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import { seedUserConnectionRows } from "./factories/rows/connection.ts";
import { seedEmbeddedCorpusRows, seedIndexedAssetRows } from "./factories/rows/embedding-generation.ts";
import type { ServerTestHarness } from "./server.ts";

export const CORPUS_KNOWLEDGE_IMAGE_SIZES = [
  { width: 64, height: 96 },
  { width: 96, height: 64 },
] as const;
type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
interface CorpusKnowledgeImages {
  readonly connection: Awaited<ReturnType<typeof seedUserConnectionRows>>;
  readonly cards: readonly Awaited<ReturnType<CorpusCaller["character"]["create"]>>[];
  readonly assets: readonly (typeof assets.$inferSelect)[];
  readonly indexed: readonly Awaited<ReturnType<typeof seedIndexedAssetRows>>[];
  readonly repeated: readonly Awaited<ReturnType<typeof seedIndexedAssetRows>>[];
  readonly cardVectors: Awaited<ReturnType<typeof seedEmbeddedCorpusRows>>;
  readonly facets: Awaited<ReturnType<CorpusCaller["discovery"]["imageFacets"]>>;
  readonly members: Awaited<ReturnType<CorpusCaller["discovery"]["charactersByImageFacet"]>>;
  readonly families: Awaited<ReturnType<CorpusCaller["discovery"]["visualArchetypes"]>>;
  readonly duplicates: Awaited<ReturnType<CorpusCaller["discovery"]["imageDuplicates"]>>;
  readonly alignment: Awaited<ReturnType<CorpusCaller["discovery"]["portraitAlignment"]>>;
}

/** Real owner admission and native indexers determine every geometry, generation and facet row. */
export async function seedCorpusKnowledgeImages(root: ServerTestHarness): Promise<CorpusKnowledgeImages> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const connection = await seedUserConnectionRows(root, {
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_EMBED_MODEL,
    allowBackground: true,
    declared: {
      kind: "embedding",
      embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: 8192, input: ["text", "image"] },
      features: { detectServer: false },
    },
  });
  await caller.connection.setBinding({ task: "imageEmbed", connectionId: connection.id });
  const avatar = await readSeedAvatar(WELCOME_ASSISTANT_HANDLE);
  if (avatar === null) {
    throw new Error("the bundled corpus avatar pixels are missing");
  }
  const cards: CorpusKnowledgeImages["cards"][number][] = [];
  const storedRows: CorpusKnowledgeImages["assets"][number][] = [];
  const indexed: CorpusKnowledgeImages["indexed"][number][] = [];
  const repeated: CorpusKnowledgeImages["repeated"][number][] = [];
  for (const [index, size] of CORPUS_KNOWLEDGE_IMAGE_SIZES.entries()) {
    const bytes = await sharp(Buffer.from(avatar.bytes))
      .resize({ ...size, fit: "fill" })
      .gif()
      .toBuffer();
    const stored = await root.app.assets.store({ principal, bytes, kind: "avatar", mime: "image/gif", enforceMagic: true });
    const card = await caller.character.create({
      input: createCharacterSchema.parse({
        handle: `knowledge-image-${index}`,
        name: `Orbital portrait ${index}`,
        description: "An illustrated traveller preserves the orbital ledger.",
      }),
    });
    const updated = await root.services.character.update({ principal, characterId: card.id, input: { avatarAssetId: stored.assetId } });
    await root.settleBackground();
    const row = await root.db.select().from(assets).where(eq(assets.id, stored.assetId)).get();
    if (row === undefined) {
      throw new Error("native avatar storage left no canonical asset row");
    }
    cards.push(updated);
    storedRows.push(row);
    indexed.push(await seedIndexedAssetRows(root, [stored.assetId, { force: false }]));
    repeated.push(await seedIndexedAssetRows(root, [stored.assetId, { force: false }]));
  }
  const cardVectors = await seedEmbeddedCorpusRows(root, {
    ownerId: root.ownerId,
    force: false,
    signal: new AbortController().signal,
  });
  return {
    connection,
    cards,
    assets: storedRows,
    indexed,
    repeated,
    cardVectors,
    facets: await caller.discovery.imageFacets(),
    members: await caller.discovery.charactersByImageFacet({ facet: "artStyle", value: "illustration" }),
    families: await caller.discovery.visualArchetypes({ k: 1 }),
    duplicates: await caller.discovery.imageDuplicates(),
    alignment: await caller.discovery.portraitAlignment(),
  };
}
