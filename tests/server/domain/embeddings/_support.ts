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
import { assets, characters, chats, users } from "@orb/db";
import type {
  AssetId,
  CharacterEmbeddingId,
  CharacterId,
  ChatDigestId,
  ChatId,
  ChatSegmentId,
  Handle,
  ImageEmbeddingId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Mock } from "vitest";
import { vi } from "vitest";
import type {
  EmbeddingsContext,
  EmbeddingsIndexerContext,
  EmbeddingsService,
} from "../../../../packages/server/src/domain/embeddings/contract/service.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { createSeededIds } from "../../../support/ids.ts";

const FROZEN_AT = 1_750_000_000_000;

/** The test embed space `(model, dim)`. Small dim keeps vectors cheap; the model strings are the space tag. */
export const EMBED_DIM = 8;
export const EMBED_MODEL = "qwen3-embed-test";
export const IMAGE_EMBED_MODEL = "qwen3-vl-test";
export const SUMMARIZER_MODEL = "qwen3-summarize-test";
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
  const imageEmbed: Mock<RoleClients["imageEmbed"]> = vi.fn<RoleClients["imageEmbed"]>(
    (req: ImageEmbedInput) =>
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
  };
}

export interface StoreHarness {
  readonly ctx: EmbeddingsContext;
  readonly roleClients: FakeRoleClients;
  readonly advance: (ms: number) => void;
}

/** Build an `EmbeddingsContext` over a real db with deterministic clock/ids + a recording fake bundle. */
export function makeStoreHarness(db: Db): StoreHarness {
  const clock = createFrozenClock(FROZEN_AT);
  const ids = createSeededIds();
  const roleClients = makeRoleClients();
  const ctx: EmbeddingsContext = {
    db,
    roleClients,
    now: (): number => clock.now(),
    newCharacterEmbeddingId: (): CharacterEmbeddingId =>
      castId<CharacterEmbeddingId>(ids.next("character_embedding")),
    newImageEmbeddingId: (): ImageEmbeddingId =>
      castId<ImageEmbeddingId>(ids.next("image_embedding")),
    newChatDigestId: (): ChatDigestId => castId<ChatDigestId>(ids.next("chat_digest")),
    newChatSegmentId: (): ChatSegmentId => castId<ChatSegmentId>(ids.next("chat_segment")),
  };
  return { ctx, roleClients, advance: (ms: number): void => clock.advance(ms) };
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
  const loadCardText: Mock<EmbeddingsIndexerContext["loadCardText"]> = vi.fn<
    EmbeddingsIndexerContext["loadCardText"]
  >(() => Promise.resolve(sources.cardText));
  const loadAssetBytes: Mock<EmbeddingsIndexerContext["loadAssetBytes"]> = vi.fn<
    EmbeddingsIndexerContext["loadAssetBytes"]
  >(() => Promise.resolve(sources.assetBytes));
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

// ── FK-parent seeders ─────────────────────────────────────────────────────────

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
}

/** Insert a `users` row (the FK target for characters/assets). */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.handle ?? "x"}`);
  await db.insert(users).values({
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: "user",
    enabled: true,
    passwordHash: null,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Insert a `characters` row (the producer FK for character_embeddings). Returns its branded id. */
export async function seedCharacter(
  db: Db,
  ownerId: UserId,
  overrides: { readonly id?: string; readonly name?: string } = {},
): Promise<CharacterId> {
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
export async function seedAsset(
  db: Db,
  ownerId: UserId,
  overrides: { readonly id?: string; readonly hash?: string } = {},
): Promise<AssetId> {
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
