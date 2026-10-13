import type { PortableEntity, PortableFile } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import { CHAT_BUNDLE_EXT } from "#primitives/serde/chat-bundle";
import type { PortableExportDeps, PortableExports } from "../contract/portable.ts";

function oneFile(produce: (ownerId: UserId) => Promise<PortableFile>): PortableEntity["exportAll"] {
  return async function* (ownerId): AsyncIterable<PortableFile> {
    yield await produce(ownerId);
  };
}

/** Portable backup traversal keeps owner admission on each producer, including rows removed mid-export. */
export function createPortableExports(deps: PortableExportDeps): PortableExports {
  return {
    gallery: oneFile(deps.gallery),
    tag: oneFile(async (ownerId) => ({ filename: "tags.json", bytes: await deps.tags(ownerId) })),
    theme: oneFile(deps.theme),
    userSettings: oneFile(deps.userSettings),
    async *preset(ownerId): AsyncIterable<PortableFile> {
      yield* await deps.presets({ ownerId });
    },
    async *worldInfo(ownerId): AsyncIterable<PortableFile> {
      for (const bookId of await deps.listBookIds({ ownerId })) {
        const book = await deps.worldBook({ ownerId, bookId });
        if (book !== null) {
          yield book;
        }
      }
    },
    async *regex(ownerId): AsyncIterable<PortableFile> {
      yield* await deps.regex({ ownerId });
    },
    async *databank(ownerId): AsyncIterable<PortableFile> {
      for (const documentId of await deps.listDocumentIds({ ownerId })) {
        const file = await deps.document({ ownerId, documentId });
        if (file !== null) {
          yield file;
        }
      }
    },
    async *persona(ownerId): AsyncIterable<PortableFile> {
      const principal = await deps.resolveOwnerPrincipal(ownerId);
      for (const detail of await deps.persona.list({ principal })) {
        yield await deps.persona.export({ principal, personaId: detail.id });
      }
    },
    async *character(ownerId): AsyncIterable<PortableFile> {
      const principal = await deps.resolveOwnerPrincipal(ownerId);
      for (const characterId of await deps.listCharacterIds(ownerId)) {
        const card = await deps.exportService.exportCharacter({ principal, characterId });
        if (card !== null) {
          yield { filename: card.filename, bytes: card.bytes };
        }
      }
    },
    async *chat(ownerId): AsyncIterable<PortableFile> {
      const principal = await deps.resolveOwnerPrincipal(ownerId);
      for (const { chatId, handle } of await deps.exportService.listHostChats({ principal })) {
        const bundle = await deps.exportService.exportChatBundle({ principal, chatId });
        if (bundle !== null) {
          yield { filename: `${handle}/${chatId}${CHAT_BUNDLE_EXT}`, bytes: bundle.bytes };
        }
      }
    },
  };
}
