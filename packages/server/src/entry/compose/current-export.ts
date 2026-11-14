// The two current-export reads the import lookup's last step takes (D290): a card or room the app wrote carries no
// stored import key, so a restore compares the incoming file with what the library would export now. Each reads
// only the importing owner's rows: the character resolves by handle under that owner and the exporter re-proves
// ownership on the id, so a handle naming nothing or another account's row answers null, never an error.
import type { PortableExportNotes } from "@orb/contracts/portability";
import type { CharacterService } from "#domain/character";
import type { ExportService } from "#domain/export";
import type { ExportCurrentCard, ExportCurrentChats, ImportDriverDeps } from "#domain/import";

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
