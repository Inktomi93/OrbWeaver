// Mirror int-test for domain/persona/persistence/joiner — the sign-up joiner's persona statement over a real db.
// It runs inside chat's signup batch, so the case that matters is the gate: it inserts only after a statement that
// changed a row, and a batch whose earlier step wrote nothing leaves no persona.

import type { Db } from "@orb/db";
import { personas, users } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { insertJoinerPersonaStatement } from "../../../../../packages/server/src/domain/persona/persistence/joiner.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;
const PERSONA_ID = castId<PersonaId>("persona_joiner_statement");
const PERSONA = { name: "Mira", description: "A cartographer." } as const;

let db: Db;
let owner: UserId;

beforeEach(async () => {
  db = await freshDb();
  owner = (await seedUser(db)).id;
});

// A step that changes the owner's row, or one that changes nothing: what the claim before it does in the real batch.
function precedingWrite(changes: boolean): BatchStmt {
  return db
    .update(users)
    .set({ updatedAt: AT })
    .where(changes ? eq(users.id, owner) : sql`0 = 1`);
}

describe("persistence/joiner — insertJoinerPersonaStatement", () => {
  test("after a step that changed a row, it inserts the named persona for the owner and returns its id", async () => {
    const statement = insertJoinerPersonaStatement(db, { id: PERSONA_ID, ownerId: owner, persona: PERSONA, at: AT });
    const results = await db.batch(batchMany([precedingWrite(true), statement]));
    expect(results[1]).toEqual([{ id: PERSONA_ID }]);
    const rows = await db.select().from(personas).where(eq(personas.ownerId, owner));
    expect(rows).toEqual([
      expect.objectContaining({
        id: PERSONA_ID,
        name: PERSONA.name,
        description: PERSONA.description,
        title: null,
        starred: false,
        avatarAssetId: null,
        metadata: null,
        createdAt: AT,
        updatedAt: AT,
      }),
    ]);
  });

  test("after a step that changed nothing, it inserts nothing", async () => {
    const statement = insertJoinerPersonaStatement(db, { id: PERSONA_ID, ownerId: owner, persona: PERSONA, at: AT });
    const results = await db.batch(batchMany([precedingWrite(false), statement]));
    expect(results[1]).toEqual([]);
    expect(await db.select().from(personas).where(eq(personas.ownerId, owner))).toEqual([]);
  });
});
