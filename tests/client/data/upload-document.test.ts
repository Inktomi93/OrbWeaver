// data/upload-document — the databank multipart upload POST. Pins the request shape (POST
// `/api/databank/upload`, a `file` (+ optional `name`) FormData body, the CSRF header every mutation
// carries), that the load-bearing half of the response is VALIDATED against `documentViewSchema` rather
// than cast, and that the two server-controlled dispositions (`outcome`/`ingest`/`warning`) survive to the
// caller — the dedup + empty-extraction signals legacy swallowed. `fetch` is stubbed at the global boundary
// (the sanctioned "fake at the edges" seam, the `upload-asset` precedent), never a hand-mock of the helper.

import { uploadDocument } from "@orb/client/data";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const DOCUMENT_ID = mintTypeId(ID_PREFIX.document);

function documentView(): Record<string, unknown> {
  return {
    id: DOCUMENT_ID,
    name: "notes.md",
    mime: "text/markdown",
    origin: "upload",
    sourceUrl: null,
    byteSize: 42,
    charCount: 12,
    chunkCount: 0,
    embeddedCount: 0,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("POSTs a file FormData body with the CSRF header, and parses the returned document", async () => {
  let capturedRequest: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    capturedRequest = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ document: documentView(), outcome: "created", ingest: "queued" }), { status: 200 }));
  });

  const file = new File(["bytes"], "notes.md", { type: "text/markdown" });
  const result = await uploadDocument(file);

  expect(result.document.id).toBe(DOCUMENT_ID);
  expect(result.outcome).toBe("created");
  expect(result.ingest).toBe("queued");
  expect(capturedRequest?.url).toBe("/api/databank/upload");
  expect(capturedRequest?.init.method).toBe("POST");
  const headers = capturedRequest?.init.headers as Record<string, string>;
  expect(headers[CSRF_HEADER]).toBe("1");
  const form = capturedRequest?.init.body as FormData;
  expect((form.get("file") as File).name).toBe("notes.md");
  // No explicit name ⇒ the field is ABSENT, so the server falls back to the uploaded filename.
  expect(form.get("name")).toBeNull();
});

test("an explicit name rides the body; an empty one does not (the server's filename fallback stays reachable)", async () => {
  const bodies: FormData[] = [];
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    bodies.push(init.body as FormData);
    return Promise.resolve(new Response(JSON.stringify({ document: documentView(), outcome: "created", ingest: "queued" }), { status: 200 }));
  });

  const file = new File(["bytes"], "notes.md", { type: "text/markdown" });
  await uploadDocument(file, "House Valeroth");
  await uploadDocument(file, "");

  expect(bodies[0]?.get("name")).toBe("House Valeroth");
  expect(bodies[1]?.get("name")).toBeNull();
});

test("the dedup + empty-extraction dispositions reach the caller — the signals legacy swallowed", async () => {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify({ document: documentView(), outcome: "duplicate", ingest: "skipped", warning: "empty-extraction" }), { status: 200 }),
    ),
  );

  const result = await uploadDocument(new File(["bytes"], "notes.md", { type: "text/markdown" }));

  expect(result.outcome).toBe("duplicate");
  expect(result.ingest).toBe("skipped");
  expect(result.warning).toBe("empty-extraction");
});

test("a MALFORMED document is a throw, not a silent cast — the boundary validates", async () => {
  // `origin: "carrier-pigeon"` is not on the DOC_ORIGINS axis: a bare cast would have handed the surface a
  // document whose derived phase/label lookups silently resolve to undefined.
  vi.stubGlobal("fetch", () =>
    Promise.resolve(Response.json({ document: { ...documentView(), origin: "carrier-pigeon" }, outcome: "created", ingest: "queued" })),
  );

  await expect(uploadDocument(new File(["bytes"], "notes.md", { type: "text/markdown" }))).rejects.toThrow();
});

test("throws on a non-OK response", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ error: "too large" }), { status: 413 })));

  await expect(uploadDocument(new File(["bytes"], "huge.pdf", { type: "application/pdf" }))).rejects.toThrow();
});
