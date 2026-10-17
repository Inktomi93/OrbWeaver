// Encode captured membership only at the storage boundary; canon's existing fence and SQL remain unchanged.
import type { ParticipantRoleState } from "@orb/contracts/identity";
import { participantRoleValue } from "#primitives/role-data/decode";
import { prepareContinueRestore } from "./canon-write.ts";

/** Role data becomes the stored code only while building the existing atomic continuation fence. */
export function prepareContinueRestoreForRoleData(
  db: Parameters<typeof prepareContinueRestore>[0],
  args: Omit<Parameters<typeof prepareContinueRestore>[1], "role"> & { readonly role: ParticipantRoleState },
): ReturnType<typeof prepareContinueRestore> {
  return prepareContinueRestore(db, { ...args, role: participantRoleValue(args.role) });
}
