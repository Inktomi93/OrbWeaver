// The one invite preview assembly: room name, host handle, member count and mode label only. The fake roster
// resolver derives a handle from the user id.

import { GROUP_OUTPUT_LABELS, GROUP_POLICIES, GROUP_POLICY_LABELS } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach } from "vitest";
import { createInvitePreview, guestModeSentence } from "../../../../../packages/server/src/domain/chat/verbs/invite-preview.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeLoadParticipantViews, seedChat, seedParticipant, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

test("assembles exactly the preview fields for a hosted room", async () => {
  const host = await seedUser(db, castId<Handle>("host"));
  const member = await seedUser(db, castId<Handle>("member"));
  const chatId = await seedChat(db, "preview", { title: "The room" });
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  const preview = await createInvitePreview({ db }, { loadParticipantViews: makeLoadParticipantViews(db) })(chatId);
  expect(Object.keys(preview).toSorted()).toEqual(["chatId", "hostHandle", "memberCount", "modeLabel", "roomName"]);
  expect(preview).toMatchObject({ chatId, roomName: "The room", hostHandle: host, memberCount: 2 });
});

test("a room that is gone reads as the same NOT_FOUND an invalid token gives", async () => {
  await expect(createInvitePreview({ db }, { loadParticipantViews: makeLoadParticipantViews(db) })(castId<ChatId>("chat_gone"))).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
});

// The invitee is a guest: no output or policy the room can have shows them the host's setting names for it.
test("the guest mode sentence never carries the host's Group-tab vocabulary", () => {
  const hostWords = [...Object.values(GROUP_OUTPUT_LABELS), ...Object.values(GROUP_POLICY_LABELS)].map((word) => word.toLowerCase());
  for (const output of ["per-speaker", "narrator"] as const) {
    for (const policy of GROUP_POLICIES) {
      const sentence = guestModeSentence({ output, policy }).toLowerCase();
      expect(
        hostWords.filter((word) => sentence.includes(word)),
        `${output} × ${policy}`,
      ).toEqual([]);
    }
  }
});
