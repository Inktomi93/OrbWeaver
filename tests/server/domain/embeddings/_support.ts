// Shared test harness for the embeddings domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Builds real-db `EmbeddingsContext` / `EmbeddingsIndexerContext` bundles with injected
// determinism (frozen clock + seeded ids, composed from tests/support) and the sanctioned "fake at the edges,
// inject at the root" doctrine (testing §3):
//   • `roleClients` — a recording FAKE of the `@orb/contracts/role-clients` bundle: `embed`/`imageEmbed`
//     return a deterministic vector of `EMBED_DIM`; `summarize` returns the fixed avatar BREAKDOWN json
//     (`TEST_IMAGE_BREAKDOWN`) the one vision call is guided-decoded into. Each is a typed
//     `vi.fn` so tests assert calls + override with `mockResolvedValueOnce` (the dim-mismatch / embed-fail
//     cases). It is a real injected op, NOT an internal-module mock.
//   • `loadCardText` / `loadAssetBytes` — recording fakes for the indexer's canon re-readers.
// Seeds the FK parents (`users` → `characters` / `assets`) directly — a fixture may read/write `users` (the
// `no-direct-users-read` gate scopes only `packages/server/src/domain`).

import type { ImageBreakdown } from "@orb/contracts/embeddings";
import type { ProviderId } from "@orb/contracts/inference";
import type { ImageEmbedInput, RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { assets, characters, chatParticipants, chats, documents, userConnections } from "@orb/db";
import type {
  AssetId,
  CharacterEmbeddingId,
  CharacterHandle,
  CharacterId,
  ChatDigestId,
  ChatId,
  ChatParticipantId,
  ChatSegmentId,
  DocumentChunkId,
  DocumentId,
  Handle,
  ImageEmbeddingId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { Mock } from "vitest";
import { vi } from "vitest";
import type { EmbeddingsContext } from "../../../../packages/server/src/domain/embeddings/context.ts";
import type { EmbeddingsIndexerContext, EmbeddingsService } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { TEST_CONNECTION_ID, TEST_PROVIDER_ID } from "../../../support/factories/resolved-connection.ts";
import { makeFakeRoleClients } from "../../../support/factories/role-clients.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = FROZEN_AT_MS;

/** The test embed space `(model, dim)`. Small dim keeps vectors cheap; the model strings are the space tag. */
export const EMBED_DIM = 8;
export const EMBED_MODEL = "qwen3-embed-test";
export const IMAGE_EMBED_MODEL = "qwen3-vl-test";
export const SUMMARIZER_MODEL = "qwen3-summarize-test";
export const TEST_CAPTION = "a deterministic test caption";

/**
 * The avatar-analysis reply the fake summarize returns — the FULL breakdown, because that is what the one
 * vision call now asks for (issue #164). A stub that returns only prose makes `runStructuredTurn` fail, the
 * analysis degrade to skip-don't-write, and the captioned row silently never appear: the whole image half of
 * this domain's suite goes red for a reason that has nothing to do with what it is testing.
 *
 * Every scalar facet is required by the grammar, so this object is the SHAPE, not a sample of it — it is
 * `satisfies ImageBreakdown`, which makes a facet added to the contract a tsc error here rather than a
 * runtime parse failure in eight integration tests.
 */
const TEST_IMAGE_BREAKDOWN = {
  caption: TEST_CAPTION,
  artStyle: "anime",
  palette: "warm",
  mood: "cheerful",
  rating: "safe",
  shotType: "portrait",
  cameraAngle: "eye-level",
  gender: "female",
  coverage: "fully-covered",
  bodyType: "average",
  chestSize: "medium",
  skinTone: "fair",
  outfitType: "casual",
  clothingState: "intact",
  nudityLevel: "none",
  exposedParts: [],
  tags: ["test", "portrait", "fixture"],
} as const satisfies ImageBreakdown;

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const BYTE = 256;

/** A 24-byte buffer `@orb/kit/image-sniff` reads as a PNG of `(width, height)`: the 8-byte signature then the
 *  width/height u32BE fields at offsets 16/20 (the only bytes the sniffer parses for PNG). The image
 *  admission-floor tests seed a degenerate `pngBytes(1, 1)` and a real `pngBytes(64, 64)`. Arithmetic
 *  byte-composition, not bitwise (the kit-purity house rule the sniffer itself follows). */
export function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set(PNG_SIG, 0);
  const u32be = (n: number, at: number): void => {
    b[at] = Math.floor(n / (BYTE * BYTE * BYTE)) % BYTE;
    b[at + 1] = Math.floor(n / (BYTE * BYTE)) % BYTE;
    b[at + 2] = Math.floor(n / BYTE) % BYTE;
    b[at + 3] = n % BYTE;
  };
  u32be(width, 16);
  u32be(height, 20);
  return b;
}

/** A deterministic, non-zero `dim`-length vector (the `seed` distinguishes distinct embeds). */
export function fakeVector(dim: number = EMBED_DIM, seed = 1): Float32Array<ArrayBuffer> {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i += 1) {
    v[i] = ((i + seed) % 7) / 7 + 0.1;
  }
  return v;
}

export interface FakeRoleClients extends RoleClients {
  readonly embed: Mock<RoleClients["embed"]>;
  readonly imageEmbed: Mock<RoleClients["imageEmbed"]>;
  readonly rerank: Mock<RoleClients["rerank"]>;
  readonly summarize: Mock<RoleClients["summarize"]>;
  readonly structured: Mock<RoleClients["structured"]>;
}

/** The §10-3 joint-space ARM this fake's owner is in — the two ways an owner loses the image lens, plus the
 *  ordinary one. `no-binding` leaves the `imageEmbed` slot empty; `no-image-input` fills it with a model
 *  that declares text only, which a bare "is it bound?" check cannot tell apart from the joint arm. */
const FAKE_IMAGE_ARMS = ["joint", "no-binding", "no-image-input"] as const;
export type FakeImageArm = (typeof FAKE_IMAGE_ARMS)[number];

/** A recording fake `RoleClients` — deterministic vectors at `EMBED_DIM`, a fixed caption from `summarize`. */
export function makeRoleClients(vision = true, imageArm: FakeImageArm = "joint"): FakeRoleClients {
  // ONE vector per input, index-aligned — the real contract's shape, and load-bearing since the segment write
  // path batches (#172): a fake that always returned a single vector would fail every item past the first.
  const embed: Mock<RoleClients["embed"]> = vi.fn<RoleClients["embed"]>((input) =>
    Promise.resolve({
      vectors: (typeof input === "string" ? [input] : input).map((_, i) => fakeVector(EMBED_DIM, i + 1)),
      model: EMBED_MODEL,
      usage: { promptTokens: null, totalTokens: null },
    }),
  );
  const imageEmbed: Mock<RoleClients["imageEmbed"]> = vi.fn<RoleClients["imageEmbed"]>((req: ImageEmbedInput) =>
    Promise.resolve({
      vectors: [fakeVector(EMBED_DIM, req.kind === "multimodal" ? 3 : 2)],
      model: IMAGE_EMBED_MODEL,
    }),
  );
  const rerank: Mock<RoleClients["rerank"]> = vi.fn<RoleClients["rerank"]>(() =>
    Promise.resolve({ hits: [], model: "rerank-test", usage: { totalTokens: null } }),
  );
  const summarize: Mock<RoleClients["summarize"]> = vi.fn<RoleClients["summarize"]>(() =>
    Promise.resolve({
      items: [{ text: JSON.stringify(TEST_IMAGE_BREAKDOWN), usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
      model: SUMMARIZER_MODEL,
    }),
  );
  const structured: Mock<RoleClients["structured"]> = vi.fn<RoleClients["structured"]>((inputs, opts) => summarize(inputs, opts));
  // The caption lens reads `resolved("structured").capability` for the image-input fact (#2422): the scripted
  // view carries `input: ["text", "image"]` when `vision` is on and text-only otherwise.
  const base = makeFakeRoleClients({
    embed,
    imageEmbed,
    rerank,
    summarize,
    structured,
    summarizerVision: vision,
    ...(imageArm === "no-binding" ? { unbound: ["imageEmbed"] as const } : {}),
    ...(imageArm === "no-image-input" ? { imageEmbedVision: false } : {}),
    summarizerContextTokens: 32_000,
    embedDim: EMBED_DIM,
    embedModel: EMBED_MODEL,
    imageEmbedModel: IMAGE_EMBED_MODEL,
    summarizeModel: SUMMARIZER_MODEL,
    structuredModel: SUMMARIZER_MODEL,
  });
  return { ...base, embed, imageEmbed, rerank, summarize, structured };
}

/** The seeded entity's owner from the real table — the indexer/sweeps read it the way compose wires it. */
async function loadOwnerOf(db: Db, kind: "character" | "asset", id: CharacterId | AssetId): Promise<UserId | null> {
  if (kind === "character") {
    const rows = await db
      .select({ ownerId: characters.ownerId })
      .from(characters)
      .where(eq(characters.id, id as CharacterId));
    return rows[0]?.ownerId ?? null;
  }
  const rows = await db
    .select({ ownerId: assets.ownerId })
    .from(assets)
    .where(eq(assets.id, id as AssetId));
  return rows[0]?.ownerId ?? null;
}

export interface StoreHarness {
  readonly ctx: EmbeddingsContext;
  readonly roleClients: FakeRoleClients;
  readonly advance: (ms: number) => void;
  /** Re-point the owner's resolved embed connection at a different DTYPE — the operator flipping the served
   *  precision. The dtype rides INSIDE the space tag (`embedSpaceOf`, #2417), which is what a generation id is
   *  minted from, so this is the seam that makes a corpus stale the way a model change does. NOT `embedAs`:
   *  that flips what the PROVIDER reports for a produced vector (the issue-724 strand fixture) and never
   *  reaches the staleness gate, which keys on the generation since the `610937682` cutover. */
  readonly embedDtypeAs: (dtype: string) => void;
  readonly listCharacterIds: Mock<EmbeddingsContext["listCharacterIds"]>;
  readonly loadCardText: Mock<EmbeddingsContext["loadCardText"]>;
  readonly listImageAssetIds: Mock<EmbeddingsContext["listImageAssetIds"]>;
  readonly loadAssetBytes: Mock<EmbeddingsContext["loadAssetBytes"]>;
}

/** The PD-53 bulk-pass sweep universe the harness fakes serve (all default empty/absent). */
export interface StoreHarnessSources {
  readonly characterIds?: readonly CharacterId[];
  readonly cardTexts?: ReadonlyMap<CharacterId, string>;
  readonly imageAssetIds?: readonly AssetId[];
  readonly assetBytes?: ReadonlyMap<AssetId, Uint8Array>;
}

/** Make `embed` report a DIFFERENT model until called again — the shape of rows written while the box ran
 *  another embed model. Since `0fed0b3ee` the stored `model` column records what the provider ACTUALLY
 *  returned rather than what the caller declared, so a retired-space fixture has to come from the provider;
 *  that is also exactly how a real strand is created. Batch-scoped (not `once`) because the store paths
 *  fan out concurrently, where per-call ordering is not something a fixture may assume. */
export function embedAs(harness: StoreHarness, model: string): void {
  harness.roleClients.embed.mockImplementation((input) =>
    Promise.resolve({
      vectors: (typeof input === "string" ? [input] : input).map((_, i) => fakeVector(EMBED_DIM, i + 1)),
      model,
      usage: { promptTokens: null, totalTokens: null },
    }),
  );
}

/** Build an `EmbeddingsContext` over a real db with deterministic clock/ids + a recording fake bundle.
 *  `sources` feeds the bulk-pass enumeration/canon-read fakes (recording `vi.fn`s, overridable per test). */
export function makeStoreHarness(db: Db, sources: StoreHarnessSources = {}, imageArm: FakeImageArm = "joint"): StoreHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const roleClients = makeRoleClients(true, imageArm);
  const listCharacterIds: Mock<EmbeddingsContext["listCharacterIds"]> = vi.fn<EmbeddingsContext["listCharacterIds"]>(() =>
    Promise.resolve(sources.characterIds ?? []),
  );
  const loadCardText: Mock<EmbeddingsContext["loadCardText"]> = vi.fn<EmbeddingsContext["loadCardText"]>((characterId) =>
    Promise.resolve(sources.cardTexts?.get(characterId)),
  );
  const listImageAssetIds: Mock<EmbeddingsContext["listImageAssetIds"]> = vi.fn<EmbeddingsContext["listImageAssetIds"]>(() =>
    Promise.resolve(sources.imageAssetIds ?? []),
  );
  const loadAssetBytes: Mock<EmbeddingsContext["loadAssetBytes"]> = vi.fn<EmbeddingsContext["loadAssetBytes"]>((assetId) =>
    Promise.resolve(sources.assetBytes?.get(assetId)),
  );
  // The owner's resolved embed DTYPE, overridable per test (`embedDtypeAs`). Undefined ⇒ the capability's own
  // answer (the fake declares none, so the space tag is the bare model).
  const embedDtype: { current: string | undefined } = { current: undefined };
  const ctx: EmbeddingsContext = {
    db,
    roleClientsFor: () => Promise.resolve(roleClients),
    resolveEmbeddingConnection: async (_ownerId, task) => {
      const resolved = await roleClients.resolved(task);
      const dtype = embedDtype.current;
      const capability =
        task === "embed" && dtype !== undefined && resolved !== null && resolved.capability.kind === "embedding"
          ? { ...resolved.capability, embedding: { ...resolved.capability.embedding, dtype } }
          : resolved?.capability;
      return resolved === null || capability === undefined
        ? null
        : {
            ...resolved,
            capability,
            api: "test",
            wire: "test",
            baseUrl: null,
            features: {},
            extras: null,
            transport: null,
            embed: roleClients.embed,
            imageEmbed: roleClients.imageEmbed,
          };
    },
    // The entity OWNER reads (the funder of every sweep) — the harness's seeded rows all belong to whoever the
    // test seeded; a null answer means "row gone", which the sweeps skip.
    loadCharacterOwner: (characterId) => loadOwnerOf(db, "character", characterId),
    loadAssetOwner: (assetId) => loadOwnerOf(db, "asset", assetId),
    now: (): number => clock.now(),
    newCharacterEmbeddingId: (): CharacterEmbeddingId => castId<CharacterEmbeddingId>(ids.next("character_embedding")),
    newImageEmbeddingId: (): ImageEmbeddingId => castId<ImageEmbeddingId>(ids.next("image_embedding")),
    newChatDigestId: (): ChatDigestId => castId<ChatDigestId>(ids.next("chat_digest")),
    newChatSegmentId: (): ChatSegmentId => castId<ChatSegmentId>(ids.next("chat_segment")),
    newDocumentChunkId: (): DocumentChunkId => castId<DocumentChunkId>(ids.next("document_chunk")),
    listCharacterIds,
    loadCardText,
    listImageAssetIds,
    loadAssetBytes,
    embedDim: EMBED_DIM,
    imageEmbedDim: EMBED_DIM,
  };
  return {
    ctx,
    roleClients,
    advance: (ms: number): void => clock.advance(ms),
    embedDtypeAs: (dtype: string): void => {
      embedDtype.current = dtype;
    },
    listCharacterIds,
    loadCardText,
    listImageAssetIds,
    loadAssetBytes,
  };
}

export interface IndexerHarness {
  readonly ctx: EmbeddingsIndexerContext;
  readonly roleClients: FakeRoleClients;
  readonly loadCardText: Mock<EmbeddingsIndexerContext["loadCardText"]>;
  readonly loadAssetMime: Mock<EmbeddingsIndexerContext["loadAssetMime"]>;
  readonly loadAssetBytes: Mock<EmbeddingsIndexerContext["loadAssetBytes"]>;
  readonly store: EmbeddingsService["store"];
}

/** Build an `EmbeddingsIndexerContext` over a real store verb + recording canon-reader fakes. `assetMime`
 *  defaults to an image mime so an asset event embeds unless a test overrides it (the embeddability gate).
 *  `db` is the real handle the indexer's OWN `image_index_skips` table (the admission floor) is read/written
 *  through — the same `db` the store verb closes over; `now` is a frozen clock for the skip-record's stamp. */
export function makeIndexerHarness(
  db: Db,
  store: EmbeddingsService["store"],
  roleClients: FakeRoleClients,
  sources: { readonly cardText?: string | undefined; readonly assetBytes?: Uint8Array | undefined; readonly assetMime?: string },
): IndexerHarness {
  const loadCardText: Mock<EmbeddingsIndexerContext["loadCardText"]> = vi.fn<EmbeddingsIndexerContext["loadCardText"]>(() => Promise.resolve(sources.cardText));
  // Default to an image mime so a bare asset event embeds; a test overrides (e.g. `video/mp4`) or uses
  // `loadAssetMime.mockResolvedValueOnce(null)` for the row-gone case (the established override pattern).
  const loadAssetMime: Mock<EmbeddingsIndexerContext["loadAssetMime"]> = vi.fn<EmbeddingsIndexerContext["loadAssetMime"]>(() =>
    Promise.resolve(sources.assetMime ?? "image/png"),
  );
  const loadAssetBytes: Mock<EmbeddingsIndexerContext["loadAssetBytes"]> = vi.fn<EmbeddingsIndexerContext["loadAssetBytes"]>(() =>
    Promise.resolve(sources.assetBytes),
  );
  const clock = createFrozenClock(FROZEN_AT);
  const ctx: EmbeddingsIndexerContext = {
    store,
    db,
    now: (): number => clock.now(),
    loadCardText,
    loadAssetMime,
    loadAssetBytes,
    loadCharacterOwner: (characterId) => loadOwnerOf(db, "character", characterId),
    loadAssetOwner: (assetId) => loadOwnerOf(db, "asset", assetId),
    roleClientsFor: () => Promise.resolve(roleClients),
    embedDim: EMBED_DIM,
    imageEmbedDim: EMBED_DIM,
  };
  return { ctx, roleClients, loadCardText, loadAssetMime, loadAssetBytes, store };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: Handle;
}

/**
 * Seed the `user_connections` row every REAL embeddings write resolves through — the FK parent of
 * `embed_generations.connection_id` (`substrate/generation.ts` `resolveTargetGeneration`, which runs on the
 * first `store()` of every sweep).
 *
 * THE ROW IS NOT DECORATION, AND IT IS NOT OPTIONAL. The shared fake `roleClients` resolve every owner to
 * {@link TEST_CONNECTION_ID} (`tests/support/factories/resolved-connection.ts`) — the id is minted there as a
 * pure const and NOTHING seeds the row it points at. With no row, the generation insert fails the FK and the
 * failure surfaces wherever the caller happens to swallow it: an embeddings verb throws outright, while
 * databank's ingest accumulator records it as DATA (`failed[]`) and every count reads zero, leaving the suite
 * quietly, plausibly green. Three lanes hit this on three different days; this helper is the one home.
 *
 * WHY THE SEEDER IS HERE AND NOT AT THE ID'S MINT. `tests/support/factories/resolved-connection.ts` is
 * imported by BROWSER-world CT stories (`tests/client/features/preset/components/_params-deck-stories.tsx`,
 * `readout/_readout-stories.tsx`, `_message-handling-stories.tsx` and their `.ct.tsx` specs) — giving it a
 * `@orb/db` import would drag the node-only db package into the CT bundle. So the id stays a pure const with
 * a pointer comment, and the FK parent is seeded here, in the node-world harness that owns the write path.
 *
 * ONE row per db, not one per owner: the fake resolves a single connection id for everybody, so a second
 * owner's generation necessarily points at the same row (`onConflictDoNothing` keeps the first seeder's).
 * The FK is the only thing that reads it — nothing projects the connection's owner.
 */
export async function seedVectorConnection(db: Db, ownerId: UserId): Promise<void> {
  await db
    .insert(userConnections)
    .values({
      id: TEST_CONNECTION_ID,
      ownerId,
      label: "test vector connection",
      providerId: castId<ProviderId>(TEST_PROVIDER_ID),
      model: EMBED_MODEL,
    })
    .onConflictDoNothing();
}

/** Insert a `users` row (the FK target for characters/assets) AND its {@link seedVectorConnection} row. Thin
 *  delegate over the canonical factory — embeddings' call sites want the id back, not the row. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  const seeded = await seedUserRow(db, { id, handle: castId<Handle>(overrides.handle ?? id) });
  await seedVectorConnection(db, seeded.id);
  return seeded.id;
}

/** Insert a `characters` row (the producer FK for character_embeddings). Returns its branded id. */
export async function seedCharacter(db: Db, ownerId: UserId, overrides: { readonly id?: string; readonly name?: string } = {}): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? "character_test");
  await db.insert(characters).values({
    id,
    handle: castId<CharacterHandle>(overrides.name ?? "test-card"),
    ownerId,
    contentHash: "seed-content-hash",
    name: overrides.name ?? "Test Card",
  });
  return id;
}

/** Insert a `chats` row (the producer FK for chat_digests / chat_segments). Returns its branded id. */
export async function seedChat(db: Db, id = "chat_test", hostUserId?: UserId): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  if (hostUserId !== undefined) {
    // The PRESENT host row — the owner the chat-memory purge scopes on (a chat's vectors belong to its host).
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>(`chat_participant_${id}_host`),
      chatId,
      kind: "human",
      userId: hostUserId,
      role: "host",
      joinedAt: FROZEN_AT,
      joinSeq: 0,
    });
  }
  return chatId;
}

/** Insert a `documents` row (the producer FK for document_chunks). Returns its branded id. The chunk-store
 *  arm keys off (documentId, chunkIdx, model) — the FK parent must exist first. */
export async function seedDocument(db: Db, ownerId: UserId, overrides: { readonly id?: string; readonly text?: string } = {}): Promise<DocumentId> {
  const id = castId<DocumentId>(overrides.id ?? "document_test");
  const extractedText = overrides.text ?? "seed document canon";
  await db.insert(documents).values({
    id,
    ownerId,
    name: "test.md",
    mime: "text/markdown",
    origin: "text",
    extractedText,
    importHash: `seed-import-${id}`,
    byteSize: extractedText.length,
    extractorVersion: "none",
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Insert an `assets` row (the producer FK for image_embeddings). Returns its branded id. */
export async function seedAsset(db: Db, ownerId: UserId, overrides: { readonly id?: string; readonly hash?: string } = {}): Promise<AssetId> {
  const id = castId<AssetId>(overrides.id ?? "asset_test");
  await db.insert(assets).values({
    id,
    ownerId,
    kind: "avatar",
    mime: "image/png",
    size: 8,
    hash: overrides.hash ?? "seed-asset-hash",
    uploadedAt: FROZEN_AT,
  });
  return id;
}
