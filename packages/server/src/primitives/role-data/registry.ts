// Shared only by the role encoder and its closed decoding door; role values never live on public objects.
// ASSUMES(single-replica): the maps are keyed by object identity and never leave this process, so there is no DB seam.
import type { ParticipantRole, UserRole } from "@orb/contracts/identity";

export const userRoleCodes = new WeakMap<object, UserRole>();
export const participantRoleCodes = new WeakMap<object, ParticipantRole>();
