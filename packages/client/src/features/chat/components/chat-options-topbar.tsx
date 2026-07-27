// The active chat's options ⋯ menu, rendered at the END of the topbar TRAIL cluster (moved out of the
// identity row — chat-header.tsx — so the trail reads as one uniform ghost cluster, ui-cohesion-north-star
// §4 N1). The chrome body (lib/chat-options-chrome.tsx) renders <ChatOptionsTopbar/>; it reads the active
// committed chat from #state and resolves the roster + host gate from the same chat.getChat query the
// identity header already suspends on (TanStack dedupes the two reads).

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { isCommitted, isLanding, useActiveChatHandle, useActiveDraftSeed, useDraftConfig } from "#state";
import { filterCharacters } from "../lib/roster";
import { ChatOptionsMenu } from "./chat-options-menu";

/** The chrome-body wrapper: renders the ONE options ⋯ menu for the active chat in BOTH phases. A COMMITTED
 *  chat resolves its roster + host gate from `chat.getChat`; a DRAFT resolves them from its seed/config (no
 *  server row) and renders the same menu with the not-yet-available actions DISABLED (#8 — no vanished or
 *  parallel reduced surface). chatOptionsChrome's `useVisible` gates this to a non-landing chats section, so
 *  `landing` is the belt case. */
export function ChatOptionsTopbar(): ReactElement | null {
  const handle = useActiveChatHandle();
  if (isCommitted(handle)) {
    return <ActiveChatOptionsMenu chatId={handle.id} />;
  }
  if (isLanding(handle)) {
    return null;
  }
  return <DraftChatOptionsMenu draftKey={handle.draftKey} />;
}

/** The draft arm: its cast comes from the founding seed + draft-config additions (no server read); the
 *  viewer is always the host of their own draft. Every committed-only action (turn steering, delete/rename/
 *  download, membership) renders DISABLED via `committed={false}`. */
function DraftChatOptionsMenu({ draftKey }: { readonly draftKey: string }): ReactElement {
  const trpc = useTRPC();
  const draftSeed = useActiveDraftSeed();
  const draftConfig = useDraftConfig(draftKey);
  const characterIds: readonly CharacterId[] = [...new Set([...(draftSeed?.characterIds ?? []), ...(draftConfig.addedCharacterIds ?? [])])];
  const results = useQueries({ queries: characterIds.map((characterId) => trpc.character.get.queryOptions({ characterId })) });
  const characters = results.flatMap((r) => (r.data === undefined ? [] : [{ characterId: r.data.id, name: r.data.name }]));
  return <ChatOptionsMenu committed={false} title={draftSeed?.title ?? null} characters={characters} />;
}

/** Resolves the active chat's roster + server host gate (`viewerIsHost`) from the shared getChat query and
 *  renders the ⋯ menu — the same wiring the identity row used before N1 moved the menu into the trail. */
export function ActiveChatOptionsMenu({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const characters = filterCharacters(chat?.participants ?? []).map((c) => ({ characterId: c.characterId, name: c.displayName }));
  return <ChatOptionsMenu chatId={chatId} title={chat?.title ?? null} characters={characters} />;
}
