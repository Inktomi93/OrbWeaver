import { inviteRoomSentence } from "@orb/client/lib";
import { invitePreviewSchema } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("invite wording respects a withheld host and an unnamed room without losing member counts", () => {
  const hostHandle = invitePreviewSchema.shape.hostHandle.parse("alex");
  expect(inviteRoomSentence({ hostHandle, roomName: "Atrium", memberCount: 2 })).toBe("Invited by alex to Atrium (2 members).");
  expect(inviteRoomSentence({ roomName: "", memberCount: 1 })).toBe("You're invited to a room (1 member).");
  expect(inviteRoomSentence({ roomName: "Atrium", memberCount: 0 })).toBe("You're invited to Atrium (0 members).");
});
