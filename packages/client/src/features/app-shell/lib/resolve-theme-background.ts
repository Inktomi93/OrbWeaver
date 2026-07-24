// The D63 (amends D49 §3) app-background URL resolver — pure, module-scope. Reads the FLAT appearance
// fields (the background image moved off the theme onto `UserSettings.appearance`, palette-independent)
// and returns the URL the fixed-position root layer paints. Exported so BOTH `<ThemeBackgroundLayer>`
// (paints it) AND `app-shell.tsx` (gates `.shell-grid`'s own opaque background off the SAME resolved
// outcome — the image must show through the chrome's gaps/glass to be visible at all) read the ONE answer.
//
// PD-131: the `asset` (own upload) kind resolves the STORED immutable content hash straight to `blobUrl`
// (no async id→hash round-trip — the hash is persisted alongside `backgroundAssetId`, which GC roots).

import { blobUrl } from "@orb/contracts/assets";
import type { AppearanceSettings } from "@orb/contracts/settings";
import { resolveSeededBackgroundUrl } from "#lib";

/** `null` ⇒ no image renders (kind `none` or `external`, an empty/stale seeded id, or a
 *  not-yet-uploaded `asset` with no stored hash). `external` never persists a paintable field (BG-C
 *  invariant, contracts/settings) — a pasted URL is materialized server-side into an `asset` entry, so
 *  it resolves to `null` here. */
export function resolveBackgroundUrl(a: Pick<AppearanceSettings, "backgroundImageKind" | "backgroundSeededId" | "backgroundAssetHash">): string | null {
  if (a.backgroundImageKind === "seeded") {
    return resolveSeededBackgroundUrl(a.backgroundSeededId) ?? null;
  }
  if (a.backgroundImageKind === "asset") {
    return a.backgroundAssetHash ? blobUrl(a.backgroundAssetHash) : null;
  }
  return null;
}
