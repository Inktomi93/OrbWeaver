// verb: importCharacter — one ST character card → one canonical character. Flow: parse bytes → hash whole
// file → byte-identical dedup (return existing, created:false) → flatten+validate → PD-108 handle-match
// (edit in place instead of insert) → else create fresh with provenance + CAS-store avatar → attach tags
// → re-link carried attached-book references (PD-144), else carry the embedded lorebook clone (the fallback
// when no reference resolves on this install). All cross-feature ops (create/lookup/update/store/attach/
// re-link) are injected via context.ts — import never reads a db table directly.

import type { AttachedBookRef } from "@orb/contracts/character";
import type { RegexScriptCard } from "@orb/contracts/regex";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { CharacterId, RegexScriptId } from "@orb/kit/ids";
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

interface WriteCharacterArgs {
  readonly matchedId: CharacterId | null;
  readonly input: Parameters<ImportContext["createCharacter"]>[0]["input"];
  readonly filename: string | undefined;
  readonly importHash: string;
}

/** A handle match edits the existing row in place instead of inserting (dead-ends on the unique index). */
async function writeCharacter(ctx: ImportContext, args: WriteCharacterArgs): Promise<{ readonly characterId: CharacterId; readonly created: boolean }> {
  const { matchedId, input, filename, importHash } = args;
  if (matchedId !== null) {
    await ctx.updateCharacter({ ownerId: ctx.ownerId, characterId: matchedId, input });
    return { characterId: matchedId, created: false };
  }
  const ref = await ctx.createCharacter({
    ownerId: ctx.ownerId,
    input,
    importedFrom: filename ?? null,
    importHash,
  });
  return { characterId: ref.characterId, created: true };
}

async function attachCardTags(ctx: ImportContext, characterId: CharacterId, tags: readonly string[]): Promise<void> {
  for (const tagName of tags) {
    // biome-ignore lint/performance/noAwaitInLoops: card tags attach sequentially — each is an independent idempotent resolve-or-create-and-attach; card tag lists are short.
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

/**
 * Attach everything the card carried, after the character row exists. Extracted from the verb so the verb
 * reads as its own story (parse → dedupe → write → attach) and the two channels' DIFFERENT rules sit
 * together where they can be compared:
 *
 *  • LOREBOOK is either/or. A resolved reference IS the book on this install, so when ANY reference links
 *    we SKIP the embedded clone — cloning it would duplicate the book (double primary). The clone is the
 *    fallback for a foreign install (no reference resolved) and for cards carrying no references at all.
 *  • REGEX takes BOTH channels at once and resolves them INTERNALLY (`planCardLift`): a carried reference
 *    this owner holds attaches the existing row, and a by-value script content-dedups against the library,
 *    minting only when genuinely new. So a same-install re-import produces zero duplicate rows and a
 *    foreign card still gets its scripts.
 */
async function attachCarriedContent(
  ctx: ImportContext,
  characterId: CharacterId,
  carried: CarriedContent,
): Promise<{ readonly attachedBooksLinked: number; readonly attachedBooksSkipped: number }> {
  const { linked: attachedBooksLinked, skipped: attachedBooksSkipped } = await relinkCarriedBooks(ctx, characterId, carried.attachedBooks);

  if (ctx.importLorebook !== undefined && carried.book !== null && attachedBooksLinked === 0) {
    await ctx.importLorebook({ ownerId: ctx.ownerId, characterId, book: carried.book });
  }

  if (ctx.importCardScripts !== undefined && (carried.regexScripts.length > 0 || carried.attachedRegexScripts.length > 0)) {
    await ctx.importCardScripts({
      ownerId: ctx.ownerId,
      characterId,
      scripts: carried.regexScripts,
      carried: carried.attachedRegexScripts,
    });
  }

  return { attachedBooksLinked, attachedBooksSkipped };
}

export function createImportCharacter(ctx: ImportContext): ImportService["importCharacter"] {
  return async ({ card }: ImportCharacterInput): Promise<ImportCharacterResult> => {
    const { bytes, filename } = card;
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

    const existing = await ctx.findByImportHash({ ownerId: ctx.ownerId, importHash });
    if (existing !== null) {
      return { characterId: existing, created: false, importHash, attachedBooksLinked: 0, attachedBooksSkipped: 0 };
    }

    const inputForNewHandle = cardToCreateInput(characterCard, null);
    const matchedId = await ctx.findByHandle({
      ownerId: ctx.ownerId,
      handle: inputForNewHandle.handle,
    });

    // Content-addressed store: a byte-identical re-import resolves to the same asset id.
    const avatarAssetId = png ? await ctx.storeAsset({ ownerId: ctx.ownerId, bytes, mime: PNG_MIME }) : null;
    const input = cardToCreateInput(characterCard, avatarAssetId);

    const { characterId, created } = await writeCharacter(ctx, {
      matchedId,
      input,
      filename,
      importHash,
    });
    await attachCardTags(ctx, characterId, tags);

    const { attachedBooksLinked, attachedBooksSkipped } = await attachCarriedContent(ctx, characterId, {
      book,
      attachedBooks,
      regexScripts: characterCard.regexScripts ?? [],
      attachedRegexScripts,
    });

    return { characterId, created, importHash, attachedBooksLinked, attachedBooksSkipped };
  };
}
