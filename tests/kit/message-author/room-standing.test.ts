// A room's standing holds only its present human seats: a seat that has left and a seat with no user hold none, so a
// standing-scoped regex script reads the room as it is now. Both the display pass and the prompt build read it.
// @subject packages/kit/src/message-author/index.ts

import { createIdSource } from "@orb/kit/ids";
import { roomStandingOf, standingOf } from "@orb/kit/message-author";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const users = createIdSource(createSeededIds().next);
const LEFT_AT_SEQ = 12;

test("a seat that has left and a seat with no user hold no standing; the present seats keep theirs", () => {
  const host = users.userId();
  const member = users.userId();
  const departed = users.userId();
  const room = roomStandingOf([
    { userId: host, leftSeq: null, role: "host" },
    { userId: member, leftSeq: null, role: "member" },
    { userId: departed, leftSeq: LEFT_AT_SEQ, role: "member" },
    { userId: null, leftSeq: null, role: "member" },
  ]);

  expect(room.seatedRoles).toEqual({ [host]: "host", [member]: "member" });
  expect([host, member, departed].map((authorUserId) => standingOf({ authorUserId }, room))).toEqual(["host", "member", null]);
});
