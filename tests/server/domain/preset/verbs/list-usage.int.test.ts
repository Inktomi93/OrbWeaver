// verb: listUsage — the preset CONTEXT panel's backward bindings (#279). The verb owns the GATE and nothing
// else: readability is preset's own rule, everything after it is an injected op (settings' active pick +
// rpg's GM redirect + chat's membership, assembled at `entry/compose/preset-usage.ts` and tested there).
//
// So these pins are exactly two claims: a stranger cannot aim this at someone else's preset (it collapses
// to the same NotFound a `get` does — no existence oracle), and a readable preset's answer is the injected
// op's, verbatim, for the CALLING principal.

import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createPresetService, PresetNotFoundError, SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { principal } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedPreset, seedUser } from "../_support.ts";

const USAGE = { isUserDefault: true, gmRooms: [] } as const;

describe("listUsage", () => {
  test("answers for the owner's own preset, through the injected op, for the CALLING principal", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const asked: string[] = [];
    const svc = createPresetService(
      makeHarness(db, {
        resolvePresetUsage: (caller, presetId) => {
          asked.push(`${caller.userId}:${presetId}`);
          return Promise.resolve(USAGE);
        },
      }).ctx,
    );
    const id = await seedPreset(db, { id: castId<PresetId>("preset_own"), ownerId: owner });

    expect(await svc.listUsage({ principal: principal(owner), id })).toEqual(USAGE);
    expect(asked).toEqual([`${owner}:${id}`]);
  });

  test("the shared system default is readable, so its bindings are too", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createPresetService(makeHarness(db, { resolvePresetUsage: () => Promise.resolve(USAGE) }).ctx);
    await seedPreset(db, { id: SYSTEM_DEFAULT_PRESET_ID, ownerId: null, name: "Default" });

    expect(await svc.listUsage({ principal: principal(owner), id: SYSTEM_DEFAULT_PRESET_ID })).toEqual(USAGE);
  });

  // The harness's `resolvePresetUsage` default THROWS "not stubbed", so this also pins that the gate runs
  // BEFORE the injected read: a verb that resolved usage first would fail with that error, not NotFound.
  test("another owner's preset collapses to NotFound, before any binding is read", async () => {
    const db = await freshDb();
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const svc = createPresetService(makeHarness(db).ctx);
    const id = await seedPreset(db, { id: castId<PresetId>("preset_a"), ownerId: a });

    await expect(svc.listUsage({ principal: principal(b), id })).rejects.toBeInstanceOf(PresetNotFoundError);
  });
});
