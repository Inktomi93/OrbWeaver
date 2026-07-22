// The external-background MATERIALIZE op (BG-C invariant / side-eye F-P0-2). An external URL can never paint
// (the CSP `img-src` is self/data/blob only, by design), so every background write path that receives a
// `kind:"external"` source runs THIS op: fetch the URL through the SSRF-safe egress belt, verify the bytes
// are a real image via the magic-sniff belt (never the claimed content-type — the avatar-proxy precedent),
// store them in the caller's CAS, and hand back the asset ref. The write then persists a `kind:"asset"`
// source (with the original URL as `provenanceUrl`), OR — on any failure — refuses with a typed reason the
// caller surfaces. The op IMPL is compose-built from `infra/network` + `assets.store` (the domain never
// imports infra); its TYPE is homed here so chat / character / settings share the one shape.

import type { AssetId } from "@orb/kit/ids";
import type { Principal } from "#identity";

/** The stored asset a materialized external background resolves to — the content pointer the write persists. */
export interface MaterializedBackgroundAsset {
  readonly assetId: AssetId;
  readonly assetHash: string;
  readonly mime: string;
}

/** Why a materialize refused — collapsed from the infra belts (egress SSRF/scheme/deadline/non-2xx →
 *  `unreachable`; magic-sniff/content-type reject → `not-image`; byte/dimension caps → `too-large`) into the
 *  three reasons a user-facing message needs. NEVER carries the resolved address or internal detail. */
export const BACKGROUND_MATERIALIZE_FAILURES = ["unreachable", "not-image", "too-large"] as const;
export type BackgroundMaterializeFailure = (typeof BACKGROUND_MATERIALIZE_FAILURES)[number];

export type MaterializeBackgroundResult =
  | { readonly ok: true; readonly asset: MaterializedBackgroundAsset }
  | { readonly ok: false; readonly reason: BackgroundMaterializeFailure };

/** Fetch → magic-belt → CAS-store a user-pasted external URL under the caller's ownership. Resolves a typed
 *  result (never throws for an expected refusal — the belts' failures are data, not exceptions, so the domain
 *  branches without importing infra error classes). */
export type MaterializeBackgroundOp = (principal: Principal, url: string) => Promise<MaterializeBackgroundResult>;

/** The user-facing refusal copy for a failed materialize — ONE home so every write path (chat / character /
 *  settings) surfaces the same honest reason. Never echoes any URL or internal detail. */
export function backgroundMaterializeMessage(reason: BackgroundMaterializeFailure): string {
  switch (reason) {
    case "not-image":
      return "That URL isn't an image we can use as a background.";
    case "too-large":
      return "That image is too large to use as a background.";
    case "unreachable":
      return "Couldn't load an image from that URL.";
  }
}
