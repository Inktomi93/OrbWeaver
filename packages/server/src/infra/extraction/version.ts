// infra/extraction/version.ts — the ONE global extractor version. Bump on ANY change
// that can alter extraction OUTPUT for an already-supported format: a loader-lib upgrade, a normalization
// change, or a per-format join-rule change. The stamp lands on `documents.extractorVersion` and keys the
// re-extract sweep (`databank-reindex mode:'re-extract'`, ingest §maybeReExtract:
// `extractorVersion != EXTRACTOR_VERSION AND sourceAssetId IS NOT NULL`). Adding a NEW format does NOT need a
// bump (existing documents are unaffected). ONE global string, not per-format — the consumer predicate is a
// single "is this document current?" compare — per-format versions and code-hashing were rejected. A bump
// re-extracts every document stamped with another string on its next `re-extract` reindex.
export const EXTRACTOR_VERSION = "2";
