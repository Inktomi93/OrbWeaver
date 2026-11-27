// domain/import/substrate/card — pure bytes/string in → ParsedCard out (or null on unreadable). Composes
// png-card-chunk (PNG tEXt/zTXt decode) + #primitives/serde/card (readCardJson, which reads every plane the card
// carries through the card schema). Adds import-specific bits the serde core doesn't own: the whole-file importHash
// (dedup oracle over raw bytes, distinct from cardContentHash), the embedded book's column narrowing, and the
// flatten-to-create-input validation seam.
//
// Pure: no DB, no fs, no logger. Text that is not JSON returns null; a card the import refuses for what it holds
// (nesting past JSON_MAX_DEPTH, an embedded book the column refuses) throws ImportCardError; any other throw is a defect.

import type { AttachedBookRef, CharacterCard, CreateCharacterInput } from "@orb/contracts/character";
import {
  ATTACHED_BOOKS_WIRE_KEY,
  CHARACTER_BACKGROUND_WIRE_KEY,
  CHARACTER_HANDLE_WIRE_KEY,
  createCharacterSchema,
  repairImportedCardInput,
} from "@orb/contracts/character";
import { ATTACHED_REGEX_SCRIPTS_WIRE_KEY } from "@orb/contracts/regex";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { BulkImportLorebookInput, EntryMetadata } from "@orb/contracts/world-info";
import { narrowedEntryMetadataSchema } from "@orb/contracts/world-info";
import type { AssetId, CharacterHandle, CharacterId, RegexScriptId, UserId } from "@orb/kit/ids";
import { JSON_MAX_DEPTH, nestsPastJsonMaxDepth, parseJsonText } from "@orb/kit/json";
import { readCardChunk, stripCardChunks } from "@orb/kit/png-card-chunk";
import { z } from "zod";
import { sha256Hex } from "#primitives/content-hash";
import type { CardBookRead, CardData } from "#primitives/serde/card";
import { cardImportHash, readCardJson } from "#primitives/serde/card";
import { ImportCardError } from "../contract/errors.ts";
import type { CardIdentityHashes, CurrentCardIdentity, ExportCurrentCard, FindCharacterByHash, ImportedCharacterMatch } from "../contract/identity.ts";
import { requestedHandle } from "./handle.ts";

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
  /** The handle an orbweaver export carried; null for a foreign card. Not part of the identity. */
  readonly handle: CharacterHandle | null;
  /** The asset background an orbweaver export carried, re-linked by its hash at create; null when none. Not
   *  part of the identity. */
  readonly background: ThemeBackground | null;
  /** Each field the reader left out, regex script it refused or placement it lost, as one line the import names.
   *  Beside the card, never in it, so it is not part of the identity. */
  readonly notes: readonly string[];
}

const DEFAULT_BOOK_NAME = "Imported World Book";
// An exported card always names itself, so the fallback never enters a seat card's identity.
const SEAT_CARD_FALLBACK_NAME = "Imported Character";

// Narrowed at the parse, so a card whose embedded book the column refuses fails before its character is written.
function narrowedLoreMetadata(raw: Record<string, unknown>): EntryMetadata | null {
  const narrowed = narrowedEntryMetadataSchema.safeParse(raw);
  if (!narrowed.success) {
    throw new ImportCardError("card_invalid", `the card's embedded world book failed validation:\n${z.prettifyError(narrowed.error)}`);
  }
  return narrowed.data;
}

// The book the serde read, with each entry's metadata narrowed for its column. A book without entries carries none.
function bulkImportLorebook(book: CardBookRead | null): BulkImportLorebookInput | null {
  if (book === null || book.entries.length === 0) {
    return null;
  }
  const name = book.name !== undefined && book.name.trim().length > 0 ? book.name : DEFAULT_BOOK_NAME;
  const entries = book.entries.map(({ columns, metadata }) => ({ ...columns, metadata: narrowedLoreMetadata(metadata) }));
  return { name, description: book.description ?? null, entries };
}

// Only an asset source with its hash re-links; anything else (a foreign or malformed value) carries nothing.
function carriedBackground(data: CardData): ThemeBackground | null {
  const background = data[CHARACTER_BACKGROUND_WIRE_KEY];
  return background !== undefined && background.kind === "asset" && background.assetHash.length > 0 ? background : null;
}

function toText(input: Uint8Array | string): string {
  const raw = typeof input === "string" ? input : new TextDecoder("utf-8").decode(input);
  return raw.charCodeAt(0) === UTF8_BOM ? raw.slice(1) : raw;
}

function fromText(text: string, fallbackName: string, artHash: string | null): ParsedCard | null {
  // Every caller reads the `null`: `createImportCharacter` throws `ImportCardError("card_unreadable")`,
  // `restoreCharacterBook` answers `ok: false`, and `collectCards` records the file in `unreadableCards`.
  const parsed = parseJsonText(text);
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  // Before any walk: the identity hash and the stored planes are walked recursively, so without this a deep card
  // imports or overflows the stack depending on the host.
  if (nestsPastJsonMaxDepth(parsed)) {
    throw new ImportCardError("card_invalid", `the card nests deeper than ${String(JSON_MAX_DEPTH)} levels`);
  }
  const read = readCardJson(parsed, fallbackName);
  return {
    card: read.card,
    notes: read.notes.map(({ field, reason }) => `\`${field}\` — ${reason}`),
    // Raw strings, no normalization here — the tag resolve-or-create chokepoint owns the one canonicalization.
    tags: read.data.tags ?? [],
    book: bulkImportLorebook(read.book),
    attachedBooks: read.data[ATTACHED_BOOKS_WIRE_KEY] ?? [],
    attachedRegexScripts: (read.data[ATTACHED_REGEX_SCRIPTS_WIRE_KEY] ?? []).map(({ regexScriptId }) => regexScriptId),
    artHash,
    handle: read.data[CHARACTER_HANDLE_WIRE_KEY] ?? null,
    background: carriedBackground(read.data),
  };
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

/** The keys a card PNG is looked up by, computed the way the character restore computes them — what a chat
 *  bundle's seat carries so it binds to the row that card restored as. Null when the bytes carry no card. */
export async function cardPngIdentity(bytes: Uint8Array): Promise<CardIdentityHashes | null> {
  const parsed = await parseCardPng(bytes, SEAT_CARD_FALLBACK_NAME);
  return parsed === null ? null : { importHash: parsedCardImportHash(parsed), textHash: parsedCardTextHash(parsed), fileHash: importFileHash(bytes) };
}

/** The current identity of the owner's character `handle` names, or undefined for a card that carries no handle
 *  (a foreign card, which no row the app wrote can equal). */
export function currentCardIdentity(exportCurrentCard: ExportCurrentCard, ownerId: UserId, handle: CharacterHandle | null): CurrentCardIdentity | undefined {
  if (handle === null) {
    return undefined;
  }
  return async () => {
    const current = await exportCurrentCard({ ownerId, handle });
    const hashes = current === null ? null : await cardPngIdentity(current.bytes);
    return current === null || hashes === null ? null : { characterId: current.characterId, hashes };
  };
}

// The current export is always a PNG. A JSON card carries no art, so it equals the export's text identity; a PNG
// card equals the full one.
function sameCard(incoming: CardIdentityHashes, current: CardIdentityHashes): boolean {
  return incoming.importHash === current.importHash || (incoming.importHash === incoming.textHash && incoming.textHash === current.textHash);
}

/** The owner's character an equal card already landed as, in ONE lookup order for every door. The stored keys come
 *  first; only when they all miss does `current` export the one row the card's carried handle names (D290). */
export async function findImportedCharacter<Row = CharacterId>(
  find: FindCharacterByHash<Row>,
  hashes: CardIdentityHashes,
  current?: CurrentCardIdentity<Row>,
): Promise<{ readonly characterId: Row; readonly match: ImportedCharacterMatch } | null> {
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
  const byFile = await find(hashes.fileHash);
  if (byFile !== null) {
    return { characterId: byFile, match: "file" };
  }
  const live = current === undefined ? null : await current();
  return live !== null && sameCard(hashes, live.hashes) ? { characterId: live.characterId, match: "current" } : null;
}

/** The row a card reuses, the one rule the card write and its dry run share: the row an equal card landed as, where a
 *  match by text alone (a row from the JSON card, and this is its PNG) holds only when `takeArt` gives the row this
 *  card's art. `find` sees every row the upload landed before this card as well as the owner's: the write reads the
 *  database it has been writing, the dry run its record of the rows it would have written. */
export async function reusedCardRow<Row>(args: {
  readonly find: FindCharacterByHash<Row>;
  readonly hashes: CardIdentityHashes;
  readonly current?: CurrentCardIdentity<Row> | undefined;
  readonly takeArt: (row: Row) => Promise<boolean>;
}): Promise<{ readonly characterId: Row; readonly match: ImportedCharacterMatch } | null> {
  const found = await findImportedCharacter(args.find, args.hashes, args.current);
  if (found?.match !== "text") {
    return found;
  }
  return (await args.takeArt(found.characterId)) ? found : null;
}

/** @throws {@link ImportCardError} card_invalid when the normalized card fails the canonical schema. */
export function cardToCreateInput(parsed: Pick<ParsedCard, "card" | "handle">, avatarAssetId: AssetId | null): CreateCharacterInput {
  const { card } = parsed;
  const candidate = {
    handle: requestedHandle({ handle: parsed.handle, name: card.name }),
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
