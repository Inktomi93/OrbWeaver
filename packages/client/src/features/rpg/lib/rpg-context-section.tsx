// The rpg CONTEXT-panel SECTION contribution (Context-Panel-Program §4.4 lite trim; client-architecture-
// lockdown §6c) — the FIRST real `chatContextContributors` consumer + rpg's registered definition (the
// feature-owns-definition anchor). Four `ContextTabDef<ChatContextState>` game tabs (Status · Sheet ·
// Inventory · Scene), each `strip:"game"` (the §4.2 bracket's TOP row). rpg NEVER imports chat: `main.tsx`
// (the door) calls `makeRpgContextTabs({ trpc, queryClient })` and assembles the result into
// `createContributorRegistry("chat-context", …)`, which flows to chat's `defineContextTabs` `contributors`
// arm (one-directional flow holds; `client-features-no-cross` keeps enforcing it). Quests/Journal/Map are lite
// APPLICABILITY-omitted (§4.4) — not contributed; their doorway is `rpg.game`'s graduation (a later wave).
//
// SELF-CONTAINED cross-domain read (lockdown §12 matrix — a feature reads ANOTHER domain's server entity via
// a CACHE-FIRST `trpc.*` read, never by importing that feature or widening its projection): the takeover
// APPLICABILITY gate (§4.1 — game-ness) reads the rpg POINTER off `chat.getChat` CACHE-FIRST. `chat` already
// holds that query (`useChatContextState` suspense-fetches it), so `getQueryData` is a pure cache read, no
// round-trip; and because chats' own `useResolved` subscribes to that query, `when` re-evaluates when it
// settles. The door injects the `queryClient` + `trpc` proxy (both singletons it already owns), so this stays
// a plain function `when` (no hooks) while still reading `#data`'s cross-domain channel — never chat's client.

import { Backpack, Drama, HeartPulse, ScrollText } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { QueryClient } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import type { Trpc } from "#data";
import { peekQueryData, QueryBoundary, QueryErrorState } from "#data";
import type { ChatContextState, CommittedChatContext, ContextTabDef } from "#lib";
import { RpgGameTabBody } from "../components/rpg-game-tab-body";
import { RpgHeaderBand } from "../components/rpg-header-band";
import { RpgInventoryTab } from "../components/rpg-inventory-tab";
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
          renderError={(_error, retry): ReactElement => <QueryErrorState label={label.toLowerCase()} onRetry={retry} />}
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
      body: gameTab("Status", (state) => <RpgStatusTab state={state} />),
      // The scene banner + pool orbs ride the `.shell-panel-header` BAND slot ABOVE both strips (§4.2/§4.11
      // #3), NOT a tab body — supplied on this (always-present) game tab via the W3c header-contributor seam,
      // gated on the SAME `isGameChat` `when` (a game chat with no game clears the whole takeover, band too).
      header: (s) => (isGameChat(s) ? <RpgHeaderBand chatId={s.chatId} /> : null),
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
  ];
}
