// The rpg HEAD-BAND CLAIM (HUD-1 §3.1 as re-shaped by the context bracket, #860) — the ONE
// `defineContextRegion` call site in the tree. On an ENGAGED game chat the Waystone band takes the CONTEXT
// pane's head slot in place of chat's own room band; the rails, the viewport and the ground are the shell's
// bracket in every room, so the claim is exactly the band and nothing else. On anything else the claim is
// simply false and chat's band renders, unchanged.
//
// The claim reads the SAME `isGameChat` predicate the tab contributions gate on (`rpg-game-chat.ts`), so the
// band and the game rail can never disagree — one predicate, one answer. Enter/exit need no machinery:
// committing a game invalidates `chat.getChat`, the panel re-resolves, and the Waystone appears on the next
// render exactly like a chat switch; a disengaged pointer or a non-game chat drops the claim the same way.
// No animation, no toggle, no second state (a game is content, not an event).
//
// rpg NEVER imports chat: `main.tsx` (the door) builds this and assembles it into the `chat-context-regions`
// contributor registry, which chat's `defineContextTabs` consumes blind (lockdown §6c).

import type { ChatContextState, ContextRegionDef } from "#lib";
import { defineContextRegion } from "#lib";
import { RpgHudBand } from "../components/rpg-hud-band.tsx";
import type { RpgContextTabsDeps } from "./rpg-game-chat.ts";
import { makeIsGameChat } from "./rpg-game-chat.ts";

export function makeRpgHudRegion(deps: RpgContextTabsDeps): ContextRegionDef<ChatContextState> {
  const isGameChat = makeIsGameChat(deps);
  return defineContextRegion<ChatContextState>({
    id: "rpg.hud",
    claims: isGameChat,
    // The band's own state comes from its own hooks inside its own components — `S` never crosses into the
    // band (§3.2's variance fence).
    band: () => <RpgHudBand />,
  });
}
