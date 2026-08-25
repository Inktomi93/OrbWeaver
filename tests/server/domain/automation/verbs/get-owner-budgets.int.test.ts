// verb: getOwnerBudgets (C5) — the caller's OWN owner-global fire-rate ceiling.
//
// THE LOAD-BEARING PIN IS THE DEFAULT, and it is a two-sided claim: an ABSENT row must project to the SAME
// number the dispatch gate uses for an absent row. Those are two separate code paths (`selectOwnerBudgetView`
// and `engine/budget-gate.ts`), both reading `AUTOMATION_OWNER_BUDGET_DEFAULTS`, and if they ever disagreed
// the pane would display a ceiling nobody is actually bounded by — a belt that lies about its own value. The
// gate side is pinned at `../engine/dispatch.int.test.ts`; this is the projection side.

import { AUTOMATION_OWNER_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { principal, ruleFixture, seedUser } from "../_support.ts";

describe("getOwnerBudgets", () => {
  test("an ABSENT row projects to the DDL default — the value the dispatch gate uses for it", async () => {
    const f = await ruleFixture();
    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ ...AUTOMATION_OWNER_BUDGET_DEFAULTS });
  });

  test("reads the caller's OWN row — the plane is single-owned, so there is no other to read", async () => {
    const f = await ruleFixture();
    const other = await seedUser(f.db, "user_other");
    await f.svc.setOwnerBudgets({ principal: principal(f.host), maxFiresPerHour: 7 });

    await expect(f.svc.getOwnerBudgets({ principal: principal(f.host) })).resolves.toEqual({ maxFiresPerHour: 7 });
    // The second user's read is UNAFFECTED — it is not "empty because nothing exists", it is their own row.
    await expect(f.svc.getOwnerBudgets({ principal: principal(other) })).resolves.toEqual({ ...AUTOMATION_OWNER_BUDGET_DEFAULTS });
  });
});
