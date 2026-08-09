// The chat options ⋯ menu at its ONE home: the composer's LEFT gutter (D111 §3's drawn control map — ☰ ✨
// [textarea] 🎭 ⟳ ▷ ⏩ ➤; owner ruling 2026-08-09 closed the parked "topbar vs composer" fork on the
// composer, and the topbar affordance was REMOVED in the same commit — never two homes for one menu).
//
// PURE RELOCATION, as D111 specifies: `ChatOptionsMenu` and every item in it are untouched, and the ⋯ glyph
// stays ours (the map's ☰ is how the owner drew our three-dots, not a request to re-skin it). What changed
// is the mount point and, with it, the phase read: the topbar wrapper resolved the active chat from the
// shell store (`useActiveChatHandle`) because chrome has no props; the composer already HOLDS the handle it
// renders for, so the phase comes down as a PROP and the landing case is unrepresentable here.
//
// ONE menu across draft + committed (#8): a DRAFT (no server row yet) renders the IDENTICAL item set with
// the not-yet-available actions DISABLED — never a vanished or parallel reduced surface.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import type { ChatHandle } from "#state";
import { isCommitted, isLanding, resolveDraftCharacterIds, useActiveDraftSeed, useDraftConfig } from "#state";
import { filterCharacters } from "../lib/roster.ts";
import { ChatOptionsMenu } from "./chat-options-menu.tsx";

/** The composer-left ⋯: the ONE options menu for the room this composer belongs to, in BOTH phases.
 *  `landing` is the belt case — the landing screen renders no composer at all, so there is no room to
 *  carry options for; it renders nothing rather than an empty menu. */
export function ComposerChatOptions({ handle }: { readonly handle: ChatHandle }): ReactElement | null {
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
  // The ONE founding-cast union (`#state`) — never a local re-spelling; the ⋯ menu's cast is the cast the
  // transcript previews and the commit writes.
  const characterIds: readonly CharacterId[] = resolveDraftCharacterIds(draftSeed?.characterIds, draftConfig.addedCharacterIds);
  const results = useQueries({ queries: characterIds.map((characterId) => trpc.character.get.queryOptions({ characterId })) });
  const characters = results.flatMap((r) => (r.data === undefined ? [] : [{ characterId: r.data.id, name: r.data.name }]));
  return <ChatOptionsMenu committed={false} draftKey={draftKey} title={draftSeed?.title ?? null} characters={characters} />;
}

/** Resolves the active chat's roster + server host gate (`viewerIsHost`) from the shared getChat query and
 *  renders the ⋯ menu — the same wiring the topbar trail used before the D111 relocation. */
export function ActiveChatOptionsMenu({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const characters = filterCharacters(chat?.participants ?? []).map((c) => ({ characterId: c.characterId, name: c.displayName }));
  return <ChatOptionsMenu chatId={chatId} title={chat?.title ?? null} characters={characters} />;
}
