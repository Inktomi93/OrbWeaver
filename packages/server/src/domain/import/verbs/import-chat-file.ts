// verb: importChatFile — ONE bundle-shaped chat file into the owner's library. THE one path for a single
// chat: the `POST /api/import/chat` door and the bundle descriptor both land here, so the handle derivation,
// the parse, and the refusal copy have exactly one home (F8 — this body used to live inline in
// `entry/compose/portability.ts`, outside every domain test mirror). NEVER throws for a malformed file.
//
// TWO ARMS UNDER ONE DOOR (R6). The `chats/` dir carries two formats and this is where they part:
//   • `<handle>/<name>.jsonl` — the ST TRANSCRIPT INTERCHANGE. Foreign bytes, no envelope, accept-forever.
//   • `<handle>/<id>.orb.json` — the ORB-NATIVE BUNDLE (`importChatBundle`), which carries the planes the
//     interchange structurally cannot: injections, the tag overlay, room overrides, the variable/macro picks,
//     and the rpg campaign.
// The EXTENSION picks which parser is tried; the ENVELOPE is what actually decides (a `.json` that is not an
// `orb.chat.bundle` — a character card, say — refuses BY NAME through the spine's `foreign-kind` reason
// rather than being fed to a parser that would half-read it). Extension alone would be a lie; envelope alone
// cannot see an ST jsonl, which carries none by design.
//
// The jsonl arm tries the directory handle, exact header name, header-derived handle, then folded name.
// SillyTavern carries display names, so a refusal names the header rather than its derived handle.
// Names are not unique; two matches refuse rather than guess. (The orb-native arm prefers the seat list the
// file itself carries, and falls back to the directory handle.)

import type { CharacterHandle, CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { slugifyHandle } from "@orb/kit/slug";
import { sha256Hex } from "#kit/content-hash";
import { parseChatJsonl } from "#kit/serde/chat";
import type { ImportContext } from "../context.ts";
import type { ImportChatFileOutcome } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import type { ImportChatFileInput } from "../contract/views.ts";

const DEC = new TextDecoder();
/** CASE-INSENSITIVE, exactly like the profile collector's own `JSONL_EXT` (`loader/collect.ts`): the two
 *  doors must agree on what an ST transcript is. A case-SENSITIVE `endsWith(".jsonl")` sent a perfectly
 *  readable `chat.JSONL` to the orb-native parser, which refused it by envelope ("the file is not JSON") —
 *  a valid transcript reported as a foreign file (#1469 item 3). */
const ST_TRANSCRIPT_EXT = /\.jsonl$/i;

type CharacterResolution = { readonly ok: true; readonly characterId: CharacterId } | { readonly ok: false; readonly error: string };

// Exact names win over fallbacks; ambiguous names never pick a character arbitrarily.
async function resolveCharacter(ctx: ImportContext, dirName: string, characterName: string): Promise<CharacterResolution> {
  if (dirName.length > 0) {
    const byHandle = await ctx.findByHandle({ ownerId: ctx.ownerId, handle: castId<CharacterHandle>(dirName) });
    if (byHandle !== null) {
      return { ok: true, characterId: byHandle };
    }
  }
  const name = characterName.trim();
  if (name.length === 0) {
    return { ok: false, error: "the transcript names no character — import it inside a bundle instead" };
  }
  let matches = await ctx.findByName({ ownerId: ctx.ownerId, name });
  if (matches.length === 0) {
    const byHandle = await ctx.findByHandle({ ownerId: ctx.ownerId, handle: castId<CharacterHandle>(slugifyHandle(name)) });
    if (byHandle !== null) {
      return { ok: true, characterId: byHandle };
    }
    matches = await ctx.findByName({ ownerId: ctx.ownerId, name, caseInsensitive: true });
  }
  const [only, ...rest] = matches;
  if (only === undefined) {
    return { ok: false, error: `no character named "${name}" on this account` };
  }
  if (rest.length > 0) {
    return { ok: false, error: `more than one character is named "${name}" on this account — rename one so the chat can find its character` };
  }
  return { ok: true, characterId: only };
}

/** Both sibling verbs are INJECTED, not imported: `domain-no-cross-verb` bans a verb→verb edge, so the
 *  domain's own composition root (`service.ts`) is where they are wired together. */
export function createImportChatFile(
  ctx: ImportContext,
  importChats: ImportService["importChats"],
  importChatBundle: ImportService["importChatBundle"],
): ImportService["importChatFile"] {
  return async ({ filename, bytes }: ImportChatFileInput): Promise<ImportChatFileOutcome> => {
    if (!ST_TRANSCRIPT_EXT.test(filename)) {
      // Everything that is not an ST transcript is offered to the orb-native parser, which refuses by NAME
      // (`foreign-kind` / `newer-version`) rather than guessing. The check is deliberately the jsonl
      // NEGATIVE, not a positive `.orb.json` test, so a hand-renamed bundle still gets its real diagnosis
      // instead of the wrong parser's.
      return await importChatBundle({ filename, bytes });
    }
    // A bare upload has no directory: the whole filename is the leaf and only the header name can re-link it.
    const slash = filename.indexOf("/");
    const dirName = slash === -1 ? "" : filename.slice(0, slash);
    const leaf = filename.slice(slash + 1);
    // These are SillyTavern's bytes, so its zone-less wall-clock dates resolve in the injected ST zone.
    const parsed = parseChatJsonl(DEC.decode(bytes), {
      fileName: leaf,
      charDirName: dirName,
      ...(ctx.profile?.stWallClockZone !== undefined ? { wallClockZone: ctx.profile.stWallClockZone } : {}),
    });
    if (parsed === null) {
      return { ok: false, error: "not a valid chat .jsonl file" };
    }
    const character = await resolveCharacter(ctx, dirName, parsed.characterName);
    if (!character.ok) {
      return character;
    }
    const result = await importChats({
      characterId: character.characterId,
      chats: [{ parsed, importedFrom: filename, importHash: sha256Hex(bytes) }],
    });
    // The ST interchange carries no overlay planes at all (no tags, no campaign — that is the whole reason
    // the orb-native bundle exists), so this arm can never skip one. The EMPTY list still rides: an absent
    // field would read as "not looked at" at the door that renders it.
    return { ok: true, created: result.chatsImported > 0, skippedOverlays: [] };
  };
}
