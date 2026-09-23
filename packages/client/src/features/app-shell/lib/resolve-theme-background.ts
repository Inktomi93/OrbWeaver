// The D63 (amends D49 §3) app-background URL resolver — pure, module-scope. Reads the FLAT appearance
// fields (the background image moved off the theme onto `UserSettings.appearance`, palette-independent)
// and returns the URL the fixed-position root layer paints. ONE answer for both the layer that paints it
// and `app-shell.tsx`, which gates `.shell-grid`'s own opaque background off the SAME resolved outcome —
// the image must show through the chrome's gaps/glass to be visible at all.
//
// The `asset` (own upload) kind resolves the STORED immutable content hash straight to `blobUrl`
// (no async id→hash round-trip — the hash is persisted alongside `backgroundAssetId`, which GC roots).

import { blobUrl } from "@orb/contracts/assets";
import type { CarriedAppearance } from "@orb/contracts/chat";
import { resolveCarriedBackgroundForAppearance } from "@orb/contracts/chat";
import type { AppearanceSettings } from "@orb/contracts/settings";
import type { ThemeBackground } from "@orb/contracts/theme";

/** `null` ⇒ no image renders (kind `none` or `external`, or a not-yet-uploaded `asset` with no stored
 *  hash). `external` never persists a paintable field (BG-C invariant, contracts/settings) — a pasted URL
 *  is materialized server-side into an `asset` entry, so it resolves to `null` here. Every bundled scene
 *  plate is an owned `asset` too since the `seeded` kind retired, so there is exactly ONE image arm. */
function resolveBackgroundUrl(a: Pick<AppearanceSettings, "backgroundImageKind" | "backgroundAssetHash">): string | null {
  if (a.backgroundImageKind === "asset") {
    return a.backgroundAssetHash ? blobUrl(a.backgroundAssetHash) : null;
  }
  return null;
}

// ── BG-C: the carried (per-chat / card) background source cascade over the viewer's own appearance.
// Keyed on the phase-independent `CarriedAppearance`, so a pre-send DRAFT dresses the shell from its
// founding cards exactly as the committed room it becomes will (owner dogfood 2026-08-06). ──

/** The viewer's FLAT `appearance` background fields projected onto the nested carried `ThemeBackground`
 *  source shape, so the app-shell resolves ONE source type (carried override ?? this) into a url + the
 *  video-layer branch. */
export function appearanceBackgroundSource(
  a: Pick<AppearanceSettings, "backgroundImageKind" | "backgroundAssetId" | "backgroundAssetHash" | "backgroundAssetMime">,
): ThemeBackground {
  return {
    kind: a.backgroundImageKind,
    // The flat appearance path carries no paintable external URL (materialized to an asset before persist) and
    // no provenance (that rides the library entry) — both empty here.
    externalUrl: "",
    provenanceUrl: "",
    assetId: a.backgroundAssetId,
    assetHash: a.backgroundAssetHash,
    mime: a.backgroundAssetMime,
  };
}

/** The url a carried `ThemeBackground` source paints — the `resolveBackgroundUrl` twin over the nested shape
 *  (delegates to the ONE resolver so an external/asset source resolves identically to the flat appearance
 *  fields). */
export function resolveThemeBackgroundUrl(bg: ThemeBackground): string | null {
  return resolveBackgroundUrl({
    backgroundImageKind: bg.kind,
    backgroundAssetHash: bg.assetHash,
  });
}

/** The effective carried background SOURCE for the active chat OR the active pre-send draft (BG-C), or
 *  `undefined` when the viewer's own appearance should win. A thin projection of the ONE
 *  `resolveCarriedBackgroundForAppearance` cascade in `@orb/contracts/chat` — shared with the chat context panel's
 *  Background row, so the painted pixels and the settings echo can never disagree (they are the same rules
 *  over the same phase-independent composition). The gate + cascade live in that resolver's header. */
export function resolveChatBackgroundSource(
  appearance: CarriedAppearance | undefined,
  chatBackground: ThemeBackground | null | undefined,
): ThemeBackground | undefined {
  return appearance === undefined ? undefined : resolveCarriedBackgroundForAppearance(appearance, chatBackground)?.source;
}
