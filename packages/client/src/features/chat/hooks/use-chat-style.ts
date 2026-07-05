// `useChatStyle` — resolves the active message appearance (`bubble | flat | document`, UI-Theming
// §12.1) from the synced `UserSettings.appearance` blob (server-side, the §12.1 PERSISTENCE rule —
// "localStorage is device-local only; synced prefs live in the blob"). WIRED by task #31 (appearance
// settings): the value is now the real user pref, read via the shared `getUserSettings` query, and
// re-renders live when the appearance panel saves (that mutation invalidates this query). Until the
// read resolves (or for an unauthed/errored read) it falls back to the ST-parity default `bubble`.
//
// A plain (non-suspense) query with a fallback: the chat surface reads this OUTSIDE its QueryBoundary
// (before the draft gate), so it must never suspend or throw. The chat feature reads `trpc.settings.*`
// directly (a sanctioned cross-feature read, §11.0 — never a `#features/settings` import).

import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";

type ChatStyle = (typeof THEME_SCOPE_CHAT_STYLES)[number];

/** The active chatStyle — the synced appearance pref, `bubble` until the settings read resolves. */
export function useChatStyle(): ChatStyle {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.settings.getUserSettings.queryOptions());
  return data?.config.appearance.chatStyle ?? DEFAULT_APPEARANCE_SETTINGS.chatStyle;
}
