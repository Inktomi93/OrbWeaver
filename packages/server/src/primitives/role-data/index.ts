// Capture row data, never an authority verdict. Weak keys follow the immutable snapshot's own lifetime.
import type { ParticipantRole, ParticipantRoleState, UserRole, UserRoleState } from "@orb/contracts/identity";
import { participantRoleCodes, userRoleCodes } from "./registry.ts";

/** Storage and input owners capture an already parsed global-role code. */
export function captureUserRole(code: UserRole): UserRoleState {
  const state = Object.freeze({}) as UserRoleState;
  userRoleCodes.set(state, code);
  return state;
}

/** Membership loaders capture the seat they actually read, with no second query or cached permission. */
export function captureParticipantRole(code: ParticipantRole): ParticipantRoleState {
  const state = Object.freeze({}) as ParticipantRoleState;
  participantRoleCodes.set(state, code);
  return state;
}
