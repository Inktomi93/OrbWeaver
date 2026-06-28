// domain/persona/substrate/macro-swap — the {{char}} ↔ {{user}} swap for createFromCharacter (ST
// convertCharacterToPersona). A character's description is written from the chatbot's POV, so `{{char}}`
// is itself and `{{user}}` is the player. As a PERSONA (the player), those roles invert.
//
// LOAD-BEARING two-pass invariant (persona.md §Esoteric — explicitly KEPT, the structural-reference
// alternative is NOT taken): the swap routes through two intermediate tokens so it can never collide. A
// naive one-pass (`{{char}}→{{user}}` then `{{user}}→{{char}}`) would DOUBLE-swap any description
// containing BOTH macros — the second pass re-hits what the first just wrote. The intermediate tokens make
// each source macro land exactly once. Pure, zero-I/O (so the invariant is unit-testable in isolation).

const CHAR_INTERMEDIATE = "{{personaChar}}";
const USER_INTERMEDIATE = "{{personaUser}}";

export function swapPersonaMacros(description: string): string {
  return description
    .replace(/\{\{char\}\}/gi, CHAR_INTERMEDIATE)
    .replace(/\{\{user\}\}/gi, USER_INTERMEDIATE)
    .replace(/\{\{personaUser\}\}/gi, "{{char}}")
    .replace(/\{\{personaChar\}\}/gi, "{{user}}");
}
