// data/import-characters — the character-card import POST helper. Pins: the request shape (POST
// `/api/import`, a repeated `file` FormData body, the CSRF header every mutation carries) and that a
// non-OK response throws. `fetch` is stubbed at the global boundary (the `uploadAsset.test.ts` precedent
// — "fake at the edges"), never a hand-mock of `importCharacters` itself. Successful bodies are parsed
// through the canonical import schema; malformed 200 responses must not reach the result summary.

import { CSRF_HEADER } from "@orb/contracts/identity";
// Deep import the PURE module (NOT the "@orb/client/data" barrel): a barrel import drags browser TSX into
// the dom-less root typecheck:graph program (a dom-lib landmine by construction — the 2026-06-28 incident).
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { afterEach, vi } from "vitest";
import { importCharacters } from "../../../packages/client/src/data/import-characters.ts";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("POSTs every file under the repeated `file` field with the CSRF header", async () => {
  let capturedRequest: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    capturedRequest = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ imported: [], failed: [] }), { status: 200 }));
  });

  const png = new File(["bytes"], "elara.png", { type: "image/png" });
  const json = new File(["{}"], "kai.json", { type: "application/json" });
  await importCharacters([png, json]);

  expect(capturedRequest?.url).toBe("/api/import");
  expect(capturedRequest?.init.method).toBe("POST");
  const headers = capturedRequest?.init.headers as Record<string, string>;
  expect(headers[CSRF_HEADER]).toBe("1");
  const form = capturedRequest?.init.body as FormData;
  const files = form.getAll("file") as File[];
  expect(files.map((f) => f.name)).toEqual(["elara.png", "kai.json"]);
});

test("throws on a non-OK response", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 415, statusText: "Unsupported Media Type" })));
  const file = new File(["bytes"], "bad.txt", { type: "text/plain" });
  await expect(importCharacters([file])).rejects.toThrow("415");
});

const imported = {
  filename: "elara.png",
  characterId: mintTypeId(ID_PREFIX.character),
  created: true,
  importHash: "card-wire-hash",
  notes: ["Primary book kept"],
};

test("a valid partial batch preserves canonical IDs, hashes, per-card notes and isolated failures", async () => {
  const body = { imported: [imported, { ...imported, created: false, notes: [] }], failed: [{ filename: "bad.png", error: "Unreadable card" }] };
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
  expect(await importCharacters([])).toEqual(body);
});

test("an older card result may omit notes without inventing a note or losing its identity", async () => {
  const { notes: _notes, ...card } = imported;
  const body = { imported: [card], failed: [] };
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
  expect(await importCharacters([])).toEqual(body);
});

for (const body of [
  { imported: 2, failed: [] },
  { imported: [{ ...imported, characterId: "not-a-character-id" }], failed: [] },
  { imported: [{ ...imported, importHash: undefined }], failed: [] },
  { imported: [{ ...imported, notes: [42] }], failed: [] },
  { imported: [], failed: [{ filename: "bad.png", error: 42 }] },
]) {
  test(`malformed successful card import is refused: ${JSON.stringify(body)}`, async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
    await expect(importCharacters([])).rejects.toThrow();
  });
}
