// The rpg CONTEXT-panel SECTION contribution (client-architecture-lockdown
// §6c) — the FIRST real `chatContextContributors` consumer + rpg's registered definition (the
// feature-owns-definition anchor). The GAME-rail tabs: Status · Inventory · Scene ·
// Quests · Journal (Quests + Journal are LIVE lite tabs — real data planes, the owner correction) + the
// PHASE-locked Map (visible, `disabledReason` — "the promise visible, the gate honest"; 5 live + 1 locked).
// **Sheet is NOT a tab** (the tracked-field unification): Status is the only list of people and expanding
// a participant entry IS the sheet, so the sheet is a STATE of Status, not a sibling of it — a tab whose content
// migrated to another tab depending on the stat profile was a hallway. Inventory STAYS its own tab
// (plane-shaped, not character-card-shaped). rpg NEVER imports chat: `main.tsx` (the door) calls `makeRpgContextTabs({ trpc, queryClient })`
// and assembles the result into `createContributorRegistry("chat-context", …)`, which flows to chat's
// `defineContextTabs` `contributors` arm (one-directional flow; `client-features-no-cross` enforces it).
//
// The APPLICABILITY gate (game-ness) is `rpg-game-chat.ts` — ONE predicate shared with the HEAD-BAND CLAIM
// (`rpg-hud-region.tsx`), so the Waystone band and the game tabs appear and disappear together. These defs
// own the tabs; the SHELL owns the arrangement (the context bracket — band slot, rails, viewport, ground —
// `app-shell/components/context-bracket.tsx`, #860) and rpg owns only the band's content.
//
// THE INSTRUMENT TIER RIDES THE BODIES (§7.4; UI-Density-Law §3.1 names the game pane as this exact
// surface): every game tab body is wrapped in `<Surface tier="instrument">` here — read-mostly, glanceable,
// many data per cm² — and the band wraps itself (`rpg-hud-band.tsx`). NEVER the rails: those are the shell's
// and must render identically in a normal room and a game room, which is the whole ruling.

import { Backpack, BookOpen, Crown, Drama, Flag, HeartPulse, MapIcon } from "@orb/ui/icons";
import { Surface } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary } from "#components";
import type { ChatContextState, CommittedChatContext, ContextTabDef } from "#lib";
import { RpgErrorState } from "../components/rpg-error-state.tsx";
import { RpgGameDoor } from "../components/rpg-game-door.tsx";
import { RpgGameTab } from "../components/rpg-game-tab.tsx";
import { RpgGameTabBody } from "../components/rpg-game-tab-body.tsx";
import { RpgInventoryTab } from "../components/rpg-inventory-tab.tsx";
import { RpgJournalTab } from "../components/rpg-journal-tab.tsx";
import { RpgMapTab } from "../components/rpg-map-tab.tsx";
import { RpgQuestsTab } from "../components/rpg-quests-tab.tsx";
import { RpgSceneTab } from "../components/rpg-scene-tab.tsx";
import { RpgStatusTab } from "../components/rpg-status-tab.tsx";
import type { RpgPanelState } from "../hooks/use-rpg-context-state.ts";
import type { RpgContextTabsDeps } from "./rpg-game-chat.ts";
import { makeIsGameChat, peekChatDetail } from "./rpg-game-chat.ts";

/** Build the lite game-tab contributions, bound to the door's cross-domain read channel. */
export function makeRpgContextTabs(deps: RpgContextTabsDeps): readonly ContextTabDef<ChatContextState>[] {
  // THE game-ness gate — the SAME predicate the whole-pane HUD claim reads (`rpg-game-chat.ts`), so the
  // tabs and the claim can never disagree about whether this chat is a game.
  const isGameChat = makeIsGameChat(deps);

  /** Is this a game chat the viewer HOSTS? The crown GM-console gate ("Game" — host-only). Reads the
   *  same cached `getChat` for `viewerIsHost`; a member never sees the tab (PERMISSION-omit) and the
   *  server verb is a second host gate. */
  const isHostGameChat = (s: ChatContextState): boolean => isGameChat(s) && peekChatDetail(deps, s)?.viewerIsHost === true;

  /** The Game meta tab's #40 gate: EVERY committed chat the viewer hosts (game or not) — the tab is the
   *  FRONT DOOR (start a game / resume a paused one / the GM console). PERMISSION-omit for members. */
  // ChatContextState is single-arm today (R1 deleted the draft arm; the union stays as the re-entry
  // seam) — no phase check needed until a second arm exists, at which point tsc re-demands one here.
  const isHostCommitted = (s: ChatContextState): s is CommittedChatContext => peekChatDetail(deps, s)?.viewerIsHost === true;

  const gameTab =
    (label: string, render: (state: RpgPanelState) => ReactNode) =>
    (s: ChatContextState): ReactNode =>
      isGameChat(s) ? (
        <Surface tier="instrument">
          {/* RESERVED (#1098) — the key is DERIVED FROM THE TAB, never a literal: this is a FACTORY that
              builds five different game tabs, and one literal here would hand all five the same box (the
              copy-paste collision the gate's duplicate arm exists to red). One label, one surface, one key. */}
          <QueryBoundary
            fallback={<Text voice="gloss">{`Loading ${label.toLowerCase()}…`}</Text>}
            reserveKey={`rpg.tab.${label.toLowerCase()}`}
            // The ONE consolidated, ANNOUNCED error surface (FIX 3): the game-tab body owns it; the header BAND
            // collapses to nothing on error so a failed read is a single `role="alert"` region, never two
            // fragmented unannounced blocks. Scene-named copy + a ≥44px Retry live in `RpgErrorState`. A NOT_FOUND
            // read = the DANGLING POINTER state: `RpgErrorState` discriminates it and renders the typed
            // gone-copy + the host's detach heal instead of a doomed Retry (host = the same cached `viewerIsHost`).
            renderError={(error, retry): ReactElement => <RpgErrorState chatId={s.chatId} isHost={isHostGameChat(s)} error={error} onRetry={retry} />}
          >
            <RpgGameTabBody chatId={s.chatId} render={render} />
          </QueryBoundary>
        </Surface>
      ) : null;

  return [
    {
      id: "rpg.status",
      label: "Status",
      icon: HeartPulse,
      strip: "game",
      when: isGameChat,
      // A game chat lands on Status (the game-state centerpiece) — not Members, the
      // declared-order first. A stored prior selection still wins.
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
      // The ONE PHASE-locked tab ("Map"): visible, wearing a lock glyph with its reason
      // on `title` — the promise visible, the gate honest. RV-7: it OPENS, onto the coming-soon body the
      // mock drew (`map.html`); MA-3 replaces that with the region map. Because it opens for every input,
      // the bracket's cell does NOT mark it `aria-disabled` (2026-08-01 side-eye: announcing "unavailable"
      // over a tab that Enter and a click both open is two stories) — `disabledReason` is the LOCK's reason
      // here, and the cell decides how to wear it.
      id: "rpg.map",
      label: "Map",
      icon: MapIcon,
      strip: "game",
      when: isGameChat,
      // No internal arc id in player-facing copy (side-eye 2026-08-06 P3 — the panel body's "arrives with
      // MA-3" chip went for the same reason; a ticket number is a fact a player cannot use).
      disabledReason: (): string => "Maps unlock with the map arc",
      body: (s): ReactNode =>
        isGameChat(s) ? (
          <Surface tier="instrument">
            <RpgMapTab />
          </Surface>
        ) : null,
    },
    {
      // The crown Game tab ("Game") — the host-admin home AND the #40 FRONT DOOR.
      // `strip:"meta"` (the bracket's bottom/administration strip); host-only (`when:
      // isHostCommitted` — PERMISSION-omit, a member never sees it). A LIVE game renders the GM console
      // (the `gameTab` wrapper — panel-state resolve + boundary; the console owns its OWN inner
      // `getConfigView` boundary, a second server-side host gate); a non-game / PAUSED chat renders the
      // Game DOOR (start a freeform|d20 game / turn a preserved game back on).
      id: "rpg.game",
      label: "Game",
      icon: Crown,
      strip: "meta",
      // HOST-ONLY — the crown-gold glyph at rest in the admin rail. `when` is the real gate
      // (PERMISSION-omit); this is only how the HUD paints it.
      crown: true,
      when: isHostCommitted,
      body: (s): ReactNode => {
        if (isHostGameChat(s)) {
          return gameTab("Game", (state) => <RpgGameTab state={state} />)(s);
        }
        if (!isHostCommitted(s)) {
          return null;
        }
        return (
          // RESERVED (#1098) — the Game DOOR is ONE surface (host-committed, non-game or paused), unlike
          // the tab factory above, so it takes a literal key of its own.
          <QueryBoundary
            fallback={<Text voice="gloss">Loading…</Text>}
            reserveKey="rpg.gameDoor"
            // The Game-DOOR boundary (host-committed, non-game / paused chat). A host reaches it, so a dangling
            // pointer here surfaces the host detach heal exactly like the tab bodies.
            renderError={(error, retry): ReactElement => <RpgErrorState chatId={s.chatId} isHost={true} error={error} onRetry={retry} />}
          >
            <RpgGameDoor chatId={s.chatId} />
          </QueryBoundary>
        );
      },
    },
  ];
}
