// data/upload-document — the databank multipart upload POST. Pins the request shape (POST
// `/api/databank/upload`, a `file` (+ optional `name`) FormData body, the CSRF header every mutation
// carries), that the load-bearing half of the response is VALIDATED against `documentViewSchema` rather
// than cast, and that the server-controlled dispositions (`outcome`/`ingest`/`warning`) both survive to the
// caller — the dedup + empty-extraction signals legacy swallowed — and are CHECKED against their own closed
// vocabularies rather than asserted (#1488). `fetch` is stubbed at the global boundary
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

// A 2xx says the UPLOAD succeeded; it says nothing about the body being the shape the route promised. These
// three fields used to ride a type ASSERTION straight off the parsed JSON, so a version skew or a proxy's own
// JSON would have driven the caller's created-vs-duplicate UI off a value nothing checked. The `document` half
// was always parsed — this is the other half of the same boundary.
test("an UNKNOWN disposition on a 200 is a throw, and the message names the field", async () => {
  const file = new File(["bytes"], "notes.md", { type: "text/markdown" });

  vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ document: documentView(), outcome: "perhaps", ingest: "queued" })));
  await expect(uploadDocument(file)).rejects.toThrow(/"outcome"/u);

  vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ document: documentView(), outcome: "created", ingest: 7 })));
  await expect(uploadDocument(file)).rejects.toThrow(/"ingest"/u);

  // An ABSENT warning stays absent (the optional's own arm) — only a PRESENT unknown one is a refusal.
  vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ document: documentView(), outcome: "created", ingest: "queued", warning: "on-fire" })));
  await expect(uploadDocument(file)).rejects.toThrow(/"warning"/u);
});

test("throws on a non-OK response", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ error: "too large" }), { status: 413 })));

  await expect(uploadDocument(new File(["bytes"], "huge.pdf", { type: "application/pdf" }))).rejects.toThrow();
});

test("explicit ingestion consent rides the multipart body and a saved-but-not-indexed response is preserved", async () => {
  const bodies: FormData[] = [];
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    bodies.push(init.body as FormData);
    return Promise.resolve(Response.json({ document: documentView(), outcome: "created", ingest: "not-queued" }));
  });
  const file = new File(["bytes"], "notes.md", { type: "text/markdown" });
  expect((await uploadDocument(file, undefined, { kind: "global" })).ingest).toBe("not-queued");
  expect(bodies[0]?.get("destination")).toBe('{"kind":"global"}');
});
