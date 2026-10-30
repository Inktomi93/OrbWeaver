import type { StoredAsset } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { GeneratedImage } from "@orb/inference";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { Logger } from "#foundation/observability";
import type { SafeFetch } from "#infra/network";
import type { BackgroundStoreDeps, BackgroundStoreParams } from "./background-store.ts";

export interface MaterializeBackgroundDeps {
  readonly storeBackground: (params: BackgroundStoreParams) => Promise<Pick<StoredAsset, "assetId" | "hash">>;
  readonly maxBytes: NonNullable<BackgroundStoreDeps["maxBytes"]>;
  /** The root's scoped egress `safeFetch`, so the download runs through the injected network execution. */
  readonly fetchImpl: SafeFetch;
}

export interface InlineReplyImageDeps {
  readonly logger: Logger;
  readonly storeGenerated: (ownerId: UserId, bytes: Uint8Array, mime: string) => Promise<Pick<StoredAsset, "assetId">>;
  readonly maxBytes: () => number;
  /** The root's scoped egress `safeFetch`, so the download runs through the injected network execution. */
  readonly fetchImpl: SafeFetch;
}

export type StoreInlineReplyImage = (ownerId: UserId, image: GeneratedImage) => Promise<Pick<StoredAsset, "assetId"> | null>;
export type ImageryGalleryAdd = (owner: Principal, assetId: AssetId, subjectCharacterId: CharacterId) => Promise<void>;
