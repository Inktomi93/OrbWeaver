// The saved-party reads: the library list (suspense — the picker body sits in a QueryBoundary) and the
// ACTIVE-room projection the picker's chat-scoped affordances gate on ("Add to this chat" / "Save current
// party"). The room read is the `useSuspenseQueries` dynamic-array idiom (use-chat-context-state.ts's
// exact shape) so it suspends ONLY when a room is open; the cross-feature channel is `trpc.chat.getChat`
// (cache-first — the open room's detail is already warm), never a chat-feature import. Wire types come
// from `@orb/contracts/roster-preset` (one home); the active-room projection is deliberately UN-exported
// (no-inline-types — a consumer derives it via `ReturnType<typeof useActivePartyChat>`).

import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { useTRPC } from "#data";
import { useActiveChatId } from "#state";

type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** The caller's saved parties, name-sorted (suspends; bus-driven fresh via `rosterPresetsChanged`). */
export function useSavedParties(): readonly RosterPresetSummary[] {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.rosterPreset.list.queryOptions());
  return data;
}

/** The open room the picker's chat-scoped affordances act on — `null` when nothing is open. Carries the
 *  full detail (participants + group + anchor) because "Save current party" snapshots exactly those.
 *  NOT exported as a named type — derive `NonNullable<ReturnType<typeof useActivePartyChat>>`. */
interface ActivePartyChat {
  readonly chatId: ChatDetail["id"];
  readonly isHost: boolean;
  readonly detail: ChatDetail;
}

export function useActivePartyChat(): ActivePartyChat | null {
  const chatId = useActiveChatId();
  const trpc = useTRPC();
  const chatQueries = useSuspenseQueries({
    queries: (chatId === null ? [] : [chatId]).map((id) => trpc.chat.getChat.queryOptions({ chatId: id })),
  });
  const chatQuery = chatQueries[0];
  if (chatId === null || chatQuery === undefined) {
    return null;
  }
  return { chatId, isHost: chatQuery.data.viewerIsHost === true, detail: chatQuery.data };
}
