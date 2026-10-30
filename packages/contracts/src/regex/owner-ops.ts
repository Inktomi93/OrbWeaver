// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { ChatId, RegexScriptId } from "@orb/kit/ids";

/** The rooms each script reaches, keyed by script id. */
export type ResolveRegexScriptRoomsOp = (scriptIds: readonly RegexScriptId[]) => Promise<Map<RegexScriptId, ChatId[]>>;

/** Capture the rooms the scripts reach before junction teardown; call the thunk with the ids that were deleted. */
export type CaptureRegexRoomReachOp = (scriptIds: readonly RegexScriptId[]) => Promise<(deleted: readonly RegexScriptId[]) => void>;
