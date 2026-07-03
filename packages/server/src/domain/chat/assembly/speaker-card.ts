// domain/chat/assembly/speaker-card — the per-speaker CARD-SECTION shape (chat.md Part III §7 two-axis; §5
// `shape(ctx, speaker)`). Given the ONE immutable turn ctx (the full resolved `cast` + its index-aligned
// `castMembers` identities) and the active speaker, pick THAT speaker's card as the rendered character section
// (`ctx.character`/`speaker`) and the co-speakers:
//   • merged (default)  → co-speakers = the OTHER present cast (the "[Also present — X]" block renders them).
//   • scoped            → co-speakers = [] (own card only; best isolation).
// PURE — never mutates the input ctx (§5: per-speaker is a fresh shape, not a mutation). A ctx with no
// `castMembers` (solo / hand-built / preview) returns UNCHANGED → byte-identical (D16, no `if(isGroup)`).
//
// D60: `castMembers` carries `agent` refs too (an agent's card is its resolved soul, injected at RESOLVE), so
// an agent speaker's soul becomes the character section here exactly like a character's card — one turn path.

import type { AssembleContext, SpeakerRef } from "@orb/contracts/chat";
import { speakerKey } from "@orb/contracts/chat";

/** Shape the immutable ctx to THIS speaker (chat.md §5/§7). `cardScope` selects the co-speaker breadth. */
export function shapeContextForSpeaker(
  ctx: AssembleContext,
  speaker: { readonly ref: SpeakerRef; readonly cardScope: "merged" | "scoped" },
): AssembleContext {
  const { castMembers, cast } = ctx;
  if (castMembers === undefined || cast === undefined) {
    return ctx; // solo / hand-built — no per-speaker selection to make.
  }
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
