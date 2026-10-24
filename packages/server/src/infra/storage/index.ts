// infra/storage — front door for the per-user content-addressed byte store (D21). The CAS holds blob
// BYTES keyed by `(ownerId, sha-256)`; the variant cache holds derived webp resizes. Both are SEALED
// filesystem adapters (node:* + @orb/kit only, NEVER @orb/db / a domain) constructed once at `entry/`
// and injected DOWN into `domain/assets` (+ `domain/export`). The `assets` INDEX (the table + the
// `storeBlob` coherence primitive + GC/reap policy) is the domain's; storage owns the bytes.

export { createCas } from "./cas.ts";
export type { Cas, ExtractOptions, StagedArchive, VariantCache, ZipEntry, ZipSource } from "./contract.ts";

export { createNodeFsImportPort } from "./profile-fs.ts";
export { writeImportReportFile } from "./report.ts";
export { stageDirectory } from "./stage-dir.ts";
export { createUserRuntimeDirs } from "./user-runtime-dir.ts";
export { createVariantCache } from "./variant-cache.ts";
export { extractZip, packZip } from "./zip.ts";
