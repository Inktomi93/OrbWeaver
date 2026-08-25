// verb: setOwnerBudgets (C5) — upsert the caller's OWN owner-global fire-rate ceiling.
//
// The row is BORN on the first set and patched thereafter, which is the `setBudgets` posture one plane over.
// ZERO is a real, useful value and is pinned as such: "stop all of my library rules" without disabling each
// one, and a verb that treated 0 as "unset" would silently ignore the strongest thing a host can ask for.

import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { principal, ruleFixture, seedUser } from "../_support.ts";

describe("setOwnerBudgets", () => {
  test("borns the row on the first set, then patches it", async () => {
    const f = await ruleFixture();
    await f.svc.setOwnerBudgets({ principal: principal(f.host), maxFiresPerHour: 30 });
    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ maxFiresPerHour: 30 });
    await f.svc.setOwnerBudgets({ principal: principal(f.host), maxFiresPerHour: 90 });
    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ maxFiresPerHour: 90 });
  });

  test("ZERO is a real ceiling, not an absent one — 'stop all of my library rules'", async () => {
    const f = await ruleFixture();
    await f.svc.setOwnerBudgets({ principal: principal(f.host), maxFiresPerHour: 0 });
    // A verb that read 0 as "unset" would hand back the 120 default here and quietly ignore the one setting
    // a worried host most needs to work. (The GATE half — that a 0 ceiling actually refuses a fire — is
    // pinned at `../engine/dispatch.int.test.ts`.)
    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ maxFiresPerHour: 0 });
  });

  test("an ABSENT field keeps the current value — a patch, never a replace", async () => {
    const f = await ruleFixture();
    await f.svc.setOwnerBudgets({ principal: principal(f.host), maxFiresPerHour: 42 });
    await f.svc.setOwnerBudgets({ principal: principal(f.host) });
    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ maxFiresPerHour: 42 });
  });

  test("writes the caller's OWN row and no other — the single-owned partition, on the WRITE side", async () => {
    const f = await ruleFixture();
    const other = await seedUser(f.db, "user_other");
    await f.svc.setOwnerBudgets({ principal: principal(other), maxFiresPerHour: 5 });
    // The writer's own row moved; the fixture host's did not, and it is the DEFAULT rather than 5 — the
    // proof that these are two rows and not one shared ceiling.
    await expect(f.svc.getOwnerBudgets({ principal: principal(other) })).resolves.toEqual({ maxFiresPerHour: 5 });
    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ maxFiresPerHour: 120 });
  });
});
