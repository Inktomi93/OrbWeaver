import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { ActionBarFixture } from "./action-bar.fixtures.tsx";

test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true });

/** The slot boxes on one settled read; the fill is measured as a box the browser laid out, never as a class. */
function slotGeometry(bar: Locator): Promise<{
  readonly gap: number;
  readonly fillFloor: number;
  readonly order: readonly string[];
  readonly boxes: Readonly<Record<string, { readonly left: number; readonly right: number; readonly top: number; readonly width: number }>>;
}> {
  return bar.evaluate((root) => {
    const boxes: Record<string, { left: number; right: number; top: number; width: number }> = {};
    const order: string[] = [];
    for (const node of root.children) {
      const slot = node.getAttribute("data-slot") ?? "";
      order.push(slot);
      const box = (slot === "action-bar-primary" ? (node.firstElementChild ?? node) : node).getBoundingClientRect();
      boxes[slot] = { left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), width: Math.round(box.width) };
    }
    const fill = root.querySelector('[data-slot="action-bar-fill"]');
    return {
      gap: Math.round(Number.parseFloat(getComputedStyle(root).columnGap)),
      fillFloor: fill === null ? 0 : Math.round(Number.parseFloat(getComputedStyle(fill).minWidth)),
      order,
      boxes,
    };
  });
}

test("actual container fit moves keyed groups, preserving focus and state without a viewport change", async ({ mount, page }) => {
  const component = await mount(<ActionBarFixture />);
  const bar = component.locator('[data-slot="action-bar"]');
  const host = component.locator('[data-slot="action-bar-host"]');
  const order = (): Promise<string[]> => bar.locator(":scope > div").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-slot") ?? ""));
  await expect(bar).toHaveAttribute("data-stacked", "false");
  expect(await order()).toEqual(["action-bar-leading", "action-bar-primary", "action-bar-fill", "action-bar-trailing"]);
  await component.getByRole("button", { name: "Primary 0", exact: true }).click();
  const primary = component.getByRole("button", { name: "Primary 1", exact: true });
  await primary.focus();
  await host.evaluate((node) => {
    (node as HTMLElement).style.width = "322px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "true");
  await expect(primary).toBeFocused();
  expect(await order()).toEqual(["action-bar-primary", "action-bar-leading", "action-bar-fill", "action-bar-trailing"]);
  await page.keyboard.press("Tab");
  await expect(component.getByRole("button", { name: "Swipe", exact: true })).toBeFocused();
  await primary.focus();
  await host.evaluate((node) => {
    (node as HTMLElement).style.width = "600px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "false");
  await expect(primary).toBeFocused();
  await component.getByRole("button", { name: "Read ref", exact: true }).click();
  await expect(component.getByRole("status", { name: "Ref slot" })).toHaveText("action-bar");
});

test("an added control changes the fit and removing it restores the wide row", async ({ mount }) => {
  const component = await mount(<ActionBarFixture />);
  const bar = component.locator('[data-slot="action-bar"]');
  await expect(bar).toHaveAttribute("data-stacked", "false");
  await component.getByRole("button", { name: "Toggle extra", exact: true }).click();
  await expect(bar).toHaveAttribute("data-stacked", "true");
  await expect(component.getByRole("button", { name: "Stop draft", exact: true })).toBeVisible();
  const boxes = await bar.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(Math.min(...boxes)).toBeGreaterThanOrEqual(48);
  await component.getByRole("button", { name: "Toggle extra", exact: true }).click();
  await expect(bar).toHaveAttribute("data-stacked", "false");
});

test("inline padding reduces available fit and cannot orphan Send", async ({ mount }) => {
  const component = await mount(<ActionBarFixture />);
  const bar = component.locator('[data-slot="action-bar"]');
  await expect(bar).toHaveAttribute("data-stacked", "false");
  const primary = component.getByRole("button", { name: "Primary 0", exact: true });
  await primary.focus();
  await bar.evaluate((node) => {
    (node as HTMLElement).style.paddingInline = "24px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "true");
  await expect(primary).toBeFocused();
  await expect
    .poll(async () => {
      const { order, boxes } = await slotGeometry(bar);
      const top = (slot: string): number => boxes[slot]?.top ?? Number.NaN;
      return {
        order,
        primaryAbove: top("action-bar-primary") < top("action-bar-leading"),
        pairTogether: top("action-bar-leading") === top("action-bar-trailing"),
      };
    })
    .toEqual({ order: ["action-bar-primary", "action-bar-leading", "action-bar-fill", "action-bar-trailing"], primaryAbove: true, pairTogether: true });
  await bar.evaluate((node) => {
    (node as HTMLElement).style.paddingInline = "0px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "false");
  await expect(primary).toBeFocused();
});

test("an empty fill is out of layout, and filled it counts toward fit only at its control-width floor", async ({ mount }) => {
  const component = await mount(<ActionBarFixture />);
  const bar = component.locator('[data-slot="action-bar"]');
  const fill = bar.locator('[data-slot="action-bar-fill"]');
  await expect(bar).toHaveAttribute("data-stacked", "false");
  await expect(fill).toBeHidden();
  // The default row fits its host with less spare room than one control plus a gap, so the floor alone tips it.
  await component.getByRole("button", { name: "Toggle placed", exact: true }).click();
  await expect(fill).toBeVisible();
  await expect(bar).toHaveAttribute("data-stacked", "true");
  await component.getByRole("button", { name: "Toggle placed", exact: true }).click();
  await expect(fill).toBeHidden();
  await expect(bar).toHaveAttribute("data-stacked", "false");
});

test("the fill grows into the free space before trailing and its grown width never holds the bar stacked", async ({ mount }) => {
  const component = await mount(<ActionBarFixture />);
  const bar = component.locator('[data-slot="action-bar"]');
  const host = component.locator('[data-slot="action-bar-host"]');
  await host.evaluate((node) => {
    (node as HTMLElement).style.width = "600px";
  });
  await component.getByRole("button", { name: "Toggle placed", exact: true }).click();
  await expect(component.getByRole("button", { name: "Placed", exact: true })).toBeVisible();
  await expect(bar).toHaveAttribute("data-stacked", "false");
  await expect
    .poll(async () => {
      const { gap, fillFloor, boxes } = await slotGeometry(bar);
      const lead = boxes["action-bar-leading"];
      const body = boxes["action-bar-primary"];
      const fill = boxes["action-bar-fill"];
      const end = boxes["action-bar-trailing"];
      if (lead === undefined || body === undefined || fill === undefined || end === undefined) {
        return "a slot did not render";
      }
      return {
        oneRow: new Set([lead.top, body.top, fill.top, end.top]).size === 1,
        afterPrimary: Math.abs(fill.left - (body.right + gap)) <= 1,
        beforeTrailing: Math.abs(end.left - (fill.right + gap)) <= 1,
        grown: fill.width > fillFloor,
      };
    })
    .toEqual({ oneRow: true, afterPrimary: true, beforeTrailing: true, grown: true });

  await host.evaluate((node) => {
    (node as HTMLElement).style.width = "322px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "true");
  await expect
    .poll(async () => {
      const { gap, order, boxes } = await slotGeometry(bar);
      const lead = boxes["action-bar-leading"];
      const fill = boxes["action-bar-fill"];
      const end = boxes["action-bar-trailing"];
      if (lead === undefined || fill === undefined || end === undefined) {
        return "a slot did not render";
      }
      return { order, secondRow: lead.top === fill.top && fill.top === end.top, beforeTrailing: Math.abs(end.left - (fill.right + gap)) <= 1 };
    })
    .toEqual({ order: ["action-bar-primary", "action-bar-leading", "action-bar-fill", "action-bar-trailing"], secondRow: true, beforeTrailing: true });

  // While stacked the fill spans the whole second row; counting that width would keep the bar stacked here.
  await host.evaluate((node) => {
    (node as HTMLElement).style.width = "600px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "false");
});
