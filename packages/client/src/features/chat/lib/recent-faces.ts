// The chats-pane FACES curation (list-pane-projection Arm B, §5.2): which characters get a face at the top
// of the chats list, and in what order.
//
// RESUME-RECENCY, capped: walk the chats newest-first (the server's own `listChats` order) and take each
// character seat the first time it appears. That makes the strip "the people you were just with", which is
// what a launcher shortcut is for — and it costs nothing, because it folds two reads the pane already has.
//
// Seats the character page doesn't carry are dropped rather than guessed: a face with no name is a shortcut
// to an unknown. Pure + structural, so it unit-tests without a data layer.

import type { ChatRowPortrait } from "./chat-summary-row";

/** The default strip cap — enough to cover a working cast, short enough to stay one glanceable row. */
const RECENT_FACES_CAP = 8;

/** The chat shape the curation reads (a structural subset of `ChatSummary`), already in recency order. */
export interface FaceSourceChat {
  readonly participantCharacterIds: readonly string[];
}

/** One curated face — the id the filter chip is set from, in the `FaceStrip` item shape (so the strip takes
 *  the curation's output directly; no adapter, no second spelling of a face). */
export interface RecentFace {
  readonly id: string;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** Distinct character seats in first-appearance order across `chats`, capped at `cap`. */
export function recentFaces(
  chats: readonly FaceSourceChat[],
  characterById: ReadonlyMap<string, ChatRowPortrait>,
  cap: number = RECENT_FACES_CAP,
): readonly RecentFace[] {
  const faces: RecentFace[] = [];
  const seen = new Set<string>();
  for (const chat of chats) {
    for (const characterId of chat.participantCharacterIds) {
      if (seen.has(characterId)) {
        continue;
      }
      seen.add(characterId);
      const seat = characterById.get(characterId);
      if (seat !== undefined) {
        faces.push({ id: characterId, name: seat.name, avatarHash: seat.hash });
        if (faces.length >= cap) {
          return faces;
        }
      }
    }
  }
  return faces;
}
