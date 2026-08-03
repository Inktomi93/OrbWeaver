// infra/extraction/loaders/textlike — the loader-free text/markdown formats (databank-design/04 §2). Decodes
// STRICT UTF-8 (invalid bytes throw — the dispatch wraps that as ExtractionFailedError) and keeps markdown
// syntax verbatim. Normalization is the dispatch's job, so this asserts the raw decode only.

import { loadTextlike } from "../../../../../packages/server/src/infra/extraction/loaders/textlike.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const enc = new TextEncoder();

test("decodes plain UTF-8 text", async () => {
  const out = await loadTextlike(enc.encode("plain text, café"));
  expect(out.text).toBe("plain text, café");
  expect(out.pageCount).toBeUndefined();
  expect(out.title).toBeUndefined();
});

test("keeps markdown syntax verbatim (no md→plaintext rendering)", async () => {
  const md = "# Heading\n\n- item one\n- item two\n\n**bold** and `code`";
  const out = await loadTextlike(enc.encode(md));
  expect(out.text).toBe(md);
});

test("throws on invalid UTF-8 bytes (strict decode)", () => {
  // 0xFF is never a valid UTF-8 lead byte; the strict decode throws (the dispatch wraps it).
  expect(() => loadTextlike(new Uint8Array([0x68, 0xff, 0x69]))).toThrow();
});
