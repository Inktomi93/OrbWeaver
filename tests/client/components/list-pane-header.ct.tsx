// @subject packages/client/src/components/list-pane-header.tsx
// @subject packages/client/src/components/list-pane-header-host.tsx
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { ListPaneHeaderStory } from "./_list-pane-header-stories.tsx";

test("the title and census keep their readable hierarchy, hiding only bare zero counts", async ({ mount }) => {
  const component = await mount<typeof ListPaneHeaderStory>("tests/client/components/_list-pane-header-stories/ListPaneHeaderStory", {
    count: 12,
    title: "Characters",
  });
  const heading = component.getByRole("heading", { level: 2 });
  const count = component.getByText("12", { exact: true });
  const rem = await heading.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  await expect(heading).toHaveCSS("font-size", `${String(Number.parseFloat(TOKENS["text.display"].value) * rem)}px`);
  await expect(count).toHaveCSS("font-size", `${String(Number.parseFloat(TOKENS["text.label"].value) * rem)}px`);
  await expect(heading).toHaveCSS("text-transform", "none");
  await expect(count).toHaveCSS("text-transform", "none");
  await expect(count).toHaveCSS("font-variant-numeric", "tabular-nums");
  await expect(count).toHaveCSS("font-family", await heading.evaluate((element) => getComputedStyle(element).fontFamily));
  await expect
    .poll(() =>
      count.evaluate((element) => {
        const title = element.previousElementSibling;
        if (title === null) {
          throw new Error("The census has no preceding title");
        }
        return element.getBoundingClientRect().left - title.getBoundingClientRect().right;
      }),
    )
    .toBeGreaterThan(0);

  await component.update({ count: 0, title: "Characters" });
  await expect(heading).toHaveText("Characters");
  await component.update({ count: "0", title: "Characters" });
  await expect(heading).toHaveText("Characters");
  await component.update({ count: "0 of 11", title: "Characters" });
  await expect(heading.getByText("0 of 11", { exact: true })).toBeVisible();
  await component.update({ title: "Characters" });
  await expect(heading).toHaveText("Characters");
});

test("a scoped header names its entity at the title's step with a quieter tone", async ({ mount }) => {
  const component = await mount<typeof ListPaneHeaderStory>("tests/client/components/_list-pane-header-stories/ListPaneHeaderStory", {
    accent: "Sola",
    count: 8,
    title: "Chats",
  });
  const heading = component.getByRole("heading", { level: 2 });
  const accent = heading.getByText("Sola", { exact: true });
  await expect(heading).toContainText("Chats · Sola");
  await expect(heading.getByText("8", { exact: true })).toBeVisible();
  await expect(accent).toHaveCSS("font-size", await heading.evaluate((element) => getComputedStyle(element).fontSize));
  const titleColor = await heading.evaluate((element) => getComputedStyle(element).color);
  await expect(accent).not.toHaveCSS("color", titleColor);
});

test("back is keyboard operable and the host renders one optional action and its resulting overlay", async ({ mount }) => {
  const component = await mount<typeof ListPaneHeaderStory>("tests/client/components/_list-pane-header-stories/ListPaneHeaderStory", {
    title: "Chats",
    withAction: true,
    withBack: true,
  });
  const back = component.getByRole("button", { name: "Back to all characters", exact: true });
  await expect(back).toBeVisible();
  await back.focus();
  await expect(back).toBeFocused();
  await back.press("Enter");
  await expect(component.getByText("Back activated 1; action activated 0", { exact: true })).toBeVisible();

  const markedAction = component.locator('[data-slot="list-pane-action"]');
  await expect(markedAction).toHaveCount(1);
  await markedAction.getByRole("button", { name: "New chat", exact: true }).click();
  await expect(component.getByText("Back activated 1; action activated 1", { exact: true })).toBeVisible();
  await expect(component.getByRole("button")).toHaveCount(2);

  await component.update({ title: "Chats" });
  await expect(component.getByRole("button")).toHaveCount(0);
  await expect(markedAction).toHaveCount(0);
  await expect(component.getByRole("heading", { level: 2 })).toHaveText("Chats");
});

test("in a constrained host the unscoped title keeps its width instead of yielding to the census", async ({ mount }) => {
  const component = await mount<typeof ListPaneHeaderStory>("tests/client/components/_list-pane-header-stories/ListPaneHeaderStory", {
    count: "0 of 11",
    title: "Characters",
    width: "11rem",
  });
  const title = component.getByText("Characters", { exact: true });
  await expect(title).toBeVisible();
  await expect(component.getByText("0 of 11", { exact: true })).toBeVisible();
  await expect.poll(() => title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
