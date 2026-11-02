import type { CharacterId, ChatId } from "@orb/kit/ids";
// The portability HTTP routes the server registers and the client and the suites call. ONE home, zero imports:
// the path is a contract, not a string each side spells (the `BLOB_ROUTE` precedent).

export const PORTABILITY_ROUTES = {
  importCards: "/api/import",
  importChat: "/api/import/chat",
  importBundle: "/api/import/bundle",
  importTree: "/api/import/tree",
  importTreeReview: "/api/import/tree/review",
  restoreCardLorebook: "/api/import/restore-card-lorebook",
  exportLibrary: "/api/export/library",
  exportCharacter: "/api/export/character/:characterId",
  exportChat: "/api/export/chat/:chatId",
} as const;

/** The download URL of one character's export, before its `?format=` query. */
export function exportCharacterPath(characterId: CharacterId): string {
  return PORTABILITY_ROUTES.exportCharacter.replace(":characterId", characterId);
}

/** The download URL of one chat's export, before its `?format=` query. */
export function exportChatPath(chatId: ChatId): string {
  return PORTABILITY_ROUTES.exportChat.replace(":chatId", chatId);
}
