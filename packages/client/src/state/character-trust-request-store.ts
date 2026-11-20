// A request to land on one character's Trust tab control, made by a door that opened the tab (the row notice's Trust settings control).
// The tab mounts after the door's reveal lands, so the request waits here until the tab takes it once.

import type { CharacterId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

interface CharacterTrustRequestState {
  readonly requested: CharacterId | null;
}

const useCharacterTrustRequestStore = createGatedStore<CharacterTrustRequestState>(
  "character-trust-request",
  (): CharacterTrustRequestState => ({ requested: null }),
);

export function requestCharacterTrustLanding(characterId: CharacterId): void {
  useCharacterTrustRequestStore.setState({ requested: characterId }, false, "characterTrustRequest/request");
}

/** The Trust tab took the request: focus has moved to the control the door named. */
export function clearRequestedCharacterTrust(): void {
  useCharacterTrustRequestStore.setState({ requested: null }, false, "characterTrustRequest/clear");
}

/** Reactive: the character whose Trust tab a door just opened and has not yet landed on (`null` = none). */
export function useRequestedCharacterTrust(): CharacterId | null {
  return useCharacterTrustRequestStore((s) => s.requested);
}
