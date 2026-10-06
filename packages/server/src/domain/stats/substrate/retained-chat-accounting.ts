import type { RetainedRebaseInput, RetainedRebaseProjection } from "../contract/retained-chat-accounting.ts";

/** Project distinct retained cohorts and voices from the accepted rekey plan without query-layer state. */
export function retainedRebaseProjection({ rekeys, ownerIds, seats, slots, variants, cardOwners }: RetainedRebaseInput): RetainedRebaseProjection {
  const characterOwners = new Map(cardOwners.map((row) => [row.id, row.ownerId]));
  const characterSeats = seats.filter((seat) => seat.kind === "character" && seat.characterId !== null);
  const beforeSeatIds = [...new Set(characterSeats.flatMap((seat) => (seat.characterId === null ? [] : [seat.characterId])))];
  const afterSeatIds = [
    ...new Set(
      characterSeats.flatMap((seat) => {
        const characterId = rekeys.seats.get(seat.id) ?? seat.characterId;
        return characterId === null ? [] : [characterId];
      }),
    ),
  ];
  const afterOwnerIds = [
    ...new Set(
      afterSeatIds.flatMap((id) => {
        const owner = characterOwners.get(id);
        return owner === undefined ? [] : [owner];
      }),
    ),
  ].sort();
  const planStillMatches = [...rekeys.seats].every(([participantId, characterId]) => {
    const seat = characterSeats.find((row) => row.id === participantId);
    return seat?.characterId !== null && seat?.characterId !== undefined && rekeys.characters.get(seat.characterId) === characterId;
  });
  return { slots, variants, beforeOwnerIds: ownerIds, afterOwnerIds, beforeSeatIds, afterSeatIds, characterOwners, planStillMatches };
}
