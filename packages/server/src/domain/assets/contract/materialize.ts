import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { GeneratedImage } from "@orb/inference";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { SafeFetchOptions, SafeFetchResult } from "#infra/network";
import type { BackgroundStoreParams } from "./background-store.ts";

export interface MaterializeBackgroundDeps {
  readonly storeBackground: (params: BackgroundStoreParams) => Promise<Pick<StoredAsset, "assetId" | "hash">>;
  readonly maxBytes: () => number;
  readonly fetchImpl?: (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;
}

export interface InlineReplyImageDeps {
  readonly storeGenerated: (ownerId: UserId, bytes: Uint8Array, mime: string) => Promise<Pick<StoredAsset, "assetId">>;
  readonly maxBytes: () => number;
  readonly fetchImpl?: (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;
}

export type StoreInlineReplyImage = (ownerId: UserId, image: GeneratedImage) => Promise<Pick<StoredAsset, "assetId"> | null>;
export type ImageryGalleryAdd = (owner: Principal, assetId: AssetId, subjectCharacterId: CharacterId) => Promise<void>;
