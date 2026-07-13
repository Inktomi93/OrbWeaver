// domain/persona/substrate/macro-swap — the {{char}} <-> {{user}} swap for createFromCharacter. A
// character's description is written from the chatbot's POV; as a persona, those roles invert.
// LOAD-BEARING: routes through two intermediate tokens so it can never collide — a naive one-pass
// ({{char}}->{{user}} then {{user}}->{{char}}) would double-swap a description containing both macros.

const CHAR_INTERMEDIATE = "{{personaChar}}";
const USER_INTERMEDIATE = "{{personaUser}}";

export function swapPersonaMacros(description: string): string {
  return description
    .replace(/\{\{char\}\}/gi, CHAR_INTERMEDIATE)
    .replace(/\{\{user\}\}/gi, USER_INTERMEDIATE)
    .replace(/\{\{personaUser\}\}/gi, "{{char}}")
    .replace(/\{\{personaChar\}\}/gi, "{{user}}");
}
