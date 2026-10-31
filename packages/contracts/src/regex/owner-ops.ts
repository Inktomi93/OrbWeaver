// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { CharacterId, ChatId, RegexScriptId, UserId } from "@orb/kit/ids";
import type { PortableFile } from "#portability";
import type { ExportedCardScripts, ImportCardScriptsArgs, ImportCardScriptsResult, ImportGlobalScriptsArgs, ImportPresetScriptsArgs } from "./schemas.ts";

/** The rooms each script reaches, keyed by script id. */
export type ResolveRegexScriptRoomsOp = (scriptIds: readonly RegexScriptId[]) => Promise<Map<RegexScriptId, ChatId[]>>;

/** Capture the rooms the scripts reach before junction teardown; call the thunk with the ids that were deleted. */
export type CaptureRegexRoomReachOp = (scriptIds: readonly RegexScriptId[]) => Promise<(deleted: readonly RegexScriptId[]) => void>;

/** The card lift: a card's by-value scripts become library rows and character attachments. */
export type ImportCardScripts = (args: ImportCardScriptsArgs) => Promise<ImportCardScriptsResult>;

export type ImportPresetScripts = (args: ImportPresetScriptsArgs) => Promise<ImportCardScriptsResult>;

export type ImportGlobalScripts = (args: ImportGlobalScriptsArgs) => Promise<ImportCardScriptsResult>;

/** The card re-embed: the character's attached scripts back out to the card-wire shape. */
export type ExportCardScripts = (args: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<ExportedCardScripts>;

/** Every script the owner owns, one portable file each. */
export type ExportRegexScripts = (args: { readonly ownerId: UserId }) => Promise<readonly PortableFile[]>;

/** One owned script as its portable file. A foreign or absent id answers `null`. */
export type ExportRegexScript = (args: { readonly ownerId: UserId; readonly scriptId: RegexScriptId }) => Promise<PortableFile | null>;

/** Import one `regex/*.json`. `created: false` means it matched an existing row. */
export type ImportRegexScript = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array }) => Promise<{ readonly created: boolean }>;

/** The host-handoff regex copy takes these args. The copy returns unexecuted statements, so its signature stays
 *  with each consuming domain. */
export interface CopyHandoffRegexScriptsArgs {
  readonly fromOwnerId: UserId;
  readonly toOwnerId: UserId;
  readonly chatId: ChatId;
}

/** How many script rows the handoff regex copy would mint for `toOwnerId`. Read-only. */
export type CountHandoffRegexScripts = (args: CopyHandoffRegexScriptsArgs) => Promise<number>;

/** WHOSE display scripts a room broadcasts (the host option): `enabled:false` is the default and the
 *  byte-identical arm; `hostUserId` is null for a hostless (archived orphan) room, which broadcasts nothing. */
interface RoomDisplayPolicy {
  readonly enabled: boolean;
  readonly hostUserId: UserId | null;
}

/** Chat's answer to a room's display policy: both halves (the host flag and the host seat) are chat's data. */
export type ResolveRoomDisplayPolicyOp = (chatId: ChatId) => Promise<RoomDisplayPolicy>;
