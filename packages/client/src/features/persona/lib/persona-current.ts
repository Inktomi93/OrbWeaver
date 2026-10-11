// The ONE resolution of "which persona am I playing as". With no room open it is who a new chat starts you as:
// the default (the crown), then the last-played persona, then the first owned. In a room it is the viewer's
// SEAT persona, or null when the seat is empty (the server stamps no persona then). Spelled ONCE because
// every mount reads it: the switcher's rows, its head and the rail chip's trigger.

/** The seed pointers the resolution reads — the `settings.config.seeds` slice, structurally. */
export interface PersonaSeedPointers {
  readonly currentPersonaId: string | null;
  readonly defaultPersonaId: string | null;
}

/** The viewer's seat in the open room: `seatId` is `null` for an empty seat. */
export interface PlayingRoom {
  readonly seatId: string | null;
}

/** Which pointer decided who a new chat starts you as. */
type NewChatPersonaSource = "default" | "lastPlayed";

export function resolvePlayingPersona<T extends { readonly id: string }>(
  personas: readonly T[],
  seeds: PersonaSeedPointers,
  room: PlayingRoom | null,
): T | null {
  if (room === null) {
    return resolveNewChatPersona(personas, seeds)?.persona ?? null;
  }
  return personas.find((persona) => persona.id === room.seatId) ?? null;
}

/** Who a new chat starts you as, in the server's order after the connected persona: default, then last played. */
export function resolveNewChatPersona<T extends { readonly id: string }>(
  personas: readonly T[],
  seeds: PersonaSeedPointers,
): { readonly persona: T; readonly source: NewChatPersonaSource } | null {
  const byDefault = personas.find((persona) => persona.id === seeds.defaultPersonaId);
  if (byDefault !== undefined) {
    return { persona: byDefault, source: "default" };
  }
  const lastPlayed = personas.find((persona) => persona.id === seeds.currentPersonaId) ?? personas[0];
  return lastPlayed === undefined ? null : { persona: lastPlayed, source: "lastPlayed" };
}
