// The one standalone world-info-book serde core: the portable `worlds/*.json` grammar with both directions
// in one home, raw SillyTavern detection beside the native envelope, and the book content identity.
// The embedded-in-card book path is #kit/serde/card and stays independent; both share the entry mapper.

import type { PortableParse } from "@orb/contracts/portability";
import type { BulkImportLorebookInput, BulkImportLoreEntryInput, EntryMetadata } from "@orb/contracts/world-info";
import { isPlainObject } from "@orb/kit/guards";
import type { WorldBookId } from "@orb/kit/ids";
import { stableStringify } from "@orb/kit/stable-stringify";
import { isDelimitedKeyPattern } from "@orb/kit/world-info";
import { z } from "zod";
import { loreEntryColumns, loreEntryIdentity, loreEntryMetadata } from "#kit/serde/card";
import { decodePortableObject, defineJsonRowsSerde } from "#kit/serde/lib";

export const WORLD_INFO_SCHEMA_KIND = "orb.world-info.book";
const SCHEMA_VERSION = 1;

// keys is always an array (empty, never omitted — the null-collapse to world_entries.keys is the writer's
// job); metadata is the raw entry blob, passed through untouched.
const fileEntrySchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  content: z.string(),
  keys: z.array(z.string()).transform((keys): readonly string[] => keys),
  enabled: z.boolean(),
  priority: z.number(),
  ignoreBudget: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

// The book's own top-level fields, beside the envelope and the entry array. Not .strict() — an unknown
// top-level key from a newer writer rides through (forward-tolerant).
const headerSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
});

const worldBookSerde = defineJsonRowsSerde<BulkImportLorebookInput, BulkImportLorebookInput["entries"][number], z.infer<typeof headerSchema>>({
  schemaKind: WORLD_INFO_SCHEMA_KIND,
  schemaVersion: SCHEMA_VERSION,
  // ACCEPT-OLD-FOREVER: books written before the envelope was uniform spell the version key `version`.
  // Build emits `schemaVersion`; both keys parse, forever (portable files are external artifacts —
  // NO-LEGACY governs the db, not a user's on-disk lorebook).
  legacyVersionKeys: ["version"],
  plural: "entries",
  rowSchema: fileEntrySchema,
  // DECLARED opt-in (O-8): a lorebook is an integral whole — an entry silently missing from a restored
  // book is a worse outcome than a refused file, because the book still LOOKS complete.
  rowPolicy: "reject-file",
  headerSchema,
  toWire: (book) => ({
    header: { name: book.name, description: book.description },
    rows: book.entries.map((e) => ({
      title: e.title,
      description: e.description,
      content: e.content,
      keys: [...e.keys],
      enabled: e.enabled,
      priority: e.priority,
      ignoreBudget: e.ignoreBudget,
      metadata: e.metadata,
    })),
  }),
  fromWire: (entries, header) => ({
    name: header.name,
    description: header.description,
    entries: entries.map((e) => ({
      title: e.title,
      description: e.description,
      content: e.content,
      keys: e.keys,
      enabled: e.enabled,
      priority: e.priority,
      ignoreBudget: e.ignoreBudget,
      metadata: e.metadata,
    })),
  }),
});

/** Serialize the canonical lorebook shape to the portable world-info book bytes (the inverse of
 *  `parseWorldBookFile`). Every field in a fixed key order so a re-serialize is byte-identical. */
export function buildWorldBookFile(book: BulkImportLorebookInput): Uint8Array {
  return worldBookSerde.build(book);
}

// ── The raw SillyTavern `worlds/*.json` grammar ──────────────────────────────────────────────────────
// ST's native world file is a bare `{ entries: { <uid>: {...} } }` with no envelope and no internal name.
// Each entry is adapted to the chara_card_v2 spelling and run through the SAME shared mapper an embedded
// card book uses, so embedded and standalone converge on one entry normalization.

/** ST keys entries by uid; per-entry ordering is the `order` field (applied downstream as priority), so the
 *  object's own value order is fine here. Non-object junk is dropped. */
function extractStWorldEntries(raw: Record<string, unknown>): Record<string, unknown>[] {
  const entries = raw["entries"];
  if (!isPlainObject(entries)) {
    return [];
  }
  return Object.values(entries).filter((e): e is Record<string, unknown> => isPlainObject(e));
}

/** Rename the three divergent ST field spellings; everything else (comment/content/constant/position/depth/role
 *  plus unknown ST fields) rides through the lossless metadata blob untouched. */
function toCharacterBookEntry(stEntry: Record<string, unknown>): Record<string, unknown> {
  const { key, order, disable, ...rest } = stEntry;
  return {
    ...rest,
    keys: Array.isArray(key) ? key : [],
    // biome-ignore lint/style/useNamingConvention: the chara_card_v2 entry wire field the shared mapper reads.
    insertion_order: typeof order === "number" ? order : 0,
    enabled: disable !== true,
  };
}

/** Derive `metadata.keyMode` for a NATIVE ST world entry: this format carries NO `use_regex` field, so a key
 *  written in the delimited form (`/he(llo|y)/i`) is the only signal its author had that the key is a pattern
 *  — honoring it here is format fidelity, not a semantic change (owner ruling: the delimited form IS this
 *  format's regex marker; card-embedded books keep flag-only semantics, and no stored entry is ever
 *  re-interpreted). Scoped to THIS grammar deliberately — the shared entry mapper stays flag-only.
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

/** A decoded object is an ST world file when it carries an `entries` object and no envelope. */
function isStWorldObject(raw: Record<string, unknown>): boolean {
  return raw["schemaKind"] === undefined && isPlainObject(raw["entries"]);
}

/** Parse an untrusted world-info book upload — the native envelope or a raw SillyTavern world file — into
 *  the canonical `BulkImportLorebookInput`, or the typed reason it was refused. An ST file carries no name,
 *  so `fallbackName` (the file stem) names it; an ST file with zero entries is `malformed`. */
export function parseWorldBookFile(bytes: Uint8Array, fallbackName: string): PortableParse<BulkImportLorebookInput> {
  const decoded = decodePortableObject(bytes);
  if (!decoded.ok) {
    return decoded;
  }
  if (!isStWorldObject(decoded.value)) {
    return worldBookSerde.parse(bytes);
  }
  const stEntries = extractStWorldEntries(decoded.value);
  if (stEntries.length === 0) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, value: { name: fallbackName, description: null, entries: stEntries.map(toLoreEntry) } };
}

// ── The book content identity ────────────────────────────────────────────────────────────────────────
// One rule for every door: a book matches an owned book when its entry set is content-equal, WHATEVER its
// name (the way a theme and a preset match), so a book that landed under a collision suffix is found again
// on the next import instead of minting the next suffix. Entry ARRAY ORDER is not semantic (entries fire by
// priority), object key order is not semantic (`stableStringify`), `keys` collapses empty→null the way the
// writer's column does, and only the SEMANTIC metadata keys count (`loreEntryIdentity`): the lossless
// residue of a source entry is not identity, so an exported book re-imports as itself.

/** One lore entry reduced to the fields that decide book identity (write-time stamps and ids dropped).
 *  `keys` is the NULL-vs-[] axis the writer collapses; `metadata` is the schema-parsed blob on both sides. */
export interface DedupLoreEntry {
  readonly title: string;
  readonly description: string | null;
  readonly content: string;
  readonly keys: readonly string[] | null;
  readonly enabled: boolean;
  readonly priority: number;
  readonly ignoreBudget: boolean;
  readonly metadata: EntryMetadata | null;
}

/** A book reduced to its content identity: its entries, order-independent. `name` rides along for the
 *  caller's outcome (the name a matched book carries), not for the key. */
export interface DedupBook {
  readonly name: string;
  readonly entries: readonly DedupLoreEntry[];
}

/** An owned library book a candidate is content-matched against. */
export interface DedupCandidateBook extends DedupBook {
  readonly id: WorldBookId;
}

/** The content-equality key: the SORTED per-entry canonical JSON. Two books with the same entry set produce
 *  the same key, under any names.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function bookContentKey(book: Pick<DedupBook, "entries">): string {
  const entryKeys = book.entries.map((entry) => stableStringify(loreEntryIdentity(entry))).sort();
  return stableStringify({ entries: entryKeys });
}

/** The owned library book the incoming book content-matches (its id and the name it carries), or null
 *  (mint a fresh book). */
export function findDuplicateBook(incoming: Pick<DedupBook, "entries">, candidates: readonly DedupCandidateBook[]): DedupCandidateBook | null {
  const key = bookContentKey(incoming);
  return candidates.find((candidate) => bookContentKey(candidate) === key) ?? null;
}
