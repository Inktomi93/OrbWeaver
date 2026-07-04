// CT: the minimal swipe strip — the n/m counter + generate-next wiring. Asserts the counter reflects
// the MessageView's variant fields and that the right chevron fires the `chat.swipe` mutation (recorded
// at the network by routeTrpc). Step-back (left chevron) is disabled pending `chat.selectVariant` on
// the transport (#19), so this covers the generate-only path the strip ships today.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SwipeStripStory } from "../_ct-stories";

test("renders the n/m counter and fires swipe on the next chevron", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.swipe": () => ({ ok: true }),
  });

  const component = await mount(<SwipeStripStory />);

  // selectedVariantIdx 1 (0-based) + variantCount 3 → "2 / 3".
  await expect(component.getByText("2 / 3")).toBeVisible();

  await component.getByRole("button", { name: "Next variant" }).click();
  await expect.poll(() => trpc.count("chat.swipe")).toBe(1);
});

test("the step-back chevron is disabled (no selectVariant transport yet)", async ({ mount }) => {
  const component = await mount(<SwipeStripStory />);
  await expect(component.getByRole("button", { name: "Previous variant" })).toBeDisabled();
});
