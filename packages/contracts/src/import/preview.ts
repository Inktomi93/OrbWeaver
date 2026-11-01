// What a dry-run profile import reports it would do. Every string comes from a hostile file, so the server clips
// it and caps each list; `total` stays exact when `items` is capped. The client renders names as plain text.

import { z } from "zod";

export const IMPORT_PREVIEW_KINDS = ["characters", "chats", "personas", "worlds", "presets", "themes", "backgrounds", "groups", "orphans"] as const;
export type ImportPreviewKind = (typeof IMPORT_PREVIEW_KINDS)[number];

/** The most entries one preview list holds, so a stored run and its bus frame stay small. */
export const IMPORT_PREVIEW_LIST_MAX = 500;
/** The longest name, source or reason a preview holds. */
export const IMPORT_PREVIEW_TEXT_MAX = 200;

const previewText = z.string().max(IMPORT_PREVIEW_TEXT_MAX);

const importPreviewItemSchema = z.strictObject({
  /** The item's identity in the folder: its file, or its name where it has no file. The same file in two
   *  uploads of a split folder is one item. */
  source: previewText,
  name: previewText,
  /** A character the owner already has; a run imports nothing for it. Absent otherwise. */
  inLibrary: z.literal(true).optional(),
});
export type ImportPreviewItem = z.infer<typeof importPreviewItemSchema>;

const importPreviewListSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  items: z.array(importPreviewItemSchema).max(IMPORT_PREVIEW_LIST_MAX).readonly(),
});
export type ImportPreviewList = z.infer<typeof importPreviewListSchema>;

const importPreviewSkipSchema = z.strictObject({ source: previewText, reason: previewText });
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

/** One preview over the uploads of a split folder. Shared files and repeated cards repeat across uploads, so
 *  listed items union by source; a capped list's unlisted tail cannot be compared and is added. A skip unions by
 *  source and reason together: one source can be skipped two ways, and each way is its own row. */
export function mergeImportPreviews(previews: readonly ImportPreview[]): ImportPreview {
  const kinds = Object.fromEntries(
    IMPORT_PREVIEW_KINDS.map((kind) => [
      kind,
      union(
        previews.map((preview) => preview.kinds[kind]),
        (item) => item.source,
      ),
    ]),
  );
  const skipped = union(
    previews.map((preview) => preview.skipped),
    (item) => `${item.source}\n${item.reason}`,
  );
  return importPreviewSchema.parse({ kinds, skipped });
}
