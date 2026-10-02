// domain/import/substrate/card — pure bytes/string in → ParsedCard out (or null on unreadable). Composes
// png-card-chunk (PNG tEXt/zTXt decode) + #kit/serde/card (cardFromJson). Adds import-specific bits the serde
// core doesn't own: the whole-file importHash (dedup oracle over raw bytes, distinct from cardContentHash),
// the flatten-to-create-input validation seam, and card tag extraction (cardFromJson drops data.tags).
//
// Pure: no DB, no fs, no logger. A parse failure returns null, never throws.

import type { AttachedBookRef, CharacterCard, CreateCharacterInput } from "@orb/contracts/character";
import { ATTACHED_BOOKS_WIRE_KEY, attachedBookRefSchema, createCharacterSchema, repairImportedCardInput } from "@orb/contracts/character";
import { ATTACHED_REGEX_SCRIPTS_WIRE_KEY, attachedRegexScriptRefSchema } from "@orb/contracts/regex";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { AssetId, CharacterId, RegexScriptId } from "@orb/kit/ids";
import { readCardChunk, stripCardChunks } from "@orb/kit/png-card-chunk";
import { slugifyHandle } from "@orb/kit/slug";
import { z } from "zod";
import { sha256Hex } from "#kit/content-hash";
import { cardFromJson, cardImportHash, extractLorebook, loreEntryColumns, loreEntryMetadata, selectBestCharacterBook } from "#kit/serde/card";
import { ImportCardError } from "../contract/errors.ts";
import type { CardIdentityHashes, FindCharacterByHash, ImportedCharacterMatch } from "../contract/identity.ts";

// UTF-8 BOM codepoint — Windows exports + some editors prepend one and `JSON.parse` rejects it.
const UTF8_BOM = 0xfe_ff;

interface ParsedCard {
  readonly card: CharacterCard;
  readonly tags: readonly string[];
  /** Embedded ST character_book mapped to the canonical bulk-import shape, or null when the card ships none. */
  readonly book: BulkImportLorebookInput | null;
  /** Carried attached-book REFERENCES (`{worldBookId, role}`), re-linked by id on import. Empty for a
   *  foreign ST card / an orbweaver card with no attached books. Each ref is validated (invalid ones dropped). */
  readonly attachedBooks: readonly AttachedBookRef[];
  /** D121-E twin of `attachedBooks`: carried attached-SCRIPT references (`{regexScriptId}`), re-linked by id
   *  on a same-install re-import. Empty for a foreign ST card — the by-value `card.regexScripts` lifts then. */
  readonly attachedRegexScripts: readonly RegexScriptId[];
  /** sha-256 hex of the PNG minus its card chunks (the art), null for a JSON card. Part of the identity. */
  readonly artHash: string | null;
}

const DEFAULT_BOOK_NAME = "Imported World Book";

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// selectBestCharacterBook disambiguates a card that embeds a book twice (most-named-entries wins).
function extractBulkImportLorebook(raw: unknown): BulkImportLorebookInput | null {
  const root = asRecord(raw);
  if (root === null) {
    return null;
  }
  const data = asRecord(root["data"]) ?? root;
  const book = asRecord(selectBestCharacterBook(data["character_book"], root["character_book"]));
  if (book === null) {
    return null;
  }
  const entries = extractLorebook(book).map((entry) => ({
    ...loreEntryColumns(entry),
    metadata: loreEntryMetadata(entry),
  }));
  if (entries.length === 0) {
    return null;
  }
  const name = typeof book["name"] === "string" && book["name"].trim().length > 0 ? book["name"] : DEFAULT_BOOK_NAME;
  const description = typeof book["description"] === "string" ? book["description"] : null;
  return { name, description, entries };
}

// pull the orbweaver-namespaced attached-book references off `data.orbweaver_attached_books` (V3
// nests real fields under `data`; a bare root is tolerated). Each candidate is validated through the
// canonical schema — a foreign/malformed entry is dropped, never thrown. The ownership gate runs later at
// the re-link op; this only shapes the ids + roles.
function extractAttachedBooks(raw: unknown): AttachedBookRef[] {
  const root = asRecord(raw);
  if (root === null) {
    return [];
  }
  const data = asRecord(root["data"]) ?? root;
  const candidates = data[ATTACHED_BOOKS_WIRE_KEY];
  if (!Array.isArray(candidates)) {
    return [];
  }
  const out: AttachedBookRef[] = [];
  for (const candidate of candidates) {
    const parsed = attachedBookRefSchema.safeParse(candidate);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}

// D121-E twin of `extractAttachedBooks`: pull the orbweaver-namespaced attached-SCRIPT references off
// `data.orbweaver_attached_regex_scripts`. Each candidate is validated through the canonical ref schema — a
// foreign/malformed entry is dropped, never thrown. The OWNERSHIP gate runs later at the lift op (a
// reference naming a row this owner does not have simply resolves to nothing).
function extractAttachedRegexScripts(raw: unknown): RegexScriptId[] {
  const root = asRecord(raw);
  if (root === null) {
    return [];
  }
  const data = asRecord(root["data"]) ?? root;
  const candidates = data[ATTACHED_REGEX_SCRIPTS_WIRE_KEY];
  if (!Array.isArray(candidates)) {
    return [];
  }
  const out: RegexScriptId[] = [];
  for (const candidate of candidates) {
    const parsed = attachedRegexScriptRefSchema.safeParse(candidate);
    if (parsed.success) {
      out.push(parsed.data.regexScriptId);
    }
  }
  return out;
}

function toText(input: Uint8Array | string): string {
  const raw = typeof input === "string" ? input : new TextDecoder("utf-8").decode(input);
  return raw.charCodeAt(0) === UTF8_BOM ? raw.slice(1) : raw;
}

// Raw strings, no normalization here — the tag resolve-or-create chokepoint owns the one canonicalization.
function extractCardTags(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) {
    return [];
  }
  const root = raw as Record<string, unknown>;
  const data = typeof root["data"] === "object" && root["data"] !== null ? (root["data"] as Record<string, unknown>) : root;
  const fromData = Array.isArray(data["tags"]) ? data["tags"] : [];
  const rootTags = root["tags"];
  const candidate = fromData.length > 0 || !Array.isArray(rootTags) ? fromData : rootTags;
  return candidate.filter((entry): entry is string => typeof entry === "string");
}

function fromText(text: string, fallbackName: string, artHash: string | null): ParsedCard | null {
  // @orb-waive caught-failure-ownership(catch): pure `JSON.parse` over untrusted import text —
  // no infra I/O in this try. A malformed card degrades to the consumed `null` result the caller checks.
  // Ends if this call gains a real infra step (then the infra half must escalate separately).
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    return {
      card: cardFromJson(parsed, fallbackName),
      tags: extractCardTags(parsed),
      book: extractBulkImportLorebook(parsed),
      attachedBooks: extractAttachedBooks(parsed),
      attachedRegexScripts: extractAttachedRegexScripts(parsed),
      artHash,
    };
  } catch {
    return null;
  }
}

/** JSON rides in a base64 ccv3 (V3, preferred) or chara (V2) tEXt/zTXt chunk. Async because the codec's
 *  zTXt (compressed) arm inflates through `DecompressionStream`. */
export async function parseCardPng(bytes: Uint8Array, fallbackName: string): Promise<ParsedCard | null> {
  const decoded = (await readCardChunk(bytes, "ccv3")) ?? (await readCardChunk(bytes, "chara"));
  if (decoded === null) {
    return null;
  }
  return fromText(decoded, fallbackName, sha256Hex(stripCardChunks(bytes)));
}

export function parseCardJson(input: Uint8Array | string, fallbackName: string): ParsedCard | null {
  return fromText(toText(input), fallbackName, null);
}

/** The whole-file hash a chat transcript dedups by, and the legacy character key: rows imported before the
 *  content identity landed carry this, so a character lookup tries it after the content hash misses. */
export function importFileHash(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

/** The character import identity (`characters.importHash`): the parsed card, its embedded book and its art
 *  through the serde's one hash, so a re-saved PNG or a re-ordered JSON of one card dedups. */
export function parsedCardImportHash(parsed: ParsedCard): string {
  return cardImportHash({ card: parsed.card, book: parsed.book, artHash: parsed.artHash });
}

/** The identity with the art left out — what a JSON card of the same text hashes to. */
export function parsedCardTextHash(parsed: ParsedCard): string {
  return cardImportHash({ card: parsed.card, book: parsed.book, artHash: null });
}

/** The owner's character an equal card already landed as, in ONE lookup order for every door. */
export async function findImportedCharacter(
  find: FindCharacterByHash,
  hashes: CardIdentityHashes,
): Promise<{ readonly characterId: CharacterId; readonly match: ImportedCharacterMatch } | null> {
  const byContent = await find(hashes.importHash);
  if (byContent !== null) {
    return { characterId: byContent, match: "content" };
  }
  if (hashes.textHash !== hashes.importHash) {
    const byText = await find(hashes.textHash);
    if (byText !== null) {
      return { characterId: byText, match: "text" };
    }
  }
  const byFile = await find(importFileHash(hashes.bytes));
  return byFile === null ? null : { characterId: byFile, match: "file" };
}

/** @throws {@link ImportCardError} card_invalid when the normalized card fails the canonical schema. */
export function cardToCreateInput(card: CharacterCard, avatarAssetId: AssetId | null): CreateCharacterInput {
  const candidate = {
    handle: slugifyHandle(card.name),
    name: card.name,
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
    nickname: card.nickname,
    source: card.source,
    creationDate: card.creationDate,
    modificationDate: card.modificationDate,
    // ST's `extensions.fav`, promoted by the serde (residue drops the key; export re-emits the live row).
    starred: card.starred === true,
    extensions: card.extensions,
    residualData: card.residualData,
    avatarAssetId,
    depthPrompt: card.depthPrompt,
  };
  // Best-effort repair BEFORE validation: clamp over-cap fields so a foreign card with a too-long value still
  // imports. A card that STILL fails (a structural/type defect repair can't fix) throws — the bulk-import loop
  // isolates it per-card (skip + count), never aborting the batch.
  const result = createCharacterSchema.safeParse(repairImportedCardInput(candidate));
  if (!result.success) {
    // `z.prettifyError` over `error.message`: the raw message is the ZodError's JSON issue DUMP — a wall of
    // `[{"expected":"string","code":"invalid_type","path":["name"],…}]` shown verbatim to whoever dragged the
    // card in. This refusal is USER-facing, so it gets the human layout (same shape as the plugin manifest
    // and the preset-file refusals).
    throw new ImportCardError("card_invalid", `imported card failed validation:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
