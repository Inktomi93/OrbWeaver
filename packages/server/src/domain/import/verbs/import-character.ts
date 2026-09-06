// verb: importCharacter — one ST character card → one canonical character. Flow: parse bytes → hash whole
// file → byte-identical dedup (the ONLY dedup: the same FILE, never a name) → flatten+validate → mint a FREE
// per-owner handle (a name-slug collision suffixes the HANDLE only, never the display name — two distinct
// "Emily" cards are two characters) → create fresh with provenance + CAS-store avatar → attach tags → re-link
// carried attached-book references (PD-144), else carry the embedded lorebook clone (the fallback when no
// reference resolves on this install, and only into a FREE primary seat — #1598). All cross-feature ops are
// injected via context.ts — import never reads a db table directly.
//
// THE DEDUP HIT FINISHES THE IMPORT; IT DOES NOT SKIP IT (#1470). A card lands as a character row PLUS three
// overlay planes (tags · books · scripts), each its own awaited op, so a throw after the create commits a
// character with planes missing — and the dedup key is that character's own `importHash`, so it is the exact
// row that answers "already imported". The dedup arm therefore runs the SAME `attachAllPlanes` the create arm
// does and returns the counts it actually landed: `created:false` means no new CHARACTER was written, never
// that nothing was. Why RECONCILE rather than one transaction: `db.transaction()` is banned in this tree (the
// replacement-connection trap, `Tier-1-DB` §6) and a `db.batch` is one db's statements — it cannot span four
// injected cross-DOMAIN ops, and this verb touches no db at all. So the resumable state is the one the owning
// domains already hold, and each plane's op is idempotent for the same (character, card) pair.

import type { AttachedBookRef } from "@orb/contracts/character";
import { pluginImportedFrom } from "@orb/contracts/character";
import type { RegexScriptCard } from "@orb/contracts/regex";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { CharacterHandle, CharacterId, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isPng } from "@orb/kit/png-card-chunk";
import type { ImportContext } from "../context.ts";
import { ImportCardError } from "../contract/errors.ts";
import type { ImportCharacterInput } from "../contract/params.ts";
import type { ImportCharacterResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import { cardToCreateInput, importFileHash, parseCardJson, parseCardPng } from "../substrate/card.ts";

const PNG_MIME = "image/png";
const DEFAULT_FALLBACK_NAME = "Imported Character";
const PATH_SEPARATOR = /[/\\]/;
const FILE_EXTENSION = /\.[^.]+$/;

// Derive the fallback character name from the source filename ("Aria.png" -> "Aria") when the card JSON
// carries no name.
function fallbackNameFrom(filename: string | undefined): string {
  if (filename === undefined) {
    return DEFAULT_FALLBACK_NAME;
  }
  const base = filename.split(PATH_SEPARATOR).pop() ?? filename;
  const stem = base.replace(FILE_EXTENSION, "").trim();
  return stem.length > 0 ? stem : DEFAULT_FALLBACK_NAME;
}

/** Resolve a FREE per-owner character handle: `characters.handle` is per-owner UNIQUE, so a byte-new card
 *  whose name-slug is already taken gets a numeric suffix (`emily` → `emily-2` → `emily-3`). This suffixes the
 *  HANDLE only — the card's display `name` is untouched. We NEVER dedupe by name: two distinct "Emily" cards
 *  are two characters (byte-identical files already deduped upstream by importHash). */
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

/** PD-144: re-link the carried attached-book references (owned-source gated in the op). No-op — 0/0 — when
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

/** #1598: is the character's PRIMARY book seat already taken? A re-upload of the same card file re-runs every
 *  overlay plane (#1470), and the embedded-book plane is the one that is not idempotent — world-info's write
 *  REPLACES an existing primary's entries, reverting whatever the owner has since edited into that book. So
 *  the plane is skipped when the seat is taken and the outcome SAYS so; the explicit restore verb is the
 *  opt-in path back to the card's own version (owner ruling 2026-09-05).
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
 *    references at all, and it lands ONLY into a FREE primary seat (#1598): a taken seat holds a book the
 *    owner may have edited, and world-info's write would replace its entries wholesale.
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

/** EVERY plane a card lands beyond the character row, in one place — because BOTH arms of the verb run it
 *  (#1470). The create arm runs it to finish a fresh import; the dedup arm runs it to RECONCILE one that did
 *  not finish. One function, so the two arms cannot drift into different definitions of "imported". */
async function attachAllPlanes(
  ctx: ImportContext,
  characterId: CharacterId,
  tags: readonly string[],
  carried: CarriedContent,
): Promise<{
  readonly attachedBooksLinked: number;
  readonly attachedBooksSkipped: number;
  readonly regexScriptsLifted: number;
  readonly regexScriptsReused: number;
  readonly skippedOverlays: readonly string[];
}> {
  await attachCardTags(ctx, characterId, tags);
  return await attachCarriedContent(ctx, characterId, carried);
}

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

    const importHash = importFileHash(bytes);

    const carried: CarriedContent = {
      book,
      attachedBooks,
      regexScripts: characterCard.regexScripts ?? [],
      attachedRegexScripts,
    };

    const existing = await ctx.findByImportHash({ ownerId: ctx.ownerId, importHash });
    if (existing !== null) {
      // THE DEDUP HIT RECONCILES; IT DOES NOT RETURN EARLY (#1470). The character row and its overlay planes
      // are written by SEPARATE awaited ops, so a throw anywhere after the create leaves a committed character
      // whose tags/books/scripts never landed — and because the dedup key is the card's own `importHash`, the
      // row that proves "already imported" is exactly the row that is incomplete. Returning zeros here made
      // that state PERMANENT: every retry of the same bytes short-circuited on it, and nothing anywhere
      // recorded the character as unfinished. So a re-import re-runs the overlays and reports what actually
      // landed. It is safe to re-run because every plane is idempotent for the same (character, card) pair —
      // the tag attach is race-safe and by name, the carried re-link is `onConflictDoNothing` on its junction
      // PK, and the script lift content-dedups against the library. The embedded-book plane was the ONE that
      // is not idempotent (world-info REPLACES an existing primary's entries), so it is now SKIPPED when the
      // character already holds a primary — the owner's edits win, the outcome names the kept book, and the
      // restore verb is the opt-in way back to the card's version (#1598, owner ruling 2026-09-05).
      const reconciled = await attachAllPlanes(ctx, existing, tags, carried);
      return { characterId: existing, created: false, importHash, ...reconciled };
    }

    // Content-addressed store: a byte-identical re-import resolves to the same asset id.
    const avatarAssetId = png ? await ctx.storeAsset({ ownerId: ctx.ownerId, bytes, mime: PNG_MIME }) : null;
    const baseInput = cardToCreateInput(characterCard, avatarAssetId);
    // A byte-new card is always a NEW character; only its per-owner-unique handle is disambiguated (the name stays).
    const handle = await freeHandle(ctx, baseInput.handle);
    // Two provenance channels, never both: a file upload carries a filename; a plugin funnel (#1702) carries
    // no filename at all (its wire shape is `{card}`/`{assetId}`, never a name) but knows its OWN manifest id
    // — paired with this card's own `importHash` so a byte-identical re-ingest through the SAME plugin mints
    // the SAME `importedFrom` (the `findByImportedFrom` re-ingest match).
    const importedFrom = filename ?? (pluginId === undefined ? null : pluginImportedFrom(pluginId, importHash));
    const ref = await ctx.createCharacter({
      ownerId: ctx.ownerId,
      input: { ...baseInput, handle },
      importedFrom,
      importHash,
    });
    const characterId = ref.characterId;
    const created = true;
    const attached = await attachAllPlanes(ctx, characterId, tags, carried);

    return { characterId, created, importHash, ...attached };
  };
}
