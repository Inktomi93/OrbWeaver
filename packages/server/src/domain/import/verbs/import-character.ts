// verb: importCharacter — one ST character card → one canonical character (4c W3 card slice). The flow:
//   1. parse the bytes (PNG ccv3/chara chunk → JSON, or a bare V2/V3 JSON card) → canonical CharacterCard
//      (tolerant IN); unreadable bytes throw ImportCardError("card_unreadable").
//   2. hash the whole FILE bytes → importHash (provenance + the dedup oracle).
//   3. byte-identical dedup: if the owner already has a character with this importHash, return it
//      (created:false) — a byte-identical re-import is safe + a no-op (cheapest check first).
//   4. flatten + validate → CreateCharacterInput (derives the per-owner `handle` from the card name).
//   5. PD-108 handle-match: if the owner already has a character at this `handle`, this is a re-import of
//      an EDITED card (or a second same-name card) — edit it IN PLACE (D28) via the injected update op
//      instead of inserting (which would dead-end on `characters_owner_handle_unique`). Also created:false.
//   6. otherwise genuinely new: PNG cards CAS-store the SAME bytes as the avatar asset (one blob, both
//      roles) → avatarAssetId, then create via the injected op WITH the provenance stamp.
//   7. carry the card's author-shipped tags: attach each parsed tag to the character (new OR matched) as a
//      card/pending suggestion via the injected tag op (`card.tags` → `character_tags`
//      `status:'pending'`, NOT a JSON column; the user's "Accept" later flips them to accepted). A handle-
//      match re-import may have added/changed tags, so the attach still runs (idempotent — a re-attach
//      never downgrades an already-`accepted` row).
//
// Boundaries-are-physics: the create / lookup / update / asset-store / tag-attach are INJECTED ops
// (context.ts) wired at the composition root — import sideways-imports neither character, assets, nor tag,
// and never reads a db table (both dedup lookups are injected character reads). Determinism: no clock/id/
// random here (the file hash is content-derived; the id is minted by the injected create op; the tag id by
// the injected tag op).

import type { CharacterId } from "@orb/kit/ids";
import { isPng } from "@orb/kit/png-card-chunk";
import { ImportCardError } from "../contract/errors";
import type { ImportCharacterInput } from "../contract/params";
import type { ImportCharacterResult } from "../contract/results";
import type { ImportContext, ImportService } from "../contract/service";
import { cardToCreateInput, importFileHash, parseCardJson, parseCardPng } from "../substrate/card";

// A PNG card IS its own avatar (ST embeds the card JSON in the avatar PNG). A bare-JSON card carries no
// image, so no avatar is stored.
const PNG_MIME = "image/png";
const DEFAULT_FALLBACK_NAME = "Imported Character";
const PATH_SEPARATOR = /[/\\]/;
const FILE_EXTENSION = /\.[^.]+$/;

// Derive the fallback character name from the source filename (`"Aria.png"` → `"Aria"`) when the card
// JSON carries no name. Strips the directory + the final extension; empty → a stable default.
function fallbackNameFrom(filename: string | undefined): string {
  if (filename === undefined) {
    return DEFAULT_FALLBACK_NAME;
  }
  const base = filename.split(PATH_SEPARATOR).pop() ?? filename;
  const stem = base.replace(FILE_EXTENSION, "").trim();
  return stem.length > 0 ? stem : DEFAULT_FALLBACK_NAME;
}

interface WriteCharacterArgs {
  /** PD-108 handle-match hit, or null for a genuinely new handle. */
  readonly matchedId: CharacterId | null;
  readonly input: Parameters<ImportContext["createCharacter"]>[0]["input"];
  readonly filename: string | undefined;
  readonly importHash: string;
}

/** Resolve-or-write the character: PD-108 handle-match edits the EXISTING row in place (D28) instead of
 *  inserting (which would dead-end on `characters_owner_handle_unique`); no match creates fresh with the
 *  import-provenance stamp. Returns the id + whether this run newly created it. */
async function writeCharacter(
  ctx: ImportContext,
  args: WriteCharacterArgs,
): Promise<{ readonly characterId: CharacterId; readonly created: boolean }> {
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

/** Carry the card's author-shipped tags as card/pending suggestions (the injected op binds source/status).
 *  Runs for BOTH the new-create and handle-match paths — a re-imported edited card may ship new/changed
 *  tags; the attach is idempotent (never downgrades an already-`accepted` row). */
async function attachCardTags(
  ctx: ImportContext,
  characterId: CharacterId,
  tags: readonly string[],
): Promise<void> {
  for (const tagName of tags) {
    // biome-ignore lint/performance/noAwaitInLoops: card tags attach sequentially — each is an independent idempotent resolve-or-create-and-attach; card tag lists are short.
    await ctx.attachCardTag({ ownerId: ctx.ownerId, characterId, tagName });
  }
}

export function createImportCharacter(ctx: ImportContext): ImportService["importCharacter"] {
  return async ({ card }: ImportCharacterInput): Promise<ImportCharacterResult> => {
    const { bytes, filename } = card;
    const png = isPng(bytes);
    const fallbackName = fallbackNameFrom(filename);

    const parsed = png ? parseCardPng(bytes, fallbackName) : parseCardJson(bytes, fallbackName);
    if (parsed === null) {
      throw new ImportCardError(
        "card_unreadable",
        png
          ? "PNG carries no readable ccv3/chara character-card chunk"
          : "bytes are not a readable V2/V3 character-card JSON",
      );
    }
    const { card: characterCard, tags, book } = parsed;

    const importHash = importFileHash(bytes);

    // Byte-identical re-import dedup: nothing changed, not even the file encoding — a true no-op (the tags
    // were attached on the first import; the attach is idempotent regardless, so nothing to redo here).
    const existing = await ctx.findByImportHash({ ownerId: ctx.ownerId, importHash });
    if (existing !== null) {
      return { characterId: existing, created: false, importHash };
    }

    // The card is flattened+validated BEFORE the handle-match lookup: `cardToCreateInput` derives the
    // per-owner `handle` from the card name (`slugifyHandle`), which is exactly the identity the PD-108
    // match keys on — the same derivation the original create-path insert would collide on.
    const inputForNewHandle = cardToCreateInput(characterCard, null);
    const matchedId = await ctx.findByHandle({
      ownerId: ctx.ownerId,
      handle: inputForNewHandle.handle,
    });

    // CAS-store the avatar first (PNG cards only) — content-addressed, so a byte-identical re-import
    // resolves to the same asset id; a genuinely new/edited avatar gets its own. Shared by both branches.
    const avatarAssetId = png
      ? await ctx.storeAsset({ ownerId: ctx.ownerId, bytes, mime: PNG_MIME })
      : null;
    const input = cardToCreateInput(characterCard, avatarAssetId);

    const { characterId, created } = await writeCharacter(ctx, {
      matchedId,
      input,
      filename,
      importHash,
    });
    await attachCardTags(ctx, characterId, tags);

    // W1: carry the embedded ST lorebook (when the card shipped one AND a world-info importer is wired) —
    // written keyed on the character (the PRIMARY `character_books` slot; D28 replace-on-reimport). Runs for
    // BOTH new-create + handle-match (an edited card may ship a changed book); the byte-identical re-import
    // path returned earlier (the book was written on the first import — a true no-op).
    if (ctx.importLorebook !== undefined && book !== null) {
      await ctx.importLorebook({ ownerId: ctx.ownerId, characterId, book });
    }

    return { characterId, created, importHash };
  };
}
