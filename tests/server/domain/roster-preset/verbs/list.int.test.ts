// verb: list — the caller's parties, NAME-sorted, each summary carrying its position-ordered member
// preview (name + avatar hash joined) and the hasGroupConfig flag. Load-bearing: owner partition (B
// never sees A's — the WHERE-clause plane the cross-tenant sweep also probes with a marker).

import { createRosterPresetService } from "@orb/server/domain/roster-preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedAsset } from "../../../../support/factories/asset.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, memberSpec, principal } from "../_support.ts";

describe("list", () => {
  test("name-sorted summaries with position-ordered member previews (avatar hash joined)", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const owner = (await seedUser(db)).id;
    const avatar = await seedAsset(db, { ownerId: owner, hash: "sha_brook" });
    const a = (await seedCharacter(db, { ownerId: owner, name: "Ash" })).id;
    const b = (await seedCharacter(db, { ownerId: owner, name: "Brook", avatarAssetId: avatar.id })).id;

    await svc.create({
      principal: principal(owner),
      input: { name: "Zeta", description: "", groupConfig: { output: "narrator" }, members: [memberSpec(b, 0), memberSpec(a, 1)] },
    });
    await svc.create({ principal: principal(owner), input: { name: "Alpha", description: "", members: [memberSpec(a, 0)] } });

    const rows = await svc.list({ principal: principal(owner) });
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Zeta"]);
    expect(rows[0]?.characterCount).toBe(1);
    expect(rows[0]?.hasGroupConfig).toBe(false);
    expect(rows[1]?.characterCount).toBe(2);
    expect(rows[1]?.hasGroupConfig).toBe(true);
    expect(rows[1]?.members.map((m) => m.name)).toEqual(["Brook", "Ash"]);
    expect(rows[1]?.members[0]?.avatarHash).toBe("sha_brook");
    expect(rows[1]?.members[1]?.avatarHash).toBeNull();
  });

  test("the owner partition holds: B's list is empty while A's is populated (and vice versa)", async () => {
    const db = await freshDb();
    const svc = createRosterPresetService(makeHarness(db).ctx);
    const a = (await seedUser(db)).id;
    const b = (await seedUser(db)).id;
    const ca = (await seedCharacter(db, { ownerId: a })).id;
    await svc.create({ principal: principal(a), input: { name: "A's party", description: "", members: [memberSpec(ca, 0)] } });

    // The positive control (A sees the row) is what entitles the empty read to mean "partitioned",
    // not "broken query" (empty-population-vs-broken-probe).
    expect(await svc.list({ principal: principal(a) })).toHaveLength(1);
    expect(await svc.list({ principal: principal(b) })).toHaveLength(0);
  });
});
