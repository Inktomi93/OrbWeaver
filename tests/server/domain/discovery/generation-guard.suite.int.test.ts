// Discovery reads only the owner's current generation. A generation switch deletes the old vectors and the store
// refuses a late write for a retired generation, so this second belt is for a row that arrives any other way, at
// another width under the same model tag. This suite plants such a row in every vector table and runs every
// in-memory pass: none may throw on the width mismatch, and none may report the late rows.

import type { Db } from "@orb/db";
import { characterEmbeddings, characterSummaries, characters, chatDigests, chatSegments, embedGenerations, imageEmbeddings } from "@orb/db";
import type { AssetId, CharacterId, ChatId, EmbedGenerationId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { computeGroupHubs } from "../../../../packages/server/src/domain/discovery/substrate/hub-math.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import {
  EMBED_MODEL,
  FROZEN_AT,
  makeDiscoveryHarness,
  makeHubScoreRecorder,
  seedAsset,
  seedCharacter,
  seedCharacterEmbedding,
  seedChatDigest,
  seedChatSegment,
  seedHostedChat,
  seedImageEmbedding,
  seedUser,
  vec,
} from "./_support.ts";

/** The late rows' width — anything but the current generation's. */
const LATE_DIMS = 512;

function lateVector(seed: number): Float32Array {
  return Float32Array.from({ length: LATE_DIMS }, (_value, i) => ((i + seed) % 7) + 1);
}

interface Corpus {
  readonly owner: UserId;
  readonly chat: ChatId;
  readonly cards: readonly CharacterId[];
}

async function staleGeneration(db: Db, ownerId: UserId, task: "embed" | "imageEmbed"): Promise<EmbedGenerationId> {
  const id = castId<EmbedGenerationId>(`embed_generation_stale_${task}`);
  await db.insert(embedGenerations).values({
    id,
    ownerId,
    task,
    via: task,
    connectionId: null,
    connectionRef: castId<UserConnectionId>("user_connection_stale"),
    fingerprint: "stale",
    space: EMBED_MODEL,
    createdAt: FROZEN_AT,
  });
  return id;
}

/** The current corpus at the fixture's width, plus a late row at another width beside every one of it. */
async function seedMixedCorpus(db: Db): Promise<Corpus> {
  const owner = await seedUser(db, "user_generation_guard");
  const chat = await seedHostedChat(db, "chat_guard", owner);
  const other = await seedHostedChat(db, "chat_guard_other", owner);
  const cards: CharacterId[] = [];
  for (const [i, embedding] of [vec(1, 0), vec(1, 0.01), vec(0, 1)].entries()) {
    const asset: AssetId = await seedAsset(db, `asset_guard_${i}`, owner);
    const card = await seedCharacter(db, { id: `character_guard_${i}`, ownerId: owner, avatarAssetId: asset });
    await seedCharacterEmbedding(db, { characterId: card, embedding });
    await seedImageEmbedding(db, { id: `image_embedding_guard_${i}`, assetId: asset, embedding });
    await seedImageEmbedding(db, {
      id: `image_embedding_guard_caption_${i}`,
      assetId: asset,
      embedding,
      lens: "image-captioned",
      caption: "a portrait",
      captionMeta: { rating: "safe", artStyle: "anime" },
    });
    cards.push(card);
  }
  for (const [i, chatId] of [chat, chat, other].entries()) {
    await seedChatDigest(db, {
      id: `chat_digest_guard_${i}`,
      chatId,
      embedding: vec(1, i * 0.01),
      blockIdx: i,
      ...(cards[0] === undefined ? {} : { scopedCharacterId: cards[0] }),
    });
    await seedChatSegment(db, { id: `chat_segment_guard_${i}`, chatId, embedding: vec(1, i * 0.01), blockIdx: i });
  }

  const lateText = await staleGeneration(db, owner, "embed");
  const lateImage = await staleGeneration(db, owner, "imageEmbed");
  for (const [i, card] of cards.entries()) {
    await db.insert(characterEmbeddings).values({
      id: castId(`character_embedding_late_${i}`),
      characterId: card,
      embedding: lateVector(i),
      contentHash: `late_card_${i}`,
      model: EMBED_MODEL,
      generationId: lateText,
      dim: LATE_DIMS,
      createdAt: FROZEN_AT,
    });
    const avatar = (await db.select({ avatar: characters.avatarAssetId }).from(characters).where(eq(characters.id, card)))[0]?.avatar;
    if (avatar === null || avatar === undefined) {
      throw new Error("the fixture card has an avatar");
    }
    await db.insert(imageEmbeddings).values({
      id: castId(`image_embedding_late_${i}`),
      assetId: avatar,
      embedding: lateVector(i),
      lens: "image-raw",
      contentHash: `late_image_${i}`,
      model: EMBED_MODEL,
      generationId: lateImage,
      dim: LATE_DIMS,
      createdAt: FROZEN_AT,
    });
  }
  for (const [i, chatId] of [chat, other].entries()) {
    await db.insert(chatDigests).values({
      id: castId(`chat_digest_late_${i}`),
      chatId,
      scopedCharacterId: cards[0] ?? castId<CharacterId>("character_guard_0"),
      tier: 0,
      blockIdx: 0,
      text: "late digest",
      embedding: lateVector(i),
      contentHash: `late_digest_${i}`,
      model: EMBED_MODEL,
      generationId: lateText,
      dim: LATE_DIMS,
      createdAt: FROZEN_AT,
    });
    await db.insert(chatSegments).values({
      id: castId(`chat_segment_late_${i}`),
      chatId,
      blockIdx: 0,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text: "late segment",
      embedding: lateVector(i),
      contentHash: `late_segment_${i}`,
      model: EMBED_MODEL,
      generationId: lateText,
      dim: LATE_DIMS,
      createdAt: FROZEN_AT,
    });
  }
  return { owner, chat, cards };
}

describe("discovery never meets a late write from an old generation", () => {
  // The positive control: the hub math over the fixture's card rows, both generations at once, throws on
  // the mixed widths — so a pass that does not throw below really filtered the late rows out.
  test("the fixture really mixes widths: the hub math over every card row throws", async () => {
    const db = await freshDb();
    await seedMixedCorpus(db);
    const rows = await db.select({ embedding: characterEmbeddings.embedding }).from(characterEmbeddings);
    expect(new Set(rows.map((row) => row.embedding.length)).size).toBe(2);
    expect(() => computeGroupHubs(rows.map((row) => row.embedding))).toThrow(/dim mismatch/u);
  });

  test("the hub passes score only current-generation rows", async () => {
    const db = await freshDb();
    await seedMixedCorpus(db);
    const hubScores = makeHubScoreRecorder();
    const svc = createDiscoveryService(makeDiscoveryHarness(db, { hubScores }).ctx);
    await svc.computeCharacterHubScores();
    await svc.computeDigestHubScores();
    await svc.computeSegmentHubScores();
    await svc.computeImageHubScores();
    const scored = hubScores.calls.flatMap((call) => call.updates.map((update) => update.id));
    expect(scored.length).toBeGreaterThan(0);
    expect(scored.filter((id) => id.includes("_late_"))).toEqual([]);
  });

  test("duplicates, themes and projections run over the current generation alone", async () => {
    const db = await freshDb();
    const { owner, chat, cards } = await seedMixedCorpus(db);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await svc.computeDuplicatePairs();
    await svc.computeThemes({ k: 2, funderUserId: owner });
    const points = await svc.corpusProjection(owner);
    expect(points.map((point) => point.characterId).toSorted()).toEqual([...cards].toSorted());
    // The graph plots only cards with a neighbour, so it is a subset of the current cards, each once.
    const graph = await svc.similarityGraph(owner);
    const nodes = graph.nodes.map((node) => node.characterId);
    expect(nodes.every((id) => cards.includes(id))).toBe(true);
    expect(new Set(nodes).size).toBe(nodes.length);
    await expect(svc.similarChats(owner, chat)).resolves.toBeDefined();
    await expect(svc.archetypes(owner, { k: 1 })).resolves.toBeDefined();
  });

  test("the image analytics and the dossier pair current card and avatar vectors only", async () => {
    const db = await freshDb();
    const { owner, cards } = await seedMixedCorpus(db);
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);
    await expect(svc.imageDuplicates(owner)).resolves.toBeDefined();
    await expect(svc.visualArchetypes(owner, 2)).resolves.toBeDefined();
    const alignment = await svc.portraitAlignment(owner);
    expect(alignment.characters.map((row) => row.characterId).toSorted()).toEqual([...cards].toSorted());
    const facets = await svc.imageFacets(owner);
    expect(facets).toBeDefined();
    const hero = cards[0];
    if (hero === undefined) {
      throw new Error("the fixture has cards");
    }
    // The dossier opens only for a distilled card.
    await db.insert(characterSummaries).values({ characterId: hero, genre: "fantasy", model: "test-summarize-model", computedAt: FROZEN_AT });
    await expect(svc.characterDossier(owner, hero)).resolves.toMatchObject({ characterId: hero });
  });
});
