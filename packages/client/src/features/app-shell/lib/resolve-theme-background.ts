// The D63 (amends D49 §3) app-background URL resolver — pure, module-scope. Reads the FLAT appearance
// fields (the background image moved off the theme onto `UserSettings.appearance`, palette-independent)
// and returns the URL the fixed-position root layer paints. Exported so BOTH `<ThemeBackgroundLayer>`
// (paints it) AND `app-shell.tsx` (gates `.shell-grid`'s own opaque background off the SAME resolved
// outcome — the image must show through the chrome's gaps/glass to be visible at all) read the ONE answer.
//
// FLAG[PD-131]: the `asset` (own upload) source is GONE from the kind enum — no client asset-URL
// resolver/upload flow exists yet (#67, the SAME gap `message-media-block.tsx` flags for message
// images). The picker offers only seeded/external until #67 lands. Debt registry: `Core-Audits-and-Debt.md` PD-131.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { resolveSeededBackgroundUrl } from "#lib";

/** `null` ⇒ no image renders (kind `none`, an empty/stale seeded id, or a blank external url). */
export function resolveBackgroundUrl(
  a: Pick<
    AppearanceSettings,
    "backgroundImageKind" | "backgroundSeededId" | "backgroundExternalUrl"
  >,
): string | null {
  if (a.backgroundImageKind === "seeded") {
    return resolveSeededBackgroundUrl(a.backgroundSeededId) ?? null;
  }
  if (a.backgroundImageKind === "external") {
    return a.backgroundExternalUrl || null;
  }
  return null;
}
