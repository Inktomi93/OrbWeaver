// `useChatStyle` — resolves the active message appearance (`bubble | flat | document`, UI-Theming
// §12.1). This is a TYPED SEAM: the real source is the synced `UserSettings.appearance` blob
// (server-side, §12.1 PERSISTENCE — "localStorage is device-local only; synced prefs live in the
// blob"), which lands as its OWN task (#31 appearance-settings). Until then this returns the
// default (`bubble`, the ST-parity default), typed against the render-side vocabulary
// (@orb/ui/theme-scope), so the swap to the settings read is a one-line change with no call-site churn.
//
// Why a hook, not a constant: the eventual source is a Query/store read that re-renders on change
// (live user-swappable, §12.1) — the surface already consumes it as a hook, so wiring #31 never
// touches the call site.

import type { THEME_SCOPE_CHAT_STYLES } from "@orb/ui/theme-scope";

type ChatStyle = (typeof THEME_SCOPE_CHAT_STYLES)[number];

/** The active chatStyle. Default `bubble` until #31 wires the synced appearance setting. */
export function useChatStyle(): ChatStyle {
  return "bubble";
}
