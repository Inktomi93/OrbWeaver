// verb: importChatFile — ONE bundle-shaped chat file (`<character-handle>/<name>.jsonl`) into the owner's
// library. THE one path for a single transcript: the `POST /api/import/chat` door and the bundle
// descriptor both land here, so the handle derivation, the parse, and the refusal copy have exactly one
// home (F8 — this body used to live inline in `entry/compose/portability.ts`, outside every domain test
// mirror). NEVER throws for a malformed file.
//
// The directory IS the re-link key: chat ids are not preserved across a box, so a transcript rejoins its
// character by the handle it was exported under.

import { sha256Hex } from "#kit/content-hash";
import { parseChatJsonl } from "#kit/serde/chat";
import type { ImportContext } from "../context";
import type { ImportChatFileOutcome } from "../contract/results";
import type { ImportService } from "../contract/service";
import type { ImportChatFileInput } from "../contract/views";

const DEC = new TextDecoder();

/** The sibling WRITE verb is INJECTED, not imported: `domain-no-cross-verb` bans a verb→verb edge, so the
 *  domain's own composition root (`service.ts`) is where the two are wired together. */
export function createImportChatFile(ctx: ImportContext, importChats: ImportService["importChats"]): ImportService["importChatFile"] {
  return async ({ filename, bytes }: ImportChatFileInput): Promise<ImportChatFileOutcome> => {
    const slash = filename.indexOf("/");
    if (slash === -1) {
      return { ok: false, error: "chat file is not under a character-handle directory" };
    }
    const handle = filename.slice(0, slash);
    const leaf = filename.slice(slash + 1);
    const characterId = await ctx.findByHandle({ ownerId: ctx.ownerId, handle });
    if (characterId === null) {
      return { ok: false, error: `no character with handle "${handle}" on this account` };
    }
    const parsed = parseChatJsonl(DEC.decode(bytes), { fileName: leaf, charDirName: handle });
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
