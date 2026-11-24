import type { ChatId } from "@orb/kit/ids";
import type { ProviderId } from "@orb/contracts/inference";
import type { CharacterId, ThemeId, UserId } from "@orb/kit/ids";

export function openChat(chatId: ChatId, label: string): void {}

export interface Props {
  readonly ids: readonly CharacterId[];
  readonly ownerId: UserId | null;
  readonly onPick: (id: ThemeId) => void;
  readonly note: string;
}

export const key = (providerId: ProviderId): string => providerId;

export function unlisted(id: string): string {
  return id;
}
export function branded(chatId: ChatId): ChatId {
  return chatId;
}
function wrongLine(personaId: string): string {
  return personaId;
}
export const note = (...ids: readonly CharacterId[]): void => {};
