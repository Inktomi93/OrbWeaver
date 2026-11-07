// The send witness refuses every row the send did not create.
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { newReplyRow, newUserRow } from "./turn-witness.ts";

const LINE = "The same synthetic line.";

test("a retained matching row with no send is no witness; a new exact row is", ({ ids }) => {
  const retained = { id: ids.typeId(ID_PREFIX.message), seq: 2, role: "user", content: LINE } as const;
  const sent = { id: ids.typeId(ID_PREFIX.message), seq: 4, role: "user", content: LINE } as const;
  expect(newUserRow([retained], [retained], LINE)).toBeUndefined();
  expect(newUserRow([retained], [retained, sent], LINE)).toBe(sent.id);
});

test("a new user row must carry the exact content, once", ({ ids }) => {
  const longer = { id: ids.typeId(ID_PREFIX.message), seq: 1, role: "user", content: `${LINE} And more.` } as const;
  const first = { id: ids.typeId(ID_PREFIX.message), seq: 2, role: "user", content: LINE } as const;
  const doubled = { id: ids.typeId(ID_PREFIX.message), seq: 3, role: "user", content: LINE } as const;
  expect(newUserRow([], [longer], LINE)).toBeUndefined();
  expect(newUserRow([], [longer, first], LINE)).toBe(first.id);
  expect(newUserRow([], [first, doubled], LINE)).toBeUndefined();
});

test("a greeting or an earlier reply cannot stand in for the current reply", ({ ids }) => {
  const greeting = { id: ids.typeId(ID_PREFIX.message), seq: 1, role: "assistant", content: "A seeded greeting." } as const;
  const user = { id: ids.typeId(ID_PREFIX.message), seq: 2, role: "user", content: LINE } as const;
  const reply = { id: ids.typeId(ID_PREFIX.message), seq: 3, role: "assistant", content: "The current reply." } as const;
  expect(newReplyRow([greeting], [greeting, user], user.id)).toBeUndefined();
  expect(newReplyRow([greeting], [greeting, user, reply], user.id)).toBe(reply.id);
});

test("an assistant row before the send's user row, or a blank one, is not its reply", ({ ids }) => {
  const early = { id: ids.typeId(ID_PREFIX.message), seq: 1, role: "assistant", content: "Landed first." } as const;
  const user = { id: ids.typeId(ID_PREFIX.message), seq: 2, role: "user", content: LINE } as const;
  const blank = { id: ids.typeId(ID_PREFIX.message), seq: 3, role: "assistant", content: "  \n" } as const;
  const reply = { id: ids.typeId(ID_PREFIX.message), seq: 4, role: "assistant", content: "The current reply." } as const;
  expect(newReplyRow([], [early, user, blank], user.id)).toBeUndefined();
  expect(newReplyRow([], [early, user, blank, reply], user.id)).toBe(reply.id);
});

test("no reply is read for a user row canon does not hold", ({ ids }) => {
  const reply = { id: ids.typeId(ID_PREFIX.message), seq: 4, role: "assistant", content: "A reply." } as const;
  expect(newReplyRow([], [reply], ids.typeId(ID_PREFIX.message))).toBeUndefined();
});
