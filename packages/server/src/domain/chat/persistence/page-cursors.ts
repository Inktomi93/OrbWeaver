import type { HistoryFloorSeq, HistoryPage } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { loadMessagesPage } from "./queries.ts";

/** Resolve available directions under the same admitted viewer floor as the page itself. */
export async function loadPageCursors(
  db: Db,
  chatId: ChatId,
  bounds: { readonly firstSeq: number | undefined; readonly lastSeq: number | undefined; readonly floorSeq: HistoryFloorSeq },
): Promise<Pick<HistoryPage, "previousCursor" | "nextCursor">> {
  const { firstSeq, lastSeq, floorSeq } = bounds;
  const [before, after] = await Promise.all([
    firstSeq === undefined ? [] : loadMessagesPage(db, chatId, { beforeSeq: firstSeq, limit: 1, floorSeq }),
    lastSeq === undefined ? [] : loadMessagesPage(db, chatId, { beforeSeq: undefined, afterSeq: lastSeq, ascending: true, limit: 1, floorSeq }),
  ]);
  return {
    previousCursor: before.length > 0 && firstSeq !== undefined ? { kind: "before", seq: firstSeq } : null,
    nextCursor: after.length > 0 && lastSeq !== undefined ? { kind: "after", seq: lastSeq } : null,
  };
}
