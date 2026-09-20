// Shared test harness for the discovery domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `DiscoveryContext` with the injected determinism seam (seeded ids + a frozen clock),
// a SCRIPTED `summarize` thunk, and a RECORDING `writeHubScores` fake — the sanctioned "fake at the edges,
// inject at the root" doctrine (testing §3): real injected deps, not internal-module mocks. Seeds the rows
// the verbs read directly (users / characters / character_embeddings / chats / chat_participants /
// chat_digests / chat_segments / assets / image_embeddings).

import type { ImageLens } from "@orb/contracts/embeddings";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import {
  assets,
  characterEmbeddings,
  characters,
  chatDigests,
  chatParticipants,
  chatSegments,
  chats,
  imageEmbeddings,
  messages,
  messageVariants,
  users,
} from "@orb/db";
import type {
  AssetId,
  CharacterHandle,
  CharacterId,
  CharacterKeywordProfileId,
  ChatId,
  ChatParticipantId,
  DuplicateCharacterPairId,
  DuplicateChatPairId,
  Handle,
  ImageEmbeddingId,
  KeywordCooccurrenceId,
  MessageId,
  MessageVariantId,
  ThemeClusterId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { eq } from "drizzle-orm";
import { resolveTier0Range } from "../../../../packages/server/src/domain/chat/index.ts";
import type { DiscoveryContext } from "../../../../packages/server/src/domain/discovery/index.ts";
import { createStatsService } from "../../../../packages/server/src/domain/stats/service.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { makeFakeRoleClients } from "../../../support/factories/role-clients.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";

/** A fixed instant for the service's injected clock (only `reconcile` reads it). */
const STATS_NOW = 1_700_000_000_000;

// The injected writeHubScores op type (not re-exported from the front door — derive it from the ctx).
type WriteHubScores = DiscoveryContext["writeHubScores"];

/** A fixed epoch-ms (the frozen clock instant — stable timestamp assertions). */
export const FROZEN_AT = FROZEN_AT_MS;
/** The one 1024-dim space the schema's `F32_BLOB(1024)` columns require. */
const VECTOR_DIM = 1024;
/** The default embed model the seeders tag rows with (the `(model)` space tag). */
export const EMBED_MODEL = "test-embed-model-1024";

/** Build a 1024-dim vector with the given leading components (rest zero) — enough for deterministic cosine
 *  (e.g. `vec(1)` vs `vec(0, 1)` orthogonal; `vec(1)` matches `vec(1)` exactly). */
export function vec(...components: readonly number[]): Float32Array {
  const v = new Float32Array(VECTOR_DIM);
  for (let i = 0; i < components.length; i += 1) {
    v[i] = components[i] ?? 0;
  }
  return v;
}

// ── injected-fake controls ────────────────────────────────────────────────────

/** A recording `writeHubScores` fake: captures each `{ table, updates }` call and reports rows "updated". */
export interface HubScoreRecorder {
  readonly op: WriteHubScores;
  readonly calls: { table: string; updates: { id: string; model: string; hubScore: number }[] }[];
}

export function makeHubScoreRecorder(): HubScoreRecorder {
  const calls: { table: string; updates: { id: string; model: string; hubScore: number }[] }[] = [];
  const op: WriteHubScores = (params) => {
    calls.push({
      table: params.table,
      updates: params.updates.map((u) => ({ id: u.id, model: u.model, hubScore: u.hubScore })),
    });
    return Promise.resolve({ rowsUpdated: params.updates.length });
  };
  return { op, calls };
}

/** A scripted `summarize` — returns each input's name from `names` in order (default a fixed label). Records
 *  the inputs so a test can assert the naming pass fired. */
export interface SummarizeRecorder {
  readonly op: RoleClients["summarize"];
  readonly calls: { systemPrompt: string; userPrompt: string }[][];
}

export function makeSummarizeRecorder(names: readonly string[] = []): SummarizeRecorder {
  const calls: { systemPrompt: string; userPrompt: string }[][] = [];
  const op: RoleClients["summarize"] = (inputs) => {
    calls.push(inputs.map((i) => ({ systemPrompt: i.systemPrompt, userPrompt: i.userPrompt })));
    return Promise.resolve({
      items: inputs.map((_input, idx) => ({
        text: names[idx] ?? `Theme ${idx}`,
        usage: { tokensIn: null, tokensOut: null, costUsd: null },
      })),
      model: "test-summarize-model",
    });
  };
  return { op, calls };
}

// A seeded id minter (counter-backed; deterministic) for a given prefix.
function seededMinter<T extends string>(prefix: string): () => T {
  let n = 0;
  return (): T => {
    n += 1;
    return castId<T>(`${prefix}_${String(n).padStart(6, "0")}`);
  };
}

/** A recording `attachCardTagByName` fake — captures each staging call (the distill pass's tag seam) and
 *  reports it as a NEW attach (returns true). A test that wants REAL pending rows injects the actual
 *  `tag.attachCardTagByName` instead (over the same db); this default keeps the non-distill harnesses simple. */
interface TagAttachRecorder {
  readonly op: DiscoveryContext["attachCardTagByName"];
  readonly calls: {
    ownerId: string;
    characterId: CharacterId;
    tagName: string;
    source?: string;
    status?: string;
  }[];
}

function makeTagAttachRecorder(): TagAttachRecorder {
  const calls: TagAttachRecorder["calls"] = [];
  const op: DiscoveryContext["attachCardTagByName"] = (params) => {
    calls.push({
      ownerId: params.ownerId,
      characterId: params.characterId,
      tagName: params.tagName,
      ...(params.source !== undefined ? { source: params.source } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
    });
    return Promise.resolve(true);
  };
  return { op, calls };
}

export interface DiscoveryHarness {
  readonly ctx: DiscoveryContext;
  readonly hubScores: HubScoreRecorder;
  readonly summarize: SummarizeRecorder;
  readonly tagAttach: TagAttachRecorder;
}

/** The injected cross-domain `similar` op type (search's `similarCharacters`, narrowed to DossierNeighbor). */
type SimilarOp = DiscoveryContext["similar"];

/** Build a `DiscoveryContext` over a real db with seeded ids + a frozen clock + the injected fakes. */
export function makeDiscoveryHarness(
  db: Db,
  overrides: {
    readonly summarize?: SummarizeRecorder;
    readonly hubScores?: HubScoreRecorder;
    readonly attachCardTagByName?: DiscoveryContext["attachCardTagByName"];
    readonly resolveUserPresetParams?: DiscoveryContext["resolveUserPresetParams"];
    readonly resolveUserProse?: DiscoveryContext["resolveUserProse"];
    readonly characterEconomics?: DiscoveryContext["characterEconomics"];
    readonly characterModelEconomics?: DiscoveryContext["characterModelEconomics"];
    readonly similar?: SimilarOp;
  } = {},
): DiscoveryHarness {
  const hubScores = overrides.hubScores ?? makeHubScoreRecorder();
  const summarize = overrides.summarize ?? makeSummarizeRecorder();
  const tagAttach = makeTagAttachRecorder();
  // The injected `stats` economics seam (PD-22) — default to the REAL stats reads over the SAME db (the
  // "inject the real dep at the root" doctrine; the composition root wires `stats.characterEconomics`).
  const stats = createStatsService(db, () => STATS_NOW);
  const ctx: DiscoveryContext = {
    db,
    now: () => FROZEN_AT,
    newDuplicateCharacterPairId: seededMinter<DuplicateCharacterPairId>("duplicate_character_pair"),
    newThemeClusterId: seededMinter<ThemeClusterId>("theme_cluster"),
    newKeywordCooccurrenceId: seededMinter<KeywordCooccurrenceId>("keyword_cooccurrence"),
    newCharacterKeywordProfileId: seededMinter<CharacterKeywordProfileId>("character_keyword_profile"),
    newDuplicateChatPairId: seededMinter<DuplicateChatPairId>("duplicate_chat_pair"),
    roleClientsFor: () => Promise.resolve(makeFakeRoleClients({ summarize: summarize.op, structured: summarize.op })),
    attachCardTagByName: overrides.attachCardTagByName ?? tagAttach.op,
    // The side-gen sampling ladder's middle rung; default = an empty posture (no preset params) so the distill/
    // analyze floors stand. A test asserting the ladder overrides it with a scripted params object.
    resolveUserPresetParams: overrides.resolveUserPresetParams ?? (() => Promise.resolve({})),
    // PROSE-1: the card owner's prose overrides; default = none ⇒ every discovery system prompt is its
    // shipped default (byte-identical to pre-migration). A slot test overrides it with a scripted record.
    resolveUserProse: overrides.resolveUserProse ?? (() => Promise.resolve({})),
    writeHubScores: hubScores.op,
    characterEconomics: overrides.characterEconomics ?? stats.characterEconomics,
    characterModelEconomics: overrides.characterModelEconomics ?? stats.characterModelEconomics,
    // Default `similar`: no neighbours (the non-dossier harnesses don't compose search). A dossier test injects
    // a scripted op to assert the cross-domain composition (the "inject the real/faked dep at the root" doctrine).
    similar: overrides.similar ?? (() => Promise.resolve([])),
    // The memory tier-grid seam — the REAL chat/memory resolver over the grounded floor config (fanOut 4),
    // exactly what the composition root binds (over live AppSettings there).
    tier0RangeOf: (tier, blockIdx) => resolveTier0Range(undefined, tier, blockIdx),
  };
  return { ctx, hubScores, summarize, tagAttach };
}

// ── seeders (insert the rows the verbs read directly) ─────────────────────────

/** Thin delegate over the canonical factory — discovery's call sites pass a bare-string `id` and want the
 *  id back, not the row (the punchlist's warned bare-string-second-arg variant). */
export async function seedUser(db: Db, id = "user_owner"): Promise<UserId> {
  const userId = castId<UserId>(id);
  const seeded = await seedUserRow(db, { id: userId, handle: castId<Handle>(id) });
  return seeded.id;
}

export async function seedCharacter(
  db: Db,
  overrides: {
    readonly id: string;
    readonly ownerId: UserId;
    readonly name?: string;
    readonly synthetic?: boolean;
    readonly description?: string;
    readonly avatarAssetId?: AssetId;
  },
): Promise<CharacterId> {
  const id = castId<CharacterId>(overrides.id);
  await db.insert(characters).values({
    id,
    handle: castId<CharacterHandle>(overrides.id),
    ownerId: overrides.ownerId,
    name: overrides.name ?? overrides.id,
    ...(overrides.description !== undefined ? { description: overrides.description } : {}),
    ...(overrides.avatarAssetId !== undefined ? { avatarAssetId: overrides.avatarAssetId } : {}),
    contentHash: "card_hash",
    synthetic: overrides.synthetic ?? false,
    createdAt: FROZEN_AT,
  });
  return id;
}

export async function seedCharacterEmbedding(
  db: Db,
  overrides: {
    readonly characterId: CharacterId;
    readonly embedding: Float32Array;
    readonly model?: string;
    readonly contentHash?: string;
    readonly hubScore?: number | null;
  },
): Promise<void> {
  await db.insert(characterEmbeddings).values({
    id: castId(`character_embedding_${overrides.characterId}`),
    characterId: overrides.characterId,
    embedding: overrides.embedding,
    contentHash: overrides.contentHash ?? `hash_${overrides.characterId}`,
    hubScore: overrides.hubScore ?? null,
    model: overrides.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
}

// #1791: CLAIMED by default (`startedAt: FROZEN_AT`) — the stats-owned economics op the discovery insights
// verbs inject (`domain/stats/persistence/messages-economics.ts`) now scopes through `ownerChatIds`
// (#1477), which excludes husk chats (`started_at IS NULL`). Every fixture here represents a real,
// populated conversation, not an unclaimed seeded-greeting husk, so it must be born claimed or the
// economics-insights reads silently see zero generations for it.
export async function seedChat(db: Db, id: string): Promise<ChatId> {
  const chatId = castId<ChatId>(id);
  await db.insert(chats).values({ id: chatId, createdAt: FROZEN_AT, updatedAt: FROZEN_AT, startedAt: FROZEN_AT });
  return chatId;
}

/** #1791: the D18 character-membership junction `ownerChatIds` (stats' one owner-chat predicate, #1477)
 *  joins through — a character posting into a chat here must be seeded as a `kind: 'character'` participant
 *  or the injected economics ops (`characterEconomics`/`characterModelEconomics`) see it as no one's chat and
 *  silently read zero generations for that character. Discovery's chats can host several characters at once
 *  (unlike stats' one-character-per-chat fixtures), so this is a separate call, not a `seedChat` param. */
export async function seedCharacterParticipant(db: Db, chatId: ChatId, characterId: CharacterId): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${chatId}_${characterId}`),
    chatId,
    kind: "character",
    characterId,
    role: "member",
    joinSeq: 0,
  });
}

/** Seed a chat with its human host participant (the digest→chat→host owner derivation). */
export async function seedHostedChat(db: Db, id: string, ownerId: UserId): Promise<ChatId> {
  const chatId = await seedChat(db, id);
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_${id}`),
    chatId,
    kind: "human",
    userId: ownerId,
    role: "host",
    joinSeq: 0,
    joinedAt: FROZEN_AT,
  });
  return chatId;
}

/** Seed a DEPARTED `role='host'` row on an existing chat (a `leftSeq`-stamped ex-host that coexists with the
 *  present host after a handoff-via-leave, D18). The owner derivation must NOT re-attribute the chat's digest
 *  to this stale row. */
export async function seedDepartedHost(db: Db, chatId: ChatId, userId: UserId, leftSeq = 5): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(`chat_participant_departed_${chatId}`),
    chatId,
    kind: "human",
    userId,
    role: "host",
    joinSeq: -1,
    joinedAt: FROZEN_AT,
    leftSeq,
  });
}

/** The synthetic group-as-character bucket for shared digests (a real `CharacterId` FK — inv 8, no `''`
 *  sentinel). Hidden/synthetic + with NO character_embedding + NO hosted chat, so it never enters CSLS /
 *  themes / duplicate analytics (the digest hub/theme passes scan embeddings + host-derived owners). */
const GROUP_CHAR = castId<CharacterId>("character_group");
const DIGEST_OWNER = castId<UserId>("user_digest_owner");

// Idempotently ensure the synthetic group char (+ its owner) exists for the digest scopedCharacterId FK.
async function ensureGroupChar(db: Db): Promise<void> {
  await db
    .insert(users)
    .values({
      id: DIGEST_OWNER,
      handle: castId<Handle>("user_digest_owner"),
      role: "user",
      enabled: true,
      passwordHash: null,
      createdAt: FROZEN_AT,
      updatedAt: FROZEN_AT,
    })
    .onConflictDoNothing();
  await db
    .insert(characters)
    .values({
      id: GROUP_CHAR,
      handle: castId<CharacterHandle>("group"),
      ownerId: DIGEST_OWNER,
      name: "group",
      contentHash: "card_hash",
      synthetic: true,
      createdAt: FROZEN_AT,
    })
    .onConflictDoNothing();
}

export async function seedChatDigest(
  db: Db,
  overrides: {
    readonly id: string;
    readonly chatId: ChatId;
    readonly embedding: Float32Array;
    readonly scopedCharacterId?: CharacterId;
    readonly tier?: number;
    readonly blockIdx?: number;
    readonly isGroup?: boolean;
    readonly text?: string;
    readonly model?: string;
    readonly contentHash?: string;
    readonly keywords?: string[];
  },
): Promise<void> {
  await ensureGroupChar(db);
  await db.insert(chatDigests).values({
    id: castId(overrides.id),
    chatId: overrides.chatId,
    scopedCharacterId: overrides.scopedCharacterId ?? GROUP_CHAR,
    isGroup: overrides.isGroup ?? false,
    tier: overrides.tier ?? 0,
    blockIdx: overrides.blockIdx ?? 0,
    text: overrides.text ?? `digest ${overrides.id}`,
    embedding: overrides.embedding,
    contentHash: overrides.contentHash ?? `hash_${overrides.id}`,
    keywords: overrides.keywords ?? [],
    model: overrides.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
}

export async function seedChatSegment(
  db: Db,
  overrides: {
    readonly id: string;
    readonly chatId: ChatId;
    readonly embedding: Float32Array;
    readonly blockIdx?: number;
    /** The chunk within the block (#172) — defaults to 0, the single-chunk case. */
    readonly chunkIdx?: number;
    readonly seqStart?: number;
    readonly seqEnd?: number;
    readonly text?: string;
    readonly model?: string;
    readonly contentHash?: string;
  },
): Promise<void> {
  await db.insert(chatSegments).values({
    id: castId(overrides.id),
    chatId: overrides.chatId,
    blockIdx: overrides.blockIdx ?? 0,
    chunkIdx: overrides.chunkIdx ?? 0,
    seqStart: overrides.seqStart ?? 0,
    seqEnd: overrides.seqEnd ?? 1,
    text: overrides.text ?? `segment ${overrides.id}`,
    embedding: overrides.embedding,
    contentHash: overrides.contentHash ?? `hash_${overrides.id}`,
    model: overrides.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
}

/** Seed a canon message at `seq` in `chatId` with a given `createdAt` (the msgMidAt backfill median input).
 *  `characterId` attributes an assistant slot to a character (the forgotten-gems / economics reads scope on
 *  it). Content/economics live on `message_variants` (D26) — pass `variant` to seed the SELECTED one. */
export async function seedMessage(
  db: Db,
  overrides: {
    readonly id: string;
    readonly chatId: ChatId;
    readonly seq: number;
    readonly createdAt: number;
    readonly role?: MessageRole;
    readonly characterId?: CharacterId;
    readonly variant?: {
      readonly content?: string;
      readonly model?: string | null;
      readonly provider?: string | null;
      readonly tokensIn?: number;
      readonly tokensOut?: number;
      readonly tokenProvenance?: import("@orb/contracts/chat").TokenProvenance;
      readonly costUsd?: number;
      readonly genStartedAt?: number;
      readonly genFinishedAt?: number;
    };
  },
): Promise<void> {
  const messageId = castId<MessageId>(overrides.id);
  await db.insert(messages).values({
    id: messageId,
    chatId: overrides.chatId,
    seq: overrides.seq,
    role: overrides.role ?? "assistant",
    ...(overrides.characterId !== undefined ? { characterId: overrides.characterId } : {}),
    createdAt: overrides.createdAt,
  });
  if (overrides.variant !== undefined) {
    const variantId = castId<MessageVariantId>(`${overrides.id}_v0`);
    await db.insert(messageVariants).values({
      id: variantId,
      messageId,
      idx: 0,
      // A non-empty default ON PURPOSE: an EMPTY body is precisely an rpg state-anchor slot (a snapshot key,
      // not a message), which the visible-canon reads exclude. Defaulting to "" silently minted anchors and
      // made every count fixture lie. A test that wants an anchor passes `content: ""` explicitly.
      content: overrides.variant.content ?? `body-${overrides.seq}`,
      model: overrides.variant.model ?? null,
      provider: overrides.variant.provider ?? null,
      tokensIn: overrides.variant.tokensIn ?? null,
      tokensOut: overrides.variant.tokensOut ?? null,
      tokenProvenance:
        overrides.variant.tokenProvenance ??
        (overrides.variant.tokensIn !== undefined || overrides.variant.tokensOut !== undefined ? "measured" : "unrecorded"),
      costUsd: overrides.variant.costUsd ?? null,
      genStartedAt: overrides.variant.genStartedAt ?? null,
      genFinishedAt: overrides.variant.genFinishedAt ?? null,
      createdAt: overrides.createdAt,
    });
    await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
  }
}

/** Append an EXTRA (non-selected) variant to a message — the swipe-hotspot input (a slot with >1 take). */
export async function seedMessageVariant(
  db: Db,
  overrides: {
    readonly id: string;
    readonly messageId: MessageId;
    readonly idx: number;
    readonly content?: string;
  },
): Promise<void> {
  await db.insert(messageVariants).values({
    id: castId<MessageVariantId>(overrides.id),
    messageId: castId<MessageId>(overrides.messageId),
    idx: overrides.idx,
    content: overrides.content ?? "",
    createdAt: FROZEN_AT,
  });
}

export async function seedAsset(db: Db, id: string, ownerId: UserId): Promise<AssetId> {
  const assetId = castId<AssetId>(id);
  await db.insert(assets).values({
    id: assetId,
    ownerId,
    kind: "avatar",
    mime: "image/png",
    size: 1,
    hash: `cas_${id}`,
    uploadedAt: FROZEN_AT,
  });
  return assetId;
}

export async function seedImageEmbedding(
  db: Db,
  overrides: {
    readonly id: string;
    readonly assetId: AssetId;
    readonly embedding: Float32Array;
    readonly model?: string;
    readonly contentHash?: string;
    readonly lens?: ImageLens;
    readonly caption?: string;
    readonly captionMeta?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(imageEmbeddings).values({
    id: castId<ImageEmbeddingId>(overrides.id),
    assetId: overrides.assetId,
    embedding: overrides.embedding,
    lens: overrides.lens ?? "image-raw",
    ...(overrides.caption !== undefined ? { caption: overrides.caption } : {}),
    ...(overrides.captionMeta !== undefined ? { captionMeta: overrides.captionMeta } : {}),
    contentHash: overrides.contentHash ?? `hash_${overrides.id}`,
    model: overrides.model ?? EMBED_MODEL,
    dim: VECTOR_DIM,
    createdAt: FROZEN_AT,
  });
}
