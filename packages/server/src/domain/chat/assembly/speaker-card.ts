// domain/chat/assembly/speaker-card — the per-turn CARD-SECTION shape (three-axis; `shape(ctx, speaker)`).
// Given the ONE immutable turn ctx (the full resolved `characters` + its index-aligned
// `speakerRefs` identities) and what this turn VOICES, pick the rendered character section
// (`ctx.character`/`speaker`) and the co-speakers:
//   • per-speaker × merged (default) → co-speakers = the OTHER present characters (the "[Also present — X]" block renders them).
//   • per-speaker × scoped           → co-speakers = [] (own card only; best isolation).
//   • narrator                       → ONE call voices ALL the seated characters: the primary is the character section, EVERY
//                                      other present member is a co-speaker, and `speaker` is the `multi-voice` arm, which
//                                      is what binds `{{char}}` to the joined member names (`assembly/macros` charForSpeaker).
// PURE — never mutates the input ctx (§5: per-speaker is a fresh shape, not a mutation). A ctx with no
// `speakerRefs` (solo / hand-built / preview) returns UNCHANGED → byte-identical (D16, no `if(isGroup)`).
//
// WHY NARRATOR NEEDS ITS OWN ARM: a narrator round's speaker is the SYNTHETIC
// group character, which by construction is NOT in `speakerRefs` — without this arm it would fall through
// the `idx === -1` guard below and assemble as if it were a SOLO turn for the primary (a system row naming
// only the primary, opening "write <primary>'s perspective only" on a turn that voices all the seated characters, with
// the model nonetheless attempting all the seated characters from a nudge naming names it was never given a card for). The
// `-1` guard stays, but it is a REFUSAL now, not a fallback (#1462): a genuinely off-roster speaker on a
// PER-SPEAKER round is a wiring gap, and keeping the primary answered it by shipping the wrong character's
// card under the asked-for speaker's name. Narrator does not reach it at all.
//
// D60: `speakerRefs` carries `agent` refs too. An agent has NO card — its resolved SOUL fills the same
// card-shaped `AssembleCharacter` slot (doc 04 §5, "the card-shape minus the card"), so an agent speaker's
// soul becomes the character section here exactly the way a character's card does — one turn path.

import type { AssembleCharacter, AssembleContext, GroupConfig, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";

/** The output axis — what ONE generation voices. Derived, never re-spelled (spine §5.5). */
type GroupOutput = GroupConfig["output"];
/** The card-scope axis; lives only on the per-speaker arm (narrator is always merged). */
type CardScope = Extract<GroupConfig, { output: "per-speaker" }>["cardScope"];

/** NARRATOR: one call voices all the seated characters. The primary card is the character section and every OTHER
 *  present member rides as a co-speaker — the SAME breadth `cardScope:"merged"` produces, because the cards
 *  a narrator turn needs are exactly "everyone in the room". `speaker` takes the `multi-voice` arm so `{{char}}`
 *  resolves to the joined member names rather than to whichever member happens to be primary. */
function shapeContextForMultiVoice(ctx: AssembleContext, characters: readonly AssembleCharacter[]): AssembleContext {
  const active = characters[0] ?? ctx.character;
  // An EMPTY-but-defined roster is reachable, so `members` needs the same floor `active` gets: `getCard` returning
  // falsy for every seated id drops the whole roster (`assembly/context` buildAssembleContext) while a narrator
  // round still fires (`verbs/turn` gates on `output === "narrator"` OR a speaker, never on roster size). An
  // unfloored `members: []` joins to "" and ships "…voicing  and the world around them" — `{{char}}` with no
  // value at all (the narrator default, `assembly/assemble` templateFor; it read "You are  in an immersive…"
  // before the framing became mode-aware).
  // Flooring to `[active]` degrades to exactly the pre-multi-voice-arm binding (the primary's name).
  const members = characters.length > 0 ? [...characters] : [active];
  return {
    ...ctx,
    character: active,
    speaker: { kind: "multi-voice", members, active },
    coSpeakers: characters.slice(1),
  };
}

/** PER-SPEAKER: the named speaker's card becomes the character section; `cardScope` selects the breadth of
 *  the co-speakers merged in beside it.
 *
 *  AN OFF-ROSTER REF IS REFUSED, not absorbed (#1462). This used to `return ctx` — "keep the primary, never
 *  crash" — which is not a degrade but a WRONG ANSWER: the round still runs, the model is handed the PRIMARY's
 *  card and the primary's `{{char}}`, and the reply is attributed to the speaker that was asked for. A seat
 *  whose card read came back empty (`assembly/context` drops those ids from `speakerRefs`) hits exactly this
 *  path, so it is reachable, not theoretical. Refusing surfaces the wiring gap where it happens instead of
 *  shipping one character's prose under another's name (D41 no-silent-degrade). */
function shapeContextForSingle(
  ctx: AssembleContext,
  characters: readonly AssembleCharacter[],
  speakerRefs: readonly SpeakerRef[],
  speaker: { readonly ref: SpeakerRef; readonly cardScope: CardScope },
): AssembleContext {
  const key = speakerKey(speaker.ref);
  const idx = speakerRefs.findIndex((m) => speakerKey(m) === key);
  if (idx === -1) {
    throw new ChatOperationError(
      CHAT_OP_CODES.speakerOffRoster,
      `shapeContextForSpeaker: per-speaker round asked for ${key}, which is not among this turn's resolved speakers`,
    );
  }
  const active = characters[idx] ?? ctx.character;
  const others = characters.filter((_, i) => i !== idx);
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
  const { speakerRefs, characters } = ctx;
  if (speakerRefs === undefined || characters === undefined) {
    return ctx; // solo / hand-built — no card selection to make.
  }
  switch (speaker.output) {
    case "narrator":
      return shapeContextForMultiVoice(ctx, characters);
    case "per-speaker":
      return shapeContextForSingle(ctx, characters, speakerRefs, speaker);
    default:
      return assertNeverGroupOutput(speaker.output);
  }
}
