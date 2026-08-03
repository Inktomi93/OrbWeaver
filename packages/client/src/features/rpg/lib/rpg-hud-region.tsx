// The rpg WHOLE-PANE CLAIM (HUD-1 §3.1) — the ONE `defineContextRegion` call site in the tree. On an
// ENGAGED game chat the rpg HUD owns the entire CONTEXT pane; on anything else the claim is simply false and
// the generic panel renders, unchanged.
//
// The claim reads the SAME `isGameChat` predicate the tab contributions gate on (`rpg-game-chat.ts`), so the
// pane and its tabs can never disagree — one predicate, one answer. Enter/exit need no machinery: committing
// a game invalidates `chat.getChat`, the panel re-resolves, and the HUD appears on the next render exactly
// like a chat switch; a disengaged pointer or a non-game chat drops the claim the same way. No animation, no
// toggle, no second state (a game is content, not an event).
//
// rpg NEVER imports chat: `main.tsx` (the door) builds this and assembles it into the `chat-context-regions`
// contributor registry, which chat's `defineContextTabs` consumes blind (lockdown §6c).

import type { ChatContextState, ContextRegionDef } from "#lib";
import { defineContextRegion } from "#lib";
import { RpgHud } from "../components/rpg-hud.tsx";
import type { RpgContextTabsDeps } from "./rpg-game-chat.ts";
import { makeIsGameChat } from "./rpg-game-chat.ts";

export function makeRpgHudRegion(deps: RpgContextTabsDeps): ContextRegionDef<ChatContextState> {
  const isGameChat = makeIsGameChat(deps);
  return defineContextRegion<ChatContextState>({
    id: "rpg.hud",
    claims: isGameChat,
    // The HUD's own state comes from its own hooks inside its own components — `S` never crosses into the
    // render (§3.2's variance fence), so this arm sees only the shell view.
    render: (view) => <RpgHud view={view} />,
  });
}
