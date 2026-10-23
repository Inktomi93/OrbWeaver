// A second replica on the same database holds a room's turn lease through its own engine: a forced turn whose
// provider request parks until the peer lets go. Its clock may run ahead, so an expiring lease is a real takeover.

import { chatLocks } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { createFrozenClock } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "../corpus-provider.ts";
import type { ServerHarnessOptions, ServerTestHarness } from "../server.ts";
import { createServerHarness } from "../server.ts";

/** The peer's business ids count in their own band, below the fixture band, so its rows never collide with the root's. */
const PEER_ID_CURSOR = 2 ** 30;

type ChatLockRow = typeof chatLocks.$inferSelect;

export interface PeerLeaseParams {
  readonly chatId: ChatId;
  /** A character seated in the room; the peer forces its turn. */
  readonly characterId: CharacterId;
  /** The room host the peer's turn runs as. */
  readonly hostUserId: UserId;
  readonly holder: string;
  /** How far the peer's clock runs ahead of the root's. Past the root's lease horizon the peer steals the lease. */
  readonly aheadMs?: number;
  /** The root's secret box, when the room's funding connection carries a sealed credential. */
  readonly secretBoxKey?: ServerHarnessOptions["secretBoxKey"];
}

export interface PeerLease extends AsyncDisposable {
  readonly peer: ServerTestHarness;
  /** The lease row as the peer's engine wrote it. */
  readonly row: ChatLockRow;
  /** Abort the peer's turn; its engine releases the lease it still holds. */
  readonly letGo: () => Promise<void>;
}

function isCompletion(request: Request): boolean {
  return request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions");
}

/** Start the peer replica's held turn and return once its engine owns the room's lease. */
export async function seedPeerLease(root: ServerTestHarness, params: PeerLeaseParams): Promise<PeerLease> {
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The peer replica never answers its held turn.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const reached = Promise.withResolvers<void>();
  const peer = await createServerHarness({
    db: root.db,
    ownerId: root.ownerId,
    holder: params.holder,
    clock: createFrozenClock(root.clock.now() + (params.aheadMs ?? 0)),
    ids: createSeededIds(PEER_ID_CURSOR),
    ...(params.secretBoxKey === undefined ? {} : { secretBoxKey: params.secretBoxKey }),
    providerFetch: async (input, init): Promise<Response> => {
      const request = new Request(input, init);
      if (!isCompletion(request)) {
        return await corpus.execute(request);
      }
      reached.resolve();
      // Parked until the peer's own abort reaches the physical edge.
      return await new Promise<never>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true });
      });
    },
  });
  try {
    const principal = await peer.principalFor(params.hostUserId);
    const turn = peer.services.chat.forceCharacterTurn({ principal, chatId: params.chatId, characterId: params.characterId });
    const settled = Promise.allSettled([turn]);
    await Promise.race([
      reached.promise,
      turn.then(() => {
        throw new Error("the peer replica's turn settled before it held the lease");
      }),
    ]);
    const row = await root.db.select().from(chatLocks).where(eq(chatLocks.chatId, params.chatId)).get();
    if (row?.holder !== params.holder) {
      throw new Error("the peer replica reached its provider without owning the room's lease");
    }
    let released: Promise<void> | undefined;
    const letGo = (): Promise<void> => {
      released ??= (async (): Promise<void> => {
        await peer.services.chat.abort({ principal, chatId: params.chatId });
        await settled;
        await peer.settleBackground();
      })();
      return released;
    };
    return {
      peer,
      row,
      letGo,
      [Symbol.asyncDispose]: async (): Promise<void> => {
        try {
          await letGo();
        } finally {
          await peer[Symbol.asyncDispose]();
        }
      },
    };
  } catch (error) {
    await peer[Symbol.asyncDispose]();
    throw error;
  }
}
