import { DomainNotFoundError, notFoundIdRef } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const chatId = mintTypeId(ID_PREFIX.chat, createSeededIds().next);

test("the error carries what was not found as data, whatever form the ref takes", () => {
  expect(new DomainNotFoundError({ kind: "chat", id: chatId }).ref).toEqual({ kind: "chat", id: chatId });
  expect(new DomainNotFoundError({ kind: "tool", key: "roll_dice" }).ref).toEqual({ kind: "tool", key: "roll_dice" });
  expect(new DomainNotFoundError({ kind: "imported message", index: 3 }).ref).toEqual({ kind: "imported message", index: 3 });
  expect(new DomainNotFoundError(notFoundIdRef("chat", chatId)).ref).toEqual({ kind: "chat", id: chatId });
});

test("a bare ref names nothing, so a missing invite and a missing workload funder keep no id", () => {
  expect(new DomainNotFoundError({ kind: "invite" }).ref).toEqual({ kind: "invite" });
  expect(new DomainNotFoundError({ kind: "workload admission" }).ref).toEqual({ kind: "workload admission" });
});
