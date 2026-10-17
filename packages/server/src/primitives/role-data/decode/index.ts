// Private decoding door: native incoming edges admit only the kernel and the explicit data boundaries.
import type { ParticipantRole, ParticipantRoleState, UserRole, UserRoleState } from "@orb/contracts/identity";
import { participantRoleCodes, userRoleCodes } from "../registry.ts";

/** Transport accepts only objects captured by a canonical global-role producer. */
export function isUserRoleState(value: unknown): value is UserRoleState {
  return typeof value === "object" && value !== null && userRoleCodes.has(value);
}

/** Participant data cannot substitute for global role data or an arbitrary object. */
export function isParticipantRoleState(value: unknown): value is ParticipantRoleState {
  return typeof value === "object" && value !== null && participantRoleCodes.has(value);
}

/** A fabricated object cannot become a stored role or an authority decision. */
export function userRoleValue(state: UserRoleState): UserRole {
  const code = userRoleCodes.get(state);
  if (code === undefined) {
    throw new Error("global role data was not captured by its owner");
  }
  return code;
}

/** The caller owns whether this code selects bytes, a host identity, or a kernel verdict. */
export function participantRoleValue(state: ParticipantRoleState): ParticipantRole {
  const code = participantRoleCodes.get(state);
  if (code === undefined) {
    throw new Error("participant role data was not captured by its owner");
  }
  return code;
}
