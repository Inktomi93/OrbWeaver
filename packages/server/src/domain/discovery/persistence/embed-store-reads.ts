// domain/discovery/persistence/embed-store-reads — the READ-ONLY SELECTs over the embeddings vector store
// (the four primary tables owned by `embeddings`) that discovery's in-RAM analytics cluster over. This is a
// DOWNWARD, read-only dep into `@orb/db/schema/embeddings` — allowed (reads the store read-only — the same
// posture `search` has). discovery embeds NOTHING and writes no
// vector row here — the table NAMES appear ONLY in this file; the hub-score WRITE is the injected
// `embeddings.writeHubScores` seam, never a `db.update` here.
//
// OWNER DERIVATION (D20/D23): the vector rows carry NO ownerId. Character scope derives via
// `characters.ownerId` (D23); digest scope derives via `digest → chat → host` — the host is the ONE chat
// authority (D18: chats have no ownerId; the `chat_participants` row with `kind='human' AND role='host'`).
// Reading `chat_participants`/`characters` is a downward @orb/db read, NOT a sibling-domain runtime import.
//
// Hub passes are CROSS-TENANT (hubness describes a vector SPACE, not a user), so
// the hub reads carry no owner column; only the owner-scoped passes (duplicates, themes) join the owner in.

import type { Db } from "@orb/db";
import {
  characterEmbeddings,
  characters,
  chatDigests,
  chatParticipants,
  chatSegments,
  imageEmbeddings,
} from "@orb/db";
import type { CharacterId, ChatDigestId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";

// ── row shapes (file-local; consumers infer them — no exported persistence type, `no-inline-types`) ────

/** A card embedding tagged with its owner (via `characters.ownerId`) — the within-owner near-dup pass. */
interface OwnedCharacterVector {
  readonly characterId: CharacterId;
  readonly ownerId: UserId;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
}

/** A bare vector row for a cross-tenant hub pass (`id` is the row PK; `model` is the space tag). */
interface HubVector {
  readonly id: string;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
}

/** A digest vector for the hub pass — additionally carries `tier` (digests group per (tier, space), #5). */
interface DigestHubVector extends HubVector {
  readonly tier: number;
}

/** A solo digest vector tagged with its owner (host) + group flag + level inputs + the naming material
 *  (keywords + topic anchor) — the theme pass. */
interface OwnedDigestVector {
  readonly digestId: ChatDigestId;
  readonly ownerId: UserId;
  readonly isGroup: boolean;
  readonly tier: number;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly keywords: string[];
  readonly topicAnchor: string | null;
}

// ── duplicate-character pass ──────────────────────────────────────────────────
/** Every card embedding with its owner — EXCLUDING synthetic (per-room group) characters (they have no real
 *  card text and would pollute character similarity). The recompute groups these
 *  by (ownerId, model) for the within-owner, within-space all-pairs scan. */
export async function readOwnedCharacterVectors(db: Db): Promise<OwnedCharacterVector[]> {
  return await db
    .select({
      characterId: characterEmbeddings.characterId,
      ownerId: characters.ownerId,
      model: characterEmbeddings.model,
      embedding: characterEmbeddings.embedding,
      contentHash: characterEmbeddings.contentHash,
    })
    .from(characterEmbeddings)
    .innerJoin(characters, eq(characterEmbeddings.characterId, characters.id))
    .where(eq(characters.synthetic, false));
}

// ── hub passes (cross-tenant; one row set per table) ──────────────────────────
/** Every card embedding as a bare hub row (cross-tenant — hubness is per-space, not per-owner, #5). */
export async function readCharacterHubVectors(db: Db): Promise<HubVector[]> {
  return await db
    .select({
      id: characterEmbeddings.id,
      model: characterEmbeddings.model,
      embedding: characterEmbeddings.embedding,
      contentHash: characterEmbeddings.contentHash,
    })
    .from(characterEmbeddings);
}

/** Every digest embedding as a hub row, carrying `tier` (digests group per (tier, space), #5). */
export async function readDigestHubVectors(db: Db): Promise<DigestHubVector[]> {
  return await db
    .select({
      id: chatDigests.id,
      model: chatDigests.model,
      tier: chatDigests.tier,
      embedding: chatDigests.embedding,
      contentHash: chatDigests.contentHash,
    })
    .from(chatDigests);
}

/** Every verbatim segment embedding as a bare hub row. */
export async function readSegmentHubVectors(db: Db): Promise<HubVector[]> {
  return await db
    .select({
      id: chatSegments.id,
      model: chatSegments.model,
      embedding: chatSegments.embedding,
      contentHash: chatSegments.contentHash,
    })
    .from(chatSegments);
}

/** Every image embedding as a bare hub row (image↔image hub ONLY — never read on text→image, #2). */
export async function readImageHubVectors(db: Db): Promise<HubVector[]> {
  return await db
    .select({
      id: imageEmbeddings.id,
      model: imageEmbeddings.model,
      embedding: imageEmbeddings.embedding,
      contentHash: imageEmbeddings.contentHash,
    })
    .from(imageEmbeddings);
}

// ── theme pass ────────────────────────────────────────────────────────────────
/** Every digest embedding tagged with its OWNER (the chat's `kind='human' AND role='host'` participant) +
 *  `isGroup` + `tier` + space — the theme clustering inputs. The recompute filters `isGroup=0` for solo
 *  clustering (a room's digests belong to the synthetic group character, not the host's theme space, #13)
 *  and buckets by level (`scene` = tier 0, `arc` = tier ≥ 1). A digest whose chat has no host row is
 *  dropped (the inner join), which can never happen for a real chat. */
export async function readOwnedDigestVectors(db: Db): Promise<OwnedDigestVector[]> {
  return await db
    .select({
      digestId: chatDigests.id,
      ownerId: chatParticipants.userId,
      isGroup: chatDigests.isGroup,
      tier: chatDigests.tier,
      model: chatDigests.model,
      embedding: chatDigests.embedding,
      contentHash: chatDigests.contentHash,
      keywords: chatDigests.keywords,
      topicAnchor: chatDigests.topicAnchor,
    })
    .from(chatDigests)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chatDigests.chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
      ),
    )
    .then((rows) =>
      rows.flatMap((r) => (r.ownerId === null ? [] : [{ ...r, ownerId: r.ownerId as UserId }])),
    );
}
