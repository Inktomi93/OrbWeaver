// @orb/contracts/crew — the chat-crew cross-boundary vocabulary, RIDER SLICE ONLY: exactly the shapes
// the `@orb/db` crew/character columns `$type<>` against + the status tuples their CHECKs derive. The
// rest of the contracts module lands with `domain/crew` proper — do not grow this file ahead of that.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

export const CREW_CONFIG_VERSION = 1;

// The `min()`s are the structural spend throttle — cadence floors are schema-enforced, not policy.
const KEEPER_MIN_SPAN_FLOOR = 16;
const KEEPER_MIN_SPAN_CEIL = 256;
const KEEPER_MIN_SPAN_DEFAULT = 48;
const CARD_MIN_SPAN_FLOOR = 64;
const CARD_MIN_SPAN_CEIL = 1024;
const CARD_MIN_SPAN_DEFAULT = 128;
const DIRECTOR_CADENCE_FLOOR = 4;
const DIRECTOR_CADENCE_CEIL = 64;
// Gentler than rpg's 8 — plain roleplay wants a hand on the tiller, not on the wheel.
const DIRECTOR_CADENCE_DEFAULT = 16;
const DIRECTOR_STEER_MAX_CHARS = 600;

/** The per-chat crew config — one versioned blob on `crew_chats.config`; every member defaults OFF
 *  (enabling is the consent act). Counters live as columns, never in here. */
export const crewConfigSchema = z.object({
  version: z.literal(CREW_CONFIG_VERSION),
  keeper: z
    .object({
      enabled: z.boolean().default(false),
      // null + enabled ⇒ the domain mints + attaches a book on first run.
      bookId: typeIdSchema(ID_PREFIX.worldBook).nullable().default(null),
      // Messages pending past the protect tail before a run enqueues.
      minSpan: z
        .number()
        .int()
        .min(KEEPER_MIN_SPAN_FLOOR)
        .max(KEEPER_MIN_SPAN_CEIL)
        .default(KEEPER_MIN_SPAN_DEFAULT),
    })
    .prefault({}),
  cardEvolution: z
    .object({
      enabled: z.boolean().default(false),
      minSpan: z
        .number()
        .int()
        .min(CARD_MIN_SPAN_FLOOR)
        .max(CARD_MIN_SPAN_CEIL)
        .default(CARD_MIN_SPAN_DEFAULT),
    })
    .prefault({}),
  director: z
    .object({
      enabled: z.boolean().default(false),
      // Assistant turns between passes.
      cadenceTurns: z
        .number()
        .int()
        .min(DIRECTOR_CADENCE_FLOOR)
        .max(DIRECTOR_CADENCE_CEIL)
        .default(DIRECTOR_CADENCE_DEFAULT),
      // The host's standing direction ("slow burn", "keep it cozy") — rides every director pass.
      steer: z.string().max(DIRECTOR_STEER_MAX_CHARS).default(""),
    })
    .prefault({}),
  proseAudit: z
    .object({
      enabled: z.boolean().default(false),
      // On-demand-first is the cost posture.
      mode: z.enum(["on-demand", "every-turn"]).default("on-demand"),
    })
    .prefault({}),
});
export type CrewConfig = z.infer<typeof crewConfigSchema>;

/** The edit-proposal lifecycle. `superseded` = the variant is no longer selected at accept time;
 *  `stale` = the content hash moved — both are lazy accept-time refusals, never eager listeners. */
export const CREW_EDIT_PROPOSAL_STATUSES = [
  "pending",
  "accepted",
  "dismissed",
  "superseded",
  "stale",
] as const;
export type CrewEditProposalStatus = (typeof CREW_EDIT_PROPOSAL_STATUSES)[number];
export const crewEditProposalStatusSchema = z.enum(CREW_EDIT_PROPOSAL_STATUSES);

const EDIT_NOTE_MAX_CHARS = 300;

/** One rationale chip on an edit proposal (`crew_edit_proposals.notes` element). */
export const crewEditNoteSchema = z.object({
  kind: z.enum(["prose", "continuity"]),
  note: z.string().min(1).max(EDIT_NOTE_MAX_CHARS),
});
export type CrewEditNote = z.infer<typeof crewEditNoteSchema>;

/** The card-proposal lifecycle. No `stale` arm — card proposals supersede by a newer audit, not by
 *  content-hash drift. */
export const CARD_EVOLUTION_PROPOSAL_STATUSES = [
  "pending",
  "accepted",
  "dismissed",
  "superseded",
] as const;
export type CardEvolutionProposalStatus = (typeof CARD_EVOLUTION_PROPOSAL_STATUSES)[number];
export const cardEvolutionProposalStatusSchema = z.enum(CARD_EVOLUTION_PROPOSAL_STATUSES);

const CHANGE_TEXT_MAX_CHARS = 1500;
const CHANGE_RATIONALE_MAX_CHARS = 400;

/** One proposed card change. `field` is the conservative evolvable set — never name/systemPrompt/
 *  postHistory (steering internals are the author's, not play's). */
export const cardEvolutionChangeSchema = z.object({
  field: z.enum(["description", "personality", "scenario", "creatorNotes"]),
  op: z.enum(["append", "replace"]),
  text: z.string().min(1).max(CHANGE_TEXT_MAX_CHARS),
  rationale: z.string().min(1).max(CHANGE_RATIONALE_MAX_CHARS),
});
export type CardEvolutionChange = z.infer<typeof cardEvolutionChangeSchema>;

/** A transcript span `{fromSeq, toSeq}` — provenance of the audited window. */
export const crewSpanSchema = z.object({
  fromSeq: z.number().int().nonnegative(),
  toSeq: z.number().int().nonnegative(),
});
export type CrewSpan = z.infer<typeof crewSpanSchema>;
