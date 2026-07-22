// `materializeBackground` op impl (side-eye F-P0-2), extracted from the composition root so its failure
// mapping is unit-testable in isolation. A user-pasted external background URL can never paint (CSP), so this
// op turns it into an owned CAS asset: fetch through the SSRF-safe egress belt (ANY_HOST — no host pin, but
// the FULL public-internet firewall: https-scheme, IP-literal reject, and per-hop private-range denial ALL
// run; this is a user-supplied URL, so there is NO ownerConfiguredEndpoint exemption) → verify the bytes are
// a real raster image via the magic-sniff belt (never the claimed content-type — the avatar-proxy precedent;
// the sniffer only ever yields the 5 non-executable raster mimes, so SVG/HTML/text can never pass) → store
// under the caller's ownership. Every expected refusal is returned as a TYPED reason (not thrown), so the
// calling domain branches on it without importing an infra error class.

import type { Principal } from "@orb/contracts/identity";
import type { MaterializeBackgroundOp, MaterializeBackgroundResult } from "@orb/contracts/theme";
import type { AssetId } from "@orb/kit/ids";
import type { SafeFetchOptions, SafeFetchResult } from "#infra/network";
import { ANY_HOST, EgressBlockedError, ImageRejectedError, isAllowedImageBuffer, safeFetch } from "#infra/network";

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;

/** Injected so the compose root binds the real `assets.store` (kind `background`, enforceMagic) and the
 *  effective per-image byte cap, and a unit test binds a fake fetch + a fake store. */
export interface MaterializeBackgroundDeps {
  /** Store the fetched bytes under the caller's CAS (kind `background`, magic-enforced). */
  readonly storeBackground: (principal: Principal, bytes: Uint8Array, mime: string) => Promise<{ readonly assetId: AssetId; readonly hash: string }>;
  /** The effective `maxImageBytes` cap — bounds the download AND the post-decode image guard. */
  readonly maxBytes: () => number;
  /** Test seam; defaults to the real `safeFetch`. */
  readonly fetchImpl?: (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;
}

/** Map an egress/read throw onto a user-facing reason. A byte-cap hit is `too-large`; everything else the
 *  egress belt refuses (scheme / private-range / unresolvable / deadline / non-2xx / network) is `unreachable`
 *  — the internal detail (a resolved private IP) NEVER leaks past the belt's own securityEvent log. */
function egressReason(err: unknown): "too-large" | "unreachable" {
  return err instanceof EgressBlockedError && err.reason === "too-large" ? "too-large" : "unreachable";
}

/** Map the image guard's rejection onto a user-facing reason: a real-but-oversized image is `too-large`; a
 *  non-image / disallowed-mime / unparseable buffer is `not-image` (the honest "that wasn't a usable image"). */
function imageReason(err: unknown): "too-large" | "not-image" {
  if (err instanceof ImageRejectedError && (err.reason === "too-large" || err.reason === "dimensions-exceeded")) {
    return "too-large";
  }
  return "not-image";
}

export function createMaterializeBackground(deps: MaterializeBackgroundDeps): MaterializeBackgroundOp {
  const fetchImpl = deps.fetchImpl ?? safeFetch;
  return async (principal: Principal, url: string): Promise<MaterializeBackgroundResult> => {
    const maxBytes = deps.maxBytes();

    let res: SafeFetchResult;
    try {
      res = await fetchImpl(url, { allowedHosts: ANY_HOST, method: "GET", maxBytes });
    } catch (err) {
      return { ok: false, reason: egressReason(err) };
    }
    if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
      res.dispose?.();
      return { ok: false, reason: "unreachable" };
    }

    let bytes: Uint8Array;
    try {
      bytes = await res.bytes();
    } catch (err) {
      return { ok: false, reason: egressReason(err) };
    }

    let mime: string;
    try {
      // No `allowedMime` restriction needed beyond the sniff: the sniffer only recognizes the 5 non-executable
      // raster signatures, so the guard already refuses SVG/HTML/text. The caps bound the decompression bomb.
      mime = isAllowedImageBuffer(bytes, { maxBytes }).mime;
    } catch (err) {
      return { ok: false, reason: imageReason(err) };
    }

    const stored = await deps.storeBackground(principal, bytes, mime);
    return { ok: true, asset: { assetId: stored.assetId, assetHash: stored.hash, mime } };
  };
}
