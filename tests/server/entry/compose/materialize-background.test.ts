// entry/compose/materialize-background — the F-P0-2 external-background materialize op. Locks the failure-
// reason mapping (the reason a user-facing toast needs) and the SSRF/magic posture without a live network:
//   • success: fetch → magic-belt (never the content-type) → store → { ok, asset }.
//   • non-image bytes → not-image (even when the content-type CLAIMS image/png).
//   • an egress refusal (private-range / scheme / unreachable / deadline) → unreachable.
//   • a byte-cap hit → too-large.
//   • a non-2xx response → unreachable, and the body is disposed (no leaked Agent).

import type { Principal } from "@orb/contracts/identity";
import type { AssetId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createMaterializeBackground } from "@orb/server/entry/compose";
import type { SafeFetchResult } from "@orb/server/infra/network";
import { EgressBlockedError } from "@orb/server/infra/network";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// A minimal but header-PARSEABLE 1×1 PNG: signature + an IHDR carrying width/height. The magic belt fails a
// bare signature (requireDimensions defaults true), so the success case needs a real IHDR.
const PNG_ONE_BY_ONE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00,
]);

const PRINCIPAL: Principal = { userId: castId<UserId>("user_u"), role: "user", handle: castId<Handle>("user_u"), externalId: null, via: "cookie" };

function fetchResult(over: { status?: number; contentType?: string; dispose?: () => void; bytes: () => Promise<Uint8Array> }): SafeFetchResult {
  return {
    status: over.status ?? 200,
    headers: new Headers(),
    contentType: over.contentType ?? "image/png",
    dispose: over.dispose ?? ((): void => undefined),
    bytes: over.bytes,
  };
}

const storeBackground = (): Promise<{ assetId: AssetId; hash: string }> =>
  Promise.resolve({ assetId: castId<AssetId>("asset_stored0000000000001"), hash: "hash_stored" });
const maxBytes = (): number => 10_000_000;

describe("createMaterializeBackground", () => {
  test("success: fetch → magic-belt → store → { ok, asset }", async () => {
    const op = createMaterializeBackground({
      storeBackground,
      maxBytes,
      fetchImpl: () => Promise.resolve(fetchResult({ bytes: () => Promise.resolve(PNG_ONE_BY_ONE) })),
    });
    expect(await op(PRINCIPAL, "https://cdn.example/bg.png")).toEqual({
      ok: true,
      asset: { assetId: "asset_stored0000000000001", assetHash: "hash_stored", mime: "image/png" },
    });
  });

  test("non-image bytes → not-image, even when the content-type CLAIMS image/png (magic is the truth)", async () => {
    const op = createMaterializeBackground({
      storeBackground,
      maxBytes,
      fetchImpl: () =>
        Promise.resolve(fetchResult({ contentType: "image/png", bytes: () => Promise.resolve(Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c])) })),
    });
    expect(await op(PRINCIPAL, "https://cdn.example/not-image")).toEqual({ ok: false, reason: "not-image" });
  });

  test("an egress refusal (private-range / scheme / unreachable) → unreachable", async () => {
    const op = createMaterializeBackground({
      storeBackground,
      maxBytes,
      fetchImpl: () => Promise.reject(new EgressBlockedError("private-address", "blocked")),
    });
    expect(await op(PRINCIPAL, "https://cdn.example/private")).toEqual({ ok: false, reason: "unreachable" });
  });

  test("a byte-cap hit → too-large", async () => {
    const op = createMaterializeBackground({ storeBackground, maxBytes, fetchImpl: () => Promise.reject(new EgressBlockedError("too-large", "over cap")) });
    expect(await op(PRINCIPAL, "https://cdn.example/huge")).toEqual({ ok: false, reason: "too-large" });
  });

  test("a non-2xx response → unreachable, and the body is disposed", async () => {
    let disposed = false;
    const op = createMaterializeBackground({
      storeBackground,
      maxBytes,
      fetchImpl: () =>
        Promise.resolve(
          fetchResult({
            status: 404,
            dispose: (): void => {
              disposed = true;
            },
            bytes: () => Promise.resolve(PNG_ONE_BY_ONE),
          }),
        ),
    });
    expect(await op(PRINCIPAL, "https://cdn.example/gone")).toEqual({ ok: false, reason: "unreachable" });
    expect(disposed).toBe(true);
  });
});
