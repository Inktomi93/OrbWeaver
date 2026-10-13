import type { assets, Db } from "@orb/db";
import type { AssetId } from "@orb/kit/ids";
import type { ImageAdapter } from "#infra/image";
import type { prepareVideo } from "#infra/media";
import type { ChatContext } from "./context.ts";
export interface ImageRefAssets {
  readonly frameCount: ImageAdapter["frameCount"];
  readonly prepareVideo: typeof prepareVideo;
  readonly assetCasRefById: (id: AssetId) => Promise<Pick<typeof assets.$inferSelect, "ownerId" | "mime"> | undefined>;
  readonly loadAssetBytes: (id: AssetId) => Promise<Uint8Array | null>;
}

export interface ResolveMediaRefDeps {
  readonly db: Db;
  readonly assets: Pick<ImageRefAssets, "assetCasRefById" | "loadAssetBytes">;
  readonly mediaProcessing: Pick<ImageRefAssets, "frameCount" | "prepareVideo">;
  readonly forbidExternalMedia: () => boolean;
}

export type ResolveMediaRef = ChatContext["resolveImageUrl"];
