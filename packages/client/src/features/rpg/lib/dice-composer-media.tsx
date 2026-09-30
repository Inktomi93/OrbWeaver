// D269: the RPG dice group leads chat's existing composer utility menu (the `composer-room` anchor) without a
// standing band.

import type { ReactElement } from "react";
import type { ChatSurfaceContribution } from "#lib";
import { RpgDiceComposerItems } from "../components/rpg-dice-composer-items.tsx";

/** One room-scoped group in the existing Message tools menu; no second dice door is mounted. */
export const rpgDiceComposerMediaSurface: ChatSurfaceContribution = {
  id: "rpgDiceComposerMedia",
  anchor: "composer-room",
  body: ({ chatId }): ReactElement | null => (chatId === null ? null : <RpgDiceComposerItems chatId={chatId} />),
};
