// The rpg `message-footer` surface contribution (§6c/M8) — the door-side half of the per-row
// "what this turn did" disclosure (TOOLCALLS-INVISIBLE, arm A).
//
// THE SEAM'S FIRST REAL TENANT. `chatSurfaceContributors` shipped EMPTY-but-typed with the note that
// "rpg/agents append array members later"; this is that append. rpg never imports chat and chat never imports
// rpg — `main.tsx` owns both and injects this array member, exactly as it does for the context tabs and the
// HUD region.
//
// The `when` predicate is SYNC and sees only the `MessageView`, so it gates on the cheap structural fact (an
// ASSISTANT row — a user turn calls no tools). The DATA applicability — does this row's selected variant
// actually have a record — lives in the body, which returns `null` when it does not. That split is forced by
// the seam's shape and is the right one anyway: `when` decides "could this ever apply", the body decides
// "does it apply right now", and neither invents a mode.

import type { ChatSurfaceContribution } from "#lib";
import { TurnToolCallsDisclosure } from "../components/turn-tool-calls-disclosure.tsx";

/** The stable contribution id (the registry key + the row's React key). */
const TURN_TOOL_CALLS_SURFACE_ID = "rpg-turn-tool-calls";

/** The rpg per-row disclosure of a folded turn's recorded tool calls. Added at the `main.tsx` door. */
export const rpgTurnToolCallsSurface: ChatSurfaceContribution = {
  id: TURN_TOOL_CALLS_SURFACE_ID,
  anchor: "message-footer",
  // A user/system row never carries game actions — skip the query lookup and the mount entirely.
  when: ({ message }) => message.role === "assistant",
  body: ({ message }) => <TurnToolCallsDisclosure message={message} />,
};
