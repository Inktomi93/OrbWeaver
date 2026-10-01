import {
  continuedSignatureMetadata,
  replayTextSignatures,
  signaturesForContent,
} from "../../../../../packages/server/src/domain/chat/substrate/content-signatures.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("an unsigned prefix and signed continuation reconstruct only the exact canonical body", () => {
  const metadata = continuedSignatureMetadata({
    beforeContent: "Prefix",
    additionContent: " suffix",
    before: {},
    addition: { contentSignatures: { content: " suffix", text: [{ text: " suffix", thoughtSignature: "signed" }], images: [] } },
  });
  const signatures = signaturesForContent(metadata?.contentSignatures, "Prefix suffix");
  expect(replayTextSignatures([{ type: "text", text: "Prefix suffix" }], signatures)).toEqual([
    { type: "text", text: "Prefix" },
    { type: "text", text: " suffix", thoughtSignature: "signed" },
  ]);
  expect(signaturesForContent(metadata?.contentSignatures, "Edited Prefix suffix")).toBeUndefined();
  expect(signaturesForContent(metadata?.contentSignatures, "Prefix")?.text).toEqual([{ text: "Prefix" }]);
});

test("a second continuation after undo retains only the active prefix and bounds the previous snapshot", () => {
  const first = continuedSignatureMetadata({
    beforeContent: "A",
    additionContent: "B",
    before: { contentSignatures: { content: "A", text: [{ text: "A", thoughtSignature: "a" }], images: [] } },
    addition: { contentSignatures: { content: "B", text: [{ text: "B", thoughtSignature: "b" }], images: [] } },
  });
  const second = continuedSignatureMetadata({
    beforeContent: "A",
    additionContent: "C",
    before: first ?? {},
    addition: { contentSignatures: { content: "C", text: [{ text: "C", thoughtSignature: "c" }], images: [] } },
  });
  expect(second?.contentSignatures?.text).toEqual([
    { text: "A", thoughtSignature: "a" },
    { text: "C", thoughtSignature: "c" },
  ]);
  expect(second?.contentSignatures?.previous).not.toHaveProperty("previous");
  expect(signaturesForContent(second?.contentSignatures, "AB")).toBeUndefined();
});
