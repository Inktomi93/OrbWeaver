// What a dry-run profile import reports it would do. Every string comes from a hostile file, so the server clips
// it and caps each list; `total` and `counts` stay exact over every entry when `items` is capped, and the count line
// reads them, never the list. The client renders names as plain text.
// An entry's identity is its source: the profile directory it sits in plus its path inside that profile, so two
// profiles of one upload that share a relative path are two entries. `mergeImportPreviews` is the one place that
// keys on it. A skip at the upload's root, beside the profiles, has `profile: null`. Equal content is each owning
// domain's rule, so an entry carries digests of the keys that rule compares by (its identities), and the merge marks
// an entry a repeat when an earlier entry holds them all; it keeps no equality rule of its own. Across uploads a card
// is compared by its import hash alone, and a group by the set of transcripts it brings, so a JSON card and the PNG of
// the same text, or a group bringing only some of an earlier group's transcripts, stay two writes in the merge.
// A split folder re-sends files (settings, avatars and world books ride every upload, a group's member cards ride its
// upload too), so one entry can sit in several uploads. Every entry carries the digest of its source; an upload's
// unlisted tail sends the digests of its first IMPORT_PREVIEW_TAIL_MAX entries by outcome, and the merge counts an
// entry once however many uploads hold it. A tail entry carries no identities, so it cannot be compared by content, and
// a tail past the digests cannot be matched at all: the merge counts both as `uncompared`, and the count line says its
// numbers may be high.

import { z } from "zod";

export const IMPORT_PREVIEW_KINDS = ["characters", "chats", "personas", "worlds", "presets", "themes", "backgrounds", "groups", "orphans"] as const;
export type ImportPreviewKind = (typeof IMPORT_PREVIEW_KINDS)[number];

/** The most entries one preview list holds, so a stored run and its bus frame stay small. */
export const IMPORT_PREVIEW_LIST_MAX = 500;
// The most unlisted entries of one kind per upload whose source digest a preview sends, so a merge can count an entry
// that several uploads of a split folder hold once. Entries past it are counted but cannot be matched.
const IMPORT_PREVIEW_TAIL_MAX = 5000;
/** The longest name, source or reason a preview holds. */
export const IMPORT_PREVIEW_TEXT_MAX = 200;

const previewText = z.string().max(IMPORT_PREVIEW_TEXT_MAX);

/** Why a run writes nothing for an entry: the owner's library holds equal content, or an earlier entry of the same
 *  upload does. The owning domain's read-only twin of each write answers it with the write's own equality rule. */
export type ImportReuse = "library" | "upload";

/** What an owning domain's read-only twin answers for one entry of a dry run: why a run writes nothing for it
 *  (`reuse`, null when it writes it) and the content keys of the owner's own equality rule (`keys`: one for most
 *  kinds, one per theme of a theme file, one for a group: the set of its transcripts' keys). The preview sends the
 *  keys' digests, never the keys, so two uploads of one folder can tell that their entries are equal. */
export interface ImportAnswer {
  readonly reuse: ImportReuse | null;
  readonly keys: readonly string[];
}

/** Where an entry sits in the upload: the profile directory's name and the entry's path inside that profile (its
 *  file, or its name where it has no file). A single picked profile is staged under one fixed directory name. */
const importSourceSchema = z.strictObject({ profile: previewText, path: previewText });

/** A skip's source: a profile entry, or `profile: null` for an entry beside the profiles at the upload's root. */
const importSkipSourceSchema = z.strictObject({ profile: previewText.nullable(), path: previewText });
type ImportSkipSource = z.infer<typeof importSkipSourceSchema>;

const importPreviewItemSchema = z.strictObject({
  /** The item's identity in the upload. The same file of the same profile in two uploads of a split folder is
   *  one item. */
  source: importSourceSchema,
  /** A digest of the source, so the merge can tell that an upload's unlisted entry is one another upload lists. */
  sourceDigest: previewText,
  name: previewText,
  /** Something the owner already has (a character, book, preset, chat and so on); a run adds nothing for it.
   *  Absent otherwise. */
  inLibrary: z.literal(true).optional(),
  /** Equal content to an earlier entry of this upload, or of an earlier upload once the merge has seen both,
   *  usually another profile's copy: a run reuses that entry's row and adds nothing for it. Absent otherwise, and
   *  never beside `inLibrary`. */
  repeat: z.literal(true).optional(),
  /** Digests of the content keys the entry's owner compares it by (see {@link ImportAnswer}). Two uploads of a split
   *  folder cannot see each other's entries, so the merge reads equal content off these. Empty when the entry cannot
   *  be compared, which the merge treats as never equal. */
  identities: z.array(previewText).max(IMPORT_PREVIEW_LIST_MAX).readonly(),
  /** A persona whose avatar file is missing or unreadable: it imports, without art. Absent otherwise. */
  withoutArt: z.literal(true).optional(),
});
export type ImportPreviewItem = z.infer<typeof importPreviewItemSchema>;

const importCount = z.number().int().nonnegative();

/** Exact counts over every entry of a kind, the unlisted tail included, so the count line never reads the capped
 *  list. `inLibrary` and `repeat` are the entries a run writes nothing for, `writes` the rest, and `withoutArt` the
 *  personas that import without art. `uncompared` is the number of those the merge of a split folder could not check
 *  against the other uploads: a write with no identities (a listed entry without them, or any unlisted entry), and an
 *  unlisted entry past the digests of {@link IMPORT_PREVIEW_TAIL_MAX}, which could also be counted twice. Only the
 *  merge sets it. */
const importPreviewCountsSchema = z.strictObject({
  inLibrary: importCount,
  repeat: importCount,
  writes: importCount,
  withoutArt: importCount,
  uncompared: importCount,
});
type ImportPreviewCounts = z.infer<typeof importPreviewCountsSchema>;

const tailDigests = z.array(previewText).max(IMPORT_PREVIEW_TAIL_MAX).readonly();

/** The source digests of an upload's first unlisted entries, by what a run does with each. `withoutArt` names the
 *  personas among them that import without art; they sit in one of the other three as well. */
const importPreviewTailSchema = z.strictObject({
  inLibrary: tailDigests,
  repeat: tailDigests,
  writes: tailDigests,
  withoutArt: tailDigests,
});

const importPreviewListSchema = z.strictObject({
  /** Every entry of the kind the upload holds, listed or not. */
  total: importCount,
  counts: importPreviewCountsSchema,
  items: z.array(importPreviewItemSchema).max(IMPORT_PREVIEW_LIST_MAX).readonly(),
  /** The entries after the listed ones, as far as {@link IMPORT_PREVIEW_TAIL_MAX} reaches. */
  tail: importPreviewTailSchema,
});
export type ImportPreviewList = z.infer<typeof importPreviewListSchema>;

function countedOf(items: readonly ImportPreviewItem[]): Omit<ImportPreviewCounts, "uncompared"> & { readonly total: number } {
  const inLibrary = items.filter((item) => item.inLibrary === true).length;
  const repeat = items.filter((item) => item.repeat === true).length;
  return {
    total: items.length,
    inLibrary,
    repeat,
    writes: items.length - inLibrary - repeat,
    withoutArt: items.filter((item) => item.withoutArt === true).length,
  };
}

/** The list for every entry of one kind in one upload: exact counts over all of them, the first
 *  {@link IMPORT_PREVIEW_LIST_MAX} listed and the digests of the next {@link IMPORT_PREVIEW_TAIL_MAX}. */
export function importPreviewListOf(items: readonly ImportPreviewItem[]): ImportPreviewList {
  const { total, ...counts } = countedOf(items);
  const unlisted = items.slice(IMPORT_PREVIEW_LIST_MAX, IMPORT_PREVIEW_LIST_MAX + IMPORT_PREVIEW_TAIL_MAX);
  const digestsOf = (keep: (item: ImportPreviewItem) => boolean): string[] => unlisted.filter(keep).map((item) => item.sourceDigest);
  return {
    total,
    counts: { ...counts, uncompared: 0 },
    items: items.slice(0, IMPORT_PREVIEW_LIST_MAX),
    tail: {
      inLibrary: digestsOf((item) => item.inLibrary === true),
      repeat: digestsOf((item) => item.repeat === true),
      writes: digestsOf((item) => !isReused(item)),
      withoutArt: digestsOf((item) => item.withoutArt === true),
    },
  };
}

const importPreviewSkipSchema = z.strictObject({ source: importSkipSourceSchema, reason: previewText });
export type ImportPreviewSkip = z.infer<typeof importPreviewSkipSchema>;

const importPreviewSkippedSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  items: z.array(importPreviewSkipSchema).max(IMPORT_PREVIEW_LIST_MAX).readonly(),
});

export const importPreviewSchema = z.strictObject({
  kinds: z.strictObject({
    characters: importPreviewListSchema,
    chats: importPreviewListSchema,
    personas: importPreviewListSchema,
    worlds: importPreviewListSchema,
    presets: importPreviewListSchema,
    themes: importPreviewListSchema,
    backgrounds: importPreviewListSchema,
    groups: importPreviewListSchema,
    orphans: importPreviewListSchema,
  }),
  skipped: importPreviewSkippedSchema,
});
export type ImportPreview = z.infer<typeof importPreviewSchema>;

/** How many items of each kind a folder holds. A dry run's preview lists and a real run's result both take their
 *  numbers from the one count, so the two never disagree. */
export const importKindCountsSchema = z.strictObject({
  characters: z.number().int().nonnegative(),
  chats: z.number().int().nonnegative(),
  personas: z.number().int().nonnegative(),
  worlds: z.number().int().nonnegative(),
  presets: z.number().int().nonnegative(),
  themes: z.number().int().nonnegative(),
  backgrounds: z.number().int().nonnegative(),
  groups: z.number().int().nonnegative(),
  orphans: z.number().int().nonnegative(),
}) satisfies z.ZodType<Readonly<Record<ImportPreviewKind, number>>>;
export type ImportKindCounts = z.infer<typeof importKindCountsSchema>;

/** The distinct listed items of every list, first sight winning. */
function distinct<T>(lists: readonly { readonly items: readonly T[] }[], identity: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const list of lists) {
    for (const item of list.items) {
      if (!seen.has(identity(item))) {
        seen.set(identity(item), item);
      }
    }
  }
  return [...seen.values()];
}

function skippedOf(lists: readonly ImportPreview["skipped"][]): ImportPreview["skipped"] {
  const items = distinct(lists, (item) => `${sourceKey(item.source)}\n${item.reason}`);
  const unlisted = lists.reduce((sum, list) => sum + list.total - list.items.length, 0);
  return { total: items.length + unlisted, items: items.slice(0, IMPORT_PREVIEW_LIST_MAX) };
}

// A JSON tuple keeps a hostile profile or path from reading as the other half of the key.
function sourceKey(source: ImportSkipSource): string {
  return JSON.stringify([source.profile, source.path]);
}

function isReused(item: ImportPreviewItem): boolean {
  return item.inLibrary === true || item.repeat === true;
}

/** An item the run writes nothing for because an earlier item of the merged list holds every one of its identities:
 *  each upload judged it alone and called it new. An item without identities cannot be compared and stays as it was. */
function flagRepeats(items: readonly ImportPreviewItem[]): ImportPreviewItem[] {
  const held = new Set<string>();
  return items.map((item) => {
    const repeat = !isReused(item) && item.identities.length > 0 && item.identities.every((identity) => held.has(identity));
    for (const identity of item.identities) {
      held.add(identity);
    }
    return repeat ? { ...item, repeat: true } : item;
  });
}

type Tally = ReturnType<typeof countedOf>;

const TAIL_OUTCOMES = ["inLibrary", "repeat", "writes"] as const;
// A merged preview is shown, never merged again, so it keeps no digests.
const EMPTY_TAIL: ImportPreviewList["tail"] = { inLibrary: [], repeat: [], writes: [], withoutArt: [] };
type TailOutcome = (typeof TAIL_OUTCOMES)[number];

/** An unlisted entry an upload sent the digest of: what a run does with it and whether it imports without art. */
interface TailEntry {
  readonly digest: string;
  readonly outcome: TailOutcome;
  readonly withoutArt: boolean;
}

function tailEntriesOf({ tail }: ImportPreviewList): TailEntry[] {
  const withoutArt = new Set(tail.withoutArt);
  return TAIL_OUTCOMES.flatMap((outcome) => tail[outcome].map((digest) => ({ digest, outcome, withoutArt: withoutArt.has(digest) })));
}

function tallyOfTail(entries: readonly TailEntry[]): Tally {
  const outcomes = (outcome: TailOutcome): number => entries.filter((entry) => entry.outcome === outcome).length;
  return {
    total: entries.length,
    inLibrary: outcomes("inLibrary"),
    repeat: outcomes("repeat"),
    writes: outcomes("writes"),
    withoutArt: entries.filter((entry) => entry.withoutArt).length,
  };
}

function sumOf(parts: readonly Tally[]): Tally {
  return parts.reduce(
    (sum, part) => ({
      total: sum.total + part.total,
      inLibrary: sum.inLibrary + part.inLibrary,
      repeat: sum.repeat + part.repeat,
      writes: sum.writes + part.writes,
      withoutArt: sum.withoutArt + part.withoutArt,
    }),
    countedOf([]),
  );
}

/** What an upload holds of a kind beyond its listed items and the digests it sent: those entries carry no flags, no
 *  identities and no digest, so nothing but their numbers is known. */
function unmatchedOf(list: ImportPreviewList): Tally {
  const listed = countedOf(list.items);
  const digested = tallyOfTail(tailEntriesOf(list));
  return {
    total: list.total - listed.total - digested.total,
    inLibrary: list.counts.inLibrary - listed.inLibrary - digested.inLibrary,
    repeat: list.counts.repeat - listed.repeat - digested.repeat,
    writes: list.counts.writes - listed.writes - digested.writes,
    withoutArt: list.counts.withoutArt - listed.withoutArt - digested.withoutArt,
  };
}

/** One kind over the uploads of a split folder. Listed items union by source and are marked a repeat when an earlier
 *  entry holds their identities. An unlisted entry counts when no listed entry and no earlier upload's unlisted entry has
 *  its source digest, so an entry that several uploads hold (a shared file, a group's member card) is counted once. The
 *  entries no upload sent a digest for are added as the upload counted them. Neither an unlisted entry nor an entry with
 *  no identities can be compared by content with another upload, and an entry with no digest cannot be matched, so a split
 *  folder reports the writes among the first two, and every one of the last, as `uncompared`: the run may write fewer. */
function mergeKind(lists: readonly ImportPreviewList[]): ImportPreviewList {
  const items = flagRepeats(distinct(lists, (item) => sourceKey(item.source)));
  const held = new Set(items.map((item) => item.sourceDigest));
  const parts: Tally[] = [countedOf(items)];
  let uncompared = items.filter((item) => !isReused(item) && item.identities.length === 0).length;
  for (const list of lists) {
    const fresh: TailEntry[] = [];
    for (const entry of tailEntriesOf(list)) {
      if (!held.has(entry.digest)) {
        held.add(entry.digest);
        fresh.push(entry);
      }
    }
    const unmatched = unmatchedOf(list);
    parts.push(tallyOfTail(fresh), unmatched);
    uncompared += fresh.filter((entry) => entry.outcome === "writes").length + unmatched.total;
  }
  const { total, ...counts } = sumOf(parts);
  return { total, counts: { ...counts, uncompared: lists.length > 1 ? uncompared : 0 }, items: items.slice(0, IMPORT_PREVIEW_LIST_MAX), tail: EMPTY_TAIL };
}

/** One preview over the uploads of a split folder. Shared files and repeated cards repeat across uploads, so
 *  listed items union by source (profile and path). Each upload judged its entries alone, so an entry whose content
 *  an earlier upload already lands is then marked a repeat, by the keys its owner's equality rule gave it. A skip
 *  unions by source and reason together: one source can be skipped two ways, and each way is its own row. */
export function mergeImportPreviews(previews: readonly ImportPreview[]): ImportPreview {
  const kinds = Object.fromEntries(IMPORT_PREVIEW_KINDS.map((kind) => [kind, mergeKind(previews.map((preview) => preview.kinds[kind]))]));
  return importPreviewSchema.parse({ kinds, skipped: skippedOf(previews.map((preview) => preview.skipped)) });
}
