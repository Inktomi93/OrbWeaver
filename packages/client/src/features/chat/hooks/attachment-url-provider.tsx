// #67 inline-attachment RENDER resolver — the PROVIDER half (context + consumer live in
// `attachment-url-context.tsx`). Resolves a row's `asset:<id>` refs → `blobUrl`s via the CHAT-SCOPED
// `assets.resolveChatBlobRefs` query and shares them with the row's `MessageMediaBlock`s over context. The
// chat-scoped path (not the owner-only `resolveBlobRefs`) lets a PRESENT co-participant render another
// member's attachment (#67 co-participant render): the server gate is STRUCTURAL (`message_assets` reference
// in this chat + owner present + caller present), so a non-participant still resolves nothing. Reuses the
// SAME `blobUrl` seam every avatar/gallery `<img src>` already builds — no second URL builder. A row with no
// image refs issues NO query (`enabled` gate).

import { blobUrl } from "@orb/contracts/assets";
import type { AssetId, ChatId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useTRPC } from "#data";
import { AttachmentUrlContext, assetIdsInContent } from "./attachment-url-context";

export interface AttachmentUrlProviderProps {
  /** The chat the row belongs to — scopes the co-participant render gate (`message.chatId`). */
  readonly chatId: ChatId;
  /** The row's stored body — its `asset:<id>` refs are resolved once and shared with every media block. */
  readonly content: string;
  readonly children: ReactNode;
}

/** Resolve a row's inline `asset:<id>` refs → `blobUrl`s (chat-scoped `assets.resolveChatBlobRefs`) and
 *  provide them to the row's `MessageMediaBlock`s. */
export function AttachmentUrlProvider({ chatId, content, children }: AttachmentUrlProviderProps): ReactElement {
  const trpc = useTRPC();
  const assetIds = assetIdsInContent(content);
  const query = useQuery({
    ...trpc.assets.resolveChatBlobRefs.queryOptions({ chatId, assetIds }),
    enabled: assetIds.length > 0,
  });
  const map: ReadonlyMap<AssetId, string> = new Map((query.data ?? []).map((ref) => [ref.assetId, blobUrl(ref.hash)] as const));
  return <AttachmentUrlContext value={map}>{children}</AttachmentUrlContext>;
}
