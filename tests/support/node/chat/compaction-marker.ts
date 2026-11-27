// A room's compaction checkpoint as its host reads it: the summary and the seq it covers, off the production chat export.

import type { Principal } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import { parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import type { ServerProducerRoot } from "../server.ts";

export interface CompactionMarker {
  readonly compactSummary: string | null;
  readonly compactedAtSeq: number | null;
}

/** Export the room as its host and read the checkpoint the bundle carries; throws when the room produces no readable bundle. */
export async function readCompactionMarker(root: ServerProducerRoot, principal: Principal, chatId: ChatId): Promise<CompactionMarker> {
  const exported = await root.app.exportService.exportChatBundle({ principal, chatId });
  const parsed = exported === null ? null : parseChatBundleFile(exported.bytes);
  if (parsed === null || !parsed.ok) {
    throw new Error("the room produced no readable chat bundle");
  }
  return { compactSummary: parsed.value.compactSummary, compactedAtSeq: parsed.value.compactedAtSeq };
}
