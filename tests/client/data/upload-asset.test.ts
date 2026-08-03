// data/upload-asset — the multipart upload POST helper (#67 keystone). Pins: the request shape (POST
// `/api/assets/upload`, a `file`+`kind` FormData body, the CSRF header every mutation carries), the
// response is validated against `storedAssetSchema` (not just cast), and a non-OK response throws.
// `fetch` is stubbed at the global boundary (the sanctioned "fake at the edges" seam — the `safeFetch`
// precedent, `tests/server/infra/network/egress.test.ts`), never a hand-mock of `uploadAsset` itself.

import { uploadAsset } from "@orb/client/data";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const SAMPLE_ASSET_ID = mintTypeId(ID_PREFIX.asset);
const SAMPLE_HASH = "ab".repeat(32);

afterEach(() => {
  vi.unstubAllGlobals();
});

test("POSTs a file+kind FormData body with the CSRF header, and parses the response", async () => {
  let capturedRequest: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    capturedRequest = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ assetId: SAMPLE_ASSET_ID, hash: SAMPLE_HASH, size: 42, created: true }), { status: 200 }));
  });

  const file = new File(["bytes"], "avatar.png", { type: "image/png" });
  const stored = await uploadAsset(file, "avatar");

  expect(stored).toEqual({ assetId: SAMPLE_ASSET_ID, hash: SAMPLE_HASH, size: 42, created: true });
  expect(capturedRequest?.url).toBe("/api/assets/upload");
  expect(capturedRequest?.init.method).toBe("POST");
  const headers = capturedRequest?.init.headers as Record<string, string>;
  expect(headers[CSRF_HEADER]).toBe("1");
  const form = capturedRequest?.init.body as FormData;
  expect(form.get("kind")).toBe("avatar");
  expect((form.get("file") as File).name).toBe("avatar.png");
});

test("throws on a non-OK response", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 401, statusText: "Unauthorized" })));
  const file = new File(["bytes"], "avatar.png", { type: "image/png" });
  await expect(uploadAsset(file, "avatar")).rejects.toThrow("401");
});

test("throws on a malformed response body (schema validation, not a bare cast)", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ hash: SAMPLE_HASH }), { status: 200 })));
  const file = new File(["bytes"], "avatar.png", { type: "image/png" });
  await expect(uploadAsset(file, "avatar")).rejects.toThrow();
});
