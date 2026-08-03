// data/import-chats — the chat-transcript import POST helper. Pins: the request shape (POST
// `/api/import/chat`, a repeated `file` FormData body, the CSRF header every mutation carries), that the
// REAL per-file body is handed back (the caller's summary derives from it — an all-failed 200 must reach
// the caller as a failure, never be swallowed as success), and that a non-OK response throws. `fetch` is
// stubbed at the global boundary (the `import-characters.test.ts` precedent — "fake at the edges"), never
// a hand-mock of `importChats` itself.

// Deep import the PURE module (NOT the "@orb/client/data" barrel): a barrel import drags browser TSX into
// the dom-less root typecheck:graph program (a dom-lib landmine by construction — the 2026-06-28 incident).
import { CSRF_HEADER } from "@orb/contracts/identity";
import { afterEach, vi } from "vitest";
import { importChats } from "../../../packages/client/src/data/import-chats.ts";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("POSTs every transcript under the repeated `file` field with the CSRF header", async () => {
  let capturedRequest: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    capturedRequest = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ imported: [], failed: [] }), { status: 200 }));
  });

  const first = new File(['{"character_name":"Aria"}\n'], "aria.jsonl", { type: "application/x-ndjson" });
  const second = new File(['{"character_name":"Bee"}\n'], "bee.jsonl", { type: "application/x-ndjson" });
  await importChats([first, second]);

  expect(capturedRequest?.url).toBe("/api/import/chat");
  expect(capturedRequest?.init.method).toBe("POST");
  const headers = capturedRequest?.init.headers as Record<string, string>;
  expect(headers[CSRF_HEADER]).toBe("1");
  const form = capturedRequest?.init.body as FormData;
  const files = form.getAll("file") as File[];
  expect(files.map((f) => f.name)).toEqual(["aria.jsonl", "bee.jsonl"]);
});

test("hands back the REAL per-file outcome — an all-failed 200 is not swallowed as success", async () => {
  const body = {
    imported: [],
    failed: [{ filename: "ghost.jsonl", error: 'no character with handle "ghost" on this account' }],
  };
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));

  const result = await importChats([new File(["{}"], "ghost.jsonl")]);
  expect(result.imported).toHaveLength(0);
  expect(result.failed[0]?.error).toContain("no character with handle");
});

test("throws on a non-OK response (a whole-batch rejection)", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 413, statusText: "Payload Too Large" })));
  await expect(importChats([new File(["{}"], "huge.jsonl")])).rejects.toThrow("413");
});
