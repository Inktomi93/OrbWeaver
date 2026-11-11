// World-info WIRE schemas — cross-boundary book/entry shapes the tRPC router AND client form validators
// both need at runtime. World info is BOOKS-ONLY: a book contains keyword-triggered entries, attaches at
// one of four scopes (global/character/chat/persona), and the per-turn pool unions all four.
// `inject` reuses the shared `@orb/kit/injection` directive; role is the canonical `MessageRole`, never a
// world-info-local re-spell.

// Strip mode: these schemas also read stored rows, which can carry keys this release does not declare; the wire parses a strict form (`strictTwin` or a `.strict()` view).
import type { CharacterId, ChatId, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import type { JsonObject } from "@orb/kit/json";
import { jsonMemberSchema, jsonObjectSchema } from "@orb/kit/json";
import { ENTRY_KEY_MODES, ENTRY_POSITIONS, ENTRY_SCOPE_MODES } from "@orb/kit/world-info";
import { z } from "zod";

/** The cap on a book or entry name. */
export const WORLD_INFO_NAME_MAX = 200;
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
const WORLD_INFO_SCOPES = ["always", "keyword"] as const;
const worldInfoScopeSchema = z.enum(WORLD_INFO_SCOPES);
export type WorldInfoScope = z.infer<typeof worldInfoScopeSchema>;

export const createBookSchema = z.strictObject({
  name: z.string().min(1).max(WORLD_INFO_NAME_MAX),
  description: z.string().max(DESCRIPTION_MAX).optional(),
});
export type CreateBookInput = z.infer<typeof createBookSchema>;

export const updateBookSchema = z.strictObject({
  name: z.string().min(1).max(WORLD_INFO_NAME_MAX).optional(),
  description: z.string().max(DESCRIPTION_MAX).optional(),
});
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

// Machine-writer provenance an automated upserter (the D46 automation writer today; the purged chat/rpg
//  agents keepers were the other two intended consumers — the rebuild wires them onto the same shape if either
//  domain returns) stamps onto an entry it owns. `contentHash` is the sha256-hex of the content AS THE WRITER
//  LEFT IT — the hand-edit-safe belt: a `upsertEntries` re-run that finds the CURRENT content no longer
//  hashing to this value knows a human curated the entry and SKIPS it (the host's hand always wins). Generic on purpose — the
//  shared `upsertEntries` mint owns this shape so every machine consumer inherits the same guarantee.
const loreEntryProvenanceSchema = z
  .object({
    contentHash: z.string(),
  })
  .strip();
export type LoreEntryProvenance = z.infer<typeof loreEntryProvenanceSchema>;

// Loose: unknown keys (e.g. preserved ST entry fields) ride through untouched; the load-bearing fields are
// typed. `provenance` is the machine-writer provenance (above) — present only on entries an upserter owns.
// (Renamed from `crew` by the vocab kill; pre-launch NO-LEGACY, so a pre-rename row's `crew` key
// rides through as an inert unknown key and the writer re-stamps `provenance`. Note for the record only —
// no such row exists pre-launch, so this is comment-accuracy, not a live gap: on a hypothetical pre-rename
// row the hand-edit belt would be DISARMED, not merely inert — `upsertEntries` reads
// `metadata.provenance?.contentHash` (`upsert-entries.ts`) to detect a human hand-edit, and that reads
// `undefined` on a `crew`-only row, which the belt treats as "never machine-owned" and overwrites
// unconditionally; the stale `crew` key would also persist beside the new `provenance`, since the
// upsert spreads `prior.metadata` forward rather than stripping retired keys.)
//
// The brand makes this schema the only producer of a value the `world_entries.metadata` column takes, so a writer
// cannot store an object it never narrowed: see {@link narrowEntryMetadata}.
export const entryMetadataSchema = z
  .object({
    scopeMode: z.enum(ENTRY_SCOPE_MODES).exactOptional(),
    /** How the entry's keys compile — the orb spelling of Character-Card-V3 `use_regex`, normalized in by the
     *  card serde (`loreEntryMetadata`). Absent ⇒ `literal`. */
    keyMode: z.enum(ENTRY_KEY_MODES).exactOptional(),
    inject: injectionDirectiveSchema.exactOptional(),
    position: z.enum(ENTRY_POSITIONS).exactOptional(),
    provenance: loreEntryProvenanceSchema.exactOptional(),
  })
  .catchall(jsonMemberSchema)
  .brand<"EntryMetadata">();
export type EntryMetadata = z.infer<typeof entryMetadataSchema>;

/** The one narrowing of a written metadata object into {@link EntryMetadata}. Every writer passes it: the write
 *  schema hands out a plain {@link JsonObject} and the import serdes an object decoded from a file, and the
 *  column takes only this function's branded output.
 *  @throws ZodError when a known field is out of shape. */
export function narrowEntryMetadata(raw: Readonly<Record<string, unknown>> | null): EntryMetadata | null {
  return raw === null ? null : entryMetadataSchema.parse(raw);
}

// Write-side metadata guard: stays an open JSON object (unknown keys ride through), but the known fields are
//  validated when present — a typo'd `scopeMode`/`inject` rejects at WRITE.
//
//  The two hops are deliberate (the `personaMetadataWriteSchema` rationale): the plain `JsonObject` OUTPUT keeps
//  the wire input unnarrowed so every writer passes the one narrowing seam, {@link narrowEntryMetadata}. The
//  `code:"custom"` re-emit is an ACCEPTED loss for the same reason stated there: forwarding the original issue
//  does not typecheck on 4.4.3 (`$ZodIssue` lacks `$ZodRawIssue`'s index signature) and `message` + `path` —
//  what a client renders — survive the flatten.
const entryMetadataWriteSchema = jsonObjectSchema.superRefine((val, ctx): void => {
  const known = entryMetadataSchema.safeParse(val);
  if (!known.success) {
    for (const issue of known.error.issues) {
      ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
    }
  }
}) satisfies z.ZodType<JsonObject, Record<string, unknown>>;

export const createEntrySchema = z.strictObject({
  title: z.string().min(1).max(WORLD_INFO_NAME_MAX),
  content: z.string().min(1).max(CONTENT_MAX),
  /** Keyword triggers — fires the entry when scope=`keyword`. Each key is matched case-insensitively
   *  whole-word against the scan-depth window of recent messages. */
  keys: z.array(z.string().max(KEY_MAX)).max(KEYS_MAX).optional(),
  priority: z.int().min(PRIORITY_MIN).max(PRIORITY_MAX).optional(),
});
export type CreateEntryInput = z.infer<typeof createEntrySchema>;

export const updateEntrySchema = z.strictObject({
  title: z.string().min(1).max(WORLD_INFO_NAME_MAX).optional(),
  description: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  content: z.string().min(1).max(CONTENT_MAX).optional(),
  keys: z.array(z.string().max(KEY_MAX)).max(KEYS_MAX).optional(),
  enabled: z.boolean().optional(),
  priority: z.int().min(PRIORITY_MIN).max(PRIORITY_MAX).optional(),
  ignoreBudget: z.boolean().optional(),
  metadata: entryMetadataWriteSchema.nullable().optional(),
});
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;

/** A world book — the top-level container that holds entries. Owner-scoped via `worldBooks.ownerId`. */
export interface BookView {
  id: WorldBookId;
  name: string;
  description: string | null;
}

/** Per-scope attachment rollup for one book — "where does this book fire?", read from the book's side.
 *  The four scopes are the four junctions (`global_books` / `character_books` / `persona_books` /
 *  `chat_books`); `global` is a FLAG, not a count, because `global_books` keys on the book itself (a book
 *  is global or it is not). `total` counts the global scope as one attachment, so "attached ×0" and
 *  "unattached" are the same statement. */
export interface BookUsage {
  characters: number;
  personas: number;
  chats: number;
  global: boolean;
  total: number;
}

/** A book plus the two DERIVED numbers a library row states about it: how big it is, and where it fires.
 *  The `TagWithUsage` shape one domain over, for the same reason — a roster row that can only show a name
 *  makes the reader open every book to find the one they meant. */
export interface BookWithUsage extends BookView {
  entryCount: number;
  usage: BookUsage;
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

const INHERITED_BOOK_SOURCES = ["global", "character", "persona"] as const;
export type InheritedBookSource = (typeof INHERITED_BOOK_SOURCES)[number];

/** A room attachment, or an eligible runtime source the room inherits without granting automation writes. */
export interface ChatBookView extends BookAttachmentView {
  readonly inherited?: { readonly source: InheritedBookSource; readonly name: string | null } | undefined;
}

/** The owner-scoped reverse index for one book's character/persona activation controls. Deliberately
 *  excludes chats (membership-scoped in the room) and global (its own one-row query). */
export interface BookAttachmentTargets {
  readonly characters: readonly { readonly characterId: CharacterId; readonly role: WorldBookRole }[];
  readonly personaIds: readonly PersonaId[];
}

export const bookViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.worldBook),
  name: z.string(),
  description: z.string().nullable(),
}) satisfies z.ZodType<BookView>;
const bookUsageSchema = z.strictObject({
  characters: z.number(),
  personas: z.number(),
  chats: z.number(),
  global: z.boolean(),
  total: z.number(),
}) satisfies z.ZodType<BookUsage>;
export const bookWithUsageSchema = bookViewSchema.extend({ entryCount: z.number(), usage: bookUsageSchema }) satisfies z.ZodType<BookWithUsage>;
export const entryViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.worldEntry),
  worldBookId: typeIdSchema(ID_PREFIX.worldBook),
  title: z.string(),
  description: z.string().nullable(),
  content: z.string(),
  keys: z.array(z.string()).nullable(),
  enabled: z.boolean(),
  priority: z.number(),
  ignoreBudget: z.boolean(),
  metadata: entryMetadataSchema.nullable(),
}) satisfies z.ZodType<EntryView>;
export const bookAttachmentViewSchema = bookViewSchema.extend({ role: worldBookRoleSchema.nullable() }) satisfies z.ZodType<BookAttachmentView>;
export const chatBookViewSchema = bookAttachmentViewSchema.extend({
  inherited: z.strictObject({ source: z.enum(INHERITED_BOOK_SOURCES), name: z.string().nullable() }).optional(),
}) satisfies z.ZodType<ChatBookView>;
export const bookAttachmentTargetsSchema = z.strictObject({
  characters: z.array(z.strictObject({ characterId: typeIdSchema(ID_PREFIX.character), role: worldBookRoleSchema })).readonly(),
  personaIds: z.array(typeIdSchema(ID_PREFIX.persona)).readonly(),
}) satisfies z.ZodType<BookAttachmentTargets>;
export interface DetachResult {
  readonly detached: boolean;
}
export interface BackfillResult {
  readonly filled: number;
}
export interface ReorderResult {
  readonly reordered: number;
}
export const detachResultSchema = z.strictObject({ detached: z.boolean() }) satisfies z.ZodType<DetachResult>;
export const backfillResultSchema = z.strictObject({ filled: z.number() }) satisfies z.ZodType<BackfillResult>;
export const reorderResultSchema = z.strictObject({ reordered: z.number() }) satisfies z.ZodType<ReorderResult>;

// Entry-level variants are emitted by domain/world-info/verbs/entries/{create,update,remove}.

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
 *  in place (the restore door); `created` = a fresh book row was minted. Both false = the book content-matched
 *  an owned book and that row was reused. `name` is the name the book landed under; `renamedFrom` is the
 *  file's own name when the landed name took a collision suffix. */
interface BulkImportLorebookResultBase {
  readonly worldBookId: WorldBookId;
  readonly entryCount: number;
  readonly name: string;
  readonly renamedFrom: string | null;
}

export type BulkImportLorebookResult = BulkImportLorebookResultBase &
  (
    | { readonly created: true; readonly replaced: false }
    | { readonly created: false; readonly replaced: true }
    | { readonly created: false; readonly replaced: false }
  );

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// upsertEntries — the SHARED machine-writer bulk op (D58 satellite). The ONE
// home for hand-edit-safe lore upkeep: the D46 automation writer injects it today (the chat agents keeper and
// rpg lorebook upkeep were the other two intended consumers before the purge — the rebuild wires
// them here too, never a fork of the fence-strip/compare copy). The op upserts by (bookId,
// title) — a re-run REPLACES its own prior entry for the same title — and NEVER overwrites a human-curated
// entry (the stored `metadata.provenance.contentHash` vs the current content is the guard). Caller policy (caps,
// merge-mode, span-stamped names, mark advance) stays with the caller; the SKIP semantics live here so every
// consumer inherits them.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** One entry a machine writer upserts. `title` is the upsert key within the book; `keys` drive the keyword
 *  match (a keeper entry is keyed, not constant). */
export interface UpsertLoreEntryInput {
  readonly title: string;
  readonly keys: readonly string[];
  readonly content: string;
}

/** The shared machine-writer op: upsert `entries` into `bookId` as the book owner `authorUserId`. */
export type UpsertEntriesOp = (args: {
  readonly authorUserId: UserId;
  readonly bookId: WorldBookId;
  readonly entries: readonly UpsertLoreEntryInput[];
}) => Promise<void>;

/** One row of a book's entry index — the lean shape a machine writer reads to build its merge/dedup prompt
 *  and count against a per-book cap (never the full `EntryView`). */
export interface LoreEntryIndexRow {
  readonly title: string;
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

export const worldBookIdInputSchema = z.strictObject({ bookId: typeIdSchema(ID_PREFIX.worldBook) });

export const worldEntryIdInputSchema = z.strictObject({ entryId: typeIdSchema(ID_PREFIX.worldEntry) });

export const worldInfoCharacterInputSchema = z.strictObject({ characterId: typeIdSchema(ID_PREFIX.character) });

export const worldInfoPersonaInputSchema = z.strictObject({ personaId: typeIdSchema(ID_PREFIX.persona) });

export const worldInfoChatInputSchema = z.strictObject({ chatId: typeIdSchema(ID_PREFIX.chat), includeInherited: z.boolean().optional() });
