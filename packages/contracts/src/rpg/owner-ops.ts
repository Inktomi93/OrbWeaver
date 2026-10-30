// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { CharacterId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import type { RpgGameConfig } from "./config.ts";
import type { RPG_GAME_MODES, RPG_GAME_STATUSES, RPG_JOURNAL_TYPES } from "./enums.ts";
import type { RpgRecordedToolCall } from "./extraction.ts";
import type { RpgSheet } from "./sheet.ts";
import type { RpgPortableCheckpoint, RpgSnapshotState } from "./snapshot.ts";

/** Cancel the owner's in-flight state rounds on a chat and return how many were signalled. */
export type CancelStateRoundsOp = (chatId: ChatId, ownerUserId: UserId) => number;

/** One `rpg_sheets` row as it travels. `characterId` null = the HOST human's sheet (the actor XOR's user
 *  arm) — on restore that is the importer, the only human the room has. */
export interface RpgPortableSheet {
  readonly characterId: CharacterId | null;
  readonly sheet: RpgSheet;
}

/** One `rpg_snapshots` row. The two-arm shape rides intact: a TURN row carries `messageId` + `variantId`
 *  (and never an as-of stamp), a HAND row carries neither and may carry `asOfMessageId`. */
export interface RpgPortableSnapshot {
  readonly messageId: MessageId | null;
  readonly variantId: MessageVariantId | null;
  readonly asOfMessageId: MessageId | null;
  readonly committed: boolean;
  readonly createdAt: number;
  readonly state: RpgSnapshotState;
}

/** One `rpg_journal` entry. `variantId` null = a HAND entry (visible on every lineage). */
export interface RpgPortableJournalEntry {
  readonly type: (typeof RPG_JOURNAL_TYPES)[number];
  readonly label: string;
  readonly title: string;
  readonly content: string;
  readonly variantId: MessageVariantId | null;
  readonly sourceMessageId: MessageId | null;
  readonly createdAt: number;
}

/** One `rpg_turn_tool_calls` row — both refs are NOT NULL at the db, so a row whose anchor did not survive
 *  the round trip is dropped by the serde before it ever reaches the write. */
export interface RpgPortableTurnToolCalls {
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly calls: readonly RpgRecordedToolCall[];
  readonly createdAt: number;
}

/** A whole chat-anchored campaign as it travels.
 *
 *  DELIBERATELY ABSENT: `gmUserId` and `gmPresetId`. Both are nullable FKs whose NULL is a REAL state
 *  (seatless / augment-your-own-preset), and both name a row that does not survive a cross-box move — a user
 *  seat and a preset id. Carrying either would land a dangling reference where the honest answer is the
 *  born-default the lite mode already ships. */
export interface RpgPortableGame {
  readonly mode: (typeof RPG_GAME_MODES)[number];
  readonly status: (typeof RPG_GAME_STATUSES)[number];
  readonly sessionNumber: number;
  readonly config: RpgGameConfig;
  readonly createdAt: number;
  readonly sheets: readonly RpgPortableSheet[];
  readonly snapshots: readonly RpgPortableSnapshot[];
  readonly journal: readonly RpgPortableJournalEntry[];
  readonly turnToolCalls: readonly RpgPortableTurnToolCalls[];
  readonly checkpoints: readonly RpgPortableCheckpoint[];
}

/** Read the whole campaign anchored to one chat, or null when the chat has no game (the common case — a
 *  gameless chat's bundle is byte-identical to one written before this plane existed). */
export type ExportRpgGame = (args: { readonly chatId: ChatId }) => Promise<RpgPortableGame | null>;

/** What {@link ImportRpgGame} did: wrote the carried campaign, kept the game the chat already has, or wrote
 *  nothing because the caller had no placeable campaign for a gameless chat. */
const RPG_IMPORT_OUTCOMES = ["restored", "kept-existing", "not-restored"] as const;
export type RpgImportOutcome = (typeof RPG_IMPORT_OUTCOMES)[number];

/** Write a carried campaign onto an imported chat. Every message/variant reference is ALREADY remapped to this
 *  box's ids by the caller. Idempotent per chat: a chat that already has a game keeps it. A deduped re-import
 *  reaches here with the room it found, which usually still holds its campaign. `game` is `null` when the
 *  caller could not place the carried campaign on this chat's rows; the op then only reports whether a game is
 *  kept, so the kept-or-lost rule has this one home and no caller re-reads `rpg_games`.
 *
 *  `hostUserId` fills the sheet actor XOR's user arm (a carried host sheet re-keys onto the importer). */
export type ImportRpgGame = (args: {
  readonly chatId: ChatId;
  readonly hostUserId: UserId;
  readonly game: RpgPortableGame | null;
}) => Promise<RpgImportOutcome>;
