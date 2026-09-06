// data/restore-card-lorebook — the #1598 explicit RESTORE-embedded-book POST helper. Pins: the request
// shape (POST `/api/import/restore-card-lorebook`, ONE `file` FormData entry, the CSRF header every
// mutation carries), that the route's OWN 400 refusal body is read as DATA (never thrown — the server's
// `{ok:false, error}` for "this card doesn't match anything of yours"), and that a whole-request rejection
// (a status the route never uses for its own refusal) throws. `fetch` is stubbed at the global boundary
// (the `import-characters.test.ts` precedent — "fake at the edges").

import { CSRF_HEADER } from "@orb/contracts/identity";
import { afterEach, vi } from "vitest";
// Deep import the PURE module (NOT the "@orb/client/data" barrel): a barrel import drags browser TSX into
// the dom-less root typecheck:graph program (the 2026-06-28 dom-lib incident).
import { restoreCardLorebook } from "../../../packages/client/src/data/restore-card-lorebook.ts";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("POSTs the ONE file under the `file` field with the CSRF header", async () => {
  let capturedRequest: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    capturedRequest = { url, init };
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, characterId: "chr_1", worldBookId: "wb_1", entryCount: 3, replaced: true }), { status: 200 }),
    );
  });

  const file = new File(["bytes"], "Aria.png", { type: "image/png" });
  await restoreCardLorebook(file);

  expect(capturedRequest?.url).toBe("/api/import/restore-card-lorebook");
  expect(capturedRequest?.init.method).toBe("POST");
  const headers = capturedRequest?.init.headers as Record<string, string>;
  expect(headers[CSRF_HEADER]).toBe("1");
  const form = capturedRequest?.init.body as FormData;
  const files = form.getAll("file") as File[];
  expect(files.map((f) => f.name)).toEqual(["Aria.png"]);
});

test("a real verb refusal (400, a real JSON body) reads as DATA — never thrown", async () => {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(new Response(JSON.stringify({ ok: false, error: "No character of yours was imported from this exact card file." }), { status: 400 })),
  );
  const file = new File(["bytes"], "unmatched.json", { type: "application/json" });

  const result = await restoreCardLorebook(file);

  expect(result).toEqual({ ok: false, error: "No character of yours was imported from this exact card file." });
});

test("a whole-request rejection (401 — no route body of its own) THROWS", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 401 })));
  const file = new File(["bytes"], "Aria.png", { type: "image/png" });

  await expect(restoreCardLorebook(file)).rejects.toThrow("401");
});
