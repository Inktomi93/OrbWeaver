// `useChatBackground` — resolves the ACTIVE chat's carried background source (BG-C) for the app-root
// background layer. The per-chat / card-carried background lives on the chat (getChat), not the viewer's
// settings, so the shell learns it via the SANCTIONED §12 cross-feature READ (`trpc.chat.getChat` keyed off
// the `#state` active-chat pointer — never a `#features/chat` import), exactly as `use-selected-theme`
// reads `trpc.settings.*`. `undefined` ⇒ no carried override (the viewer's own `appearance` background
// wins) — the safe floor for landing, an uncommitted draft, a non-true-solo room, or an unresolved read.
//
// A plain gated (non-suspense) query: the shell must never suspend/crash on this — an unresolved/errored
// read falls back to `undefined` (byte-identical to a viewer-appearance-only background). Composition
// (true-solo) + the chat-set > card-carried cascade are the ONE pure `resolveChatBackgroundSource`.

import type { ThemeBackground } from "@orb/contracts/theme";
import { useGatedQuery, useTRPC } from "#data";
import { useActiveChatId } from "#state";
import { resolveChatBackgroundSource } from "../lib/resolve-theme-background";

/** The active chat's effective carried background source, or `undefined` when the viewer's own appearance
 *  background should paint (the app-shell cascades this over `appearanceBackgroundSource(appearance)`). */
export function useChatBackground(): ThemeBackground | undefined {
  const trpc = useTRPC();
  const chatId = useActiveChatId();
  const { data } = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  return resolveChatBackgroundSource(data?.participants, data?.background);
}
