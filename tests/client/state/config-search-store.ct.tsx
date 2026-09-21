// config-search store CT (#866 S2) — the Settings search's live query + selected match. A CT because the
// reads are reactive hooks (the config-nav-store posture). The load-bearing rule: EMPTYING the query clears
// the match with it — a surviving match would mark a row for a query nobody can see (§3.4's seam contract).

import { expect, test } from "@playwright/experimental-ct-react";
import { ConfigSearchProbe } from "./_ct-stories.tsx";

test("the query and the match are independent writes, read reactively", async ({ mount }) => {
  const probe = await mount(<ConfigSearchProbe />);
  const state = probe.locator("output");
  await probe.getByRole("button", { name: "reset search" }).click();
  await expect(state).toContainText("query=none match=none");

  await probe.getByRole("button", { name: "type a query" }).click();
  await expect(state).toContainText("query=avatar @shelf:user match=none");

  await probe.getByRole("button", { name: "select a hit" }).click();
  await expect(state).toContainText("match=appearance/avatars/avatar-size/-");
  // The query SURVIVES the selection — marks live for the life of the query (§3.3).
  await expect(state).toContainText("query=avatar @shelf:user");
});

test("an EMPTY query write clears the match and remains idempotent", async ({ mount }) => {
  const probe = await mount(<ConfigSearchProbe />);
  const state = probe.locator("output");

  await probe.getByRole("button", { name: "type a query" }).click();
  await probe.getByRole("button", { name: "select a hit" }).click();
  await probe.getByRole("button", { name: "empty the input" }).click();
  await expect(state).toContainText("query=none match=none");

  await probe.getByRole("button", { name: "empty the input" }).click();
  await expect(state).toContainText("query=none match=none");
});
