// The seeded-background rewrite runs on every touch of a user, over that user's raw settings JSON. A settings row whose
// stored text is not JSON is passed by: the rewrite counts nothing, leaves the bytes, and the read reports the row
// unreadable so its reset door is offered.
// @subject packages/server/src/domain/settings/persistence/migrate-seeded-background-picks.ts
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { userSettings } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { migrateSeededCardBackgrounds } from "@orb/server/domain/character";
import { migrateSeededRoomBackgrounds } from "@orb/server/domain/chat";
import { createSeedBackgroundRewriter } from "@orb/server/domain/settings";
import { expect, test } from "@orb/testkit/node";
import { plantForeignSettingsBytes } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

// A truncated write of a seeded pick: no JSON parser reads it.
const NOT_JSON = '{"appearance": {"background": {"kind": "seeded", "sl';

test("the seeded-background rewrite passes a settings row that is not JSON by and leaves its bytes", async ({ harness, clock }) => {
  const principal = await harness.principalFor(harness.ownerId);
  await harness.services.settings.updateUserSettingsSection({ principal, input: { section: "profile", patch: { flankCollapsed: true } } });
  await plantForeignSettingsBytes(harness, harness.ownerId, NOT_JSON);
  const handle = databaseHandle(harness.db);
  const rewrite = createSeedBackgroundRewriter({
    db: handle,
    now: () => clock.now(),
    migrateCards: (userId, resolve, at) => migrateSeededCardBackgrounds(handle, userId, resolve, at),
    migrateRooms: (userId, resolve, at) => migrateSeededRoomBackgrounds(handle, userId, resolve, at),
  });

  expect(await rewrite(harness.ownerId, async () => null)).toBe(0);
  expect(
    await harness.db
      .select({ text: sql<string>`${userSettings.config}` })
      .from(userSettings)
      .where(eq(userSettings.userId, harness.ownerId)),
  ).toEqual([{ text: NOT_JSON }]);
  expect((await harness.services.settings.getUserSettings({ principal })).configUnreadable).toBe(VERSIONED_PARSE_FAILURES.notJson);
});
