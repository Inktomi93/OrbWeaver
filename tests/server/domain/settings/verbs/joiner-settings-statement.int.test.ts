// Mirror int-test for domain/settings/verbs/joiner-settings-statement — the op chat's signup batch calls. The row shape
// and the gate are pinned at the persistence mirror; here, the op writes for the owner and persona it is handed.

import type { Db } from "@orb/db";
import { userSettings, users } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createJoinerSettingsStatement } from "../../../../../packages/server/src/domain/settings/verbs/joiner-settings-statement.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;

let db: Db;
let owner: UserId;

beforeEach(async () => {
  db = await freshDb();
  owner = (await seedUser(db)).id;
  await seedUser(db);
});

describe("verbs/joiner-settings-statement — createJoinerSettingsStatement", () => {
  test("the op writes the settings row of the owner it is handed, aimed at the persona it is handed, beside another account", async () => {
    const personaId = castId<PersonaId>("persona_joiner_op");
    const statement = createJoinerSettingsStatement({ db })({ ownerId: owner, personaId, at: AT });
    await db.batch(batchMany([db.update(users).set({ updatedAt: AT }).where(eq(users.id, owner)), statement]));

    const rows = await db.select({ userId: userSettings.userId, config: userSettings.config }).from(userSettings);
    expect(rows.map((row) => row.userId)).toEqual([owner]);
    expect(rows[0]?.config.seeds).toMatchObject({ currentPersonaId: personaId, defaultPersonaId: personaId });
  });
});
