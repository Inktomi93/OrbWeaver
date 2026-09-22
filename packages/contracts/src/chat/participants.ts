// @orb/contracts/chat/participants — the chat VOCABULARY AXES: participant KINDS + the drive/identity axes +
// the AI-speaker ref, the wire message-role schema (the tuple-in-kit rule §5), and the MESSAGE-KIND axis with
// its total policy record. The runtime seats live in `domain/chat`; these are the shared vocabulary every
// other chat seam derives its role/kind fields from (no inline re-spell).
//
// WHY MESSAGE_KIND lives HERE and not in its own file (the `content-classes.ts` two-file split is NOT the
// precedent to copy): that split exists because its AXIS is in kit (`ContentSpanKind` — the tokenizer must
// read it and the cake forbids kit→contracts) while only the POLICY could home in contracts. The message-kind
// axis has no kit reachability, so tuple + schema + policy are ONE home, beside the sibling role axis they are
// orthogonal to (stickler 2026-08-08 §R1; deviation from that report's letter, endorsed 2026-08-07).

import type { CharacterId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { z } from "zod";

// `human`/`character` are the only live kinds post-rollback (2026-07-25 purge). `agent` (a first-class
// userId-backed AND AI-driven principal, D60) and `observer` (the Narrative Director seam — watches +
// proposes, never acts, unseatable) were purged with the agent-principal build; PD-17 tracks the rebuild —
// no `chat.seatAgent`/`requestAgentSeat` verb exists today. The rebuild grafts both kinds back onto this
// tuple if the agent-principal design set returns.
export const PARTICIPANT_KINDS = ["human", "character"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];
/** @public twin: PARTICIPANT_KINDS — drives the chat_participants enum + CHECK (cross-package PUBLIC). */
export const participantKindSchema = z.enum(PARTICIPANT_KINDS) satisfies z.ZodType<ParticipantKind>;

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
export const messageRoleSchema = z.enum(MESSAGE_ROLES) satisfies z.ZodType<MessageRole>;

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// MESSAGE KIND — what a canon row IS, DECLARED at mint (stickler 2026-08-08, canon-message-identity §2/§R1)
//
// The problem it closes: a row's PURPOSE was inferred from `role` + attribution + the room's CURRENT config —
// a narrator row was "assistant + the synthetic group character", an agent line "assistant + authorUserId".
// All three attribution FKs are `onDelete:'set null'` (schema/chat.ts — the deliberate history-preservation
// cascade), so deleting the group character or a user DEGRADED those rows into indistinguishable standard
// rows: the render tint, the speaker split, the memory label and the export mapping all silently
// reclassified. **Attribution is DESIGNED to degrade; purpose must not.** And a per-room `output` dial flip
// (narrator → per-speaker) re-classified every historical row the instant it moved. Kind is per-row truth.
//
// THREE ORTHOGONAL AXES, one home each — collapsing any two re-creates the overload this axis unwinds:
//   • DRIVE      — who runs the seat        → `chat_participants.kind` (PARTICIPANT_KINDS, above)
//   • AUTHORSHIP — whose voice/hand it is   → the slot's attribution stamps (`characterId`/`authorUserId`/
//                                             `personaId`) + the per-chat name producer
//   • PURPOSE    — what sort of row it is   → THIS axis
// So there is deliberately NO `agent` kind: an agent's room speech is `standard` + `authorUserId` (real
// canon, D60), and its OUT-OF-BAND, unseated reaction is `comment` (visible, never prompt, never memory).
//
// KIND NEVER DECIDES THE CANON `role` (owner ruling, 2026-08-07). Narrator rows stay `role:'assistant'` in
// canon. KIND NOW DECIDES NO WIRE ROLE EITHER (owner ruling, 2026-08-18, verbatim: "if you mean group chat
// narration mode then that is the wrong behavior"): the "ship a narrator row as a wire `system` row on
// capable models" mapping — a SHAPE-time dispatch on kind × capability, built on the measured vLLM cell in
// `56a979d44` — is RULED OUT. Group narration is ONE generation voicing all the seated characters, i.e. the assistant's
// own output voice, so a narrator row delivers `assistant` on every wire. Kind also does not replace the D55
// synthetic group character: that identity keeps the `__group__` memory scoping, the attribution chrome and
// the host-owned mint. Kind is purpose; attribution remains voice.
export const MESSAGE_KINDS = ["standard", "narrator", "comment"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
/** Schema twin of {@link MESSAGE_KINDS}, which drives the `messages.kind` enum + CHECK. */
export const messageKindSchema = z.enum(MESSAGE_KINDS) satisfies z.ZodType<MessageKind>;

/** The DB/wire default: every writer that does not deliberately declare a purpose mints `standard`. One home
 *  so the column default, the read-seam floor and a test factory can never spell three different defaults. */
export const DEFAULT_MESSAGE_KIND: MessageKind = "standard";

/** Whether a row's body is voiced through the NARRATOR grammar (one generation speaking all the seated characters) —
 *  the OUTER gate on the plain-`Name:` half of the speaker-span parse: in any other kind a row is one
 *  speaker's, so a line opening `Alice:` is prose (or, on a USER row, an attribution a member could forge)
 *  and must never split. Deliberately KIND-based, not role-based (the old
 *  `narratorRoom && role === "assistant"` inference mis-classified every historical row the moment the
 *  room's output dial moved).
 *
 *  PROMOTED here from the client's `attribution.ts` (B7): the server's segment-anchor validation parses
 *  the SAME body with the SAME character-name gate (`verbs/reactions.ts`), and two spellings of this predicate
 *  is a client picker and a server validator disagreeing about the same bytes. `undefined` = a row with no
 *  server slot yet (a pre-commit draft greeting) — not narrator-voiced, same as before. */
export function isNarratorVoiced(kind: MessageKind | undefined): boolean {
  switch (kind) {
    case "narrator":
      return true;
    case undefined:
    case "standard":
    case "comment":
      return false;
    default:
      return assertNeverMessageKind(kind);
  }
}

function assertNeverMessageKind(kind: never): never {
  throw new Error(`isNarratorVoiced: unhandled MessageKind ${JSON.stringify(kind)}`);
}

/** ONE kind's cross-plane policy — the `CONTENT_CLASS_POLICY` pattern one level UP (that registry is
 *  span-level: bytes INSIDE a row; this is row-level: what the row IS).
 *   • `prompt`  — how the row enters the assembled prompt. `conversation` = an ordinary history row;
 *     `system-channel` = ALSO an ordinary history row on the wire, assistant-voiced, byte-identically to
 *     `conversation`. The arm's name is archaeology: it was minted for the capability-gated
 *     narrator→wire-`system` mapping, which the owner RULED OUT on 2026-08-18 (group narration is the
 *     assistant's own output voice, not the operator channel). It is kept as its own arm because the two
 *     purposes still differ where purpose matters — the label policy and the delivered-row trace read it.
 *     `never` = the row is not prompt material at all.
 *   • `memory`  — whether the row is ingested by the digest/segment build (`loadCanonThroughSeq`). A narrator
 *     recap IS story canon and is precisely what a digest wants; an OOC comment is not story.
 *   • `reading` — the transcript surface. Every kind SHOWS: a comment is out-of-character, not secret (the
 *     member-strip plane is the `hidden` CONTENT class, an orthogonal axis). */
export interface MessageKindPolicy {
  readonly prompt: "conversation" | "system-channel" | "never";
  readonly memory: "ingest" | "exclude";
  readonly reading: "show";
}

/** The shipped cells. The `Record<MessageKind, …>` is the compile-force: a fourth member will not build until
 *  it declares its row, and every dispatch over it is a total Record / `assertNever` (spine §5.5), so the
 *  coupled sites become tsc errors rather than a sweep. An `aside` kind is a NAMED DOORWAY, not minted —
 *  D41's no-code-without-an-emit-site rule says a kind waits for its writer. */
export const MESSAGE_KIND_POLICY: Readonly<Record<MessageKind, MessageKindPolicy>> = {
  standard: { prompt: "conversation", memory: "ingest", reading: "show" },
  narrator: { prompt: "system-channel", memory: "ingest", reading: "show" },
  comment: { prompt: "never", memory: "exclude", reading: "show" },
};

/** The kinds a memory build ingests — DERIVED from {@link MESSAGE_KIND_POLICY}, never re-spelled, so the
 *  policy row is the only place the answer lives (the memory canon load reads this). */
export const MEMORY_INGEST_KINDS: readonly MessageKind[] = MESSAGE_KINDS.filter((k) => MESSAGE_KIND_POLICY[k].memory === "ingest");
