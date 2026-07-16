// data/import-bundle — the portability bundle-import POST helper. Pins: the request shape (POST
// `/api/import/bundle`, the raw File as the BODY — not multipart — with the zip content-type + the CSRF
// header every mutation carries), that a 202 `{ workloadId }` is returned, and that a non-OK response
// throws with the server's message. `fetch` is stubbed at the global boundary (the import-characters /
// upload-asset precedent — "fake at the edges"), never a hand-mock of `importBundle` itself.

// Deep import the PURE module (NOT the "@orb/client/data" barrel): a barrel import drags browser TSX into
// the dom-less node typecheck:graph program (the 2026-06-28 dom-lib incident).
import { CSRF_HEADER } from "@orb/contracts/identity";
import { afterEach, vi } from "vitest";
import { importBundle } from "../../../packages/client/src/data/import-bundle";
import { expect, test } from "../../support/fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("POSTs the raw zip File as the body with the CSRF + zip headers, and returns the workload id", async () => {
  let capturedRequest: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    capturedRequest = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ workloadId: "workload_ct_1" }), { status: 202 }));
  });

  const zip = new File(["PK"], "backup.zip", { type: "application/zip" });
  const result = await importBundle(zip);

  expect(capturedRequest?.url).toBe("/api/import/bundle");
  expect(capturedRequest?.init.method).toBe("POST");
  // The File rides as the raw body (not FormData) — the server reads c.req.raw.body directly.
  expect(capturedRequest?.init.body).toBe(zip);
  const headers = capturedRequest?.init.headers as Record<string, string>;
  expect(headers[CSRF_HEADER]).toBe("1");
  expect(headers["Content-Type"]).toBe("application/zip");
  expect(result.workloadId).toBe("workload_ct_1");
});

test("throws with the server message on a non-OK response (e.g. the 409 single-active lock)", async () => {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "a bundle import is already running for this account" }), {
        status: 409,
        statusText: "Conflict",
      }),
    ),
  );
  const zip = new File(["PK"], "backup.zip", { type: "application/zip" });
  await expect(importBundle(zip)).rejects.toThrow("already running");
});
