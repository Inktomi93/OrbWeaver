// The external-background MATERIALIZE op (BG-C invariant). An external URL can never paint
// (the CSP `img-src` is self/data/blob only, by design), so every background write path that receives a
// `kind:"external"` source runs THIS op: fetch the URL through the SSRF-safe egress belt, verify the bytes
// are a real image via the magic-sniff belt (never the claimed content-type — the avatar-proxy precedent),
// store them in the caller's CAS, and hand back the asset ref. The write then persists a `kind:"asset"`
// source (with the original URL as `provenanceUrl`), OR — on any failure — refuses with a typed reason the
// caller surfaces. Assets owns materialization; composition injects its store and byte cap.
// Its type lives here so chat, character and settings share one shape.

import type { AssetId } from "@orb/kit/ids";
import type { Principal } from "#identity";

// The stored asset a materialized external background resolves to — the content pointer the write persists.
interface MaterializedBackgroundAsset {
  readonly assetId: AssetId;
  readonly assetHash: string;
  readonly mime: string;
}

// Why a materialize refused — collapsed from the infra belts (egress SSRF/scheme/deadline/non-2xx →
//  `unreachable`; magic-sniff/content-type reject → `not-image`; byte/dimension caps → `too-large`) into the
//  three reasons a user-facing message needs. NEVER carries the resolved address or internal detail.
const BACKGROUND_MATERIALIZE_FAILURES = ["unreachable", "not-image", "too-large"] as const;
export type BackgroundMaterializeFailure = (typeof BACKGROUND_MATERIALIZE_FAILURES)[number];

export type MaterializeBackgroundResult =
  | { readonly ok: true; readonly asset: MaterializedBackgroundAsset }
  | { readonly ok: false; readonly reason: BackgroundMaterializeFailure };

/** Fetch → magic-belt → CAS-store a user-pasted external URL under the caller's ownership. Resolves a typed
 *  result (never throws for an expected refusal — the belts' failures are data, not exceptions, so the domain
 *  branches without importing infra error classes). */
export type MaterializeBackgroundOp = (principal: Principal, url: string) => Promise<MaterializeBackgroundResult>;

/** The refusal code every write path raises for an external background that could not be materialized or a
 *  background asset that is no longer available. WIRE vocabulary: the transport carries it on `data.reason`, so
 *  the chat, character and settings domains read this one constant and never spell it themselves. */
export const BACKGROUND_UNAVAILABLE_OP_CODE = "background_unavailable" as const;

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
