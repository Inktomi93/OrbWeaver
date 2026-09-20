// entry/compose/inline-reply-image — §6.7's store op for a picture a chat model emitted inside its own
// reply. The posture under test is the `materialize-background` one, and it is here for the same reason:
// the URL arm is a PROVIDER-RESPONSE-CONTROLLED address, which is attacker-influenceable exactly as a
// user-pasted one is. "The model sent it" is not provenance.
//
//   • inline base64 → magic-belt → store (no fetch at all);
//   • a provider URL → the SSRF-safe belt → magic-belt → store;
//   • an egress refusal (private-range / scheme / deadline / cap) → null, and the turn keeps its prose;
//   • a non-2xx → null, with the body DISPOSED (a leaked Agent outlives the turn);
//   • bytes that are not an image → null EVEN WHEN the provider claims `image/png` — the sniffer is the
//     truth, and this is what keeps a scriptable document out of the owner's CAS behind an
//     `img-src`-trusted origin;
//   • a payload carrying neither bytes nor a URL → null rather than an empty asset.

import type { AssetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createStoreInlineReplyImage } from "@orb/server/entry/compose";
import type { SafeFetchResult } from "@orb/server/infra/network";
import { EgressBlockedError } from "@orb/server/infra/network";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

/** A header-PARSEABLE 1×1 PNG — the magic belt requires real dimensions, so a bare signature is refused. */
const PNG_ONE_BY_ONE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00,
]);
const PNG_BASE64 = Buffer.from(PNG_ONE_BY_ONE).toString("base64");
const HTML = Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c]);

const HOST = castId<UserId>("user_host");
const STORED = castId<AssetId>("asset_stored0000000000001");
const maxBytes = (): number => 10_000_000;

function fetchResult(over: { status?: number; dispose?: () => void; bytes: () => Promise<Uint8Array> }): SafeFetchResult {
  return {
    status: over.status ?? 200,
    headers: new Headers(),
    contentType: "image/png",
    dispose: over.dispose ?? ((): void => undefined),
    bytes: over.bytes,
  };
}

describe("createStoreInlineReplyImage", () => {
  test("inline base64 → magic-belt → store under the OWNER, with no network call at all", async () => {
    // `owner` is the ROOM HOST (§6.7): `/api/blob/:hash` is owner-gated (D21), so a picture stored under a
    // member funder would render for that member alone in a shared room.
    const storeGenerated = vi.fn(() => Promise.resolve({ assetId: STORED }));
    const fetchImpl = vi.fn(() => Promise.reject(new Error("the inline arm must not fetch")));
    const op = createStoreInlineReplyImage({ storeGenerated, maxBytes, fetchImpl });

    expect(await op(HOST, { url: undefined, base64: PNG_BASE64, mediaType: "image/png" })).toEqual({ assetId: STORED });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storeGenerated).toHaveBeenCalledWith(HOST, expect.anything(), "image/png");
  });

  test("a PROVIDER URL is downloaded through the SSRF-safe belt with the full public-internet firewall", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(fetchResult({ bytes: () => Promise.resolve(PNG_ONE_BY_ONE) })));
    const op = createStoreInlineReplyImage({ storeGenerated: () => Promise.resolve({ assetId: STORED }), maxBytes, fetchImpl });

    expect(await op(HOST, { url: "https://cdn.example/gen.png", base64: undefined, mediaType: "image/png" })).toEqual({ assetId: STORED });
    // ANY_HOST with NO ownerConfiguredEndpoint exemption — the address came from a response body, not a row.
    expect(fetchImpl).toHaveBeenCalledWith("https://cdn.example/gen.png", expect.objectContaining({ method: "GET", maxBytes: 10_000_000 }));
  });

  test("an EGRESS refusal loses the picture and nothing else — null, never a throw into the turn", async () => {
    // The prose is the product. A private-range/scheme/deadline refusal must not take the reply with it.
    const op = createStoreInlineReplyImage({
      storeGenerated: () => Promise.reject(new Error("must not store")),
      maxBytes,
      fetchImpl: () => Promise.reject(new EgressBlockedError("private-address", "blocked")),
    });

    expect(await op(HOST, { url: "http://169.254.169.254/latest/meta-data/", base64: undefined, mediaType: "image/png" })).toBeNull();
  });

  test("a non-2xx is null AND the body is DISPOSED — a leaked Agent would outlive the turn", async () => {
    const dispose = vi.fn();
    const op = createStoreInlineReplyImage({
      storeGenerated: () => Promise.reject(new Error("must not store")),
      maxBytes,
      fetchImpl: () => Promise.resolve(fetchResult({ status: 404, dispose, bytes: () => Promise.resolve(PNG_ONE_BY_ONE) })),
    });

    expect(await op(HOST, { url: "https://cdn.example/gone.png", base64: undefined, mediaType: "image/png" })).toBeNull();
    expect(dispose).toHaveBeenCalled();
  });

  test("NON-IMAGE BYTES are refused even when the provider claims image/png — the sniffer is the truth", async () => {
    // The one that matters most: a claimed-png SVG/HTML stored in the owner's CAS is served back from an
    // `img-src`-trusted origin. The mediaType the model's own wire supplied is never believed.
    const storeGenerated = vi.fn(() => Promise.resolve({ assetId: STORED }));
    const op = createStoreInlineReplyImage({ storeGenerated, maxBytes, fetchImpl: () => Promise.resolve(fetchResult({ bytes: () => Promise.resolve(HTML) })) });

    expect(await op(HOST, { url: "https://cdn.example/evil.png", base64: undefined, mediaType: "image/png" })).toBeNull();
    expect(storeGenerated).not.toHaveBeenCalled();
    // The inline arm gets the identical treatment — skipping the fetch never skips the belt.
    expect(await op(HOST, { url: undefined, base64: Buffer.from(HTML).toString("base64"), mediaType: "image/png" })).toBeNull();
    expect(storeGenerated).not.toHaveBeenCalled();
  });

  test("a payload carrying NEITHER bytes nor a URL is null — a shape we do not model, not an empty picture", async () => {
    const storeGenerated = vi.fn(() => Promise.resolve({ assetId: STORED }));
    const op = createStoreInlineReplyImage({ storeGenerated, maxBytes, fetchImpl: () => Promise.reject(new Error("must not fetch")) });

    expect(await op(HOST, { url: undefined, base64: undefined, mediaType: "image/png" })).toBeNull();
    expect(await op(HOST, { url: "", base64: "", mediaType: undefined })).toBeNull();
    expect(storeGenerated).not.toHaveBeenCalled();
  });
});
