// domain/rpg/contract/portability — the TWO portability ops of the chat-anchored campaign (R6), in one
// contract file because they share one DI bundle and one shape. Standalone factories (db + clock + the id
// mints only), principal-less by design: the delivery core knows only `ownerId`, and the chat-bundle's
// export/import verbs already ran their own host/ownership gate on the CHAT before either op is reached
// (authority is INHERITED through the chat FK chain — D23: rpg stamps no owner anywhere). The databank
// portability-write is the precedent for the whole shape.
//
// WHY rpg NEEDS ITS OWN PAIR rather than riding the chat serde: a campaign is six tables the chat domain
// does not own, and three of them (`rpg_snapshots`, `rpg_journal`, `rpg_turn_tool_calls`) are keyed to
// MESSAGES and VARIANTS. Reaching into them from `domain/chat` would be a sideways write; reaching into
// chat from here would be the same crime the other way. So these are INJECTED OPS the `export`/`import`
// aggregators wire at the composition root (§1d tier 3) — the same seam `importLorebook`/`linkCarriedBooks`
// already use for the world-info planes a card carries.
//
// THESE OPS SPEAK RAW IDS, NEVER BUNDLE POSITIONS. The portable file's cross-plane references are positional
// (`messages[i].variants[j]`) because ids are not preserved across a box — but that is the SERDE's business.
// The export verb resolves ids → positions on the way out and positions → ids on the way in (through the
// `ImportedChatIdentity` remap the chat write op returns), so rpg never learns what a bundle index is and
// the serde never learns what a `MessageVariantId` is.

import type {
  RPG_CHECKPOINT_TRIGGERS,
  RPG_GAME_MODES,
  RPG_GAME_STATUSES,
  RPG_JOURNAL_TYPES,
  RpgGameConfig,
  RpgRecordedToolCall,
  RpgSheet,
  RpgSnapshotState,
} from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import type { RpgIdMints } from "./service.ts";

/** The DI bundle both rpg portability ops close over. */
export interface RpgPortabilityContext {
  readonly db: Db;
  readonly now: () => number;
  readonly ids: RpgIdMints;
}

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

/** One `rpg_checkpoints` row, pointing at its snapshot by POSITION in {@link RpgPortableGame.snapshots} —
 *  the one place a position appears in this contract, because a checkpoint's target is an rpg row this same
 *  payload mints, not a chat row the caller remaps. RESTRICT at the db makes a dangling target a hard error,
 *  so the serde prunes an unresolvable one rather than letting it abort the restore. */
export interface RpgPortableCheckpoint {
  readonly snapshotIndex: number;
  readonly label: string;
  readonly trigger: (typeof RPG_CHECKPOINT_TRIGGERS)[number];
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

/** Write a carried campaign onto a freshly-imported chat. Every message/variant reference is ALREADY
 *  remapped to this box's ids by the caller. Idempotent by construction rather than by dedup key: the chat
 *  it anchors to was minted by this same import, so a re-run of the bundle produces a NEW chat and a new
 *  game — there is no pre-existing game to collide with, and a chat that deduped never reaches here.
 *
 *  `hostUserId` fills the sheet actor XOR's user arm (a carried host sheet re-keys onto the importer). */
export type ImportRpgGame = (args: { readonly chatId: ChatId; readonly hostUserId: UserId; readonly game: RpgPortableGame }) => Promise<void>;
