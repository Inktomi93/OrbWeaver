// domain/import/contract/results — the verb result shapes.

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type {
  ImportPresetNote,
  ImportSkippedCard,
  ImportSkippedGroup,
  ImportSkippedGroupMember,
  ImportThemeNote,
  ImportUnresolvedPinnedPersona,
} from "./views.ts";

export interface ImportedCharacterRef {
  readonly characterId: CharacterId;
}

/** created:false means an existing character already carried this importHash — nothing was written.
 *  PD-144: `attachedBooksLinked`/`attachedBooksSkipped` report the carried book-reference re-link — skipped
 *  counts references whose id had no book the importer owns on this install (absent/foreign), reported so a
 *  cross-install import surfaces the books that didn't travel. Both 0 for a card carrying no references. */
export interface ImportCharacterResult {
  readonly characterId: CharacterId;
  readonly created: boolean;
  readonly importHash: string;
  readonly attachedBooksLinked: number;
  readonly attachedBooksSkipped: number;
}

/** backfillEnqueued: whether the run enqueued a memory-backfill (only when ≥1 real_conversation chat was written).
 *  `unresolvedPinnedPersonas` is the honest half of §5.7: the chats whose ST chat-bound persona pick named
 *  nothing here. Always present (empty ⇒ every pick travelled), never a silent drop. */
export interface ImportChatsResult {
  readonly characterId: CharacterId;
  readonly chatsImported: number;
  readonly chatsSkipped: number;
  readonly messagesImported: number;
  readonly variantsImported: number;
  readonly branchesLinked: number;
  readonly backfillEnqueued: boolean;
  readonly unresolvedPinnedPersonas: readonly ImportUnresolvedPinnedPersona[];
}

/** The ST preset wave's tally. The two counts are deliberately DISTINCT: `presetsImported` is every preset the
 *  preset domain ACCEPTED (created OR merged in place), which is what the operator wants to read; only
 *  `presetsCreated` is NET-NEW canon, which is what the run's `changed` may count — a re-run of a whole-profile
 *  import merges every preset, and counting those as new canon would make an idempotent no-op report as work.
 *  (The world-book wave draws the same line with its `replaced` flag.) `notes` carries the per-preset
 *  unmapped-field list, emitted even when empty so "landed whole" is legible. */
export interface ImportPresetsResult {
  readonly presetsImported: number;
  readonly presetsCreated: number;
  readonly skippedPresets: readonly ImportSkippedCard[];
  readonly notes: readonly ImportPresetNote[];
}

/** The ST theme wave's tally — the preset wave's shape exactly. `themesImported` is every theme the settings
 *  domain ACCEPTED (created OR merged in place onto a same-named import); only `themesCreated` is NET-NEW
 *  canon, so a re-run of a whole-profile import reports zero new work. `notes` carries the per-theme
 *  unmapped-key list, emitted even when empty so "landed whole" is legible. */
export interface ImportThemesResult {
  readonly themesImported: number;
  readonly themesCreated: number;
  readonly skippedThemes: readonly ImportSkippedCard[];
  readonly notes: readonly ImportThemeNote[];
}

/** The ST group wave's tally. `groupsImported` counts rooms that actually WROTE a transcript — a second
 *  byte-identical run dedups every transcript by importHash and therefore reports zero, the same "net-new
 *  canon" line the preset wave draws. `backfillNeeded` mirrors `realConversationWritten` — the driver owns the
 *  ONE post-import enqueue, so this reports the need rather than acting on it. */
export interface ImportGroupsResult {
  readonly groupsImported: number;
  readonly groupChatsImported: number;
  readonly skippedGroups: readonly ImportSkippedGroup[];
  readonly skippedMembers: readonly ImportSkippedGroupMember[];
  readonly backfillNeeded: boolean;
  /** Same §5.7 record as the solo wave's — a group transcript can carry a chat-bound pick too, and a
   *  wave-local report field is what keeps it from being the one arm that drops it silently. */
  readonly unresolvedPinnedPersonas: readonly ImportUnresolvedPinnedPersona[];
}

export interface ImportPersonasResult {
  readonly personasCreated: number;
  readonly personasSkipped: number;
  readonly defaultPersonaId: PersonaId | null;
}

/** `importChatFile` — never throws for a malformed/unmatched file; the refusal carries the operator-facing
 *  reason the calling door renders. `created:false` ⇒ the transcript deduped against an existing chat. */
export type ImportChatFileOutcome = { readonly ok: true; readonly created: boolean } | { readonly ok: false; readonly error: string };
