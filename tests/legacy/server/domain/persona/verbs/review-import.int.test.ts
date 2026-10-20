// verb: reviewImport — the read-only list of incoming personas the profile import would split. It must agree
// with the bulk write: equal content is reused (never listed), a same-name, different-content persona is
// listed once per name, and nothing is written.
// @subject packages/server/src/domain/persona/verbs/review-import.ts

import { personas } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { seedPersona } from "@orb/testkit/node/factories/index.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { createPersonaService } from "#server/domain/persona/index.ts";
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
      principal: await principal(db, owner),
      incoming: [incoming("NATE ", "ST Nate"), incoming("Nate", "another ST Nate"), incoming("Eve", "same Eve"), incoming("Robin", "new")],
    });

    expect(collisions).toEqual([
      { key: "nate", name: "NATE ", existingDescription: "orb Nate", incomingDescription: "ST Nate", differs: ["description"], keepBothName: "NATE 2" },
    ]);
    expect(await db.select().from(personas).where(eq(personas.ownerId, owner))).toHaveLength(2);
  });

  test("says what differs, not just that something does: an art-only difference carries the avatar and not the description", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedPersona(db, { ownerId: owner, name: "Tamsin", description: "a tavern singer" });

    const collisions = await svc.reviewImport({
      principal: await principal(db, owner),
      incoming: [{ name: "Tamsin", description: "a tavern singer", metadata: null, artHash: "hash-of-new-art" }],
    });

    expect(collisions.map((c) => c.differs)).toEqual([["avatar"]]);
  });

  test("keepBothName is the name keep-both would really mint: the next free one", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedPersona(db, { ownerId: owner, name: "Nate", description: "one" });
    await seedPersona(db, { ownerId: owner, name: "Nate 2", description: "two" });

    const collisions = await svc.reviewImport({ principal: await principal(db, owner), incoming: [incoming("Nate", "three")] });

    expect(collisions.map((c) => c.keepBothName)).toEqual(["Nate 3"]);
  });

  test("lists every collision the default (merge) write would resolve, including one a keep-both copy would have hidden", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedPersona(db, { ownerId: owner, name: "Nate", description: "A" });
    await seedPersona(db, { ownerId: owner, name: "Nate 2", description: "B" });

    const collisions = await svc.reviewImport({ principal: await principal(db, owner), incoming: [incoming("Nate", "Y"), incoming("Nate 2", "Y")] });

    expect(collisions.map((c) => c.key)).toEqual(["nate", "nate 2"]);
  });

  test("keepBothName avoids a case-differing twin and does not depend on the other collisions' answers", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedPersona(db, { ownerId: owner, name: "Nate", description: "A" });
    await seedPersona(db, { ownerId: owner, name: "Eve", description: "B" });
    await seedPersona(db, { ownerId: owner, name: "eve 2", description: "C" });

    const collisions = await svc.reviewImport({ principal: await principal(db, owner), incoming: [incoming("Nate", "x"), incoming("Eve", "y")] });

    expect(collisions.map((c) => [c.key, c.keepBothName])).toEqual([
      ["nate", "Nate 2"],
      ["eve", "Eve 3"],
    ]);
  });

  test("keepBothName counts a folder persona the write adds whatever the owner picks, so the preview is the written name", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedPersona(db, { ownerId: owner, name: "Nate", description: "A" });

    // "Nate 2" clashes with nothing owned, so the write adds it first; the copy of "Nate" is then "Nate 3".
    const collisions = await svc.reviewImport({ principal: await principal(db, owner), incoming: [incoming("Nate 2", "new"), incoming("Nate", "B")] });

    expect(collisions.map((c) => [c.key, c.keepBothName])).toEqual([["nate", "Nate 3"]]);
  });

  test("a folder persona that only exists under keep-both does not move a later preview", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedPersona(db, { ownerId: owner, name: "Nate", description: "A" });
    await seedPersona(db, { ownerId: owner, name: "Eve", description: "B" });

    const collisions = await svc.reviewImport({ principal: await principal(db, owner), incoming: [incoming("Eve", "x"), incoming("Nate", "y")] });

    expect(collisions.map((c) => [c.key, c.keepBothName])).toEqual([
      ["eve", "Eve 2"],
      ["nate", "Nate 2"],
    ]);
  });

  test("never lists another owner's persona", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    await seedPersona(db, { ownerId: stranger, name: "Nate", description: "theirs" });

    expect(await svc.reviewImport({ principal: await principal(db, owner), incoming: [incoming("Nate", "mine")] })).toEqual([]);
  });
});
