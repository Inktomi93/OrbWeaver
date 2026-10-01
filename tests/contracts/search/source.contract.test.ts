import { corpusSourceSchema, messageWindowTargetSchema } from "@orb/contracts/search";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const SEGMENT = {
  kind: "segment",
  rowId: mintTypeId(ID_PREFIX.chatSegment),
  chatId: mintTypeId(ID_PREFIX.chat),
  generationId: "a".repeat(64),
  fingerprint: null,
  contentHash: "selected-content",
  blockIdx: 2,
  chunkIdx: 1,
  seqStart: null,
  seqEnd: null,
  messageStartId: null,
  messageEndId: null,
};

test("legacy missing span or fingerprint remains an explicit unresolved source", () => {
  expect(messageWindowTargetSchema.parse({ kind: "source", source: SEGMENT })).toMatchObject({
    source: { fingerprint: null, seqStart: null, messageStartId: null },
  });
});

test("source row kinds, generation identity and stable message ids validate on the wire", () => {
  expect(corpusSourceSchema.safeParse({ ...SEGMENT, rowId: mintTypeId(ID_PREFIX.chatDigest) }).success).toBe(false);
  expect(corpusSourceSchema.safeParse({ ...SEGMENT, generationId: "model-name" }).success).toBe(false);
  expect(corpusSourceSchema.safeParse({ ...SEGMENT, messageStartId: mintTypeId(ID_PREFIX.chat) }).success).toBe(false);
  expect(corpusSourceSchema.safeParse({ ...SEGMENT, chunkIdx: -1 }).success).toBe(false);
});
