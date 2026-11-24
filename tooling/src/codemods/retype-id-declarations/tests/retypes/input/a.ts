import type { ChatId } from "@orb/kit/ids";

export function openChat(chatId: string, label: string): void {}

export interface Props {
  readonly ids: readonly string[];
  readonly ownerId: string | null;
  readonly onPick: (id: string) => void;
  readonly note: string;
}

export const key = (providerId: string): string => providerId;

export function unlisted(id: string): string {
  return id;
}
export function branded(chatId: ChatId): ChatId {
  return chatId;
}
function wrongLine(personaId: string): string {
  return personaId;
}
export const note = (...ids: readonly string[]): void => {};
