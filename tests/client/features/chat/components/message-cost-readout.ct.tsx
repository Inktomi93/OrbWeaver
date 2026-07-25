// CT: the PD-137 per-message settled-cost readout. The load-bearing behavior is the PAID-FETCH GATE —
// `connection.orGenerationCost` is a real upstream OpenRouter call, so the query key is built ONLY on the
// user's reveal click (useGatedQuery/skipToken). These pins prove: NO fetch on mount; a click builds the
// key and fires exactly one fetch with the message's generationId; the settled label formats to
// `$0.0023`-scale; an errored fetch degrades to "cost n/a"; and a non-OR row (null generationId) renders
// nothing at all (never a dangling trigger). If the gate ever loosens to fire on load, the "no fetch until
// click" pin goes red — that's the regression this file guards, not "a button renders".

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { MessageCostReadoutStory } from "../_ct-stories";

const COST_PROC = "connection.orGenerationCost";
const GEN_ID = "gen_ct_1";

test("no fetch on mount: the paid call never fires until the user reveals it", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [COST_PROC]: () => ({ totalCost: 0.0023 }) });
  await mount(<MessageCostReadoutStory generationId={GEN_ID} />);

  // The trigger is present, but the paid query has NOT fired — the whole point of the gate.
  await expect(page.getByRole("button", { name: "Show generation cost" })).toBeVisible();
  await expect.poll(() => trpc.count(COST_PROC)).toBe(0);
});

test("revealing fires exactly one fetch keyed by the message's generationId, then shows the formatted cost", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [COST_PROC]: () => ({ totalCost: 0.0023 }) });
  await mount(<MessageCostReadoutStory generationId={GEN_ID} />);

  await page.getByRole("button", { name: "Show generation cost" }).click();

  await expect.poll(() => trpc.count(COST_PROC), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput(COST_PROC)).toMatchObject({ generationId: GEN_ID });
  await expect(page.locator('[data-slot="message-metadata-cost"]')).toHaveText("$0.0023");
  // The trigger is gone once revealed (it swaps to the readout, not both).
  await expect(page.getByRole("button", { name: "Show generation cost" })).toHaveCount(0);
});

test("an errored fetch degrades to 'cost n/a' — never a blank or a thrown boundary", async ({ mount, page }) => {
  await routeTrpc(page, { [COST_PROC]: () => trpcError({ code: "INTERNAL_SERVER_ERROR" }) });
  await mount(<MessageCostReadoutStory generationId={GEN_ID} />);

  await page.getByRole("button", { name: "Show generation cost" }).click();
  await expect(page.locator('[data-slot="message-metadata-cost"]')).toHaveText("cost n/a");
});

test("a non-OR row (null generationId) renders nothing — no dangling cost trigger", async ({ mount, page }) => {
  await routeTrpc(page, { [COST_PROC]: () => ({ totalCost: 0.0023 }) });
  await mount(<MessageCostReadoutStory generationId={null} />);
  await expect(page.getByRole("button", { name: "Show generation cost" })).toHaveCount(0);
  await expect(page.locator('[data-slot="message-metadata-cost-trigger"]')).toHaveCount(0);
});
