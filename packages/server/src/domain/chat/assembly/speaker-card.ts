// domain/chat/assembly/speaker-card — the per-turn CARD-SECTION shape (three-axis; `shape(ctx, speaker)`).
// Given the ONE immutable turn ctx (the full resolved `cast` + its index-aligned
// `castMembers` identities) and what this turn VOICES, pick the rendered character section
// (`ctx.character`/`speaker`) and the co-speakers:
//   • per-speaker × merged (default) → co-speakers = the OTHER present cast (the "[Also present — X]" block renders them).
//   • per-speaker × scoped           → co-speakers = [] (own card only; best isolation).
//   • narrator                       → ONE call voices the WHOLE cast: the primary is the character section, EVERY
//                                      other present member is a co-speaker, and `speaker` is the `cast` arm, which
//                                      is what binds `{{char}}` to the joined cast (`assembly/macros` charForSpeaker).
// PURE — never mutates the input ctx (§5: per-speaker is a fresh shape, not a mutation). A ctx with no
// `castMembers` (solo / hand-built / preview) returns UNCHANGED → byte-identical (D16, no `if(isGroup)`).
//
// WHY NARRATOR NEEDS ITS OWN ARM (2026-08-07, the live-drive fix): a narrator round's speaker is the SYNTHETIC
// group character, which by construction is NOT in `castMembers` — so it fell through the `idx === -1` guard
// below and the round assembled as if it were a SOLO turn for the primary. A live drive counted the resulting
// system row naming the primary 7×, the co-speaker 0×, opening "write <primary>'s perspective only" on a turn
// that was voicing the whole cast. The model produced the cast anyway, from a nudge naming names it had never
// been given a card for. The `-1` guard stays: it is the honest fallback for a genuinely off-cast speaker on a
// PER-SPEAKER round (a wiring gap), and narrator no longer reaches it.
//
// D60: `castMembers` carries `agent` refs too. An agent has NO card — its resolved SOUL fills the same
// card-shaped `AssembleCharacter` slot (doc 04 §5, "the card-shape minus the card"), so an agent speaker's
// soul becomes the character section here exactly the way a character's card does — one turn path.

import type { AssembleCharacter, AssembleContext, GroupConfig, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";

/** The output axis — what ONE generation voices. Derived, never re-spelled (spine §5.5). */
type GroupOutput = GroupConfig["output"];
/** The card-scope axis; lives only on the per-speaker arm (narrator is always merged). */
type CardScope = Extract<GroupConfig, { output: "per-speaker" }>["cardScope"];

/** NARRATOR: one call voices the whole cast. The primary card is the character section and every OTHER
 *  present member rides as a co-speaker — the SAME breadth `cardScope:"merged"` produces, because the cards
 *  a narrator turn needs are exactly "everyone in the room". `speaker` takes the `cast` arm so `{{char}}`
 *  resolves to the joined cast rather than to whichever member happens to be primary. */
function shapeContextForCast(ctx: AssembleContext, cast: readonly AssembleCharacter[]): AssembleContext {
  const active = cast[0] ?? ctx.character;
  // An EMPTY-but-defined cast is reachable, so `members` needs the same floor `active` gets: `getCard` returning
  // falsy for every seated id drops the whole roster (`assembly/context` buildAssembleContext) while a narrator
  // round still fires (`verbs/turn` gates on `output === "narrator"` OR a speaker, never on roster size). An
  // unfloored `members: []` joins to "" and ships "You are  in an immersive…" — `{{char}}` with no value at all.
  // Flooring to `[active]` degrades to exactly the pre-cast-arm binding (the primary's name).
  const members = cast.length > 0 ? [...cast] : [active];
  return {
    ...ctx,
    character: active,
    speaker: { kind: "cast", members, active },
    coSpeakers: cast.slice(1),
  };
}

/** PER-SPEAKER: the named speaker's card becomes the character section; `cardScope` selects the breadth of
 *  the co-speakers merged in beside it. An off-cast ref keeps the primary (never crashes). */
function shapeContextForSingle(
  ctx: AssembleContext,
  cast: readonly AssembleCharacter[],
  castMembers: readonly SpeakerRef[],
  speaker: { readonly ref: SpeakerRef; readonly cardScope: CardScope },
): AssembleContext {
  const key = speakerKey(speaker.ref);
  const idx = castMembers.findIndex((m) => speakerKey(m) === key);
  if (idx === -1) {
    return ctx; // the speaker isn't in the resolved cast (a wiring gap) — keep the primary, never crash.
  }
  const active = cast[idx] ?? ctx.character;
  const others = cast.filter((_, i) => i !== idx);
  return {
    ...ctx,
    character: active,
    speaker: { kind: "single", character: active },
    coSpeakers: speaker.cardScope === "merged" ? others : [],
  };
}

function assertNeverGroupOutput(output: never): never {
  throw new Error(`shapeContextForSpeaker: unhandled GroupConfig output ${JSON.stringify(output)}`);
}

/** Shape the immutable ctx to what THIS turn voices. Total over the output axis (spine §5.5) — a third
 *  output mode cannot build until it declares which card section it renders. */
export function shapeContextForSpeaker(
  ctx: AssembleContext,
  speaker: { readonly ref: SpeakerRef; readonly output: GroupOutput; readonly cardScope: CardScope },
): AssembleContext {
  const { castMembers, cast } = ctx;
  if (castMembers === undefined || cast === undefined) {
    return ctx; // solo / hand-built — no card selection to make.
  }
  switch (speaker.output) {
    case "narrator":
      return shapeContextForCast(ctx, cast);
    case "per-speaker":
      return shapeContextForSingle(ctx, cast, castMembers, speaker);
    default:
      return assertNeverGroupOutput(speaker.output);
  }
}
