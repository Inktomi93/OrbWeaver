// Mirror int-test for domain/persona/verbs/joiner-persona-statement — the op chat's signup batch calls. The op mints the
// persona id before the statement runs, because the seat later in that batch names the persona first; the id it hands
// back must be the id the statement writes, and every call mints its own.

import type { Db } from "@orb/db";
import { personas, users } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createJoinerPersonaStatement } from "../../../../../packages/server/src/domain/persona/verbs/joiner-persona-statement.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const AT = 1_700_000_000_000;
const MINTED = [castId<PersonaId>("persona_joiner_a"), castId<PersonaId>("persona_joiner_b")] as const;

let db: Db;
let owner: UserId;
let minted: PersonaId[];

beforeEach(async () => {
  db = await freshDb();
  owner = (await seedUser(db)).id;
  minted = [...MINTED];
});

function newPersonaId(): PersonaId {
  const next = minted.shift();
  if (next === undefined) {
    throw new Error("the test minted more persona ids than it planned");
  }
  return next;
}

// The claim before the persona in the real batch changes a row; this stands in for it.
function ownerTouch(): BatchStmt {
  return db.update(users).set({ updatedAt: AT }).where(eq(users.id, owner));
}

describe("verbs/joiner-persona-statement — createJoinerPersonaStatement", () => {
  test("the id it returns is the id the statement writes, owned by the joiner", async () => {
    const op = createJoinerPersonaStatement({ db, newPersonaId });
    const { personaId, statement } = op({ ownerId: owner, persona: { name: "Mira", description: "" }, at: AT });

    expect(personaId).toBe(MINTED[0]);
    await db.batch(batchMany([ownerTouch(), statement]));
    const rows = await db.select({ id: personas.id, ownerId: personas.ownerId, name: personas.name }).from(personas).where(eq(personas.ownerId, owner));
    expect(rows).toEqual([{ id: personaId, ownerId: owner, name: "Mira" }]);
  });

  test("each call mints its own id, so two joiners never share a persona", () => {
    const op = createJoinerPersonaStatement({ db, newPersonaId });
    const first = op({ ownerId: owner, persona: { name: "Mira", description: "" }, at: AT });
    const second = op({ ownerId: owner, persona: { name: "Oren", description: "" }, at: AT });
    expect([first.personaId, second.personaId]).toEqual([...MINTED]);
  });
});
