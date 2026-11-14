// The story memory view: what a room's memory holds in plain parts, and the host's strike and restore of one item.
//
// Only digests are items. A digest's anchor, text and keywords are stored as the build wrote them, and its people
// are the typed speaker join; nothing here is parsed out of the text (D55: durable narrative facts are not built).
// The item key carries the digest's content hash as a compare token, so a strike lands only on the item the
// player read.

import type { CharacterId, ChatMemoryStrikeId, MessageId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** A stored content hash is a SHA-256 hex digest. */
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/u;

/** One remembered item as the view and the strike verb name it: the digest's grid position, its bucket and the
 *  hash it held when read. */
export const memoryItemKeySchema = z.strictObject({
  tier: z.int().min(0),
  blockIdx: z.int().min(0),
  scopedCharacterId: typeIdSchema(ID_PREFIX.character),
  contentHash: z.string().regex(CONTENT_HASH_PATTERN),
});
export type MemoryItemKey = z.infer<typeof memoryItemKeySchema>;

/** The `strikeMemory` wire input, beside the chat id the router adds. */
export const strikeMemoryInputSchema = z.strictObject({ item: memoryItemKeySchema });
export type StrikeMemoryInput = z.infer<typeof strikeMemoryInputSchema>;

/** The `restoreMemory` wire input, beside the chat id the router adds. */
export const restoreMemoryInputSchema = z.strictObject({ strikeId: typeIdSchema(ID_PREFIX.chatMemoryStrike) });
export type RestoreMemoryInput = z.infer<typeof restoreMemoryInputSchema>;

/** Why a room's memory is off: the app-wide retrieval mode, or the room host's own switch (D293). */
export const MEMORY_VIEW_OFF_REASONS = ["app-off", "host-off"] as const;
export type MemoryViewOffReason = (typeof MEMORY_VIEW_OFF_REASONS)[number];

/** What the view can say about the room before it lists anything. `too-short` is a chat with no complete block
 *  outside the protected recent window; `pending` is a chat long enough with no summary stored yet. */
export type MemoryViewStatus =
  | { readonly kind: "off"; readonly reason: MemoryViewOffReason }
  | { readonly kind: "too-short" }
  | { readonly kind: "pending" }
  | { readonly kind: "ready" };

/** The strike on a listed item. `changedSinceStrike` says the scene was summarized again after the strike. */
export interface MemoryItemStrikeView {
  readonly strikeId: ChatMemoryStrikeId;
  readonly changedSinceStrike: boolean;
}

/** One remembered item. `bucket` says whether every speaker recalls it or only the scoped character. */
export interface MemoryItemView {
  readonly key: MemoryItemKey;
  readonly bucket: "shared" | "scoped";
  readonly topicAnchor: string | null;
  readonly text: string;
  readonly keywords: readonly string[];
  readonly speakers: readonly CharacterId[];
  readonly strike: MemoryItemStrikeView | null;
}

/** A strike that names no stored item any more, because the messages it covered were hidden, deleted or moved.
 *  It suppresses nothing and stays listed until the host restores it. */
export interface UnmatchedStrikeView {
  readonly strikeId: ChatMemoryStrikeId;
  readonly tier: number;
  readonly scopedCharacterId: CharacterId | null;
  readonly topicAnchor: string | null;
}

/** The `memoryView` read. `recentWindowStartsAt` is the first message the last reply read word for word, null
 *  when it read the whole history or no reply has run. */
export interface MemoryView {
  readonly status: MemoryViewStatus;
  readonly items: readonly MemoryItemView[];
  readonly unmatchedStrikes: readonly UnmatchedStrikeView[];
  readonly recentWindowStartsAt: MessageId | null;
}

/** The view's status from the room's switches, its canon head and what is stored. Uses the build's own
 *  aged-out rule: a block can exist only once `maxSeq - verbatimWindow` reaches `blockSize`. */
export function memoryViewStatus(room: {
  readonly appModeOff: boolean;
  readonly hostEnabled: boolean;
  readonly maxSeq: number;
  readonly verbatimWindow: number;
  readonly blockSize: number;
  readonly storedItems: number;
}): MemoryViewStatus {
  if (room.appModeOff) {
    return { kind: "off", reason: "app-off" };
  }
  if (!room.hostEnabled) {
    return { kind: "off", reason: "host-off" };
  }
  if (room.storedItems > 0) {
    return { kind: "ready" };
  }
  return room.maxSeq - room.verbatimWindow < room.blockSize ? { kind: "too-short" } : { kind: "pending" };
}
