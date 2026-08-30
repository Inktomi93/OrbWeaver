// substrate/notification-recipients — resolve a NotificationRecipient selector into concrete inbox rows. Pins
// the exhaustive switch's three members: `host` names the host directly (no db read), `all_members` reads the
// present human roster, and `all_members_except_actor` filters the actor out (or keeps everyone when the
// actor is null — a plugin-originated notice with no human actor).

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { resolveNotificationRecipients } from "../../../../../packages/server/src/domain/automation/substrate/notification-recipients.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { ruleFixture, seedUser } from "../_support.ts";

describe("resolveNotificationRecipients", () => {
  test("recipient: 'host' names the host directly, no db read", async () => {
    const fixture = await ruleFixture();
    const hostUserId = castId<UserId>("user_someone_else");
    const recipients = await resolveNotificationRecipients(fixture.db, {
      recipient: "host",
      hostUserId,
      chatId: fixture.chatId,
      actorUserId: null,
    });
    expect(recipients).toEqual([hostUserId]);
  });

  test("recipient: 'all_members' reads every PRESENT HUMAN member", async () => {
    const fixture = await ruleFixture();
    const member = await seedUser(fixture.db, "user_member");
    await seedParticipant(fixture.db, { chatId: fixture.chatId, key: "member", userId: member, role: "member" });
    const recipients = await resolveNotificationRecipients(fixture.db, {
      recipient: "all_members",
      chatId: fixture.chatId,
      hostUserId: fixture.host,
      actorUserId: null,
    });
    expect(recipients.sort()).toEqual([fixture.host, member].sort());
  });

  test("recipient: 'all_members_except_actor' filters the actor out", async () => {
    const fixture = await ruleFixture();
    const member = await seedUser(fixture.db, "user_member");
    await seedParticipant(fixture.db, { chatId: fixture.chatId, key: "member", userId: member, role: "member" });
    const recipients = await resolveNotificationRecipients(fixture.db, {
      recipient: "all_members_except_actor",
      chatId: fixture.chatId,
      hostUserId: fixture.host,
      actorUserId: fixture.host,
    });
    expect(recipients).toEqual([member]);
  });

  test("recipient: 'all_members_except_actor' with a NULL actor (plugin-originated) keeps everyone", async () => {
    const fixture = await ruleFixture();
    const member = await seedUser(fixture.db, "user_member");
    await seedParticipant(fixture.db, { chatId: fixture.chatId, key: "member", userId: member, role: "member" });
    const recipients = await resolveNotificationRecipients(fixture.db, {
      recipient: "all_members_except_actor",
      chatId: fixture.chatId,
      hostUserId: fixture.host,
      actorUserId: null,
    });
    expect(recipients.sort()).toEqual([fixture.host, member].sort());
  });
});
