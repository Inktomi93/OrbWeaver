// infra/extraction/loader.ts — the per-format loader contract shared by the loaders and the dispatch (a leaf
// module so `formats.ts` and `loaders/*` never import each other cyclically). A loader turns raw bytes into
// pre-normalization text + optional per-format meta; `createExtractText` runs §2 normalization, measures
// `charCount`, and stamps `EXTRACTOR_VERSION`.

/** A loader's raw output — pre-normalization text plus optional per-format meta. */
export interface RawExtraction {
  readonly text: string;
  /** pdf only — the page count from the document. */
  readonly pageCount?: number;
  /** html `<title>` / pdf info-dict title, when present. */
  readonly title?: string;
}

/** A per-format loader: raw bytes → raw extraction. Throws on a genuinely unreadable file — the dispatch wraps
 *  that as `ExtractionFailedError`. (A call-signature interface, not a `type` alias — `no-inline-types`
 *  reserves exported aliases for contract homes; infra names its shapes with `interface`.) */
export interface Loader {
  // biome-ignore lint/style/useShorthandFunctionType: the shorthand is an exported `type` alias, which the `no-inline-types` gate reserves for the type-home dirs — infra names its shapes with `interface` (see this declaration's own header).
  (bytes: Uint8Array): Promise<RawExtraction>;
}
