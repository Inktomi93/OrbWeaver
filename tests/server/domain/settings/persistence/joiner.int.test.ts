// Mirror int-test for domain/settings/persistence/joiner — the sign-up joiner's first settings row as one statement in
// chat's signup batch. The cases that matter are the gate and what the row reads back as: the shipped defaults at the
// current schema version, with both persona pointers aimed at the joiner's persona.

import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { userSettings, users } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { insertJoinerSettingsStatement } from "../../../../../packages/server/src/domain/settings/persistence/joiner.ts";
import { readUserSettings } from "../../../../../packages/server/src/domain/settings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;
const PERSONA_ID = castId<PersonaId>("persona_joiner_pointers");

let db: Db;
let owner: UserId;

beforeEach(async () => {
  db = await freshDb();
  owner = (await seedUser(db)).id;
});

// The persona insert before it in the real batch: a step that changed a row, or one that changed nothing.
function precedingWrite(changes: boolean): BatchStmt {
  return db
    .update(users)
    .set({ updatedAt: AT })
    .where(changes ? eq(users.id, owner) : sql`0 = 1`);
}

describe("persistence/joiner — insertJoinerSettingsStatement", () => {
  test("after a step that changed a row, the account reads back the defaults with both pointers on the joiner's persona", async () => {
    const statement = insertJoinerSettingsStatement(db, { ownerId: owner, personaId: PERSONA_ID, at: AT });
    const results = await db.batch(batchMany([precedingWrite(true), statement]));
    expect(results[1]).toEqual([{ userId: owner }]);

    const [row] = await db.select({ schemaVersion: userSettings.schemaVersion }).from(userSettings).where(eq(userSettings.userId, owner));
    expect(row?.schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);
    const { config } = await readUserSettings(db, owner);
    expect(config).toEqual({
      ...DEFAULT_USER_SETTINGS,
      seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: PERSONA_ID, defaultPersonaId: PERSONA_ID },
    });
  });

  test("after a step that changed nothing, it writes no settings row", async () => {
    const statement = insertJoinerSettingsStatement(db, { ownerId: owner, personaId: PERSONA_ID, at: AT });
    const results = await db.batch(batchMany([precedingWrite(false), statement]));
    expect(results[1]).toEqual([]);
    expect(await db.select().from(userSettings).where(eq(userSettings.userId, owner))).toEqual([]);
  });
});
