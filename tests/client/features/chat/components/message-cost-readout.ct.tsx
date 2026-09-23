// CT: the per-message settled-cost readout. TWO load-bearing gates live here.
//
// 1. THE PAID-FETCH GATE — `connection.generationCost` is a real upstream OpenRouter call, so the query key
//    is built ONLY on the user's reveal click (useGatedQuery/skipToken). Pins: NO fetch on mount; a click
//    fires exactly one fetch keyed by the message's generationId; the settled label formats to
//    `$0.0023`-scale; an errored fetch degrades to "cost n/a".
// 2. THE DIALECT GATE (inference audit B7) — `generation_id` is now the PROVIDER's response id on every
//    hosted wire, so an Anthropic swipe carries a `msg_…` there while `generationCost` still refuses every
//    non-OpenRouter row (`requireOpenRouter`). The affordance must therefore key off the provider's dialect,
//    not off the id: an anthropic swipe WITH an id renders no trigger at all. Without this arm the product
//    ships a button whose only possible outcome is "cost n/a".
//
// If either gate loosens, a pin here goes red — that is what this file guards, not "a button renders".

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { MessageCostReadoutStory } from "../_ct-stories.tsx";

const COST_PROC = "connection.generationCost";
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

test("a row with no generation handle at all renders nothing — no dangling cost trigger", async ({ mount, page }) => {
  await routeTrpc(page, { [COST_PROC]: () => ({ totalCost: 0.0023 }) });
  await mount(<MessageCostReadoutStory generationId={null} />);
  await expect(page.getByRole("button", { name: "Show generation cost" })).toHaveCount(0);
  await expect(page.locator('[data-slot="message-metadata-cost-trigger"]')).toHaveCount(0);
});

// THE B7 ARM. The id is present and well-formed on both rows; ONLY the provider differs, so a pin that
// passes on one and fails on the other can only be reading the dialect.
test("an ANTHROPIC swipe carrying a msg_… response id offers NO reveal — the diagnostic is OpenRouter-only", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [COST_PROC]: () => ({ totalCost: 0.0023 }) });
  await mount(<MessageCostReadoutStory generationId="msg_011CfEBkq13YCxSrpf1a13Do" provider="anthropic" />);

  await expect(page.getByRole("button", { name: "Show generation cost" })).toHaveCount(0);
  await expect(page.locator('[data-slot="message-metadata-cost-trigger"]')).toHaveCount(0);
  await expect.poll(() => trpc.count(COST_PROC)).toBe(0);
});

test("the same id shape on an OPENROUTER row DOES offer the reveal (the gate reads the dialect, not the id)", async ({ mount, page }) => {
  await routeTrpc(page, { [COST_PROC]: () => ({ totalCost: 0.0023 }) });
  await mount(<MessageCostReadoutStory generationId="gen-1789884256-ZeulFgkGknjAbAgCKe1S" provider="openrouter" />);
  await expect(page.getByRole("button", { name: "Show generation cost" })).toBeVisible();
});

// A plugin/admin registry row is not in `BUILTIN_PROVIDERS`, so the client cannot resolve its dialect
// synchronously and HIDES the affordance rather than spending a paid call that would refuse.
test("an unknown (non-builtin) provider id hides the affordance rather than guessing", async ({ mount, page }) => {
  await routeTrpc(page, { [COST_PROC]: () => ({ totalCost: 0.0023 }) });
  await mount(<MessageCostReadoutStory generationId="gen_ct_1" provider="plugin:acme/router" />);
  await expect(page.getByRole("button", { name: "Show generation cost" })).toHaveCount(0);
});
