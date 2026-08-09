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
// The directory IS the re-link key for the jsonl arm: chat ids are not preserved across a box, so a
// transcript rejoins its character by the handle it was exported under. (The orb-native arm prefers the seat
// list the file itself carries, and falls back to this same directory handle.)

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sha256Hex } from "#kit/content-hash";
import { parseChatJsonl } from "#kit/serde/chat";
import type { ImportContext } from "../context.ts";
import type { ImportChatFileOutcome } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import type { ImportChatFileInput } from "../contract/views.ts";

const DEC = new TextDecoder();
const ST_TRANSCRIPT_EXT = ".jsonl";

/** Both sibling verbs are INJECTED, not imported: `domain-no-cross-verb` bans a verb→verb edge, so the
 *  domain's own composition root (`service.ts`) is where they are wired together. */
export function createImportChatFile(
  ctx: ImportContext,
  importChats: ImportService["importChats"],
  importChatBundle: ImportService["importChatBundle"],
): ImportService["importChatFile"] {
  return async ({ filename, bytes }: ImportChatFileInput): Promise<ImportChatFileOutcome> => {
    if (!filename.endsWith(ST_TRANSCRIPT_EXT)) {
      // Everything that is not an ST transcript is offered to the orb-native parser, which refuses by NAME
      // (`foreign-kind` / `newer-version`) rather than guessing. The check is deliberately the jsonl
      // NEGATIVE, not a positive `.orb.json` test, so a hand-renamed bundle still gets its real diagnosis
      // instead of the wrong parser's.
      return await importChatBundle({ filename, bytes });
    }
    const slash = filename.indexOf("/");
    if (slash === -1) {
      return { ok: false, error: "chat file is not under a character-handle directory" };
    }
    const handle = castId<CharacterHandle>(filename.slice(0, slash));
    const leaf = filename.slice(slash + 1);
    const characterId = await ctx.findByHandle({ ownerId: ctx.ownerId, handle });
    if (characterId === null) {
      return { ok: false, error: `no character with handle "${handle}" on this account` };
    }
    // These are SillyTavern's bytes, so its zone-less wall-clock dates resolve in the injected ST zone.
    const parsed = parseChatJsonl(DEC.decode(bytes), {
      fileName: leaf,
      charDirName: handle,
      ...(ctx.profile?.stWallClockZone !== undefined ? { wallClockZone: ctx.profile.stWallClockZone } : {}),
    });
    if (parsed === null) {
      return { ok: false, error: "not a valid chat .jsonl file" };
    }
    const result = await importChats({
      characterId,
      chats: [{ parsed, importedFrom: filename, importHash: sha256Hex(bytes) }],
    });
    return { ok: true, created: result.chatsImported > 0 };
  };
}
