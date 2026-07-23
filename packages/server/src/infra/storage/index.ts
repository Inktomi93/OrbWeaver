// infra/storage — front door for the per-user content-addressed byte store (D21). The CAS holds blob
// BYTES keyed by `(ownerId, sha-256)`; the variant cache holds derived webp resizes. Both are SEALED
// filesystem adapters (node:* + @orb/kit only, NEVER @orb/db / a domain) constructed once at `entry/`
// and injected DOWN into `domain/assets` (+ `domain/export`). The `assets` INDEX (the table + the
// `storeBlob` coherence primitive + GC/reap policy) is the domain's; storage owns the bytes.

export type { Cas, PutResult } from "./cas";
export { createCas } from "./cas";

export { stageDirectory } from "./stage-dir";
export type { VariantCache } from "./variant-cache";
export { createVariantCache } from "./variant-cache";
export type { ExtractOptions, StagedArchive, StagedEntry, ZipEntry } from "./zip";
export { extractZip, packZip, ZipRejectedError } from "./zip";
