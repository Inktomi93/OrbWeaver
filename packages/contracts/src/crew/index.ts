// @orb/contracts/crew — the chat-crew (D59) cross-boundary vocabulary, RIDER SLICE ONLY: exactly the
// shapes the `@orb/db` crew/character columns `$type<>` against (the D48 toolCalls precedent — typed at
// the schema leaf, parsed at the read seam) + the status tuples their CHECKs derive. The REST of the
// contracts module (the 4 member payload schemas, bus events, views, the `CrewMember` tuple) lands with
// `domain/crew` CW1 proper — chat-crew-design/02 §2, 03. Do not grow this file ahead of that build.
//
// Spec deltas resolved here (chat-crew-design/02 §6 is the source):
//   • `bookId: typeIdSchema("wibook")` in the spec → `ID_PREFIX.worldBook` ("world_book") — the ONE
//     canonical prefix (`@orb/kit/ids`); "wibook" was spec drift, the code home wins.
//   • `.default({})` on the section objects → zod-4 `.prefault({})` (the settings-schema precedent:
//     prefault PARSES {} so every inner default applies).

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// ── crew config (`crew_chats.config` — zod-parsed on read, the chats.metadata lazy-parse discipline) ────

export const CREW_CONFIG_VERSION = 1;

// Named bounds (`noMagicNumbers`). The `min()`s are the structural spend throttle — cadence floors are
// schema-enforced, not policy (chat-crew-design/02 §6).
const KEEPER_MIN_SPAN_FLOOR = 16;
const KEEPER_MIN_SPAN_CEIL = 256;
const KEEPER_MIN_SPAN_DEFAULT = 48;
const CARD_MIN_SPAN_FLOOR = 64;
const CARD_MIN_SPAN_CEIL = 1024;
const CARD_MIN_SPAN_DEFAULT = 128;
const DIRECTOR_CADENCE_FLOOR = 4;
const DIRECTOR_CADENCE_CEIL = 64;
// Gentler than rpg's 8 — plain roleplay wants a hand on the tiller, not a hand on the wheel (02 §6).
const DIRECTOR_CADENCE_DEFAULT = 16;
const DIRECTOR_STEER_MAX_CHARS = 600;

/** The per-chat crew config (chat-crew-design/02 §6) — ONE versioned blob on `crew_chats.config`;
 *  every member defaults OFF (enabling is the consent act). Counters live as COLUMNS, never in here
 *  (per-turn atomic increments — the buddy `bondXp` lesson). */
export const crewConfigSchema = z.object({
  version: z.literal(CREW_CONFIG_VERSION),
  keeper: z
    .object({
      enabled: z.boolean().default(false),
      // null + enabled ⇒ the domain mints + attaches a book on first run (chat-crew-design/03 §1).
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
      // On-demand-first is the cost posture (chat-crew-design/03 §4 argues the default).
      mode: z.enum(["on-demand", "every-turn"]).default("on-demand"),
    })
    .prefault({}),
});
export type CrewConfig = z.infer<typeof crewConfigSchema>;

// ── edit-proposal vocabulary (`crew_edit_proposals` — the prose auditor's queue) ────────────────────────

/** The edit-proposal lifecycle (chat-crew-design/02 §4). `superseded` = the variant is no longer the
 *  selected one at accept time; `stale` = the content hash moved (someone edited meanwhile) — both are
 *  LAZY accept-time refusals, never eager listeners (02 §9). The db CHECK derives this tuple. */
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

/** One rationale chip on an edit proposal (`crew_edit_proposals.notes` element) — the two marinara
 *  briefs folded into one kind axis (chat-crew-design/03 §4). */
export const crewEditNoteSchema = z.object({
  kind: z.enum(["prose", "continuity"]),
  note: z.string().min(1).max(EDIT_NOTE_MAX_CHARS),
});
export type CrewEditNote = z.infer<typeof crewEditNoteSchema>;

// ── card-evolution vocabulary (`card_evolution_proposals` — character-owned, crew-filed) ────────────────

/** The card-proposal lifecycle (chat-crew-design/02 §5). No `stale` arm — card proposals supersede by
 *  a NEWER AUDIT (one pending per (characterId, chatId)), not by content-hash drift. */
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

/** One proposed card change (`card_evolution_proposals.changes` element — chat-crew-design/03 §2).
 *  `field` is the conservative evolvable set — never name/systemPrompt/postHistory (steering internals
 *  are the author's, not play's). Per-change accept: the owner picks changes individually (02 §5). */
export const cardEvolutionChangeSchema = z.object({
  field: z.enum(["description", "personality", "scenario", "creatorNotes"]),
  op: z.enum(["append", "replace"]),
  text: z.string().min(1).max(CHANGE_TEXT_MAX_CHARS),
  rationale: z.string().min(1).max(CHANGE_RATIONALE_MAX_CHARS),
});
export type CardEvolutionChange = z.infer<typeof cardEvolutionChangeSchema>;

/** A transcript span `{fromSeq, toSeq}` (`card_evolution_proposals.sourceSpan` — provenance of the
 *  audited window). */
export const crewSpanSchema = z.object({
  fromSeq: z.number().int().nonnegative(),
  toSeq: z.number().int().nonnegative(),
});
export type CrewSpan = z.infer<typeof crewSpanSchema>;
