// @subject packages/server/src/domain/databank/verbs/gather-retrieval.ts
// @subject packages/server/src/domain/search/verbs/documents.ts
// The host's preview names each document passage the databank seated in the turn, with the span of its chunk in the
// document's extracted text, so the span reads the passage back out of the stored document.

import { chunkParamsSchema } from "@orb/contracts/databank";
import { chunkText } from "@orb/kit/chunk";
import { expect, test } from "@orb/testkit/node";
import { attachRoomDocument, documentRoom, embedDocuments } from "../../chat/handoff-attachments-physical.ts";

// Past the whole-file threshold and one paragraph per chunk, so the spans are not simply the whole text.
const PARAGRAPH_CHARS = 2000;
const WORDS = ["lighthouse", "harbour", "cliff"] as const;
const DOCUMENT = {
  name: "Coast log",
  text: WORDS.map((word) => `${word} `.repeat(Math.ceil(PARAGRAPH_CHARS / (word.length + 1))).trim()).join("\n\n"),
} as const;

test("the preview's trace names the document and the chunk spans its retrieved passages came from, and each span reads its passage back", async () => {
  await using h = await documentRoom([]);
  const documentId = await attachRoomDocument(h, h.owner, DOCUMENT);
  await embedDocuments(h, h.owner, [h.owner]);

  const { trace } = await h.root.services.chat.previewAssembly({ signal: new AbortController().signal, principal: h.owner, chatId: h.chatId });
  expect(trace.databankIncluded).toBe(true);
  const passages = trace.databankPassages ?? [];
  expect(passages.length).toBeGreaterThan(1);

  // The spans are the chunker's own partition of the stored text, and each one reads back exactly its chunk.
  const stored = await h.root.services.databank.get({ principal: h.owner, signal: new AbortController().signal, id: documentId, includeText: true });
  const text = stored.extractedText ?? "";
  expect(text).toBe(DOCUMENT.text);
  const chunks = chunkText(text, chunkParamsSchema.parse({}));
  expect(chunks.length).toBeGreaterThan(1);
  const chunkSpans = chunks.map(({ start, end }) => ({ charStart: start, charEnd: end }));
  for (const passage of passages) {
    expect(passage.documentId).toBe(documentId);
    expect(passage.documentName).toBe(DOCUMENT.name);
    expect(chunkSpans).toContainEqual({ charStart: passage.charStart, charEnd: passage.charEnd });
  }
  expect(passages.some((passage) => passage.charStart > 0)).toBe(true);
});

test("a turn that retrieved nothing names no passage", async () => {
  await using h = await documentRoom([]);
  const { trace } = await h.root.services.chat.previewAssembly({ signal: new AbortController().signal, principal: h.owner, chatId: h.chatId });
  expect(trace.databankIncluded).toBe(false);
  expect(trace.databankPassages).toBeUndefined();
});
