// domain/import/substrate/card — the import-domain card ENTRY: pure, bytes/string in → a `ParsedCard`
// ({ canonical `CharacterCard`, the author-shipped `tags` }) out (or null on unreadable). Composes
// `@orb/kit/png-card-chunk` (the PNG tEXt decode) + `@orb/server/kit/serde/card` (`cardFromJson`, the tolerant
// JSON→canonical normalize + `cardContentHash`). Adds the import-specific bits the serde core deliberately
// does NOT own: the whole-file `importHash` (provenance + dedup oracle, over the raw bytes — NOT the semantic
// content), the flatten-to-create-input seam that validates the normalized card against the canonical
// `createCharacterSchema` (serialization-core §7.3 inv 3 — the tolerant IN normalizer's output is gated by the
// SAME schema the CRUD wire uses), and the card TAG extraction. `cardFromJson` deliberately drops `data.tags`
// (tags are the `character_tags` junction, not a card column — import.md §tag.md intersection: import writes
// `status:'pending'` junction rows from `card.tags`), so the tag NAMES are read straight off the raw card
// here and carried alongside the canonical card for the verb to attach as card/pending suggestions.
//
// PURE: no DB, no fs, no logger. A parse failure returns null (the caller treats null as "skip / not a
// card", same null contract as the kit codec) — no console (noConsole), no throw at the parse boundary.

import { createHash } from "node:crypto";
import type { CharacterCard, CreateCharacterInput } from "@orb/contracts/character";
import { createCharacterSchema } from "@orb/contracts/character";
import type { AssetId } from "@orb/kit/ids";
import { readCardChunk } from "@orb/kit/png-card-chunk";
import { slugifyHandle } from "@orb/kit/slug";
import { cardFromJson } from "#kit/serde/card";
import { ImportCardError } from "../contract/errors";

// UTF-8 BOM codepoint — Windows exports + some editors prepend one and `JSON.parse` rejects it.
const UTF8_BOM = 0xfe_ff;

/** A parsed card: the canonical `CharacterCard` (for create) PLUS the author-shipped tag names (for the
 *  card/pending junction carry — `cardFromJson` drops these). File-local: the verb destructures it; the
 *  type-only edge stays inside the substrate (not a cross-boundary contract type). */
interface ParsedCard {
  readonly card: CharacterCard;
  readonly tags: readonly string[];
}

/** Decode bytes (or pass through a string) to UTF-8 text, stripping a leading BOM. `TextDecoder` is a
 *  global (no node import) so the substrate stays import-clean. */
function toText(input: Uint8Array | string): string {
  const raw = typeof input === "string" ? input : new TextDecoder("utf-8").decode(input);
  return raw.charCodeAt(0) === UTF8_BOM ? raw.slice(1) : raw;
}

/** Pull the card's author-shipped tag names off the raw card JSON (V2/V3 `data.tags`, or a bare top-level
 *  `tags`), normalized like ST's `importTags`: trimmed, empties dropped, deduped case-insensitively (first
 *  occurrence's casing kept). orbweaver has no ST-internal ROOT/TAVERN tags to exclude. Non-strings are
 *  skipped (tolerant IN). The result feeds the card/pending junction carry, NOT the canonical card. */
function extractCardTags(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) {
    return [];
  }
  const root = raw as Record<string, unknown>;
  const data =
    typeof root["data"] === "object" && root["data"] !== null
      ? (root["data"] as Record<string, unknown>)
      : root;
  const fromData = Array.isArray(data["tags"]) ? data["tags"] : [];
  const rootTags = root["tags"];
  const candidate = fromData.length > 0 || !Array.isArray(rootTags) ? fromData : rootTags;
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of candidate) {
    if (typeof entry !== "string") {
      continue;
    }
    const name = entry.trim();
    const key = name.toLowerCase();
    if (name === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** Parse already-decoded card JSON text → the canonical card + its tags, or null on malformed JSON /
 *  non-object. */
function fromText(text: string, fallbackName: string): ParsedCard | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return { card: cardFromJson(parsed, fallbackName), tags: extractCardTags(parsed) };
  } catch {
    return null; // undecodable JSON → "not a card", per the null contract
  }
}

/** Parse a character-card PNG (the JSON rides in a base64 `ccv3` (V3, preferred) or `chara` (V2) tEXt
 *  chunk). Returns null when the bytes carry no card data (no chunk, malformed PNG, or undecodable JSON). */
export function parseCardPng(bytes: Uint8Array, fallbackName: string): ParsedCard | null {
  const decoded = readCardChunk(bytes, "ccv3") ?? readCardChunk(bytes, "chara");
  if (decoded === null) {
    return null;
  }
  return fromText(decoded, fallbackName);
}

/** Parse a bare V2/V3 character-card JSON (ST "export as JSON" / a `.json` card), bytes or string — the
 *  JSON sibling of `parseCardPng`, same normalize core, no PNG chunk extraction. */
export function parseCardJson(input: Uint8Array | string, fallbackName: string): ParsedCard | null {
  return fromText(toText(input), fallbackName);
}

/** sha-256 hex of the whole imported FILE bytes — the per-card provenance (`characters.import_hash`) +
 *  the byte-level re-import dedup oracle. DISTINCT from `cardContentHash` (the semantic-fields hash): a
 *  re-encoded identical card hashes the same content but a different file. */
export function importFileHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Flatten a canonical card → the `CreateCharacterInput` the create op consumes, deriving the per-owner
 * `handle` from the name and attaching the stored avatar. VALIDATES the result against the canonical
 * `createCharacterSchema` (the tolerant-IN → strict-validate seam, §7.3 inv 3) — a normalized card that
 * fails the canonical schema throws `ImportCardError("card_invalid")` rather than reaching the create op.
 */
export function cardToCreateInput(
  card: CharacterCard,
  avatarAssetId: AssetId | null,
): CreateCharacterInput {
  const candidate = {
    handle: slugifyHandle(card.name),
    name: card.name,
    // `description` is the one required (non-nullable) create field; null normalizes to "".
    description: card.description ?? "",
    personality: card.personality,
    scenario: card.scenario,
    greetings: card.greetings,
    exampleMessages: card.exampleMessages,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
    creatorNotes: card.creatorNotes,
    creator: card.creator,
    cardVersion: card.cardVersion,
    regexScripts: card.regexScripts,
    extensions: card.extensions,
    avatarAssetId,
    depthPrompt: card.depthPrompt,
  };
  const result = createCharacterSchema.safeParse(candidate);
  if (!result.success) {
    throw new ImportCardError(
      "card_invalid",
      `imported card failed validation: ${result.error.message}`,
    );
  }
  return result.data;
}
