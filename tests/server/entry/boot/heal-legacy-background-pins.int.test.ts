// entry/boot/heal-legacy-background-pins — the boot STEP for the #1600 legacy-background-pin heal, against a
// real libSQL db (the .int lane). The heal's own semantics (which fields it clears, unreadable-row skip,
// no-op when nothing is stale) are pinned at the persistence mirror,
// tests/server/domain/settings/persistence/heal-legacy-background-pins.int.test.ts; this file pins only what
// the boot door adds — that it reaches the persistence statement and hands back its count — so a
// compose-time rewire that stops calling it goes red here rather than silently leaving every affected
// account's settings unwritable.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { assets, userSettings } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { healLegacyBackgroundPinsOnBoot } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedUser } from "../../domain/settings/_support.ts";

const AT = 1_700_000_000_000;

test("the boot step reaches the persistence heal, reports its count, and is a no-op on the next boot", async () => {
  const db = await freshDb();
  const u = await seedUser(db, { id: "user_bootheal" });
  const staleId = mintTypeId(ID_PREFIX.asset);
  await db.insert(assets).values({ id: staleId, ownerId: u, kind: "card", mime: "image/png", size: 1, hash: "h", uploadedAt: AT });
  await db.insert(userSettings).values({
    userId: u,
    schemaVersion: DEFAULT_USER_SETTINGS.schemaVersion,
    config: {
      ...DEFAULT_USER_SETTINGS,
      appearance: { ...DEFAULT_USER_SETTINGS.appearance, backgroundImageKind: "asset", backgroundAssetId: staleId, backgroundAssetHash: "h" },
    },
    updatedAt: AT,
  });

  expect(await healLegacyBackgroundPinsOnBoot({ db })).toBe(1);
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, u));
  expect(row?.config.appearance.backgroundImageKind).toBe("none");

  // The second boot matches nothing: the predicate, not a marker, is what makes it idempotent.
  expect(await healLegacyBackgroundPinsOnBoot({ db })).toBe(0);
});
