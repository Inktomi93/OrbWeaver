import { DomainNotFoundError, notFoundIdRef } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const chatId = mintTypeId(ID_PREFIX.chat, createSeededIds().next);

test("each ref form words its message from what the ref names", () => {
  expect(new DomainNotFoundError({ kind: "chat", id: chatId }).message).toBe(`chat ${chatId} not found`);
  expect(new DomainNotFoundError({ kind: "tool", key: "roll_dice" }).message).toBe("tool roll_dice not found");
  expect(new DomainNotFoundError({ kind: "imported message", index: 3 }).message).toBe("imported message 3 not found");
  expect(new DomainNotFoundError(notFoundIdRef("chat", chatId)).message).toBe(`chat ${chatId} not found`);
});

test("a bare ref names nothing, so a missing invite and a missing workload funder leak no id", () => {
  expect(new DomainNotFoundError({ kind: "invite" }).message).toBe("invite not found");
  expect(new DomainNotFoundError({ kind: "workload admission" }).message).toBe("workload admission not found");
});
