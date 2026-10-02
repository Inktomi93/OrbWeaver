import { messagesPageSchema, messageWindowSchema } from "@orb/contracts/chat";
import { CORPUS_SOURCE_OUTCOMES } from "@orb/contracts/search";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

test("empty canon pages remain readable without admitting service-only fields", () => {
  const page = { messages: [], identities: [] };
  expect(messagesPageSchema.parse(page)).toEqual(page);
  expect(messagesPageSchema.safeParse({ ...page, ownerCredential: "private" }).success).toBe(false);
});

test("source-resolution windows retain stable endpoints and reject non-message identities", () => {
  const endpoint = mintTypeId(ID_PREFIX.message);
  for (const outcome of CORPUS_SOURCE_OUTCOMES) {
    const window = {
      messages: [],
      identities: [],
      outcome,
      anchorMessageId: endpoint,
      anchorSeq: 3,
      endSeq: 7,
      endMessageId: endpoint,
      hasBefore: true,
      hasAfter: false,
    };
    expect(messageWindowSchema.parse(window)).toEqual(window);
    expect(messageWindowSchema.safeParse({ ...window, endMessageId: mintTypeId(ID_PREFIX.chat) }).success).toBe(false);
    expect(messageWindowSchema.safeParse({ ...window, privateCursor: "private" }).success).toBe(false);
  }
});
