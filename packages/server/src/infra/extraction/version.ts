// infra/extraction/version.ts — the ONE global extractor version. Bump on ANY change
// that can alter extraction OUTPUT for an already-supported format: a loader-lib upgrade, a normalization
// change, or a per-format join-rule change. The stamp lands on `documents.extractorVersion` and keys the
// re-extract sweep (`databank-reindex mode:'re-extract'`, ingest §maybeReExtract:
// `extractorVersion != EXTRACTOR_VERSION AND sourceAssetId IS NOT NULL`). Adding a NEW format does NOT need a
// bump (existing documents are unaffected). ONE global string, not per-format — the consumer predicate is a
// single "is this document current?" compare — per-format versions and code-hashing were rejected. Superseding
// the dep-free passthrough's "textlike-1" with this canonical "1" re-extracts every previously textlike
// document on its next reindex (the string differs), which is the intended version-bump flow.
export const EXTRACTOR_VERSION = "1";
