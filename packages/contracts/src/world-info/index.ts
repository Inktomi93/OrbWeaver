// World-info WIRE schemas — cross-boundary book/entry shapes the tRPC router AND client form validators
// both need at runtime. World info is BOOKS-ONLY: a book contains keyword-triggered entries, attaches at
// one of four scopes (global/character/chat/persona), and the per-turn pool unions all four.
// `inject` reuses the shared `@orb/kit/injection` directive; role is the canonical `MessageRole`, never a
// world-info-local re-spell.

import type { ChatId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import { ENTRY_POSITIONS, ENTRY_SCOPE_MODES } from "@orb/kit/world-info";
import { z } from "zod";

const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const KEY_MAX = 2000;
const KEYS_MAX = 500;
const CONTENT_MAX = 100_000;
const PRIORITY_MIN = -1_000_000;
const PRIORITY_MAX = 1_000_000;

// `primary` is the card-bound book that travels on export/import (at-most-one per character); `auxiliary`
// books are per-installation extras (no cap). Only meaningful on the `character` scope.
export const WORLD_BOOK_ROLES = ["primary", "auxiliary"] as const;
export const worldBookRoleSchema = z.enum(WORLD_BOOK_ROLES);
export type WorldBookRole = z.infer<typeof worldBookRoleSchema>;

// `always` entries fire every turn; `keyword` entries fire only on a recent-message/name keyword match.
export const WORLD_INFO_SCOPES = ["always", "keyword"] as const;
export const worldInfoScopeSchema = z.enum(WORLD_INFO_SCOPES);
export type WorldInfoScope = z.infer<typeof worldInfoScopeSchema>;

export const createBookSchema = z.object({
  name: z.string().min(1).max(NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX).optional(),
});
export type CreateBookInput = z.infer<typeof createBookSchema>;

export const updateBookSchema = z.object({
  name: z.string().min(1).max(NAME_MAX).optional(),
  description: z.string().max(DESCRIPTION_MAX).optional(),
});
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

// Loose: unknown keys (e.g. preserved ST entry fields) ride through untouched; the three load-bearing
// fields are typed.
export const entryMetadataSchema = z.looseObject({
  scopeMode: z.enum(ENTRY_SCOPE_MODES).optional(),
  inject: injectionDirectiveSchema.optional(),
  position: z.enum(ENTRY_POSITIONS).optional(),
});
export type EntryMetadata = z.infer<typeof entryMetadataSchema>;

/** Write-side metadata guard: stays a lenient open record (unknown keys ride through), but the
 *  load-bearing fields are validated when present — a typo'd `scopeMode`/`inject` rejects at WRITE. */
export const entryMetadataWriteSchema = z
  .record(z.string(), z.unknown())
  .superRefine((val, ctx): void => {
    const known = entryMetadataSchema.safeParse(val);
    if (!known.success) {
      for (const issue of known.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
    }
  });

export const createEntrySchema = z.object({
  title: z.string().min(1).max(NAME_MAX),
  /** Author-facing memo (= ST's `comment`). Optional; rendered in the entry list. NEVER prompt. */
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  content: z.string().min(1).max(CONTENT_MAX),
  /** Keyword triggers — fires the entry when scope=`keyword`. Each key is matched case-insensitively
   *  whole-word against the scan-depth window of recent messages. */
  keys: z.array(z.string().max(KEY_MAX)).max(KEYS_MAX).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(PRIORITY_MIN).max(PRIORITY_MAX).optional(),
  /** Opt-out of the per-turn WI token budget — must-have lore that should never be silently dropped. */
  ignoreBudget: z.boolean().optional(),
  metadata: entryMetadataWriteSchema.nullable().optional(),
});
export type CreateEntryInput = z.infer<typeof createEntrySchema>;

export const updateEntrySchema = z.object({
  title: z.string().min(1).max(NAME_MAX).optional(),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  content: z.string().min(1).max(CONTENT_MAX).optional(),
  keys: z.array(z.string().max(KEY_MAX)).max(KEYS_MAX).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().min(PRIORITY_MIN).max(PRIORITY_MAX).optional(),
  ignoreBudget: z.boolean().optional(),
  metadata: entryMetadataWriteSchema.nullable().optional(),
});
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

/** A world book — the top-level container that holds entries. Owner-scoped via `worldBooks.ownerId`. */
export interface BookView {
  id: WorldBookId;
  name: string;
  description: string | null;
  createdAt: number;
}

/** A single entry inside a book — injected into the prompt when the entry's scope fires. `description`
 *  is the author-facing memo, never injected; `content` is what the model sees. */
export interface EntryView {
  id: WorldEntryId;
  worldBookId: WorldBookId;
  title: string;
  description: string | null;
  content: string;
  /** Keyword triggers for `scope: keyword` entries — case-insensitive whole-word match. */
  keys: string[] | null;
  enabled: boolean;
  priority: number;
  /** When true, this entry bypasses the per-turn WI token budget (must-have lore). */
  ignoreBudget: boolean;
  metadata: EntryMetadata | null;
}

/** Book-attachment view: the book's metadata + an optional `role` for `character` attachments. */
export interface BookAttachmentView extends BookView {
  /** Only meaningful for character attachments. `null` for the other three scopes. */
  role: WorldBookRole | null;
}

// Entry-level variants are emitted by domain/world-info/verbs/entries/{create,update,remove} (PD-89 done).

/** One resolved lore entry to bulk-import. `keys` is null-collapsed by the writer (empty =\> NULL);
 *  `metadata` is validated through `entryMetadataSchema` at the write seam, never trusted raw. */
export interface BulkImportLoreEntryInput {
  readonly title: string;
  readonly description: string | null;
  readonly content: string;
  readonly keys: readonly string[];
  readonly enabled: boolean;
  readonly priority: number;
  readonly ignoreBudget: boolean;
  readonly metadata: Record<string, unknown> | null;
}

/** One resolved embedded lorebook to bulk-import into a character (the `world_books` header + its entries).
 *  The card-bound book is the `character_books` `role:'primary'` slot (at-most-one per character) — the
 *  replace key for a D28 re-import (there is no provenance column on `world_books`). */
export interface BulkImportLorebookInput {
  readonly name: string;
  readonly description: string | null;
  readonly entries: readonly BulkImportLoreEntryInput[];
}

/** The result of one lorebook bulk-import run. `replaced` = an existing primary book's entries were swapped
 *  in place (a D28 re-import); false = a fresh book was created + primary-attached. */
export interface BulkImportLorebookResult {
  readonly worldBookId: WorldBookId;
  readonly entryCount: number;
  readonly replaced: boolean;
}

export type WiBusEvent =
  | { type: "wiBookAttached"; chatId: ChatId; surface: "chat"; bookId: WorldBookId }
  | { type: "wiBookDetached"; chatId: ChatId; surface: "chat"; bookId: WorldBookId }
  | {
      type: "wiEntryAttached";
      chatId: ChatId;
      surface: "chat";
      entryId: WorldEntryId;
      scope: WorldInfoScope;
    }
  | { type: "wiEntryDetached"; chatId: ChatId; surface: "chat"; entryId: WorldEntryId }
  | {
      type: "wiEntryScopeChanged";
      chatId: ChatId;
      surface: "chat";
      entryId: WorldEntryId;
      scope: WorldInfoScope;
    };
