// infra/extraction/version.ts — the extractor version of each format. Bump one format's entry on a change
// that can alter extraction OUTPUT for that format alone: its loader-lib upgrade, a join-rule change in its
// loader. A change to the shared normalization (`normalize.ts`) bumps every entry. The stamp lands on
// `documents.extractorVersion` and is the version of the document's OWN format; the re-extract sweep
// (`databank-reindex mode:'re-extract'`) and the databank banner count read a document as stale when its stamp
// differs from its format's entry here (`isExtractionStale`, databank persistence). A bump therefore marks only
// that format's documents stale, and a pdf loader change never re-reads html, text or epub documents.
// Adding a NEW format needs no bump of the others (existing documents are unaffected), and the record is total
// over `DocFormat`, so a format without a version fails `tsc`. Per-format versions are the owner ruling; one
// global string and code-hashing were rejected. A stamp is a bare string, so every entry starts at the value
// the single global stamp held ("2") and no stored document goes stale when the stamp becomes per format.

import type { ExtractorVersions } from "@orb/contracts/extraction";

export const EXTRACTOR_VERSIONS: ExtractorVersions = {
  pdf: "2",
  html: "2",
  markdown: "2",
  text: "2",
  docx: "2",
  epub: "2",
};
