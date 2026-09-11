// domain/import/substrate/world — the ST-NATIVE standalone world-info parser: a `worlds/*.json` object in →
// the canonical BulkImportLorebookInput out (or null on unparseable), never throws.
//
// ST's native world-info file is a bare `{ entries: { <uid>: {...} } }` with NO schemaKind envelope — that
// envelope shape is orb's OWN book format (#kit/serde/world-info `parseWorldBookFile`), a different grammar.
// The per-entry field spellings also differ from an embedded chara_card_v2 book (`key`/`order`/`disable` vs
// `keys`/`insertion_order`/`enabled`), so each entry is adapted to the chara_card_v2 shape and run through
// the SAME shared mapper (`loreEntryColumns` + `loreEntryMetadata`) an embedded card book uses — embedded and
// standalone converge on ONE entry-normalization path (position/at-depth/constant all resolved identically).
// The book NAME comes from the filename (an ST worlds file carries no internal name).
//
// ONE deliberate divergence from the shared mapper lives here: `metadata.keyMode` is DERIVED from the
// delimited key form (`/re/flags`) because this format has no `use_regex` field to carry it — see
// `stEntryKeyMode` and owner ruling 2026-08-19 (#268 arm (a)).

import type { BulkImportLorebookInput, BulkImportLoreEntryInput } from "@orb/contracts/world-info";
import { isPlainObject } from "@orb/kit/guards";
import { isDelimitedKeyPattern } from "@orb/kit/world-info";
import { loreEntryColumns, loreEntryMetadata } from "#kit/serde/card";

/** ST-native world entries object → order-preserving list of entry OBJECTS (non-object junk dropped). ST keys
 *  entries by uid; per-entry ordering is the `order` field (applied downstream as priority), so the object's
 *  own value order is fine here. */
function extractStWorldEntries(raw: unknown): Record<string, unknown>[] {
  if (!isPlainObject(raw)) {
    return [];
  }
  const entries = raw["entries"];
  if (!isPlainObject(entries)) {
    return [];
  }
  return Object.values(entries).filter((e): e is Record<string, unknown> => isPlainObject(e));
}

/** Adapt one ST-native entry to the embedded chara_card_v2 entry shape the shared mapper reads: rename the
 *  three divergent field spellings, leave everything else (comment/content/constant/position/depth/role plus
 *  unknown ST fields) to ride through the lossless metadata blob untouched. */
function toCharacterBookEntry(stEntry: Record<string, unknown>): Record<string, unknown> {
  const { key, order, disable, ...rest } = stEntry;
  return {
    ...rest,
    keys: Array.isArray(key) ? key : [],
    insertion_order: typeof order === "number" ? order : 0,
    enabled: disable !== true,
  };
}

/** Derive `metadata.keyMode` for a NATIVE ST world entry: this format carries NO `use_regex` field, so a key
 *  written in the delimited form (`/he(llo|y)/i`) is the only signal its author had that the key is a pattern
 *  — honoring it here is format fidelity, not a semantic change (owner ruling 2026-08-19, #268 arm (a): the
 *  delimited form IS this format's regex marker; card-embedded books keep flag-only semantics, and no stored
 *  entry is ever re-interpreted). Scoped to THIS parser deliberately — the shared entry mapper stays
 *  flag-only, so an embedded book with a delimited-looking key still imports literal.
 *
 *  ANY delimited key flips the whole entry, because `keyMode` is per-entry while ST's form is per-key: a
 *  mixed entry's plain siblings then compile as (unanchored) patterns, which is a small precision loss —
 *  the alternative, requiring every key to be delimited, leaves the author's actual pattern inert, which is
 *  exactly the bug. An unparseable sibling still falls back to the literal compile (`keyRegex`). */
function stEntryKeyMode(adapted: Record<string, unknown>, metadata: Record<string, unknown>): Record<string, unknown> {
  if (metadata["keyMode"] !== undefined) {
    return metadata;
  }
  const keys = Array.isArray(adapted["keys"]) ? adapted["keys"] : [];
  if (!keys.some((k) => typeof k === "string" && isDelimitedKeyPattern(k))) {
    return metadata;
  }
  return { ...metadata, keyMode: "regex" };
}

function toLoreEntry(stEntry: Record<string, unknown>): BulkImportLoreEntryInput {
  const adapted = toCharacterBookEntry(stEntry);
  return { ...loreEntryColumns(adapted), metadata: stEntryKeyMode(adapted, loreEntryMetadata(adapted)) };
}

/** Parse an ST-native `worlds/<name>.json` upload into the canonical lorebook shape, or null when the bytes
 *  are not a world-info file (unparseable JSON, no `entries` object, or zero entries). `name` is the book name
 *  (the caller passes the filename stem). Never throws — a malformed file is one skipped world, not an abort. */
export function parseStWorldFile(bytes: Uint8Array, name: string): BulkImportLorebookInput | null {
  let raw: unknown;
  // @orb-waive caught-failure-ownership(catch): pure `JSON.parse` over untrusted upload
  // bytes — documented above: "Never throws — a malformed file is one skipped world, not an abort."
  try {
    raw = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  } catch {
    return null;
  }
  const stEntries = extractStWorldEntries(raw);
  if (stEntries.length === 0) {
    return null;
  }
  return { name, description: null, entries: stEntries.map(toLoreEntry) };
}
