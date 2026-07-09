// `@orb/contracts/databank` — the databank source-document ORIGIN axis, promoted to contracts so
// `@orb/db` can derive its `documents.origin` enum column from the ONE canonical tuple (the D34 pattern
// that already governs `workloads.kind`). `@orb/db` deps are `@orb/kit` + `@orb/contracts` + drizzle
// only, so a db enum column must reach its axis here, not in `domain/databank/contract/`.
//
// SCOPE NOTE (DB2-tables rider): this namespace ships ONLY the origin axis the schema column needs. The
// full databank wire surface (documentViewSchema, chunk/retrieval settings, verb params) lands with DB2
// proper (databank-design/02 §4) — those shapes have no db-column consumer, so they stay out of the
// baseline-rider slice.

import { z } from "zod";

/** The provenance of a databank document. ONE canonical tuple (§7.5 no-inline-union-redecl): the db
 *  `documents.origin` enum column derives from it, and the tRPC wire builds its `z.enum` from the same
 *  home. `text` = pasted/authored canon (no source bytes); the rest carry re-extractable source bytes or
 *  a scrape URL. */
export const DOC_ORIGINS = ["upload", "web", "youtube", "wiki", "text"] as const;

export const docOriginSchema = z.enum(DOC_ORIGINS);

export type DocOrigin = z.infer<typeof docOriginSchema>;

/** The scraper subset — DERIVED from the origin axis (not a second spelling). The origins whose bytes
 *  are fetched by a scraper rather than uploaded. */
export const SCRAPER_KINDS = ["web", "youtube", "wiki"] as const satisfies readonly DocOrigin[];

export const scraperKindSchema = z.enum(SCRAPER_KINDS);

export type ScraperKind = z.infer<typeof scraperKindSchema>;
