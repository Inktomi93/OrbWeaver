// @orb/contracts/chat/bulk-import — the chat-OWNED bulk-import op input (Option B; D34). `import` maps its ST
// parse (`ParsedChat`, which stays import-owned) onto these CANONICAL chat shapes and calls `chat`'s
// `createBulkImportChats` op; the chat op learns nothing about SillyTavern. Persona attribution is
// pre-resolved to ids by import (so the op is persona-agnostic). A cross-boundary shape shared by import +
// chat → contracts (D34).

import type { CharacterId, ChatId, MessageId, MessageVariantId, PersonaId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { UserMacroValues } from "../preset/index.ts";
import type { CHAT_INJECTION_POSITIONS } from "./assemble.ts";
import type { ChatMetadata } from "./metadata.ts";
import type { MessageKind } from "./participants.ts";

/** One resolved variant (swipe) row for a bulk-imported message (D26 — the SELECTED variant carries the
 *  rendered content). `idx` is 0-based within the slot's pool; the economics subset is what an ST import
 *  carries (the rest of `message_variants` stays null). */
export interface BulkImportVariantInput {
  readonly idx: number;
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly ttftMs: number | null;
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  readonly metadata: Record<string, unknown> | null;
  /** The variant's INPUT token count. An orb-native bundle carries the recorded usage figure. The ST jsonl
   *  arm supplies it for a `user`/`system` slot: ST has ONE `extra.token_count` — the count of the row's own
   *  TEXT, not an API usage split — so on a non-assistant row it is an inbound count and belongs here, not in
   *  {@link tokensOut}. (Corrected by the 2026-08-08 import-fidelity audit; this doc previously claimed "ST
   *  carries no inbound count", which was a claim about ST's FIELD NAMES, not about what the value means.) */
  readonly tokensIn?: number | null;
  /** R6 (orb-native only) — the swipe's runtime-variable ops (`message_variants.variable_delta`). Carrying
   *  the DELTAS is what lets a restore re-derive `chats.runtimeVariables`, which is a cache and therefore
   *  does not travel. Absent ⇒ null (the ST arm's shape). */
  readonly variableDelta?: readonly VarOp[] | null;
}

/** R6 — one `chat_injections` row carried by an orb-native chat bundle. The per-chat prose plane: since the
 *  room-override author's-note twin was retired (owner ruling 2026-08-01) this LIST is the one prose door,
 *  and ST's single `note_prompt` slot (see {@link BulkImportChatInput.authorsNote}) can carry exactly one of
 *  them, one-way. */
export interface BulkImportInjectionInput {
  readonly position: (typeof CHAT_INJECTION_POSITIONS)[number];
  readonly depth: number;
  readonly role: MessageRole;
  readonly content: string;
  readonly order: number | null;
  readonly createdAt: number;
}

/** One resolved message slot for a bulk-imported chat. Attribution is SLOT-level (D26): the chat op stamps
 *  `authorUserId` (user turns) / `characterId` (assistant turns) itself from the run's owner/character;
 *  `personaId` is pre-resolved by import (the persona the user RP'd as, or null). `selectedIdx` selects the
 *  rendered variant out of `variants`. */
export interface BulkImportMessageInput {
  readonly role: MessageRole;
  readonly createdAt: number;
  readonly personaId: PersonaId | null;
  readonly variants: readonly BulkImportVariantInput[];
  readonly selectedIdx: number;
  /** WHICH roster character voices this assistant slot — the multi-character arm. ABSENT (or null) ⇒ the
   *  run's primary `characterId`, which is byte-identically the ST-import behavior (a single-character
   *  transcript has exactly one voice, and the op stamped it unconditionally before this field existed).
   *  A non-primary id MUST appear in the chat's {@link BulkImportChatInput.roster} — the op ownership-gates
   *  every seat, so an unrostered or foreign id is refused, never silently seated. Ignored on a `user` slot
   *  (attribution there is `authorUserId` + `personaId`). */
  readonly characterId?: CharacterId | null;
  /** The slot's DECLARED PURPOSE (`messages.kind`, D129) — carried through the import boundary rather than
   *  re-derived on the far side, because purpose is a per-row fact and every inference for it (role ×
   *  attribution × the room's dial) degrades. ABSENT ⇒ `DEFAULT_MESSAGE_KIND` (`standard`): a plain ST
   *  transcript declares no purpose, and saying so here is the explicit default D129(G) asks for.
   *
   *  `narrator` ALSO routes attribution: the row is voiced by the room's SYNTHETIC group identity — the
   *  `output:"narrator"` grammar, where one message voices the whole cast and is authored by the per-room
   *  `__group__<chatId>` character rather than any roster card (`domain/chat/verbs/turn.ts` mints it the same
   *  way for a live narrator round). That id cannot be supplied by the caller — it is keyed by a chatId the
   *  write op mints — so the DECLARATION is what rides, and the op resolves the identity through the SAME
   *  injected minter the turn verb uses. It wins over {@link characterId} when both are set. (This field
   *  replaced a `narrator?: boolean` flag: two spellings of one axis is exactly the overload D129 unwinds,
   *  and the flag could not carry `comment` at all.) Ignored on a `user` slot for attribution purposes. */
  readonly kind?: MessageKind;
}

/** One resolved chat to bulk-import into an existing character. The SUPERSET shape — every field
 *  `export/verbs/export-chat.ts` round-trips out of the db, so an orbweaver export re-imports losslessly
 *  (plain ST is the lossy subset: orb-only fields arrive empty). `importHash` is the per-chat dedup oracle
 *  (`chats.importHash`); `updatedAt` is the ST last-activity (import computes `Math.max(send_dates)`, not
 *  `now`); `parentRef` is the branch parent's source filename (resolved character-wide by the op);
 *  `authorsNote` is the ST `note_prompt`, landed as a `chat_injections` row — the ONE per-chat prose door
 *  since the room-override twin was retired (owner ruling 2026-08-01), so it does NOT round-trip back out
 *  (export has no unambiguous inverse from a LIST of injections into ST's single `note_prompt` slot);
 *  `isRealConversation` gates the memory-backfill enqueue (PD-78). */
export interface BulkImportChatInput {
  readonly title: string;
  readonly importedFrom: string;
  readonly importHash: string;
  readonly anchorPersonaId: PersonaId | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly parentRef: string | null;
  readonly authorsNote: string | null;
  readonly isRealConversation: boolean;
  readonly messages: readonly BulkImportMessageInput[];
  /** The ADDITIONAL character seats beyond the run's primary (a GROUP room). Empty/absent ⇒ the founding
   *  roster is host + the one primary character, byte-identically today's ST import. Every id is
   *  ownership-gated exactly like the primary before any row is written. */
  readonly roster?: readonly CharacterId[];
  /** The room-behavior blob (`chats.metadata`) this chat is born with — the group config / opening policy a
   *  multi-character room needs to render and generate correctly. Absent ⇒ `metadata` stays NULL, which is
   *  exactly what an ST import writes today. Callers pass an ALREADY-PARSED {@link ChatMetadata}; the column's
   *  `$type` is this same shape, so there is one home and no re-spell. An orb-native bundle instead passes the
   *  RAW carried blob (a portable file is external bytes, never a trusted parsed value) — either way the write
   *  op runs it through the column's OWN `parseChatMetadata` read seam, so there is exactly one validation home
   *  and a corrupt sub-blob heals to its default instead of landing a shape every reader must then guard. */
  readonly metadata?: ChatMetadata | Record<string, unknown>;
  // ── R6, the orb-native fidelity arm. Every field below is ABSENT on the ST jsonl path, and absent means
  // "exactly what an ST import writes today" — so declaring them changed no byte of the interchange arm.
  /** `chats.star`. Absent ⇒ false (the column default). */
  readonly star?: boolean;
  /** `chats.archived`. Absent ⇒ false (the column default). */
  readonly archived?: boolean;
  /** The portable compaction checkpoint (D25) — the summary text + the seq it covers through. Absent ⇒ null. */
  readonly compactSummary?: string | null;
  readonly compactedAtSeq?: number | null;
  /** The per-chat ChoiceBlock variable flush (`chats.variableValues`) — the CONFIG plane. Absent ⇒ null. Its
   *  runtime sibling (`runtimeVariables`) is DERIVED from the carried per-variant deltas and does not travel. */
  readonly variableValues?: Record<string, string> | null;
  /** The per-chat user-macro input picks (`chats.userMacroValues`). Absent ⇒ null. */
  readonly userMacroValues?: UserMacroValues | null;
  /** The chat's whole prose plane, verbatim. INDEPENDENT of {@link authorsNote}: an ST import supplies the
   *  single migrated note, an orb-native bundle supplies the list — never both. Absent ⇒ none. */
  readonly injections?: readonly BulkImportInjectionInput[];
}

/** R6 — the ids ONE imported chat was written under, index-aligned to the input that produced them. The
 *  orb-native bundle's cross-plane references are POSITIONAL (`messages[i].variants[j]`) precisely BECAUSE
 *  ids are not preserved across a box; this is the remap that turns those positions back into ids, so the
 *  caller can re-link the chat-anchored planes it owns (the rpg campaign) without the chat write op ever
 *  learning what an rpg game is. Alignment IS the contract: `messageIds[i]` is the row written for
 *  `messages[i]`, and `variantIds[i][j]` for `messages[i].variants[j]`. */
export interface ImportedChatIdentity {
  readonly chatId: ChatId;
  readonly messageIds: readonly MessageId[];
  readonly variantIds: readonly (readonly MessageVariantId[])[];
}

/** The tallies `createBulkImportChats` returns for one bulk-import run. `realConversationWritten` is the
 *  PD-78 backfill gate (import enqueues ONE `memory-backfill` when true). */
export interface BulkImportChatsResult {
  /** What this run actually WROTE, in input order (a dedup-skipped input contributes nothing). A write that
   *  cannot say what it wrote forces its caller to re-derive the rows by a side-channel lookup: the demo-chat
   *  seeder needs the chat id to attach its rpg game through rpg's own create door, and the R6 bundle import
   *  needs the message/variant remap to re-link the carried campaign. ONE answer for both — a bare
   *  `chatIds` beside this would be the same fact spelled twice. */
  readonly written: readonly ImportedChatIdentity[];
  readonly chatsImported: number;
  readonly chatsSkipped: number;
  readonly messagesImported: number;
  readonly variantsImported: number;
  readonly branchesLinked: number;
  readonly realConversationWritten: boolean;
}
