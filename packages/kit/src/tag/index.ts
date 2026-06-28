// Tag-name canonicalization — the ONE form every tag source (manual create, card import, seeder, corpus
// distillation) runs a name through before it reaches the namespace. The single chokepoint that makes
// "Female" / " Female " / "Female  Knight" dedupe identically regardless of who authored them. Pure,
// zero-dep (kit): importable by the server's tag resolve-or-create now and the P6 client's create flow later.
//
// Canonical form = trim the edges + collapse every internal whitespace run to a single space. Display CASING
// is KEPT on purpose — a tag renders as the author typed it; case-insensitive dedupe is the uniqueness
// layer's job (the `(ownerId, lower(name))` functional unique index), NOT this normalizer's. Lowercasing here
// would destroy "NSFW" / "DnD" display intent.

/** Any run of whitespace (spaces, tabs, newlines) — collapsed to a single space. */
const WHITESPACE_RUN = /\s+/g;

/** The canonical stored display form of a tag name: edge-trimmed, internal whitespace collapsed, case kept. */
export function normalizeTagName(raw: string): string {
  return raw.replace(WHITESPACE_RUN, " ").trim();
}
