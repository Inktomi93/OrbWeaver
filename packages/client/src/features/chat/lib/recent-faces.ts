// The chats-pane FACES curation (Arm B): which characters get a face at the top
// of the chats list, and in what order.
//
// RESUME-RECENCY, capped: walk the chats newest-first (the server's own `listChats` order) and take each
// character seat the first time it appears. That makes the strip "the people you were just with", which is
// what a launcher shortcut is for — and it costs nothing, because it folds two reads the pane already has.
//
// The faces come off the chat ROWS themselves (`ChatSummary.participantPortraits`, #192). They used to be
// resolved against a whole-library `character.list {limit: 500}` map the pane fetched for exactly this — so
// a library past that ceiling simply stopped producing faces, and home boot spent a library-sized read on
// six portraits. Pure + structural, so it unit-tests without a data layer.

import type { CharacterId } from "@orb/kit/ids";
//
// UNCAPPED by default (FACEFILT): the curation answers "who, in what order", and the STRIP answers "how many
// fit" by measuring the pane it lives in — a count here was a second, blinder answer to the same question,
// and the one that produced a sideways-scrolling row on a six-character library. Everyone past the fold is
// still reachable through the strip's picker, so nothing this returns is wasted. `cap` survives for a caller
// that genuinely has one.

/** The chat shape the curation reads (a structural subset of `ChatSummary`), already in recency order. */
export interface FaceSourceChat {
  readonly participantPortraits: readonly { readonly characterId: CharacterId; readonly name: string; readonly avatarHash: string | null }[];
}

/** One curated face — the id the filter chip is set from, in the `FaceStrip` item shape (so the strip takes
 *  the curation's output directly; no adapter, no second spelling of a face). */
export interface RecentFace {
  readonly id: string;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** Distinct character seats in first-appearance order across `chats`; `cap` bounds the run when given. */
export function recentFaces(chats: readonly FaceSourceChat[], cap?: number): readonly RecentFace[] {
  const faces: RecentFace[] = [];
  const seen = new Set<string>();
  for (const chat of chats) {
    for (const seat of chat.participantPortraits) {
      if (seen.has(seat.characterId)) {
        continue;
      }
      seen.add(seat.characterId);
      faces.push({ id: seat.characterId, name: seat.name, avatarHash: seat.avatarHash });
      if (cap !== undefined && faces.length >= cap) {
        return faces;
      }
    }
  }
  return faces;
}
