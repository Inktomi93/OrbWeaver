// The ONE resolution of "which persona am I playing as". With no room open: current-pointer → default-pointer
// → first owned → null — the same order the retired `useViewer.currentPersona` composed onto sessions.me
// (#73: no consumer wanted that composed shape, so the persona surfaces read `persona.list` + `settings`
// directly and resolve here). In a room it is the viewer's SEAT persona, or null when the seat is empty (the
// server stamps no persona then). Spelled ONCE because every mount reads it: the switcher's rows, its head
// and the rail chip's trigger — one derivation, so the chip and the row can never disagree.

/** The seed pointers the resolution reads — the `settings.config.seeds` slice, structurally. */
export interface PersonaSeedPointers {
  readonly currentPersonaId: string | null;
  readonly defaultPersonaId: string | null;
}

/** The viewer's seat in the open room: `seatId` is `null` for an empty seat. */
export interface PlayingRoom {
  readonly seatId: string | null;
}

export function resolvePlayingPersona<T extends { readonly id: string }>(
  personas: readonly T[],
  seeds: PersonaSeedPointers,
  room: PlayingRoom | null,
): T | null {
  if (room === null) {
    return resolveCurrentPersona(personas, seeds);
  }
  return personas.find((persona) => persona.id === room.seatId) ?? null;
}

export function resolveCurrentPersona<T extends { readonly id: string }>(personas: readonly T[], seeds: PersonaSeedPointers): T | null {
  return (
    personas.find((persona) => persona.id === seeds.currentPersonaId) ??
    personas.find((persona) => persona.id === seeds.defaultPersonaId) ??
    personas[0] ??
    null
  );
}
