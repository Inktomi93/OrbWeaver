// World-info WIRE schemas — the cross-boundary book/entry shapes (zod + inferred types) the tRPC router
// (server) AND the client form validators both need at RUNTIME. The client may not import `@orb/server`,
// so these live in `@orb/contracts` (which the client can depend on); the kit↔contracts split keeps the
// pure leaf primitives (scope/position tuples, the metadata resolvers, the keyword engine, the role axis,
// the injection placement shape) DOWN in `@orb/kit` and imports them here (shared-dissolution §1/§5).
//
// World info is BOOKS-ONLY: a book contains keyword-triggered entries; a book attaches at one of four
// scopes (global / character / chat / persona) and the per-turn pool unions all four. Per-entry behavior
// (always-vs-keyword via `scopeMode`, depth-injection via `inject`, system-half bucket via `position`)
// rides on the entry in `metadata` and applies uniformly however the entry's book reached the pool.
//
// D32: the entry-metadata `inject` field is the SHARED injection directive (`@orb/kit/injection`) — its
// role is `z.enum(MESSAGE_ROLES)` (the canonical axis, `@orb/kit/message-role`), NOT a world-info-local
// re-spell. There is no `EntryInjectionRole`; the role IS `MessageRole`. The ST numeric role bimap and the
// `resolveEntry*` readers moved to kit; only the wire schemas + the write guard live here.
// D28: `characterBooks` keys on `characters.id` (no character versions) — a db/domain concern; the entry
// wire schema below is identity-agnostic and carries no association key.

import type { ChatId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import { ENTRY_POSITIONS, ENTRY_SCOPE_MODES } from "@orb/kit/world-info";
import { z } from "zod";

// ── Field bounds (named — noMagicNumbers) ──────────────────────────────────
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const KEY_MAX = 2000;
const KEYS_MAX = 500;
const CONTENT_MAX = 100_000;
const PRIORITY_MIN = -1_000_000;
const PRIORITY_MAX = 1_000_000;

// ── Book role axis (canonical home; contract/views.ts derives from this) ────
// `primary` is the card-bound book that travels on export/import (at-most-one per character, enforced at
// the verb layer); `auxiliary` books are per-installation extras layered on top (no cap). Only meaningful
// on the `character` scope — global / chat / persona attachments have no role distinction. No kit resolver
// reads it (roles are a CRUD/attachment concern), so the tuple lives wholly here.
export const WORLD_BOOK_ROLES = ["primary", "auxiliary"] as const;
export const worldBookRoleSchema = z.enum(WORLD_BOOK_ROLES);
export type WorldBookRole = z.infer<typeof worldBookRoleSchema>;

// ── World-info scope (runtime fire-mode an entry resolves to) ───────────────
// `always` entries fire every turn (cache-stable); `keyword` entries fire only when their keys match the
// recent-message + name haystack. The resolver (`resolveEntryScope`) lives in `@orb/kit/world-info`; this
// is the wire/event-payload form (carried in the deferred entry-level WiBusEvent variants).
export const WORLD_INFO_SCOPES = ["always", "keyword"] as const;
export const worldInfoScopeSchema = z.enum(WORLD_INFO_SCOPES);
export type WorldInfoScope = z.infer<typeof worldInfoScopeSchema>;

// ── Book CRUD wire schemas ─────────────────────────────────────────────────
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

// ── Entry metadata ─────────────────────────────────────────────────────────
// The typed read shape carried in `EntryView.metadata`. Loose: unknown keys (e.g. preserved ST entry
// fields from import) ride through untouched, but the three load-bearing fields are typed. `inject` is the
// shared `{depth, role?}` directive from `@orb/kit/injection` (role = `MessageRole`, D32); `scopeMode` and
// `position` enum the kit tuples DOWN.
export const entryMetadataSchema = z.looseObject({
  scopeMode: z.enum(ENTRY_SCOPE_MODES).optional(),
  inject: injectionDirectiveSchema.optional(),
  position: z.enum(ENTRY_POSITIONS).optional(),
});
export type EntryMetadata = z.infer<typeof entryMetadataSchema>;

// Depth at which a trailing `assistant` injection becomes a response PREFILL (unsupported across
// providers) — rejected at write. 0 = the tail, after the new user turn.
const PREFILL_DEPTH = 0;

/** Write-side metadata guard. The blob stays a lenient open record — callers building arbitrary blobs keep
 *  compiling against `Record<string, unknown>` and unknown keys ride through — but the load-bearing fields
 *  are validated when present (a typo'd `scopeMode`/`inject` is rejected at WRITE instead of silently
 *  disabling the entry's behavior at READ), AND a `assistant`-role injection at depth 0 (a trailing
 *  assistant message = response prefill) is rejected. The read path stays lenient (kit's `resolveEntry*`
 *  normalizes legacy/ST-imported entries at run time). */
export const entryMetadataWriteSchema = z
  .record(z.string(), z.unknown())
  .superRefine((val, ctx): void => {
    const known = entryMetadataSchema.safeParse(val);
    if (!known.success) {
      for (const issue of known.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
      }
      return;
    }
    const inj = known.data.inject;
    if (inj !== undefined && inj.role === "assistant" && inj.depth === PREFILL_DEPTH) {
      ctx.addIssue({
        code: "custom",
        path: ["inject"],
        message:
          "assistant-role at depth 0 is a response prefill — unsupported across providers. Use depth >= 1, or role user/system.",
      });
    }
  });

// ── Entry CRUD wire schemas ────────────────────────────────────────────────
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

// ── Cross-boundary views (client deep-imports; domain contract/views.ts derives) ────
/** A world book — the top-level container that holds entries. Owner-scoped via `worldBooks.ownerId`. */
export interface BookView {
  id: WorldBookId;
  name: string;
  description: string | null;
  createdAt: number;
}

/** A single entry inside a book — the thing injected into the prompt when the entry's scope fires.
 *  `description` is the author-facing memo (= ST's `comment`), never injected; `content` is what the model
 *  sees. `metadata` is parsed ONCE at the DB read seam (`toEntryView`) to the typed `EntryMetadata | null`
 *  — downstream consumers receive the typed shape, not `unknown`. */
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

/** Book-attachment view: the book's metadata + an optional `role` for `character` attachments. Returned by
 *  `listForCharacter` (carries role) and `listFor{Chat,Persona}` + `listGlobal` (role is null on those). */
export interface BookAttachmentView extends BookView {
  /** Only meaningful for character attachments. `null` for the other three scopes. */
  role: WorldBookRole | null;
}

// ── WI bus events (emitted by the WorldInfoService, carried by the chat bus) ────
// Only chat-scoped attachment changes surface here — cv-/user-/persona-scoped attachments affect many
// chats and would need a per-user/per-cv bus shape; add a separate subset when that demand arrives rather
// than overloading this one. The `surface` field is shaped for future expansion but `chat` is the only
// valid value today. `contracts/chat` embeds this union in `ChatBusEvent`.
//
// FLAG[PD-89] (world-info.md movement table): only `wiBookAttached`/`wiBookDetached` are emitted today.
// The three entry-level variants are declared but UNWIRED — kept for future per-entry keyword/scope edits
// that must invalidate a chat's WI pool. Do NOT auto-delete and do NOT pre-wire emitters; the criterion to
// wire is a per-entry edit needing pool invalidation, emitted from the `entries/` verbs.
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
