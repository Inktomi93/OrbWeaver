// Resolved seat data keeps the schema's one shape while withholding the raw authority code.
import type { ParticipantRoleState } from "@orb/contracts/identity";
import type { chatParticipants } from "@orb/db";

export interface ParticipantRow extends Omit<typeof chatParticipants.$inferSelect, "role"> {
  readonly role: ParticipantRoleState;
}
