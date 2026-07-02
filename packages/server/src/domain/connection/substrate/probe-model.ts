// domain/connection/substrate/probe-model — the diagnostic probe-model pick (pure; the substrate seam
// through which verbs reach the `catalog/` subsystem — domain-substrate-mediates-subsystems).

import { CHAT_MODELS } from "../catalog/chat-models";

/** The CHEAPEST curated Claude tier (haiku) — the `testClaudeAuth` verify turn's model (neo parity:
 *  "defaults to the cheapest tier"). The shortlist always carries a haiku entry; the first-entry fallback
 *  keeps this total in type (a shortlist regression surfaces as an expensive probe, not a crash). */
export function cheapestChatModelId(): string {
  const pick = CHAT_MODELS.find((m) => m.tier === "haiku") ?? CHAT_MODELS.at(0);
  if (pick === undefined) {
    // Unreachable: the curated shortlist is a non-empty literal tuple.
    throw new Error("connection: the curated chat shortlist is empty");
  }
  return pick.id;
}
