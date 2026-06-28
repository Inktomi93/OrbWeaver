// domain/character/substrate/content-hash — the card "flatten": the deterministic SEMANTIC-fields hash
// written to `characters.content_hash` on every create/edit (character.md §"What this domain owns"; the
// column is NOT NULL, so a write MUST compute it). Pure compute, zero I/O — a feature-local substrate
// helper. `stableStringify` sorts object keys recursively (arrays keep order), so two logically-identical
// cards hash identically regardless of key insertion order — the property the determinism + re-import-dedup
// tests rely on.
//
// EXCLUDED from the hash (deliberate — re-attributing or re-deriving a card must NOT change its identity):
// `creator`, `creatorNotes`, `cardVersion`, `extensions`, `refinery`, `avatarAssetId`. INCLUDED: the
// semantic content a reader experiences (name…regexScripts). Tags + lorebook are external junctions in
// orbweaver (tag / world-info domains), so they are not card columns and not hashed here.
//
// FLAG[PD-33]: this duplicates the serde-side card hash the `import` domain needs (it writes
// `content_hash` directly via @orb/db). When `@orb/server/kit/serde/card` lands, promote `cardContentHash`
// there so import + character share ONE hash (no-doubling) → `@orb/server/kit/serde` when that scaffold
// target is built (character.md Movement: the card hash homes in server/kit/serde).

import { createHash } from "node:crypto";
import type { CharacterCard } from "@orb/contracts/character";

/** Deterministic JSON: object keys sorted recursively; arrays preserve order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`);
  return `{${parts.join(",")}}`;
}

/** The semantic content subset that identifies a card (provenance/derived fields excluded — see header). */
function semanticFields(card: CharacterCard): Record<string, unknown> {
  return {
    name: card.name,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    greetings: card.greetings,
    exampleMessages: card.exampleMessages,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
    depthPrompt: card.depthPrompt,
    regexScripts: card.regexScripts,
  };
}

/** sha-256 hex of the stable-stringified semantic fields — the card's `content_hash`. */
export function cardContentHash(card: CharacterCard): string {
  return createHash("sha256")
    .update(stableStringify(semanticFields(card)))
    .digest("hex");
}
