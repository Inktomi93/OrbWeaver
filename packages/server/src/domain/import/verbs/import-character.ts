// verb: importCharacter — one ST character card → one canonical character. Flow: parse bytes → hash the
// PARSED CONTENT (the card, its tags and its embedded book; never the file bytes) → content dedup (the ONLY
// dedup: equal content is the same character, never a name) → flatten+validate → mint a FREE per-owner
// handle (a name-slug collision suffixes the HANDLE only, never the display name — two distinct "Eleni"
// cards are two characters) → create fresh with provenance + CAS-store avatar → attach tags → re-link
// carried attached-book references, else carry the embedded lorebook clone (the fallback when no reference
// resolves on this install, and only into a FREE primary seat). All cross-feature ops are injected via
// context.ts — import never reads a db table directly.
//
// THE DEDUP HIT REUSES THE CHARACTER AND RE-RUNS ITS PLANES (owner ruling): an equal-content card answers
// `created:false` (the doors' "already in your library"), and its tags, books and scripts are landed again
// idempotently — `skippedOverlays` stays what it is, the planes NOT asserted (the kept-book note) — so a
// first import that died after the row was written finishes on the next one. ART IS IDENTITY: the same text
// under a different picture is a separate character; the one exception is a JSON card followed by its PNG,
// which gives the art-less row its art and keeps the JSON's identity as a second key, so the JSON still finds
// it. Rows imported before the content identity landed carry the whole-file hash, so the lookup tries that
// last (`findImportedCharacter`).

import type { AttachedBookRef } from "@orb/contracts/character";
import { pluginImportedFrom } from "@orb/contracts/character";
import type { RegexScriptCard } from "@orb/contracts/regex";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { CharacterHandle, CharacterId, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isPng } from "@orb/kit/png-card-chunk";
import { fileStem } from "@orb/kit/strings";
import type { ImportContext } from "../context.ts";
import { ImportCardError } from "../contract/errors.ts";
import type { ImportCharacterInput } from "../contract/params.ts";
import type { ImportCharacterResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import { cardToCreateInput, findImportedCharacter, parseCardJson, parseCardPng, parsedCardImportHash, parsedCardTextHash } from "../substrate/card.ts";

const PNG_MIME = "image/png";
const DEFAULT_FALLBACK_NAME = "Imported Character";

// Derive the fallback character name from the source filename ("Aria.png" -> "Aria") when the card JSON
// carries no name.
function fallbackNameFrom(filename: string | undefined): string {
  if (filename === undefined) {
    return DEFAULT_FALLBACK_NAME;
  }
  const stem = fileStem(filename);
  return stem.length > 0 ? stem : DEFAULT_FALLBACK_NAME;
}

/** Resolve a FREE per-owner character handle: `characters.handle` is per-owner UNIQUE, so a content-new card
 *  whose name-slug is already taken gets a numeric suffix (`eleni` → `eleni-2` → `eleni-3`). This suffixes the
 *  HANDLE only — the card's display `name` is untouched. We NEVER dedupe by name: two distinct "Eleni" cards
 *  are two characters (equal-content cards already deduped upstream by the import hash). */
async function freeHandle(ctx: ImportContext, base: CharacterHandle): Promise<CharacterHandle> {
  let handle: CharacterHandle = base;
  let n = 2;
  while ((await ctx.findByHandle({ ownerId: ctx.ownerId, handle })) !== null) {
    handle = castId<CharacterHandle>(`${base}-${n}`);
    n += 1;
  }
  return handle;
}

async function attachCardTags(ctx: ImportContext, characterId: CharacterId, tags: readonly string[]): Promise<void> {
  for (const tagName of tags) {
    await ctx.attachCardTag({ ownerId: ctx.ownerId, characterId, tagName });
  }
}

/** Re-link the carried attached-book references (owned-source gated in the op). No-op — 0/0 — when
 *  the op is unwired (card-only slice) or the card carries none. */
function relinkCarriedBooks(
  ctx: ImportContext,
  characterId: CharacterId,
  refs: readonly AttachedBookRef[],
): Promise<{ readonly linked: number; readonly skipped: number }> {
  if (ctx.linkCarriedBooks === undefined || refs.length === 0) {
    return Promise.resolve({ linked: 0, skipped: 0 });
  }
  return ctx.linkCarriedBooks({ ownerId: ctx.ownerId, characterId, refs });
}

/** The content a card CARRIES beyond its own fields: its lorebook (embedded and/or by reference) and its
 *  regex scripts (by value and/or by reference). */
interface CarriedContent {
  readonly book: BulkImportLorebookInput | null;
  readonly attachedBooks: readonly AttachedBookRef[];
  readonly regexScripts: readonly RegexScriptCard[];
  readonly attachedRegexScripts: readonly RegexScriptId[];
}

/** The operator-facing line a KEPT book puts on the outcome. One spelling, so the report, the bundle notes
 *  and the tests all say the same thing. */
const BOOK_KEPT_NOTE =
  "the card's embedded world book was NOT re-asserted — this character already holds a primary world book, and your edits to it win (use the card world book restore door to put the card's version back)";

/** Is the character's PRIMARY book seat already taken? The embedded-book plane lands only into a free seat:
 *  world-info's write REPLACES an existing primary's entries, reverting whatever the owner has since edited
 *  into that book, so a taken seat is skipped and the outcome SAYS so; the explicit restore verb is the
 *  opt-in path back to the card's own version (owner ruling).
 *
 *  An UNWIRED oracle answers "free": it travels with `importLorebook` on world-info's one import port, so a
 *  composition that can write the book can always ask — the only ctx without it is one whose `importLorebook`
 *  is itself a stand-in. */
function primaryBookTaken(ctx: ImportContext, characterId: CharacterId): Promise<boolean> {
  if (ctx.hasPrimaryBook === undefined) {
    return Promise.resolve(false);
  }
  return ctx.hasPrimaryBook({ ownerId: ctx.ownerId, characterId });
}

/**
 * Attach everything the card carried, after the character row exists. Extracted from the verb so the verb
 * reads as its own story (parse → dedupe → write → attach) and the two channels' DIFFERENT rules sit
 * together where they can be compared:
 *
 *  • LOREBOOK is either/or, and never destructive. A resolved reference IS the book on this install, so when
 *    ANY reference links we SKIP the embedded clone — cloning it would duplicate the book (double primary).
 *    The clone is the fallback for a foreign install (no reference resolved) and for cards carrying no
 *    references at all, and it lands ONLY into a FREE primary seat: a taken seat holds a book the owner may
 *    have edited, and world-info's write would replace its entries wholesale.
 *  • REGEX takes BOTH channels at once and resolves them INTERNALLY (`planCardLift`): a carried reference
 *    this owner holds attaches the existing row, and a by-value script content-dedups against the library,
 *    minting only when genuinely new. So a same-install re-import produces zero duplicate rows and a
 *    foreign card still gets its scripts.
 */
async function attachCarriedContent(
  ctx: ImportContext,
  characterId: CharacterId,
  carried: CarriedContent,
): Promise<{
  readonly attachedBooksLinked: number;
  readonly attachedBooksSkipped: number;
  readonly regexScriptsLifted: number;
  readonly regexScriptsReused: number;
  readonly skippedOverlays: readonly string[];
}> {
  const { linked: attachedBooksLinked, skipped: attachedBooksSkipped } = await relinkCarriedBooks(ctx, characterId, carried.attachedBooks);
  const skippedOverlays: string[] = [];

  if (ctx.importLorebook !== undefined && carried.book !== null && attachedBooksLinked === 0) {
    if (await primaryBookTaken(ctx, characterId)) {
      skippedOverlays.push(BOOK_KEPT_NOTE);
    } else {
      await ctx.importLorebook({ ownerId: ctx.ownerId, characterId, book: carried.book });
    }
  }

  let regexScriptsLifted = 0;
  let regexScriptsReused = 0;
  if (ctx.importCardScripts !== undefined && (carried.regexScripts.length > 0 || carried.attachedRegexScripts.length > 0)) {
    const lift = await ctx.importCardScripts({
      ownerId: ctx.ownerId,
      characterId,
      scripts: carried.regexScripts,
      carried: carried.attachedRegexScripts,
    });
    regexScriptsLifted = lift.created;
    regexScriptsReused = lift.reused;
  }

  return { attachedBooksLinked, attachedBooksSkipped, regexScriptsLifted, regexScriptsReused, skippedOverlays };
}

/** EVERY plane a card lands beyond the character row, in one place, because BOTH arms of the verb run it:
 *  the create arm to finish a fresh import, the reuse arm to land what an earlier run of the same card left
 *  missing. Each plane is idempotent for the same (character, card) pair: the tag attach is by name, the
 *  carried re-link is `onConflictDoNothing`, the script lift content-dedups, and the embedded book lands only
 *  into a FREE primary seat. */
async function attachAllPlanes(
  ctx: ImportContext,
  characterId: CharacterId,
  tags: readonly string[],
  carried: CarriedContent,
): Promise<Awaited<ReturnType<typeof attachCarriedContent>>> {
  await attachCardTags(ctx, characterId, tags);
  return await attachCarriedContent(ctx, characterId, carried);
}

/** The character this card already landed as, or null for a new one. A `text` match (the row landed from a
 *  JSON card and this is its PNG) takes the art only when the row has none; a row that already has art makes
 *  this card an alt-art version, which is a separate character. */
async function resolveExisting({
  ctx,
  parsed,
  bytes,
  png,
  importHash,
}: {
  readonly ctx: ImportContext;
  readonly parsed: ParsedCardIdentity;
  readonly bytes: Uint8Array;
  readonly png: boolean;
  readonly importHash: string;
}): Promise<CharacterId | null> {
  const found = await findImportedCharacter((hash) => ctx.findByImportHash({ ownerId: ctx.ownerId, importHash: hash }), {
    importHash,
    textHash: parsedCardTextHash(parsed),
    bytes,
  });
  if (found === null) {
    return null;
  }
  if (found.match !== "text" || !png) {
    return found.characterId;
  }
  const avatarAssetId = await ctx.storeAsset({ ownerId: ctx.ownerId, bytes, mime: PNG_MIME });
  const tookArt = await ctx.attachImportedArt({ ownerId: ctx.ownerId, characterId: found.characterId, avatarAssetId, importHash });
  return tookArt ? found.characterId : null;
}

type ParsedCardIdentity = NonNullable<ReturnType<typeof parseCardJson>>;

export function createImportCharacter(ctx: ImportContext): ImportService["importCharacter"] {
  return async ({ card }: ImportCharacterInput): Promise<ImportCharacterResult> => {
    const { bytes, filename, pluginId } = card;
    const png = isPng(bytes);
    const fallbackName = fallbackNameFrom(filename);

    const parsed = png ? await parseCardPng(bytes, fallbackName) : parseCardJson(bytes, fallbackName);
    if (parsed === null) {
      throw new ImportCardError(
        "card_unreadable",
        // User-facing: this message rides `failed[].error` all the way to the import toast/report, so it
        // names the problem in the owner's terms (the spec keyword stays as the parenthetical evidence).
        png ? "No character data found in this PNG (no ccv3/chara card chunk)" : "This file isn't a V2/V3 character card (unreadable JSON)",
      );
    }
    const { card: characterCard, tags, book, attachedBooks, attachedRegexScripts } = parsed;

    const importHash = parsedCardImportHash(parsed);
    const carried: CarriedContent = {
      book,
      attachedBooks,
      regexScripts: characterCard.regexScripts ?? [],
      attachedRegexScripts,
    };

    const existing = await resolveExisting({ ctx, parsed, bytes, png, importHash });
    if (existing !== null) {
      const attached = await attachAllPlanes(ctx, existing, tags, carried);
      return { characterId: existing, created: false, importHash, ...attached };
    }

    // Content-addressed store: a byte-identical re-import resolves to the same asset id.
    const avatarAssetId = png ? await ctx.storeAsset({ ownerId: ctx.ownerId, bytes, mime: PNG_MIME }) : null;
    const baseInput = cardToCreateInput(characterCard, avatarAssetId);
    // A content-new card is always a NEW character; only its per-owner-unique handle is disambiguated (the name stays).
    const handle = await freeHandle(ctx, baseInput.handle);
    // Two provenance channels, never both: a file upload carries a filename; a plugin funnel carries no
    // filename at all (its wire shape is `{card}`/`{assetId}`, never a name) but knows its OWN manifest id
    // — paired with this card's own `importHash` so an equal-content re-ingest through the SAME plugin mints
    // the SAME `importedFrom` (the `findByImportedFrom` re-ingest match).
    const importedFrom = filename ?? (pluginId === undefined ? null : pluginImportedFrom(pluginId, importHash));
    const ref = await ctx.createCharacter({
      ownerId: ctx.ownerId,
      input: { ...baseInput, handle },
      importedFrom,
      importHash,
    });
    const characterId = ref.characterId;
    const attached = await attachAllPlanes(ctx, characterId, tags, carried);

    return { characterId, created: true, importHash, ...attached };
  };
}
