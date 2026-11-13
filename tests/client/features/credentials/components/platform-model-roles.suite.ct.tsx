// Model roles reads as one short row per role: the explanation sits behind an info control a keyboard reaches, the picker sizes to its
// value, and the Utility preset belongs to the Utility role's group. The rows hold at 200% text, and a picker on a phone at 300% keeps its value the growth.

import { ROLE_ROWS_ORDERED } from "@orb/client/lib";
import { enlargedTextFindings as findings, resolvedLength, LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { connectionRolePickerName } from "#client/components/shared-control-names.ts";
import type { ModelRolesStory } from "./_model-roles-stories.tsx";

const STORY = "tests/client/features/credentials/components/_model-roles-stories/ModelRolesStory";
const HINT = '[data-slot="hint-trigger"]';
const HINT_POPUP = '[data-slot="hint-popup"]';
const TEXT_200 = 2;
const TEXT_300 = 3;
// A picker narrower than this share of its role's group is sized to its value, not stretched across the row.
const HUG_SHARE = 0.75;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The control must paint");
  }
  return box;
}

interface Placement {
  readonly heading: Box;
  readonly hint: Box;
  readonly dot: Box;
  readonly picker: Box;
}

/** Where each role's pieces sit, measured once for the placement tests. */
async function placementOf(page: Page): Promise<readonly Placement[]> {
  const placed: Placement[] = [];
  for (const row of ROLE_ROWS_ORDERED) {
    const group = page.getByRole("group", { name: row.heading, exact: true });
    placed.push({
      heading: await boxOf(group.getByText(row.heading, { exact: true })),
      hint: await boxOf(group.locator(HINT).first()),
      dot: await boxOf(group.getByRole("img").first()),
      picker: await boxOf(group.getByRole("combobox", { name: connectionRolePickerName(row.label), exact: true })),
    });
  }
  return placed;
}

const bottomOf = (box: Box): number => box.y + box.height;

function roleOf(task: "chat" | "summarize"): (typeof ROLE_ROWS_ORDERED)[number] {
  const row = ROLE_ROWS_ORDERED.find((candidate) => candidate.task === task);
  if (row === undefined) {
    throw new Error(`Model roles carries no ${task} row`);
  }
  return row;
}

async function serveRoles(page: Page, corpus: CorpusPlayback, root: ServerTestHarness): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "search.spaceStatus",
      "workloads.list",
      "connection.list",
      "connection.listBindings",
      "connection.providersAvailable",
      "preset.list",
    ]),
  });
}

for (const device of [
  { label: "desktop", width: 1440, height: 900, coarse: false },
  { label: "phone", width: 390, height: 844, coarse: true },
] as const) {
  test.describe(device.label, () => {
    test.use({ hasTouch: device.coarse, isMobile: device.coarse, viewport: { width: device.width, height: device.height } });

    test("each role keeps its explanation behind an info control that a keyboard opens", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveRoles(page, corpus, root);
      await mount<typeof ModelRolesStory>(STORY, {});
      for (const row of ROLE_ROWS_ORDERED) {
        const group = page.getByRole("group", { name: row.heading, exact: true });
        await expect(group.locator(HINT).first()).toHaveAccessibleDescription(row.description);
      }
      await expect(page.locator(HINT_POPUP)).toHaveCount(0);
      const first = ROLE_ROWS_ORDERED[0];
      if (first === undefined) {
        throw new Error("Model roles carries no rows");
      }
      await page.keyboard.press("Tab");
      await expect(page.getByRole("group", { name: first.heading, exact: true }).locator(HINT).first()).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator(HINT_POPUP)).toContainText(first.description);
    });

    test("the Utility preset sits inside the Utility group", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveRoles(page, corpus, root);
      await mount<typeof ModelRolesStory>(STORY, {});
      const utility = page.getByRole("group", { name: roleOf("summarize").heading, exact: true });
      const chat = page.getByRole("group", { name: roleOf("chat").heading, exact: true });
      await expect(utility.getByRole("combobox")).toHaveCount(2);
      await expect(chat.getByRole("combobox")).toHaveCount(1);
    });

    test("an unset role states what unset does in view, and the embedder states its re-embed cost beside the picker", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      const withEffect = ROLE_ROWS_ORDERED.filter((row) => row.unsetEffect !== undefined);
      for (const row of withEffect) {
        await caller.connection.setBinding({ task: row.task, connectionId: null });
      }
      await serveRoles(page, corpus, root);
      await mount<typeof ModelRolesStory>(STORY, {});
      for (const row of withEffect) {
        const group = page.getByRole("group", { name: row.heading, exact: true });
        await expect(group.getByText(row.unsetEffect ?? "", { exact: true })).toBeVisible();
      }
      for (const row of ROLE_ROWS_ORDERED.filter((candidate) => candidate.standingEffect !== undefined)) {
        const group = page.getByRole("group", { name: row.heading, exact: true });
        await expect(group.getByText(row.standingEffect ?? "", { exact: true })).toBeVisible();
      }
      expect(withEffect.length).toBeGreaterThan(1);
    });

    test("every role seats its picker the same way against its heading, and its dot and hint stay on the heading", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveRoles(page, corpus, root);
      await mount<typeof ModelRolesStory>(STORY, {});
      await expect(page.getByRole("group", { name: roleOf("chat").heading, exact: true })).toBeVisible();
      const placed = await placementOf(page);
      // One rule for every role: the picker is beside its heading on all of them, or under it on all of them.
      expect(new Set(placed.map((role) => role.picker.y >= bottomOf(role.heading) - 1)).size).toBe(1);
      for (const role of placed) {
        // The hint rides beside the heading, never alone on a line of its own.
        expect(role.hint.y).toBeLessThan(bottomOf(role.heading));
        // The dot shares the heading's line.
        expect(role.dot.y + role.dot.height / 2).toBeGreaterThanOrEqual(role.heading.y);
        expect(role.dot.y + role.dot.height / 2).toBeLessThanOrEqual(bottomOf(role.heading));
      }
    });

    test("a picker whose value fits is as tall as its control-size step, and one that does not wraps its value whole", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveRoles(page, corpus, root);
      await mount<typeof ModelRolesStory>(STORY, {});
      await expect(page.getByRole("group", { name: roleOf("chat").heading, exact: true })).toBeVisible();
      const pickers = page.getByRole("combobox");
      const step = Math.round(await resolvedLength(page, `var(${TOKENS["size.control-sm"].cssVar})`, pickers.first()));
      const heights = (await pickers.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))).map((height) => Math.round(height));
      expect(heights.length).toBeGreaterThan(ROLE_ROWS_ORDERED.length);
      // A value on one line keeps the step, level with the controls of its row; none is shorter than the step.
      expect(Math.min(...heights)).toBe(step);
      // At the default text size the gap to the chevron is the row step on a phone too, never a share of the screen under it.
      const rowStep = await resolvedLength(page, `var(${TOKENS["spacing.row"].cssVar})`, pickers.first());
      expect(await pickers.first().evaluate((node) => Number.parseFloat(getComputedStyle(node).columnGap))).toBe(rowStep);
      // A fine pointer has room for every value, so no picker grows; a phone wraps the values that do not fit and cuts none.
      expect(heights.filter((height) => height !== step).length === 0).toBe(!device.coarse);
      await expect.poll(() => findings(page.locator("body"))).toEqual([]);
    });

    test("the rows hold at 200% text", async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      await serveRoles(page, corpus, root);
      await mount<typeof ModelRolesStory>(STORY, {});
      await setRootFontScale(page, channelName("fontScale"), TEXT_200);
      await expect(page.getByRole("group", { name: roleOf("summarize").heading, exact: true })).toBeVisible();
      await expect.poll(() => findings(page.locator("body"))).toEqual([]);
    });
  });
}

test.describe("desktop width", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a role's picker sizes to its value and shares the row of its heading", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    await serveRoles(page, corpus, root);
    await mount<typeof ModelRolesStory>(STORY, {});
    const chat = page.getByRole("group", { name: roleOf("chat").heading, exact: true });
    const picker = await chat.getByRole("combobox").boundingBox();
    const hint = await chat.locator(HINT).first().boundingBox();
    if (picker === null || hint === null) {
      throw new Error("The Chat role painted no picker or hint");
    }
    const group = await chat.boundingBox();
    if (group === null) {
      throw new Error("The Chat role painted no box");
    }
    expect(picker.y).toBeLessThan(hint.y + hint.height);
    expect(picker.width).toBeLessThan(group.width * HUG_SHARE);
  });
});

test.describe("phone at 300% layout", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("every role's picker takes a line of its own at the slot's width, and its chrome is the tokens' width", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    await serveRoles(page, corpus, root);
    await mount<typeof ModelRolesStory>(STORY, {});
    await setRootFontScale(page, channelName("fontScale"), TEXT_300);
    await expect(page.getByRole("group", { name: roleOf("summarize").heading, exact: true })).toBeVisible();
    await expect.poll(() => findings(page.locator("body"))).toEqual([]);
    const first = page.getByRole("combobox").first();
    const lengthOf = (name: "spacing.indent" | "spacing.picker-inset" | "spacing.picker-gap" | "border-width.control"): Promise<number> =>
      resolvedLength(page, `var(${TOKENS[name].cssVar})`, first);
    const [indent, inset, gap, edge] = await Promise.all([
      lengthOf("spacing.indent"),
      lengthOf("spacing.picker-inset"),
      lengthOf("spacing.picker-gap"),
      lengthOf("border-width.control"),
    ]);
    // The line count is not asserted: a value at 300% text wraps by the room a phone leaves it, so the bound is the room, not a count of lines.
    for (const row of ROLE_ROWS_ORDERED) {
      const group = page.getByRole("group", { name: row.heading, exact: true });
      const picker = group.getByRole("combobox", { name: connectionRolePickerName(row.label), exact: true });
      const [groupBox, pickerBox, valueBox, iconBox] = await Promise.all([
        boxOf(group),
        boxOf(picker),
        boxOf(picker.locator('[data-slot="select-value"]')),
        boxOf(picker.locator('[data-slot="select-icon"]')),
      ]);
      expect(pickerBox.x - groupBox.x).toBeLessThanOrEqual(indent + SUBPIXEL);
      expect(groupBox.x + groupBox.width - (pickerBox.x + pickerBox.width)).toBeLessThanOrEqual(SUBPIXEL);
      expect(Math.abs(pickerBox.width - valueBox.width - (2 * (inset + edge) + gap + iconBox.width))).toBeLessThanOrEqual(SUBPIXEL);
    }
  });
});

test.describe("phone landscape", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

  test("every role seats its picker the same way against its heading", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    await serveRoles(page, corpus, root);
    await mount<typeof ModelRolesStory>(STORY, {});
    await expect(page.getByRole("group", { name: roleOf("chat").heading, exact: true })).toBeVisible();
    const placed = await placementOf(page);
    expect(new Set(placed.map((role) => role.picker.y >= bottomOf(role.heading) - 1)).size).toBe(1);
  });
});
