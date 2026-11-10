// Resolved seat data keeps the schema's one shape while withholding the raw authority code.
import type { ParticipantRoleState } from "@orb/contracts/identity";
import type { chatParticipants } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";

export interface ParticipantRow extends Omit<typeof chatParticipants.$inferSelect, "role"> {
  readonly role: ParticipantRoleState;
}

export type ParticipantActor = { readonly kind: "human"; readonly userId: UserId } | { readonly kind: "character"; readonly characterId: CharacterId };

/** The DB checks the actor columns together; the human persona and AI seat knobs belong to their respective writes. */
export type ParticipantInsertRow = typeof chatParticipants.$inferInsert &
  (
    | (Extract<ParticipantActor, { kind: "human" }> & { readonly characterId?: null; readonly disabled?: never; readonly talkativeness?: never })
    | (Extract<ParticipantActor, { kind: "character" }> & { readonly userId?: null; readonly activePersonaId?: null })
  );
