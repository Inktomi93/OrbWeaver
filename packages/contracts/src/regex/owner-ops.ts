// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { ChatId, RegexScriptId, UserId } from "@orb/kit/ids";

/** The rooms each script reaches, keyed by script id. */
export type ResolveRegexScriptRoomsOp = (scriptIds: readonly RegexScriptId[]) => Promise<Map<RegexScriptId, ChatId[]>>;

/** Capture the rooms the scripts reach before junction teardown; call the thunk with the ids that were deleted. */
export type CaptureRegexRoomReachOp = (scriptIds: readonly RegexScriptId[]) => Promise<(deleted: readonly RegexScriptId[]) => void>;

/** WHOSE display scripts a room broadcasts (the host option): `enabled:false` is the default and the
 *  byte-identical arm; `hostUserId` is null for a hostless (archived orphan) room, which broadcasts nothing. */
export interface RoomDisplayPolicy {
  readonly enabled: boolean;
  readonly hostUserId: UserId | null;
}

/** Chat's answer to a room's display policy: both halves (the host flag and the host seat) are chat's data. */
export type ResolveRoomDisplayPolicyOp = (chatId: ChatId) => Promise<RoomDisplayPolicy>;
