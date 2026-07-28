// The rpg CONTEXT-panel SECTION contribution (panel-redesign DESIGN.md §4; client-architecture-lockdown
// §6c) — the FIRST real `chatContextContributors` consumer + rpg's registered definition (the
// feature-owns-definition anchor). The TOP-strip game tabs (§4.2 bracket): Status · Sheet · Inventory ·
// Scene · Quests · Journal (Quests + Journal are LIVE lite tabs — real data planes, the owner correction)
// + the PHASE-locked Map (visible, `disabledReason` — "the promise visible, the gate honest"; 6 live + 1
// locked). rpg NEVER imports chat: `main.tsx` (the door) calls `makeRpgContextTabs({ trpc, queryClient })`
// and assembles the result into `createContributorRegistry("chat-context", …)`, which flows to chat's
// `defineContextTabs` `contributors` arm (one-directional flow; `client-features-no-cross` enforces it).
//
// SELF-CONTAINED cross-domain read (lockdown §12 matrix — a feature reads ANOTHER domain's server entity via
// a CACHE-FIRST `trpc.*` read, never by importing that feature or widening its projection): the takeover
// APPLICABILITY gate (§4.1 — game-ness) reads the rpg POINTER off `chat.getChat` CACHE-FIRST. `chat` already
// holds that query (`useChatContextState` suspense-fetches it), so `getQueryData` is a pure cache read, no
// round-trip; and because chats' own `useResolved` subscribes to that query, `when` re-evaluates when it
// settles. The door injects the `queryClient` + `trpc` proxy (both singletons it already owns), so this stays
// a plain function `when` (no hooks) while still reading `#data`'s cross-domain channel — never chat's client.

import { Backpack, BookOpen, Drama, Flag, HeartPulse, MapIcon, ScrollText } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { QueryClient } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import type { Trpc } from "#data";
import { peekQueryData, QueryBoundary } from "#data";
import type { ChatContextState, CommittedChatContext, ContextTabDef } from "#lib";
import { RpgErrorState } from "../components/rpg-error-state";
import { RpgGameTabBody } from "../components/rpg-game-tab-body";
import { RpgHeaderBand } from "../components/rpg-header-band";
import { RpgInventoryTab } from "../components/rpg-inventory-tab";
import { RpgJournalTab } from "../components/rpg-journal-tab";
import { RpgQuestsTab } from "../components/rpg-quests-tab";
import { RpgSceneTab } from "../components/rpg-scene-tab";
import { RpgSheetTab } from "../components/rpg-sheet-tab";
import { RpgStatusTab } from "../components/rpg-status-tab";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";

type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** The door-injected cross-domain read channel — the singleton `queryClient` + `trpc` proxy `main.tsx` owns,
 *  so `when` reads `chat.getChat` cache-first WITHOUT a hook and WITHOUT importing chat's client (§12). */
export interface RpgContextTabsDeps {
  readonly trpc: Trpc;
  readonly queryClient: QueryClient;
}

/** Build the four lite game-tab contributions, bound to the door's cross-domain read channel. */
export function makeRpgContextTabs(deps: RpgContextTabsDeps): readonly ContextTabDef<ChatContextState>[] {
  /** Is this a game chat? The takeover APPLICABILITY gate (§4.1) — a committed chat whose CACHED `getChat`
   *  carries a non-null rpg pointer (a pure cache read off chat's own query; `undefined` while uncached ⇒
   *  false, re-evaluated when the query settles). */
  const isGameChat = (s: ChatContextState): s is CommittedChatContext => {
    if (s.phase !== "committed") {
      return false;
    }
    const detail = peekQueryData<ChatDetail>(deps.queryClient, deps.trpc.chat.getChat.queryKey({ chatId: s.chatId }));
    return detail !== undefined && detail.rpg !== null;
  };

  const gameTab =
    (label: string, render: (state: RpgPanelState) => ReactNode) =>
    (s: ChatContextState): ReactNode =>
      isGameChat(s) ? (
        <QueryBoundary
          fallback={<Text tone="muted">{`Loading ${label.toLowerCase()}…`}</Text>}
          // The ONE consolidated, ANNOUNCED error surface (FIX 3): the game-tab body owns it; the header BAND
          // collapses to nothing on error (below) so a failed read is a single `role="alert"` region, never two
          // fragmented unannounced blocks. Scene-named copy + a ≥44px Retry live in `RpgErrorState`.
          renderError={(_error, retry): ReactElement => <RpgErrorState onRetry={retry} />}
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
      // The scene banner + pool orbs ride the `.shell-panel-header` BAND slot ABOVE both strips (§4.2/§4.11
      // #3), NOT a tab body — supplied on this (always-present) game tab via the W3c header-contributor seam,
      // gated on the SAME `isGameChat` `when` (a game chat with no game clears the whole takeover, band too).
      // The band is DECORATION over the same reads the body owns: on error it collapses to nothing (its own
      // boundary, `renderError → null`) so the body's `RpgErrorState` is the SINGLE announced failure surface
      // (FIX 3 — never a second generic "Couldn't load this." block beside it).
      header: (s) =>
        isGameChat(s) ? (
          <QueryBoundary fallback={null} renderError={(): null => null}>
            <RpgHeaderBand chatId={s.chatId} />
          </QueryBoundary>
        ) : null,
    },
    {
      id: "rpg.sheet",
      label: "Sheet",
      icon: ScrollText,
      strip: "game",
      when: isGameChat,
      body: gameTab("Sheet", (state) => <RpgSheetTab state={state} />),
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
      // honest. The body is unreachable while locked; MA-3 replaces it with the region map.
      id: "rpg.map",
      label: "Map",
      icon: MapIcon,
      strip: "game",
      when: isGameChat,
      disabledReason: (): string => "Maps unlock with the map arc (MA-3)",
      body: (): ReactNode => null,
    },
  ];
}
