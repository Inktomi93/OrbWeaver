// The host-gated roster ops other domains drive by injection (saved rosters, rpg scene casting). The chat
// service implements them and gates each on host authority.

import type { CharacterId, ChatParticipantId } from "@orb/kit/ids";
import type { ParticipantRoleState } from "#identity";
import type { GroupConfig, GroupConfigInput } from "./metadata.ts";
import type { ChatScopedParams } from "./owner-ops.ts";
import type { ParticipantView, SeatKnobs } from "./roster.ts";

/** The participant read model; only the server's captured role representation differs from the wire view. */
export interface ParticipantData extends Omit<ParticipantView, "role"> {
  readonly role: ParticipantRoleState;
}

/** Host-only write of the `chatMetadata.group` sub-blob. */
export interface SetGroupConfigParams extends ChatScopedParams {
  readonly config: GroupConfigInput;
}

/** Add a character to the roster (host-only). */
export interface AddCharacterToChatParams extends ChatScopedParams {
  readonly characterId: CharacterId;
}

/** Re-stamp one AI-driven seat by its `participantId`; `patch` carries only the knobs to change. An empty patch is
 *  a no-op that still returns the current view. */
export interface SetSeatKnobsParams extends ChatScopedParams {
  readonly participantId: ChatParticipantId;
  readonly patch: SeatKnobs;
}

export type SetGroupConfigOp = (params: SetGroupConfigParams) => Promise<GroupConfig>;

export type AddCharacterToChatOp = (params: AddCharacterToChatParams) => Promise<ParticipantData>;

export type SetSeatKnobsOp = (params: SetSeatKnobsParams) => Promise<ParticipantData>;
