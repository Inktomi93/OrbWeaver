// Consumer-owned projections derive the actual service or database row; no parallel shape is declared.

import type { AssetsService } from "#domain/assets";

export type BlobAssetsPort = Pick<AssetsService, "getMetadata" | "resolveVariant">;

export type UploadAssetsPort = Pick<AssetsService, "store">;
