import type { assets, Db } from "@orb/db";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import type { ImageAdapter } from "#infra/image";
import type { PrepareVideo } from "#infra/media";
import type { ChatContext } from "./context.ts";
export interface ImageRefAssets {
  readonly frameCount: ImageAdapter["frameCount"];
  readonly prepareVideo: PrepareVideo;
  readonly assetCasRefById: (id: AssetId) => Promise<Pick<typeof assets.$inferSelect, "ownerId" | "mime"> | undefined>;
  readonly loadAssetBytes: (id: AssetId) => Promise<Uint8Array | null>;
}

/** The room facts a stored asset must satisfy before its bytes are read for the model. */
export interface MediaRoomAccess {
  readonly ownerIsPresent: (ownerId: UserId, chatId: ChatId) => Promise<boolean>;
  /** The room placed the asset itself: a `message_assets` link on one of its messages. Every link writer checks
   *  that the writer owns a cited picture, so a bare id spelled in any body places nothing. */
  readonly isPlacedInRoom: (assetId: AssetId, chatId: ChatId) => Promise<boolean>;
}

export interface ResolveMediaRefDeps {
  readonly db: Db;
  readonly assets: Pick<ImageRefAssets, "assetCasRefById" | "loadAssetBytes">;
  readonly mediaProcessing: Pick<ImageRefAssets, "frameCount" | "prepareVideo">;
  readonly forbidExternalMedia: () => boolean;
}

export type ResolveMediaRef = ChatContext["resolveImageUrl"];
