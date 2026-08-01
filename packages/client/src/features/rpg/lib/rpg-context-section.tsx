// The rpg CONTEXT-panel SECTION contribution (panel-redesign DESIGN.md §4; client-architecture-lockdown
// §6c) — the FIRST real `chatContextContributors` consumer + rpg's registered definition (the
// feature-owns-definition anchor). The GAME-rail tabs (HUD-1 §4): Status · Inventory · Scene ·
// Quests · Journal (Quests + Journal are LIVE lite tabs — real data planes, the owner correction) + the
// PHASE-locked Map (visible, `disabledReason` — "the promise visible, the gate honest"; 5 live + 1 locked).
// **Sheet is NOT a tab** (the tracked-field unification §3): Status is the only list of people and expanding
// a roster entry IS the sheet, so the sheet is a STATE of Status, not a sibling of it — a tab whose content
// migrated to another tab depending on the stat profile was a hallway. Inventory STAYS its own tab
// (plane-shaped, not character-card-shaped). rpg NEVER imports chat: `main.tsx` (the door) calls `makeRpgContextTabs({ trpc, queryClient })`
// and assembles the result into `createContributorRegistry("chat-context", …)`, which flows to chat's
// `defineContextTabs` `contributors` arm (one-directional flow; `client-features-no-cross` enforces it).
//
// The APPLICABILITY gate (game-ness) is `rpg-game-chat.ts` — ONE predicate shared with the whole-pane HUD
// CLAIM (`rpg-hud-region.tsx`), so a claimed pane and its tabs appear and disappear together. These defs own
// the tabs; the HUD owns the ARRANGEMENT (band, rails, viewport) and the BAND identity, which is why no tab
// here reaches for the shell's `.shell-panel-header` slot any more (HUD-1 §5.1 — that channel is deleted).

import { Backpack, BookOpen, Crown, Drama, Flag, HeartPulse, MapIcon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary } from "#data";
import type { ChatContextState, CommittedChatContext, ContextTabDef } from "#lib";
import { RpgErrorState } from "../components/rpg-error-state";
import { RpgGameDoor } from "../components/rpg-game-door";
import { RpgGameTab } from "../components/rpg-game-tab";
import { RpgGameTabBody } from "../components/rpg-game-tab-body";
import { RpgInventoryTab } from "../components/rpg-inventory-tab";
import { RpgJournalTab } from "../components/rpg-journal-tab";
import { RpgMapTab } from "../components/rpg-map-tab";
import { RpgQuestsTab } from "../components/rpg-quests-tab";
import { RpgSceneTab } from "../components/rpg-scene-tab";
import { RpgStatusTab } from "../components/rpg-status-tab";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import type { RpgContextTabsDeps } from "./rpg-game-chat";
import { makeIsGameChat, peekChatDetail } from "./rpg-game-chat";

/** Build the lite game-tab contributions, bound to the door's cross-domain read channel. */
export function makeRpgContextTabs(deps: RpgContextTabsDeps): readonly ContextTabDef<ChatContextState>[] {
  // THE game-ness gate — the SAME predicate the whole-pane HUD claim reads (`rpg-game-chat.ts`), so the
  // tabs and the claim can never disagree about whether this chat is a game.
  const isGameChat = makeIsGameChat(deps);

  /** Is this a game chat the viewer HOSTS? The crown GM-console gate (§4 "Game" — host-only). Reads the
   *  same cached `getChat` for `viewerIsHost`; a member never sees the tab (PERMISSION-omit) and the
   *  server verb is a second host gate. */
  const isHostGameChat = (s: ChatContextState): boolean => isGameChat(s) && peekChatDetail(deps, s)?.viewerIsHost === true;

  /** The Game meta tab's #40 gate: EVERY committed chat the viewer hosts (game or not) — the tab is the
   *  FRONT DOOR (start a game / resume a paused one / the GM console). PERMISSION-omit for members. */
  const isHostCommitted = (s: ChatContextState): s is CommittedChatContext => {
    if (s.phase !== "committed") {
      return false;
    }
    return peekChatDetail(deps, s)?.viewerIsHost === true;
  };

  const gameTab =
    (label: string, render: (state: RpgPanelState) => ReactNode) =>
    (s: ChatContextState): ReactNode =>
      isGameChat(s) ? (
        <QueryBoundary
          fallback={<Text tone="muted">{`Loading ${label.toLowerCase()}…`}</Text>}
          // The ONE consolidated, ANNOUNCED error surface (FIX 3): the game-tab body owns it; the header BAND
          // collapses to nothing on error (below) so a failed read is a single `role="alert"` region, never two
          // fragmented unannounced blocks. Scene-named copy + a ≥44px Retry live in `RpgErrorState`. A NOT_FOUND
          // read = the DANGLING POINTER state (§3.3): `RpgErrorState` discriminates it and renders the typed
          // gone-copy + the host's detach heal instead of a doomed Retry (host = the same cached `viewerIsHost`).
          renderError={(error, retry): ReactElement => <RpgErrorState chatId={s.chatId} isHost={isHostGameChat(s)} error={error} onRetry={retry} />}
        >
          <RpgGameTabBody chatId={s.chatId} render={render} />
        </QueryBoundary>
      ) : null;

  return [
    {
      id: "rpg.status",
      label: "Status",
      icon: HeartPulse,
      strip: "game",
      when: isGameChat,
      // A game chat lands on Status (the game-state centerpiece) — not the roster's Members, the
      // declared-order first (Context-Panel-Program §4.1). A stored prior selection still wins.
      defaultTab: isGameChat,
      body: gameTab("Status", (state) => <RpgStatusTab state={state} />),
    },
    {
      id: "rpg.inventory",
      label: "Inventory",
      icon: Backpack,
      strip: "game",
      when: isGameChat,
      body: gameTab("Inventory", (state) => <RpgInventoryTab state={state} />),
    },
    {
      id: "rpg.scene",
      label: "Scene",
      icon: Drama,
      strip: "game",
      when: isGameChat,
      body: gameTab("Scene", (state) => <RpgSceneTab state={state} />),
    },
    {
      id: "rpg.quests",
      label: "Quests",
      icon: Flag,
      strip: "game",
      when: isGameChat,
      body: gameTab("Quests", (state) => <RpgQuestsTab state={state} />),
    },
    {
      id: "rpg.journal",
      label: "Journal",
      icon: BookOpen,
      strip: "game",
      when: isGameChat,
      body: gameTab("Journal", (state) => <RpgJournalTab state={state} />),
    },
    {
      // The ONE PHASE-locked tab (panel-redesign §4 "Map"): visible, aria-disabled with its reason on
      // title + a lock glyph (the strip's disabledReason mechanics) — the promise visible, the gate
      // honest. RV-7: the tab is `aria-disabled`, NOT `disabled` (so its reason stays keyboard-reachable),
      // which means it still opens — and an opened tab that renders NOTHING reads as a broken panel. The
      // body is the coming-soon presentation the mock drew (`map.html`); MA-3 replaces it with the region map.
      id: "rpg.map",
      label: "Map",
      icon: MapIcon,
      strip: "game",
      when: isGameChat,
      disabledReason: (): string => "Maps unlock with the map arc (MA-3)",
      body: (s): ReactNode => (isGameChat(s) ? <RpgMapTab /> : null),
    },
    {
      // The crown Game tab (panel-redesign §4 "Game") — the host-admin home AND the #40 FRONT DOOR.
      // `strip:"meta"` (the bracket's bottom/administration strip, §4.2); host-only (`when:
      // isHostCommitted` — PERMISSION-omit, a member never sees it). A LIVE game renders the GM console
      // (the `gameTab` wrapper — panel-state resolve + boundary; the console owns its OWN inner
      // `getConfigView` boundary, a second server-side host gate); a non-game / PAUSED chat renders the
      // Game DOOR (start a freeform|d20 game / turn a preserved game back on).
      id: "rpg.game",
      label: "Game",
      icon: Crown,
      strip: "meta",
      when: isHostCommitted,
      body: (s): ReactNode => {
        if (isHostGameChat(s)) {
          return gameTab("Game", (state) => <RpgGameTab state={state} />)(s);
        }
        if (!isHostCommitted(s)) {
          return null;
        }
        return (
          <QueryBoundary
            fallback={<Text tone="muted">Loading…</Text>}
            // The Game-DOOR boundary (host-committed, non-game / paused chat). A host reaches it, so a dangling
            // pointer here surfaces the host detach heal exactly like the tab bodies (§3.3).
            renderError={(error, retry): ReactElement => <RpgErrorState chatId={s.chatId} isHost={true} error={error} onRetry={retry} />}
          >
            <RpgGameDoor chatId={s.chatId} />
          </QueryBoundary>
        );
      },
    },
  ];
}
