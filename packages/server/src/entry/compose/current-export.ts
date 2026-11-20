// The current reads an import takes of the importing owner's rows. The two current-export reads are the lookup's last
// step (D290): a card or room the app wrote carries no stored import key, so a restore compares the incoming file with
// what the library would export now. The room title read names a held room by what the owner calls it now. Each reads
// only the importing owner's rows: the character resolves by handle under that owner and the exporter and the room read
// re-prove ownership on the id, so a handle or id naming nothing or another account's row answers null, never an error.
import type { PortableExportNotes } from "@orb/contracts/portability";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterService } from "#domain/character";
import type { ChatService } from "#domain/chat";
import type { ExportService } from "#domain/export";
import type { ExportCurrentCard, ExportCurrentChats, ImportDriverDeps, OwnedChatTitle } from "#domain/import";

interface CurrentExportDeps {
  readonly character: Pick<CharacterService, "findByHandle">;
  readonly exportService: Pick<ExportService, "exportCharacter" | "exportChatBundle" | "listHostChatsCreatedAt">;
  readonly resolveOwnerPrincipal: ImportDriverDeps["resolveOwnerPrincipal"];
}

type SeatCardCache = NonNullable<Parameters<ExportService["exportChatBundle"]>[0]["seatCardCache"]>;

// An unreadable lore entry is written without its metadata in the backup and in this export alike, so the note
// changes nothing the compare reads.
const ignoreExportNote: PortableExportNotes = () => undefined;

export function createExportCurrentCard(deps: CurrentExportDeps): ExportCurrentCard {
  return async ({ ownerId, handle }) => {
    const ref = await deps.character.findByHandle({ ownerId, handle });
    if (ref === null) {
      return null;
    }
    const principal = await deps.resolveOwnerPrincipal(ownerId);
    const card = await deps.exportService.exportCharacter({ principal, characterId: ref.characterId, note: ignoreExportNote });
    return card === null ? null : { characterId: ref.characterId, bytes: card.bytes };
  };
}

export function createExportCurrentChats(deps: CurrentExportDeps): ExportCurrentChats {
  return async function* ({ ownerId, characterId, createdAt }) {
    const principal = await deps.resolveOwnerPrincipal(ownerId);
    // The candidates share their seats, so each seat card is exported once per lookup, not once per room.
    const seatCardCache: SeatCardCache = new Map();
    for (const chatId of await deps.exportService.listHostChatsCreatedAt({ principal, characterId, createdAt })) {
      const file = await deps.exportService.exportChatBundle({ principal, chatId, seatCardCache });
      if (file !== null) {
        yield { chatId, bytes: file.bytes };
      }
    }
  };
}

export function createOwnedChatTitle(deps: {
  readonly chat: Pick<ChatService, "getChat">;
  readonly resolveOwnerPrincipal: ImportDriverDeps["resolveOwnerPrincipal"];
}): OwnedChatTitle {
  return async ({ ownerId, chatId }) => {
    try {
      return (await deps.chat.getChat({ principal: await deps.resolveOwnerPrincipal(ownerId), chatId })).title;
    } catch (err) {
      if (err instanceof DomainNotFoundError) {
        return null;
      }
      throw err;
    }
  };
}
