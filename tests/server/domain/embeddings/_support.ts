// Shared test harness for the embeddings domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Builds real-db `EmbeddingsContext` / `EmbeddingsIndexerContext` bundles with injected
// determinism (frozen clock + seeded ids, composed from tests/support) and the sanctioned "fake at the edges,
// inject at the root" doctrine (testing §3):
//   • `roleClients` — a recording FAKE of the `@orb/contracts/role-clients` bundle: `embed`/`imageEmbed`
//     return a deterministic vector of `EMBED_DIM`; `summarize` returns a fixed caption. Each is a typed
//     `vi.fn` so tests assert calls + override with `mockResolvedValueOnce` (the dim-mismatch / embed-fail
//     cases). It is a real injected op, NOT an internal-module mock.
//   • `loadCardText` / `loadAssetBytes` — recording fakes for the indexer's canon re-readers.
// Seeds the FK parents (`users` → `characters` / `assets`) directly — a fixture may read/write `users` (the
// `no-direct-users-read` gate scopes only `packages/server/src/domain`).

import type { ImageEmbedInput, RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { assets, characters, chats } from "@orb/db";
import type { AssetId, CharacterEmbeddingId, CharacterId, ChatDigestId, ChatId, ChatSegmentId, Handle, ImageEmbeddingId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Mock } from "vitest";
import { vi } from "vitest";
import type { EmbeddingsContext } from "../../../../packages/server/src/domain/embeddings/context.ts";
import type { EmbeddingsIndexerContext, EmbeddingsService } from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = FROZEN_AT_MS;

/** The test embed space `(model, dim)`. Small dim keeps vectors cheap; the model strings are the space tag. */
export const EMBED_DIM = 8;
export const EMBED_MODEL = "qwen3-embed-test";
export const IMAGE_EMBED_MODEL = "qwen3-vl-test";
const SUMMARIZER_MODEL = "qwen3-summarize-test";
export const TEST_CAPTION = "a deterministic test caption";

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
}

/** A recording fake `RoleClients` — deterministic vectors at `EMBED_DIM`, a fixed caption from `summarize`. */
export function makeRoleClients(): FakeRoleClients {
  const embed: Mock<RoleClients["embed"]> = vi.fn<RoleClients["embed"]>(() =>
    Promise.resolve({
      vectors: [fakeVector(EMBED_DIM, 1)],
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
      items: [{ text: TEST_CAPTION, usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
      model: SUMMARIZER_MODEL,
    }),
  );
  return {
    embed,
    imageEmbed,
    rerank,
    summarize,
    embedModel: EMBED_MODEL,
    rerankModel: "rerank-test",
    imageEmbedModel: IMAGE_EMBED_MODEL,
    summarizerModel: SUMMARIZER_MODEL,
    summarizerContextTokens: 32_000,
  };
}

export interface StoreHarness {
  readonly ctx: EmbeddingsContext;
  readonly roleClients: FakeRoleClients;
  readonly advance: (ms: number) => void;
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

/** Build an `EmbeddingsContext` over a real db with deterministic clock/ids + a recording fake bundle.
 *  `sources` feeds the bulk-pass enumeration/canon-read fakes (recording `vi.fn`s, overridable per test). */
export function makeStoreHarness(db: Db, sources: StoreHarnessSources = {}): StoreHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const roleClients = makeRoleClients();
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
  const ctx: EmbeddingsContext = {
    db,
    roleClients,
    now: (): number => clock.now(),
    newCharacterEmbeddingId: (): CharacterEmbeddingId => castId<CharacterEmbeddingId>(ids.next("character_embedding")),
    newImageEmbeddingId: (): ImageEmbeddingId => castId<ImageEmbeddingId>(ids.next("image_embedding")),
    newChatDigestId: (): ChatDigestId => castId<ChatDigestId>(ids.next("chat_digest")),
    newChatSegmentId: (): ChatSegmentId => castId<ChatSegmentId>(ids.next("chat_segment")),
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
  readonly loadAssetBytes: Mock<EmbeddingsIndexerContext["loadAssetBytes"]>;
  readonly store: EmbeddingsService["store"];
}

/** Build an `EmbeddingsIndexerContext` over a real store verb + recording canon-reader fakes. */
export function makeIndexerHarness(
  store: EmbeddingsService["store"],
  roleClients: FakeRoleClients,
  sources: { readonly cardText?: string | undefined; readonly assetBytes?: Uint8Array | undefined },
): IndexerHarness {
  const loadCardText: Mock<EmbeddingsIndexerContext["loadCardText"]> = vi.fn<EmbeddingsIndexerContext["loadCardText"]>(() => Promise.resolve(sources.cardText));
  const loadAssetBytes: Mock<EmbeddingsIndexerContext["loadAssetBytes"]> = vi.fn<EmbeddingsIndexerContext["loadAssetBytes"]>(() =>
    Promise.resolve(sources.assetBytes),
  );
  const ctx: EmbeddingsIndexerContext = {
    store,
    loadCardText,
    loadAssetBytes,
    roleClients,
    embedDim: EMBED_DIM,
    imageEmbedDim: EMBED_DIM,
  };
  return { ctx, roleClients, loadCardText, loadAssetBytes, store };
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
}

/** Insert a `users` row (the FK target for characters/assets). Thin delegate over the canonical factory —
 *  embeddings' call sites want the id back, not the row. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  const seeded = await seedUserRow(db, { id, handle: castId<Handle>(overrides.handle ?? id) });
  return seeded.id;
}

/** Insert a `characters` row (the producer FK for character_embeddings). Returns its branded id. */
export async function seedCharacter(db: Db, ownerId: UserId, overrides: { readonly id?: string; readonly name?: string } = {}): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id ?? "character_test");
  await db.insert(characters).values({
    id,
    handle: overrides.name ?? "test-card",
    ownerId,
    contentHash: "seed-content-hash",
    name: overrides.name ?? "Test Card",
  });
  return id;
}

/** Insert a `chats` row (the producer FK for chat_digests / chat_segments). Returns its branded id. */
export async function seedChat(db: Db, id = "chat_test"): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return chatId;
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
