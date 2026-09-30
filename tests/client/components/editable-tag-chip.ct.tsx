import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/node/route-trpc.ts";
import { EditableTagChipStory } from "../features/tag/_ct-stories.tsx";

const TAG_ID = mintTypeId(ID_PREFIX.tag);

test("inline edit reads back through the same library cache and Escape restores chip focus", async ({ mount, page }) => {
  let row = {
    id: TAG_ID,
    name: "Adventure",
    color: null,
    color2: null,
    source: "manual" as const,
    folderType: "NONE" as const,
    sortOrder: null,
    isHiddenOnCard: false,
    usage: { characters: 1, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 1 },
    pendingSuggestions: 0,
  };
  const recorder = await routeTrpc(page, {
    "tag.listTagsWithUsage": () => [row],
    "tag.updateTag": (input) => {
      row = { ...row, name: input.patch.name ?? row.name };
      const { usage: _usage, pendingSuggestions: _pending, ...view } = row;
      return view;
    },
  });
  const story = await mount(<EditableTagChipStory tag={{ id: TAG_ID, name: "Adventure" }} />);
  await story.getByRole("button", { name: "Edit label Adventure", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Edit label Adventure", exact: true });
  await expect(popup.getByRole("textbox", { name: "Name" })).toHaveValue("Adventure");
  await popup.getByRole("textbox", { name: "Name" }).fill("Voyage");
  await popup.getByRole("textbox", { name: "Name" }).press("Enter");
  await expect.poll(() => recorder.count("tag.updateTag")).toBe(1);
  await story.getByRole("button", { name: "deliver tag change", includeHidden: true }).evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole("dialog", { name: "Edit label Voyage", exact: true }).getByRole("textbox", { name: "Name" })).toHaveValue("Voyage");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Edit label Voyage", exact: true })).toHaveCount(0);
  await expect(story.getByRole("button", { name: "Edit label Voyage", exact: true })).toBeFocused();
  await story.getByRole("button", { name: "Edit label Voyage", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit label Voyage", exact: true }).getByRole("textbox", { name: "Name" })).toHaveValue("Voyage");
  expect(recorder.unstubbed()).toEqual([]);
});

test("Manage in Labels dismisses the content-scoped popup before navigating", async ({ mount, page }) => {
  await routeTrpc(page, { "tag.listTagsWithUsage": [] });
  const story = await mount(<EditableTagChipStory tag={{ id: TAG_ID, name: "Adventure" }} />);
  await story.getByRole("button", { name: "Edit label Adventure", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit label Adventure", exact: true }).getByText("This label was deleted.")).toBeVisible();
  await page.getByRole("button", { name: "Manage in Labels", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit label Adventure", exact: true })).toHaveCount(0);
});

test("a long label keeps the narrow popup and its controls inside their host", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const name = "W".repeat(72);
  await routeTrpc(page, {
    "tag.listTagsWithUsage": [
      {
        id: TAG_ID,
        name,
        color: null,
        color2: null,
        source: "manual",
        folderType: "NONE",
        sortOrder: null,
        isHiddenOnCard: false,
        usage: { characters: 1, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 1 },
        pendingSuggestions: 0,
      },
    ],
  });
  const story = await mount(<EditableTagChipStory tag={{ id: TAG_ID, name }} />);
  const chip = story.getByRole("button", { name: `Edit label ${name}`, exact: true });
  await expect.poll(() => chip.evaluate((button) => button.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  await chip.click();
  const popup = page.getByRole("dialog", { name: `Edit label ${name}`, exact: true });
  await expect(popup.getByRole("textbox", { name: "Name" })).toHaveValue(name);
  await popup.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
  await expect
    .poll(() => popup.evaluate((element) => ({ overflow: element.scrollWidth - element.clientWidth, left: element.scrollLeft })))
    .toEqual({
      overflow: 0,
      left: 0,
    });
  for (const control of [
    popup.getByRole("textbox", { name: "Name" }),
    popup.getByText("Background", { exact: true }),
    popup.getByText("Text", { exact: true }),
    popup.getByRole("button", { name: "Close label editor" }),
    popup.getByRole("button", { name: "Manage in Labels" }),
  ]) {
    await expect
      .poll(async () => {
        const bounds = await control.boundingBox();
        return bounds !== null && bounds.x >= 0 && bounds.x + bounds.width <= 390;
      })
      .toBe(true);
  }
});
