// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { ChatId, RegexScriptId } from "@orb/kit/ids";
import type { ImportCardScriptsArgs, ImportCardScriptsResult, ImportGlobalScriptsArgs, ImportPresetScriptsArgs } from "./index.ts";

/** The rooms each script reaches, keyed by script id. */
export type ResolveRegexScriptRoomsOp = (scriptIds: readonly RegexScriptId[]) => Promise<Map<RegexScriptId, ChatId[]>>;

/** Capture the rooms the scripts reach before junction teardown; call the thunk with the ids that were deleted. */
export type CaptureRegexRoomReachOp = (scriptIds: readonly RegexScriptId[]) => Promise<(deleted: readonly RegexScriptId[]) => void>;

/** Lift a card's by-value scripts into the owner's library; the import drivers call it and the regex domain implements it. */
export type ImportCardScripts = (args: ImportCardScriptsArgs) => Promise<ImportCardScriptsResult>;

export type ImportPresetScripts = (args: ImportPresetScriptsArgs) => Promise<ImportCardScriptsResult>;

export type ImportGlobalScripts = (args: ImportGlobalScriptsArgs) => Promise<ImportCardScriptsResult>;
