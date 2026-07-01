// verb: restore — copy a snapshot blob → the live row in place. Load-bearing: snapshot-current-FIRST (so
// restore is reversible) and character.updated emits. A foreign/absent snapshot collapses to NotFound.

import type { CharacterSnapshotId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("restore", () => {
  test("restores a snapshot blob onto the live row, snapshotting current first, and emits", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "original" },
    });
    const snap = await svc.snapshot({
      principal: principal(owner),
      characterId: created.id,
      label: "v1",
    });
    // edit away from the snapshot
    await svc.update({
      principal: principal(owner),
      characterId: created.id,
      input: { description: "edited" },
    });
    h.events.length = 0;

    const restored = await svc.restore({
      principal: principal(owner),
      characterId: created.id,
      snapshotId: snap.id,
    });

    expect(restored.description).toBe("original");
    expect(h.events).toEqual([{ type: "character.updated", characterId: created.id }]);
    // snapshot-current-first added a second history entry (the pre-restore "edited" card)
    const snaps = await svc.listSnapshots({ principal: principal(owner), characterId: created.id });
    expect(snaps).toHaveLength(2);
  });

  test("an unknown snapshot id throws CharacterNotFoundError", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    await expect(
      svc.restore({
        principal: principal(owner),
        characterId: created.id,
        snapshotId: castId<CharacterSnapshotId>("character_snapshot_ghost"),
      }),
    ).rejects.toBeInstanceOf(CharacterNotFoundError);
  });
});
