// External backgrounds become caller-owned raster CAS assets; typed refusals conceal egress details.

import type { Principal } from "@orb/contracts/identity";
import type { BackgroundMaterializeFailure, MaterializeBackgroundOp, MaterializeBackgroundResult } from "@orb/contracts/theme";
import type { SafeFetchResult } from "#infra/network";
import { ANY_HOST, EgressBlockedError, ImageRejectedError, isAllowedImageBuffer } from "#infra/network";
import type { MaterializeBackgroundDeps } from "../contract/materialize.ts";

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;

/** Map an egress/read throw onto a user-facing reason. A byte-cap hit is `too-large`; everything else the
 *  egress belt refuses (scheme / private-range / unresolvable / deadline / non-2xx / network) is `unreachable`
 *  — the internal detail (a resolved private IP) NEVER leaks past the belt's own securityEvent log. */
function egressReason(err: unknown): Exclude<BackgroundMaterializeFailure, "not-image"> {
  return err instanceof EgressBlockedError && err.reason === "too-large" ? "too-large" : "unreachable";
}

/** Map the image guard's rejection onto a user-facing reason: a real-but-oversized image is `too-large`; a
 *  non-image / disallowed-mime / unparseable buffer is `not-image` (the honest "that wasn't a usable image"). */
function imageReason(err: unknown): Exclude<BackgroundMaterializeFailure, "unreachable"> {
  if (err instanceof ImageRejectedError && (err.reason === "too-large" || err.reason === "dimensions-exceeded")) {
    return "too-large";
  }
  return "not-image";
}

export function createMaterializeBackground(deps: MaterializeBackgroundDeps): MaterializeBackgroundOp {
  const { fetchImpl } = deps;
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

    const stored = await deps.storeBackground({ principal, bytes, mime });
    return { ok: true, asset: { assetId: stored.assetId, assetHash: stored.hash, mime } };
  };
}
