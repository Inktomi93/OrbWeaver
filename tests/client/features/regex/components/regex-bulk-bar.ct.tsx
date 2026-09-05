import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { RegexBulkBarStory } from "../_ct-stories.tsx";

type EnabledAction = "Disable" | "Enable";

async function clickInOneBrowserTask(component: Locator, actions: readonly EnabledAction[]): Promise<void> {
  await component.evaluate((root, labels) => {
    const buttons = Array.from(root.querySelectorAll("button"));
    for (const label of labels) {
      const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
      if (button === undefined) {
        throw new Error(`Missing ${label} bulk action`);
      }
      button.click();
    }
  }, actions);
}

test("a repeated Enable gesture admits one owned write and clears selection only after success", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await routeTrpc(page, { "regex.bulkSetEnabled": held });
  const component = await mount(<RegexBulkBarStory />);
  const enable = component.getByRole("button", { name: "Enable", exact: true });
  const disable = component.getByRole("button", { name: "Disable", exact: true });
  const count = component.getByRole("status", { name: "Bulk selection count" });

  await clickInOneBrowserTask(component, ["Enable", "Enable"]);
  await held.requested;
  await expect(enable).toBeDisabled();
  await expect(disable).toBeDisabled();
  await expect.poll(() => trpc.count("regex.bulkSetEnabled")).toBe(1);
  await expect(count).toHaveText("2");

  held.release({ affected: 2 });
  await expect(count).toHaveText("0");
  await expect(enable).toBeEnabled();
  await expect(disable).toBeEnabled();
});

for (const actions of [
  ["Enable", "Disable"],
  ["Disable", "Enable"],
] as const) {
  test(`${actions.join(" then ")} in one browser task admits only the first write`, async ({ mount, page }) => {
    const held = trpcHold();
    const trpc = await routeTrpc(page, { "regex.bulkSetEnabled": held });
    const component = await mount(<RegexBulkBarStory />);

    await clickInOneBrowserTask(component, actions);
    await held.requested;
    await expect.poll(() => trpc.count("regex.bulkSetEnabled")).toBe(1);
    await expect
      .poll(() => trpc.lastInput("regex.bulkSetEnabled"))
      .toEqual({
        scriptIds: ["regex_script_stripooc00000", "regex_script_narrate000000"],
        enabled: actions[0] === "Enable",
      });

    held.release({ affected: 2 });
    await expect(component.getByRole("status", { name: "Bulk selection count" })).toHaveText("0");
  });
}

test("a rejected write releases both actions for retry and retains the selection", async ({ mount, page }) => {
  const first = trpcHold();
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "regex.bulkSetEnabled": () => {
      attempts += 1;
      return attempts === 1 ? first : { affected: 2 };
    },
  });
  const component = await mount(<RegexBulkBarStory />);
  const enable = component.getByRole("button", { name: "Enable", exact: true });
  const disable = component.getByRole("button", { name: "Disable", exact: true });
  const count = component.getByRole("status", { name: "Bulk selection count" });

  await enable.click();
  await first.requested;
  await expect(enable).toBeDisabled();
  await expect(disable).toBeDisabled();
  first.release(trpcError());

  await expect(enable).toBeEnabled();
  await expect(disable).toBeEnabled();
  await expect(count).toHaveText("2");

  await disable.click();
  await expect.poll(() => trpc.count("regex.bulkSetEnabled")).toBe(2);
  await expect(count).toHaveText("0");
});

// THE SELECTION IS THE RETRY (#1501). Enable/Disable already cleared inside `onSuccess`; the kebab's two
// GLOBAL verbs, the placement apply and the delete all cleared on the same tick as `.mutate`, so a rejected
// batch dropped the checked set that named its own targets — leaving a toast about scripts the reader could
// no longer re-select. Both directions are asserted in ONE pair so a fix that simply stops clearing cannot
// pass: rejection KEEPS the selection, success still clears it.
test("a REJECTED 'Run in every chat' keeps the selection that names its targets (#1501)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "regex.bulkSetGlobal": () => trpcError({ message: "bulk global failed" }) });
  const component = await mount(<RegexBulkBarStory />);
  const count = component.getByRole("status", { name: "Bulk selection count" });
  await expect(count).toHaveText("2");

  await component.getByRole("button", { name: /^More actions for/ }).click();
  await page.getByRole("menuitem", { name: "Run in every chat" }).click();

  await expect.poll(() => trpc.count("regex.bulkSetGlobal"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(count).toHaveText("2");
});

test("a SUCCESSFUL 'Run in every chat' still clears the selection (#1501, the other direction)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "regex.bulkSetGlobal": () => ({ affected: 2 }) });
  const component = await mount(<RegexBulkBarStory />);
  const count = component.getByRole("status", { name: "Bulk selection count" });

  await component.getByRole("button", { name: /^More actions for/ }).click();
  await page.getByRole("menuitem", { name: "Run in every chat" }).click();

  await expect.poll(() => trpc.count("regex.bulkSetGlobal"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(count).toHaveText("0");
});
