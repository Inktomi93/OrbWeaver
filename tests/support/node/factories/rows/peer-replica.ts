// The chat_locks lease row a peer replica's engine holds, read behind the rows door for persistence-tier suites.

import type { Db } from "@orb/db";
import { chatLocks } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ServerTestHarness } from "../../server.ts";
import type { PeerLease, PeerLeaseParams } from "../peer-replica.ts";
import { seedPeerLease } from "../peer-replica.ts";

export type ChatLockRow = typeof chatLocks.$inferSelect;

/** The room's lease row; the peer's engine wrote it before its provider call, so it exists while the peer holds. */
export async function captureChatLock(db: Db, chatId: ChatId): Promise<ChatLockRow> {
  const row = await db.select().from(chatLocks).where(eq(chatLocks.chatId, chatId)).get();
  if (row === undefined) {
    throw new Error("the room holds no chat_locks lease");
  }
  return row;
}

export interface PeerLeaseRows extends PeerLease {
  /** The lease row as the peer's engine wrote it, read once the peer holds the room. */
  readonly row: ChatLockRow;
}

/** {@link seedPeerLease}, plus the chat_locks row the peer holds, for suites whose subject is the stored lease. */
export async function seedPeerLeaseRows(root: ServerTestHarness, params: PeerLeaseParams): Promise<PeerLeaseRows> {
  const lease = await seedPeerLease(root, params);
  try {
    const row = await captureChatLock(root.db, params.chatId);
    if (row.holder !== params.holder) {
      throw new Error("the peer replica reached its provider without owning the room's lease");
    }
    return { ...lease, row };
  } catch (error) {
    await lease[Symbol.asyncDispose]();
    throw error;
  }
}
