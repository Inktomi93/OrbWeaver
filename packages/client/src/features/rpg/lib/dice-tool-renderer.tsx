// rpg's TOOL-RENDERER contribution ("result = a tool-renderers
// contribution in-thread") — the door-side half of the `roll_dice` in-thread renderer. ONE first-party member
// of chat's `toolRenderers` registry, claiming the EXACT wire name `roll_dice` (`match: "name"`, which wins
// over any prefix claim). A value, not a registration: the door (`compose/authed-app.tsx`) appends it beside
// the plugin plane's prefix renderer, and chat consumes the registry blind — chat imports nothing from here,
// and a build with the member removed renders every `roll_dice` call in the generic `ToolCallBlock` again,
// byte-identically (which is exactly what `RpgDiceToolCard` falls back to when it has no well-formed roll).

import { ROLL_DICE_TOOL_NAME } from "@orb/contracts/rpg";
import type { ReactElement } from "react";
import type { ToolRenderer } from "#lib";
import { RpgDiceToolCard } from "../components/rpg-dice-tool-card.tsx";

/** Claims the `roll_dice` wire tool for the in-thread dice card. The name is imported, never spelled, so the
 *  claim and the tool's registration can't drift apart (the `pluginToolRenderer` precedent). */
export const rpgDiceToolRenderer: ToolRenderer = {
  id: ROLL_DICE_TOOL_NAME,
  match: "name",
  render: (record): ReactElement => <RpgDiceToolCard record={record} />,
};
