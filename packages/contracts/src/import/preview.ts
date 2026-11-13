// What a dry-run profile import reports it would do. Every string comes from a hostile file, so the server clips
// it and caps each list; `total` stays exact when `items` is capped. The client renders names as plain text.
// An entry's identity is its source: the profile directory it sits in plus its path inside that profile, so two
// profiles of one upload that share a relative path are two entries. `mergeImportPreviews` is the one place that
// keys on it. A skip at the upload's root, beside the profiles, has `profile: null`.

import { z } from "zod";

export const IMPORT_PREVIEW_KINDS = ["characters", "chats", "personas", "worlds", "presets", "themes", "backgrounds", "groups", "orphans"] as const;
export type ImportPreviewKind = (typeof IMPORT_PREVIEW_KINDS)[number];

/** The most entries one preview list holds, so a stored run and its bus frame stay small. */
export const IMPORT_PREVIEW_LIST_MAX = 500;
/** The longest name, source or reason a preview holds. */
export const IMPORT_PREVIEW_TEXT_MAX = 200;

const previewText = z.string().max(IMPORT_PREVIEW_TEXT_MAX);

/** Why a run writes nothing for an entry: the owner's library holds equal content, or an earlier entry of the same
 *  upload does. The owning domain's read-only twin of each write answers it with the write's own equality rule. */
export type ImportReuse = "library" | "upload";

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
  name: previewText,
  /** Something the owner already has (a character, book, preset, chat and so on); a run adds nothing for it.
   *  Absent otherwise. */
  inLibrary: z.literal(true).optional(),
  /** Equal content to an earlier entry of this upload, usually another profile's copy: a run reuses that entry's
   *  row and adds nothing for it. Absent otherwise, and never beside `inLibrary`. */
  repeat: z.literal(true).optional(),
  /** A persona whose avatar file is missing or unreadable: it imports, without art. Absent otherwise. */
  withoutArt: z.literal(true).optional(),
});
export type ImportPreviewItem = z.infer<typeof importPreviewItemSchema>;

const importPreviewListSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  items: z.array(importPreviewItemSchema).max(IMPORT_PREVIEW_LIST_MAX).readonly(),
});
export type ImportPreviewList = z.infer<typeof importPreviewListSchema>;

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

function union<T>(lists: readonly { readonly total: number; readonly items: readonly T[] }[], identity: (item: T) => string): { total: number; items: T[] } {
  const seen = new Map<string, T>();
  let unlisted = 0;
  for (const list of lists) {
    unlisted += list.total - list.items.length;
    for (const item of list.items) {
      if (!seen.has(identity(item))) {
        seen.set(identity(item), item);
      }
    }
  }
  return { total: seen.size + unlisted, items: [...seen.values()].slice(0, IMPORT_PREVIEW_LIST_MAX) };
}

// A JSON tuple keeps a hostile profile or path from reading as the other half of the key.
function sourceKey(source: ImportSkipSource): string {
  return JSON.stringify([source.profile, source.path]);
}

/** One preview over the uploads of a split folder. Shared files and repeated cards repeat across uploads, so
 *  listed items union by source (profile and path); a capped list's unlisted tail cannot be compared and is
 *  added. A skip unions by source and reason together: one source can be skipped two ways, and each way is its
 *  own row. */
export function mergeImportPreviews(previews: readonly ImportPreview[]): ImportPreview {
  const kinds = Object.fromEntries(
    IMPORT_PREVIEW_KINDS.map((kind) => [
      kind,
      union(
        previews.map((preview) => preview.kinds[kind]),
        (item) => sourceKey(item.source),
      ),
    ]),
  );
  const skipped = union(
    previews.map((preview) => preview.skipped),
    (item) => `${sourceKey(item.source)}\n${item.reason}`,
  );
  return importPreviewSchema.parse({ kinds, skipped });
}
