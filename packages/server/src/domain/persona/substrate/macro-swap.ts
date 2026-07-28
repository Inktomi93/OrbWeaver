// domain/persona/substrate/macro-swap — the {{char}} <-> {{user}} swap for createFromCharacter. A
// character's description is written from the chatbot's POV; as a persona, those roles invert.
// The inversion mapping ({char: "{{user}}", user: "{{char}}"}) routes through the one kit-level
// identity-swap helper: its single combined pass resolves each match independently, so a description
// containing BOTH macros can never double-swap (the emitted text is not re-scanned).

import { swapIdentityMacros } from "@orb/kit/macro";

export function swapPersonaMacros(description: string): string {
  return swapIdentityMacros(description, { char: "{{user}}", user: "{{char}}" });
}
