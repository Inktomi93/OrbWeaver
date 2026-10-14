// @subject tests/support/node/corpus-knowledge-variants.ts
// @subject tests/support/node/corpus-knowledge-images.ts
// @subject tests/support/node/corpus-knowledge-wire.ts
import "@orb/testkit/node/composed-real.ts";
import { assertReferentialIntegrity } from "@orb/db";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors } from "@orb/testkit/node/corpus-seed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import sharp from "sharp";
import { CORPUS_KNOWLEDGE_IMAGE_SIZES } from "./corpus-knowledge-images.ts";
import { seedCorpusKnowledgeVariants } from "./corpus-knowledge-variants.ts";
import { CORPUS_KNOWLEDGE_SWIPE_TAKES, corpusKnowledgeVariantsText, createKnowledgeSwipeWire } from "./corpus-knowledge-wire.ts";

test("default-grid canon produces real arc themes and selected reroll hotspots while valid GIF avatars acquire both geometry lenses and facets", async () => {
  const swipes = createKnowledgeSwipeWire();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: corpusKnowledgeVariantsText,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: swipes.completion,
  });
  const imageRequests: string[] = [];
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && new URL(request.url).pathname === "/v1/embeddings") {
      const body = await request.clone().text();
      if (body.includes('"messages":')) {
        imageRequests.push(body);
      }
    }
    return await physical.execute(request);
  };
  await using root = await createServerHarness({ providerFetch });
  const { secondUserId } = await seedCorpusActors(root);
  const result = await seedCorpusKnowledgeVariants(root);
  expect(result.memoryJobs).toMatchObject([{ kind: "memory-backfill", status: "succeeded", ownerId: root.ownerId }]);
  expect(result.themeJobs).toMatchObject([{ kind: "compute-themes", status: "succeeded", ownerId: root.ownerId }]);
  const higher = result.memory.digests.filter((digest) => digest.tier > 0);
  expect(higher.length).toBeGreaterThan(0);
  expect(higher.every((digest) => digest.text.includes("preserved the harbor witnesses"))).toBe(true);
  const arcs = result.themes.clusters.filter((cluster) => cluster.level === "arc");
  expect(arcs.length).toBeGreaterThan(0);
  expect(result.home.arcThemes.map((theme) => theme.id)).toEqual(arcs.map((cluster) => cluster.id));
  expect(result.arcDetails.map((detail) => detail?.id)).toEqual(result.home.arcThemes.map((theme) => theme.id));
  const assignments = result.themes.assignments.filter((row) => higher.some((digest) => digest.id === row.digestId));
  expect(assignments.length).toBeGreaterThan(0);
  const storyTimes = result.history.flatMap((turn) => turn.messages.map((message) => message.createdAt));
  expect(assignments.every((row) => row.msgMidAt !== null && storyTimes.includes(row.msgMidAt))).toBe(true);
  expect(assignments.every((row) => row.msgMidAt !== row.computedAt)).toBe(true);
  expect(result.singleTake).toEqual([]);
  expect(result.firstHotspot).toMatchObject([
    { messageId: result.slot.id, characterId: result.character.id, variantCount: 2, snippet: CORPUS_KNOWLEDGE_SWIPE_TAKES[1] },
  ]);
  expect(result.secondHotspot).toMatchObject([{ messageId: result.slot.id, variantCount: 3, snippet: CORPUS_KNOWLEDGE_SWIPE_TAKES[2] }]);
  expect(result.selectedHotspot).toMatchObject([{ messageId: result.slot.id, variantCount: 3, snippet: CORPUS_KNOWLEDGE_SWIPE_TAKES[0] }]);
  expect(result.variants.map((variant) => variant.content)).toEqual([...CORPUS_KNOWLEDGE_SWIPE_TAKES]);
  expect(result.slot.selectedVariantId).toBe(result.variants[0]?.id);
  expect(result.selected.selectedVariantId).toBe(result.slot.selectedVariantId);
  expect(result.swipedOnce.messages.map((message) => message.id)).toEqual([result.slot.id]);
  expect(result.swipedTwice.messages.map((message) => message.id)).toEqual([result.slot.id]);
  expect(swipes.remaining()).toBe(0);
  expect(swipes.requests).toHaveLength(3);
  expect(result.images.assets.map(({ width, height }) => ({ width, height }))).toEqual([...CORPUS_KNOWLEDGE_IMAGE_SIZES]);
  expect(result.images.assets.every((asset) => asset.kind === "avatar" && asset.mime === "image/gif")).toBe(true);
  for (const [index, capture] of result.images.indexed.entries()) {
    expect(capture.skip).toBeUndefined();
    expect(capture.vectors.map((row) => row.lens)).toEqual(["image-captioned", "image-raw"]);
    expect(capture.vectors.every((row) => row.assetId === result.images.assets[index]?.id && row.dim === CORPUS_EMBEDDING_VECTOR.length)).toBe(true);
    expect(new Set(capture.vectors.map((row) => row.generationId)).size).toBe(1);
    expect(capture.analysis).toMatchObject({
      contentHash: result.images.assets[index]?.hash,
      captionMeta: { model: CORPUS_TEXT_MODEL, artStyle: "illustration" },
    });
    expect(capture.vectors.every((row) => row.contentHash === capture.analysis?.contentHash)).toBe(true);
    expect(capture.analysis?.revision).toBeGreaterThan(0);
    expect(result.images.repeated[index]?.vectors).toEqual(capture.vectors);
  }
  const normalizedImages = await Promise.all(
    imageRequests
      .flatMap((body) => [...body.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/gu)])
      .map(async (match) => {
        const bytes = Buffer.from(match[1] ?? "", "base64");
        expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        const metadata = await sharp(bytes).metadata();
        expect(metadata.format).toBe("png");
        return { width: metadata.width, height: metadata.height };
      }),
  );
  for (const size of CORPUS_KNOWLEDGE_IMAGE_SIZES) {
    expect(normalizedImages.filter((image) => image.width === size.width && image.height === size.height).length).toBeGreaterThanOrEqual(2);
  }
  expect(result.images.facets.total).toBe(2);
  expect(result.images.facets.artStyles).toEqual([{ value: "illustration", count: 2 }]);
  expect(result.images.members.map((member) => member.characterId).toSorted()).toEqual(result.images.cards.map((card) => card.id).toSorted());
  expect(result.images.families.flatMap((family) => family.members.map((member) => member.characterId)).toSorted()).toEqual(
    result.images.cards.map((card) => card.id).toSorted(),
  );
  expect(result.images.duplicates).toHaveLength(1);
  expect(result.images.alignment.characters.map((row) => row.characterId).toSorted()).toEqual(result.images.cards.map((card) => card.id).toSorted());
  const stranger = await root.internalCallerFor(secondUserId);
  expect(await stranger.discovery.swipeHotspots({ chatId: result.room.chat.id })).toEqual([]);
  expect(await stranger.discovery.charactersByImageFacet({ facet: "artStyle", value: "illustration" })).toEqual([]);
  expect((await stranger.discovery.home()).arcThemes).toEqual([]);
  await assertReferentialIntegrity(root.db);
});
