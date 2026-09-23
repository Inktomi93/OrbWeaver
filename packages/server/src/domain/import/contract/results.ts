// domain/import/contract/results — the verb result shapes.

import type { CharacterId, PersonaId, WorldBookId } from "@orb/kit/ids";
import type {
  ImportAmbiguousSpeakerName,
  ImportPresetNote,
  ImportSeatedDisabledMember,
  ImportSkippedCard,
  ImportSkippedGroup,
  ImportSkippedGroupMember,
  ImportThemeNote,
  ImportUnresolvedPinnedPersona,
} from "./views.ts";

export interface ImportedCharacterRef {
  readonly characterId: CharacterId;
}

/** The orphan-dir placeholder mint's outcome. `created:false` ⇒ a prior run's mint (the synthetic
 *  dir-keyed importHash matched) — the chats still import against it, idempotently. `name` is what the
 *  evidence yielded (the majority non-sentinel header name, else the humanized dir name) — the report
 *  prints it so the owner can find every husk and flesh it out. */
export interface ImportOrphanCharacterResult {
  readonly characterId: CharacterId;
  readonly created: boolean;
  readonly name: string;
}

/** `created:false` means an existing character already carried this importHash, so no new CHARACTER was
 *  written — NOT that nothing was (#1470). That re-import RECONCILES the card's overlay planes against the
 *  existing character (a run that threw after the create leaves them missing, and the dedup key is that same
 *  row), so the counts below report what the reconcile actually landed and are NOT zero by definition on the
 *  dedup arm.
 *  `attachedBooksLinked`/`attachedBooksSkipped` report the carried book-reference re-link — skipped
 *  counts references whose id had no book the importer owns on this install (absent/foreign), reported so a
 *  cross-install import surfaces the books that didn't travel. Both 0 for a card carrying no references. */
export interface ImportCharacterResult {
  readonly characterId: CharacterId;
  readonly created: boolean;
  readonly importHash: string;
  readonly attachedBooksLinked: number;
  readonly attachedBooksSkipped: number;
  /** The card's regex-script lift (D121-E), the `attachedBooks*` precedent: fresh library rows minted from
   *  the by-value payload / candidates attached to existing rows instead of cloned. Both 0 for a script-less
   *  card and for an unwired lift op; on a dedup match they report the reconcile's lift, which content-dedups
   *  against the library and so reads as `reused` once the scripts have landed. */
  readonly regexScriptsLifted: number;
  readonly regexScriptsReused: number;
  /** The card planes this import deliberately did NOT assert, each as one operator-facing line (the
   *  {@link ImportChatFileOutcome} `skippedOverlays` model, #1598). Present even when EMPTY: "the card landed
   *  whole" has to be legible apart from "nobody looked". Today's one member is the embedded lorebook a
   *  re-upload KEEPS instead of replacing, because the character already holds a primary book the owner may
   *  have edited since (the restore verb is how they ask for the card's version back). */
  readonly skippedOverlays: readonly string[];
}

/** The RESTORE door's outcome (#1598). Never throws for a bad/unmatched card — the refusal is a value the
 *  calling door renders, exactly like {@link ImportChatFileOutcome}. `replaced:false` means the character
 *  held no primary book at all and the card's book was landed fresh (a restore onto a character whose book
 *  was deleted is still a restore). */
export type RestoreCharacterBookResult =
  | { readonly ok: true; readonly characterId: CharacterId; readonly worldBookId: WorldBookId; readonly entryCount: number; readonly replaced: boolean }
  | { readonly ok: false; readonly error: string };

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
  /** Already-imported rooms this run back-filled persona attribution onto (the dedup-skip arm's HEAL — the
   *  write op's `chatsPersonaHealed`). NOT counted as `changed`: healing an existing room writes no new canon,
   *  exactly as a merged preset or a replaced world book is not new canon. */
  readonly chatsPersonaHealed: number;
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
  /** The group wave's half of the dedup-skip HEAL count (`ImportChatsResult.chatsPersonaHealed`'s twin — an
   *  already-imported group room gains its persona attribution the same way a solo one does). */
  readonly chatsPersonaHealed: number;
  /** Display names two seated cards share: the name-only attribution fallback is withheld for them and the
   *  slots fall to the room's primary, reported rather than guessed (#1469 item 5). */
  readonly ambiguousSpeakerNames: readonly ImportAmbiguousSpeakerName[];
  /** Members ST had disabled that the room seats MUTED — the flag TRAVELLED (#1687; #1469 item 4 shipped the
   *  reporting half first, when the bulk-import wire still had no knob channel). */
  readonly seatedDisabledMembers: readonly ImportSeatedDisabledMember[];
}

export interface ImportPersonasResult {
  readonly personasCreated: number;
  readonly personasSkipped: number;
  readonly defaultPersonaId: PersonaId | null;
}

/** `importChatFile` — never throws for a malformed/unmatched file; the refusal carries the operator-facing
 *  reason the calling door renders. `created:false` ⇒ the transcript deduped against an existing chat.
 *
 *  `skippedOverlays` is the SUCCESS arm's honest half (#1469 item 6): an orb-native bundle carries planes the
 *  room's canon write does not own — the tag overlay and the rpg campaign — and each rides an OPTIONAL
 *  injected op. A composition without that op used to drop the plane with no record at all, so a discarded
 *  campaign answered a bare `{ok:true, created:true}`. Each dropped plane is now one operator-facing line
 *  here. Present even when EMPTY (the {@link ImportPresetNote} rule): "restored whole" must be legible apart
 *  from "never looked at". The chat itself always still imports — an overlay never un-writes canon. */
export type ImportChatFileOutcome =
  | { readonly ok: true; readonly created: boolean; readonly skippedOverlays: readonly string[] }
  | { readonly ok: false; readonly error: string };
