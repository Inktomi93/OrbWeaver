// The D63 (amends D49 §3) app-background URL resolver — pure, module-scope. Reads the FLAT appearance
// fields (the background image moved off the theme onto `UserSettings.appearance`, palette-independent)
// and returns the URL the fixed-position root layer paints. ONE answer for both the layer that paints it
// and `app-shell.tsx`, which gates `.shell-grid`'s own opaque background off the SAME resolved outcome —
// the image must show through the chrome's gaps/glass to be visible at all.
//
// PD-131: the `asset` (own upload) kind resolves the STORED immutable content hash straight to `blobUrl`
// (no async id→hash round-trip — the hash is persisted alongside `backgroundAssetId`, which GC roots).

import { blobUrl } from "@orb/contracts/assets";
import type { ParticipantView } from "@orb/contracts/chat";
import { soleTrueSoloCharacter } from "@orb/contracts/chat";
import type { AppearanceSettings } from "@orb/contracts/settings";
import type { ThemeBackground } from "@orb/contracts/theme";
import { resolveSeededBackgroundUrl } from "#lib";

/** `null` ⇒ no image renders (kind `none` or `external`, an empty/stale seeded id, or a
 *  not-yet-uploaded `asset` with no stored hash). `external` never persists a paintable field (BG-C
 *  invariant, contracts/settings) — a pasted URL is materialized server-side into an `asset` entry, so
 *  it resolves to `null` here. */
function resolveBackgroundUrl(a: Pick<AppearanceSettings, "backgroundImageKind" | "backgroundSeededId" | "backgroundAssetHash">): string | null {
  if (a.backgroundImageKind === "seeded") {
    return resolveSeededBackgroundUrl(a.backgroundSeededId) ?? null;
  }
  if (a.backgroundImageKind === "asset") {
    return a.backgroundAssetHash ? blobUrl(a.backgroundAssetHash) : null;
  }
  return null;
}

// ── BG-C: the carried (per-chat / card) background source cascade over the viewer's own appearance. ──

/** The viewer's FLAT `appearance` background fields projected onto the nested carried `ThemeBackground`
 *  source shape, so the app-shell resolves ONE source type (carried override ?? this) into a url + the
 *  video-layer branch. */
export function appearanceBackgroundSource(
  a: Pick<AppearanceSettings, "backgroundImageKind" | "backgroundSeededId" | "backgroundAssetId" | "backgroundAssetHash" | "backgroundAssetMime">,
): ThemeBackground {
  return {
    kind: a.backgroundImageKind,
    seededId: a.backgroundSeededId,
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
 *  (delegates to the ONE resolver so a seeded/external/asset source resolves identically to the flat
 *  appearance fields). */
export function resolveThemeBackgroundUrl(bg: ThemeBackground): string | null {
  return resolveBackgroundUrl({
    backgroundImageKind: bg.kind,
    backgroundSeededId: bg.seededId,
    backgroundAssetHash: bg.assetHash,
  });
}

/** The effective carried background SOURCE for the active chat (BG-C), or `undefined` when the viewer's own
 *  appearance should win. Gated by the ONE `soleTrueSoloCharacter` composition predicate: in ANY non-true-solo
 *  composition the chat/card background is INERT (a host writing it never forces another human's viewport).
 *  In a true-solo room the cascade is `chat-set` over `card-carried`; an absent/`kind:"none"` source at each level
 *  falls through (finally to `undefined` ⇒ the viewer's appearance). */
export function resolveChatBackgroundSource(
  participants: readonly ParticipantView[] | undefined,
  chatBackground: ThemeBackground | null | undefined,
): ThemeBackground | undefined {
  const sole = soleTrueSoloCharacter(participants);
  if (sole === undefined) {
    return;
  }
  const chatSet = chatBackground && chatBackground.kind !== "none" ? chatBackground : undefined;
  const cardCarried = sole.backgroundOverride && sole.backgroundOverride.kind !== "none" ? sole.backgroundOverride : undefined;
  return chatSet ?? cardCarried;
}
