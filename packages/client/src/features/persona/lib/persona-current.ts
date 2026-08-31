// The ONE resolution of "which persona am I playing as": current-pointer → default-pointer → first owned →
// null — the same order the retired `useViewer.currentPersona` composed onto sessions.me (#73: no consumer
// wanted that composed shape, so the persona surfaces read `persona.list` + `settings` directly and resolve
// here). Spelled ONCE because two mounts read it: the list's rows (`isCurrent`) and the rail chip's
// trigger (the avatar it shows) — one derivation, so the chip and the row can never disagree.

/** The seed pointers the resolution reads — the `settings.config.seeds` slice, structurally. */
export interface PersonaSeedPointers {
  readonly currentPersonaId: string | null;
  readonly defaultPersonaId: string | null;
}

export function resolveCurrentPersona<T extends { readonly id: string }>(personas: readonly T[], seeds: PersonaSeedPointers): T | null {
  return (
    personas.find((persona) => persona.id === seeds.currentPersonaId) ??
    personas.find((persona) => persona.id === seeds.defaultPersonaId) ??
    personas[0] ??
    null
  );
}
