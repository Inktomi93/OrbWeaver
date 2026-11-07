// A request to open a character's sheet on the Status tab, made from outside it (the Game tab's score door). The Status
// tab owns which character is open; it takes the request once and clears it.

import type { ChatId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

/** One ask, as an object so two asks for the same room are two requests. */
interface RpgStatusSheetRequest {
  readonly chatId: ChatId;
}

interface RpgStatusSheetRequestState {
  readonly requested: RpgStatusSheetRequest | null;
}

const useRpgStatusSheetRequestStore = createGatedStore<RpgStatusSheetRequestState>(
  "rpg-status-sheet-request",
  (): RpgStatusSheetRequestState => ({ requested: null }),
);

export function requestRpgStatusSheet(chatId: ChatId): void {
  useRpgStatusSheetRequestStore.setState({ requested: { chatId } }, false, "rpgStatusSheetRequest/request");
}

export function clearRpgStatusSheetRequest(): void {
  useRpgStatusSheetRequestStore.setState({ requested: null }, false, "rpgStatusSheetRequest/clear");
}

export function useRequestedRpgStatusSheet(): RpgStatusSheetRequest | null {
  return useRpgStatusSheetRequestStore((s) => s.requested);
}
