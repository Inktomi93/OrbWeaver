// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { CharacterId, ChatId, PresetId, RegexScriptId, UserId } from "@orb/kit/ids";
import type { ImportReuse } from "#import";
import type { PortableFile } from "#portability";
import type {
  ExportedCardScripts,
  ImportCardScriptsArgs,
  ImportCardScriptsResult,
  ImportGlobalScriptsArgs,
  ImportPresetScriptsArgs,
  RegexScriptCard,
  regexScriptContentKey,
  StRegexScriptFields,
} from "./schemas.ts";

/** The rooms each script reaches, keyed by script id. */
export type ResolveRegexScriptRoomsOp = (scriptIds: readonly RegexScriptId[]) => Promise<Map<RegexScriptId, ChatId[]>>;

/** Capture the rooms the scripts reach before junction teardown; call the thunk with the ids that were deleted. */
export type CaptureRegexRoomReachOp = (scriptIds: readonly RegexScriptId[]) => Promise<(deleted: readonly RegexScriptId[]) => void>;

/** The card lift: a card's by-value scripts become library rows and character attachments. */
export type ImportCardScripts = (args: ImportCardScriptsArgs) => Promise<ImportCardScriptsResult>;

export type ImportPresetScripts = (args: ImportPresetScriptsArgs) => Promise<ImportCardScriptsResult>;

/** What a dry run answers for one script a lift carries: `reuse` says why the lift mints no row for it (an owned row
 *  holds it, or an earlier script of the same run mints it) and is `null` when it mints one; `refused` is the write
 *  door's reason when it would mint one and the door refuses it. An owned row's `enabled` is its own switch, which the
 *  lift keeps whatever the file says. */
export type ScriptPlan =
  | { readonly reuse: Extract<ImportReuse, "library">; readonly enabled: boolean }
  | { readonly reuse: Exclude<ImportReuse, "library"> | null }
  | { readonly refused: string };

/** The preset lifts of a folder run, dry: per preset in run order, per script, what {@link ImportPresetScripts} does
 *  with it. Read-only. */
export type PlanPresetScripts = (args: {
  readonly ownerId: UserId;
  readonly presets: readonly (readonly RegexScriptCard[])[];
}) => Promise<readonly (readonly ScriptPlan[])[]>;

/** Each of the owner's presets that holds scripts, with each attached script's {@link regexScriptContentKey} in the
 *  preset's run order: what a preset import compares a file's own scripts against. Read-only. */
export type ListPresetScriptKeys = (args: { readonly ownerId: UserId }) => Promise<ReadonlyMap<PresetId, readonly string[]>>;

/** Each of the owner's presets that holds scripts, with its attached scripts in run order on the card wire, for a
 *  preset export. Only the owner's own rows are read. */
export type ExportPresetScripts = (args: { readonly ownerId: UserId }) => Promise<ReadonlyMap<PresetId, readonly (RegexScriptCard & StRegexScriptFields)[]>>;

export type ImportGlobalScripts = (args: ImportGlobalScriptsArgs) => Promise<ImportCardScriptsResult>;

/** The card re-embed: the character's attached scripts back out to the card-wire shape. */
export type ExportCardScripts = (args: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<ExportedCardScripts>;

/** Every script the owner owns, one portable file each. */
export type ExportRegexScripts = (args: { readonly ownerId: UserId }) => Promise<readonly PortableFile[]>;

/** One owned script as its portable file. A foreign or absent id answers `null`. */
export type ExportRegexScript = (args: { readonly ownerId: UserId; readonly scriptId: RegexScriptId }) => Promise<PortableFile | null>;

/** Import one `regex/*.json`. `created: false` means it matched an existing row; `notes` names what the file lost. */
export type ImportRegexScript = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array }) => Promise<{
  readonly created: boolean;
  readonly notes: readonly string[];
}>;

/** The host-handoff regex copy takes these args. The copy returns unexecuted statements, so its signature stays
 *  with each consuming domain. */
export interface CopyHandoffRegexScriptsArgs {
  readonly fromOwnerId: UserId;
  readonly toOwnerId: UserId;
  readonly chatId: ChatId;
}

/** How many script rows the handoff regex copy would mint for `toOwnerId`. Read-only. */
export type CountHandoffRegexScripts = (args: CopyHandoffRegexScriptsArgs) => Promise<number>;
