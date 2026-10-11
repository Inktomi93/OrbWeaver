// verb: reviewImport — the read-only list of incoming personas the profile import would split. It must agree
// with the bulk write: equal content is reused (never listed), a same-name, different-content persona is
// listed once per name, and nothing is written.

import { personas } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPersonaService } from "@orb/server/domain/persona";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedPersona } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

function incoming(name: string, description: string): { name: string; description: string; metadata: null; artHash: null } {
  return { name, description, metadata: null, artHash: null };
}

describe("reviewImport", () => {
  test("lists a same-name, different-content persona once; skips equal content and unknown names; writes nothing", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedPersona(db, { ownerId: owner, name: "Nate", description: "orb Nate" });
    await seedPersona(db, { ownerId: owner, name: "Eve", description: "same Eve" });

    const collisions = await svc.reviewImport({
      principal: principal(owner),
      incoming: [incoming("NATE ", "ST Nate"), incoming("Nate", "another ST Nate"), incoming("Eve", "same Eve"), incoming("Robin", "new")],
    });

    expect(collisions).toEqual([{ key: "nate", name: "NATE ", existingDescription: "orb Nate", incomingDescription: "ST Nate" }]);
    expect(await db.select().from(personas).where(eq(personas.ownerId, owner))).toHaveLength(2);
  });

  test("never lists another owner's persona", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    await seedPersona(db, { ownerId: stranger, name: "Nate", description: "theirs" });

    expect(await svc.reviewImport({ principal: principal(owner), incoming: [incoming("Nate", "mine")] })).toEqual([]);
  });
});
