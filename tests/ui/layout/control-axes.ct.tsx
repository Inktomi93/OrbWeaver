import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ControlAxesStory } from "./_control-axes-stories.tsx";

const STORY = "tests/ui/layout/_control-axes-stories/ControlAxesStory";

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

const boxOf = (locator: Locator): Promise<Box> =>
  locator.evaluate((element) => {
    const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
    return { left, right, top, bottom, width, height };
  });
const style = (locator: Locator, property: string): Promise<string> =>
  locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
const probeOf =
  (component: Locator) =>
  (name: string): Locator =>
    component.locator(`[data-probe="${name}"]`);

test("Button grow, floor and cap take their sizes from the row and the ramp", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  const host = await boxOf(probe("wide-host"));
  expect((await boxOf(probe("button-grow"))).right).toBe((await boxOf(probe("button-rest"))).left);
  expect((await boxOf(probe("button-rest"))).right).toBe(host.right);
  expect((await boxOf(probe("button-floor"))).width).toBe((await boxOf(probe("ref-field-floor"))).width);
  expect((await boxOf(probe("button-cap"))).width).toBe((await boxOf(probe("ref-hero"))).width);
});

test("Button textAlign sets the label's end and inset takes the field step", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  expect(await style(probe("button-text-end"), "text-align")).toBe("end");
  const step = await style(probe("ref-field-inset"), "padding-inline-start");
  expect(await style(probe("button-inset"), "padding-inline-start")).toBe(step);
  expect(await style(probe("button-plain"), "padding-inline-start")).not.toBe(step);
});

test("whitespace lets a Button and a Badge wrap inside a host the nowrap base outgrows", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  const host = (await boxOf(probe("narrow-host"))).width;
  expect((await boxOf(probe("button-nowrap"))).width).toBeGreaterThan(host);
  expect((await boxOf(probe("button-whitespace"))).width).toBeLessThanOrEqual(host);
  expect((await boxOf(probe("badge-nowrap"))).width).toBeGreaterThan(host);
  expect((await boxOf(probe("badge-whitespace"))).width).toBeLessThanOrEqual(host);
});

test("Badge, Field and Card cap at the ramp; Field grow takes the room left", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  const cap = (await boxOf(probe("ref-hero"))).width;
  expect((await boxOf(probe("badge-cap"))).width).toBe(cap);
  expect((await boxOf(probe("field-cap"))).width).toBe((await boxOf(probe("ref-pane-sm"))).width);
  expect((await boxOf(probe("card-width"))).width).toBe(cap);
  expect((await boxOf(probe("field-grow"))).right).toBe((await boxOf(probe("field-rest"))).left);
  expect((await boxOf(probe("field-rest"))).right).toBe((await boxOf(probe("wide-host"))).right);
});

test("PictureButton caption stacks the caption under its picture, and its floors hold an empty box at the control step", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  expect((await boxOf(probe("picture-label"))).top).toBeGreaterThanOrEqual((await boxOf(probe("picture-mark"))).bottom);
  const floor = await boxOf(probe("ref-control-md"));
  const picture = await boxOf(probe("picture-floor"));
  expect([picture.width, picture.height]).toEqual([floor.width, floor.height]);
});

test("CollapsibleTrigger width takes the whole line", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  expect((await boxOf(probe("trigger-width"))).width).toBe((await boxOf(probe("wide-host"))).width);
});

test("DialogFooter push sends the footer to the block end, and DialogHeader wrap takes a second line", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  // The footer is sticky, so its painted box follows the viewport: the auto margin is what proves where it sits in the column.
  const free = (await boxOf(probe("dialog-host"))).height - (await boxOf(probe("dialog-push"))).height;
  expect(await style(probe("dialog-push"), "margin-block-start")).toBe(`${free}px`);
  expect((await boxOf(probe("wrap-second"))).top).toBeGreaterThanOrEqual((await boxOf(probe("wrap-first"))).bottom);
});

test("self sets a child across the line against the parent's align", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  const host = await boxOf(probe("self-host"));
  expect((await boxOf(probe("self-end"))).bottom).toBe(host.bottom);
  expect((await boxOf(probe("self-stretch"))).height).toBe(host.height);
});

test("placed lays a band across its host's foot, a block step clear of it", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  const host = await boxOf(probe("placed-host"));
  const band = await boxOf(probe("placed-foot"));
  expect(band.width).toBe(host.width);
  expect(band.top).toBeGreaterThan(host.top + host.height / 2);
  expect(band.bottom).toBeLessThan(host.bottom);
});

test("maxHeight bounds a box at the ramp step and its content scrolls", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  expect((await boxOf(probe("max-height"))).height).toBe((await boxOf(probe("ref-scroll-sm"))).height);
});

test("Grid gapInline and gapBlock are two steps on two axes", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  const [first, second, third] = [await boxOf(probe("cell-a")), await boxOf(probe("cell-b")), await boxOf(probe("cell-c"))];
  expect(second.left - first.right).toBeGreaterThan(third.top - first.bottom);
});

test("Contents adds no box: its child sits in the parent's line", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  expect(await style(probe("contents"), "display")).toBe("contents");
  expect((await boxOf(probe("contents-child"))).left).toBe((await boxOf(probe("contents-row"))).left);
});

test("VirtualList fill bounds the list at its host's block size", async ({ mount }) => {
  const probe = probeOf(await mount<typeof ControlAxesStory>(STORY));
  await expect(probe("list-host").getByText("one")).toBeVisible();
  const host = await boxOf(probe("list-host"));
  expect((await boxOf(probe("list-host").getByRole("list").or(probe("list-host").locator('[data-slot="virtual-list"]')).first())).height).toBe(host.height);
});
