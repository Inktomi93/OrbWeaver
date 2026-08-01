// verb: importCharacter — one ST character card → one canonical character. Flow: parse bytes → hash whole
// file → byte-identical dedup (return existing, created:false) → flatten+validate → PD-108 handle-match
// (edit in place instead of insert) → else create fresh with provenance + CAS-store avatar → attach tags
// → re-link carried attached-book references (PD-144), else carry the embedded lorebook clone (the fallback
// when no reference resolves on this install). All cross-feature ops (create/lookup/update/store/attach/
// re-link) are injected via context.ts — import never reads a db table directly.

import type { AttachedBookRef } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import { isPng } from "@orb/kit/png-card-chunk";
import type { ImportContext } from "../context";
import { ImportCardError } from "../contract/errors";
import type { ImportCharacterInput } from "../contract/params";
import type { ImportCharacterResult } from "../contract/results";
import type { ImportService } from "../contract/service";
import { cardToCreateInput, importFileHash, parseCardJson, parseCardPng } from "../substrate/card";

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
    const { card: characterCard, tags, book, attachedBooks } = parsed;

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

    // PD-144: re-link the carried attached-book REFERENCES by id (owned-source gated in the op). A resolved
    // reference IS the book on this install, so when ANY reference links we SKIP the embedded-lorebook clone
    // below — cloning it would duplicate the book (double primary). The clone stays the fallback for the
    // foreign-install case (no reference resolved) + for cards that carry no references at all.
    const { linked: attachedBooksLinked, skipped: attachedBooksSkipped } = await relinkCarriedBooks(ctx, characterId, attachedBooks);

    if (ctx.importLorebook !== undefined && book !== null && attachedBooksLinked === 0) {
      await ctx.importLorebook({ ownerId: ctx.ownerId, characterId, book });
    }

    return { characterId, created, importHash, attachedBooksLinked, attachedBooksSkipped };
  };
}
