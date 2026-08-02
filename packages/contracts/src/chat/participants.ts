// @orb/contracts/chat/participants — participant KINDS + the drive/identity axes + the AI-speaker ref, and
// the wire message-role schema (the tuple-in-kit rule §5). The runtime seats live in `domain/chat`; these
// are the shared vocabulary every other chat seam derives its role/kind fields from (no inline re-spell).

import type { CharacterId } from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { z } from "zod";

// `human`/`character` are the only live kinds post-rollback (2026-07-25 purge). `agent` (a first-class
// userId-backed AND AI-driven principal, D60) and `observer` (the Narrative Director seam — watches +
// proposes, never acts, unseatable) were purged with the agent-principal build; PD-17 tracks the rebuild —
// no `chat.seatAgent`/`requestAgentSeat` verb exists today. The rebuild grafts both kinds back onto this
// tuple if the agent-principal design set returns.
export const PARTICIPANT_KINDS = ["human", "character"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];
/** @public schema twin of `PARTICIPANT_KINDS`, which drives the chat_participants enum + CHECK. */
export const participantKindSchema = z.enum(PARTICIPANT_KINDS);

// `kind` carries TWO facts: the identity table (userId vs characterId) AND who DRIVES the seat.
// `AI_DRIVEN_KINDS` splits out the DRIVE axis (the seats arbitration schedules/voices) — an agent is
// AI-driven AND userId-backed. `USER_BACKED_KINDS` is the human/agent shared column shape (both FK `users`).
export const AI_DRIVEN_KINDS = ["character"] as const satisfies readonly ParticipantKind[];
export const USER_BACKED_KINDS = ["human"] as const satisfies readonly ParticipantKind[];
export const isAiDriven = (k: ParticipantKind): boolean => (AI_DRIVEN_KINDS as readonly ParticipantKind[]).includes(k);
export const isUserBacked = (k: ParticipantKind): boolean => (USER_BACKED_KINDS as readonly ParticipantKind[]).includes(k);

/** The identity of ONE AI-driven speaker (D60). A `character` FKs `characters.id` */
export interface SpeakerRef {
  readonly kind: "character";
  readonly characterId: CharacterId;
}

/** The stable string key for a {@link SpeakerRef}. */
export function speakerKey(ref: SpeakerRef): string {
  return `c:${ref.characterId}`;
}

// The tuple is `@orb/kit/message-role`; the WIRE schema lives HERE (§5 tuple-in-kit rule). Every role
// field across this node goes through this one axis — no inline re-spell.
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
