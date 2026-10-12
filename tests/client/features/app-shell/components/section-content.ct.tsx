// SectionContent CT: a section inside the keep-mounted window survives leaving and returning, so the rail
// swap back is a reveal, not a fresh mount of the whole section.

import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { userSettingsView } from "@orb/testkit/node/user-settings-view.ts";
import { expect, test } from "@playwright/experimental-ct-react";
import { AppShellContentFetchStory, SectionContentDeferredStory, SectionContentKeepMountedStory } from "../_ct-stories.tsx";

test("unrevealed phone content starts no request and revealed editors retain their draft", async ({ mount, page }) => {
  const calls = await routeTrpc(page, {
    "discovery.catalog": { totalDistilled: 0 },
    "character.count": 0,
    "character.get": { name: "Measured character" },
    "notifications.list": { items: [], nextCursor: null },
    "persona.list": [],
    "settings.getUserSettings": userSettingsView(),
  });
  const component = await mount(<SectionContentDeferredStory />);
  await expect(component.getByRole("button", { name: "Reveal content", exact: true })).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Retained editor" })).toHaveCount(0);
  await expect(component.getByText("list answered", { exact: true })).toBeVisible();
  await expect.poll(() => calls.inputs("discovery.catalog")).toHaveLength(0);
  await component.getByRole("button", { name: "Reveal content", exact: true }).click();
  await expect(component.getByText("content answered", { exact: true })).toBeVisible();
  const editor = component.getByRole("textbox", { name: "Retained editor" });
  await editor.fill("kept draft");
  await component.getByRole("button", { name: "Hide content", exact: true }).click();
  await expect(editor).toBeHidden();
  await component.getByRole("button", { name: "Reveal content", exact: true }).click();
  await expect(editor).toHaveValue("kept draft");
  await expect.poll(() => calls.inputs("discovery.catalog")).toHaveLength(1);
});

test("a kept section is revealed on return, not mounted again", async ({ mount }) => {
  const component = await mount(<SectionContentKeepMountedStory />);
  await expect(component.getByTestId("probe-home")).toHaveText("home mount 1");

  await component.getByRole("button", { name: "go chats" }).click();
  const chatsMount = await component.getByTestId("probe-chats").textContent();
  await component.getByRole("button", { name: "go home" }).click();
  await component.getByRole("button", { name: "go chats" }).click();

  await expect(component.getByTestId("probe-chats")).toBeVisible();
  await expect(component.getByTestId("probe-chats")).toHaveText(chatsMount ?? "unread");
  await component.getByRole("button", { name: "go home" }).click();
  await expect(component.getByTestId("probe-home")).toHaveText("home mount 1");
});

test("the shell applies the section inset and preserves declared full-bleed content", async ({ mount }) => {
  const component = await mount(<SectionContentKeepMountedStory />);
  const region = component.locator(".shell-region-fill:visible");
  await component.getByRole("button", { name: "go presets", exact: true }).click();
  await expect(component.getByTestId("probe-presets")).toBeVisible();
  await expect
    .poll(async () => {
      const inset = await region.evaluate((node) => {
        const probe = document.createElement("div");
        probe.style.paddingInlineStart = "var(--spacing-section)";
        node.append(probe);
        const expected = getComputedStyle(probe).paddingInlineStart;
        probe.remove();
        const style = getComputedStyle(node);
        return { expected, start: style.paddingInlineStart, end: style.paddingInlineEnd };
      });
      return { nonzero: inset.expected !== "0px", start: inset.start === inset.expected, end: inset.end === inset.expected };
    })
    .toEqual({ nonzero: true, start: true, end: true });
  await component.getByRole("button", { name: "go chats", exact: true }).click();
  await expect(component.getByTestId("probe-chats")).toBeVisible();
  await expect(region).toHaveCSS("padding-inline-start", "0px");
  await expect(region).toHaveCSS("padding-inline-end", "0px");
});

test("phone finder defers CONTENT requests until selection while desktop renders them immediately", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = await routeTrpc(page, {
    "discovery.catalog": { totalDistilled: 0 },
    "character.count": 0,
    "character.get": { name: "Measured character" },
    "notifications.list": { items: [], nextCursor: null },
    "persona.list": [],
    "settings.getUserSettings": userSettingsView(),
  });
  const component = await mount(<AppShellContentFetchStory />);
  await expect(component.getByRole("button", { name: "Open measured character", exact: true })).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Retained editor" })).toHaveCount(0);
  await expect(component.getByText("list answered", { exact: true })).toBeVisible();
  await expect.poll(() => calls.count("discovery.catalog")).toBe(0);
  await component.getByRole("button", { name: "Open measured character", exact: true }).click();
  await expect(component.getByText("content answered", { exact: true })).toBeVisible();
  await expect.poll(() => calls.count("discovery.catalog")).toBe(1);
});

test("desktop CONTENT starts its read on unselected library arrival", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await routeTrpc(page, {
    "discovery.catalog": { totalDistilled: 0 },
    "character.count": 0,
    "character.get": { name: "Measured character" },
    "notifications.list": { items: [], nextCursor: null },
    "persona.list": [],
    "settings.getUserSettings": userSettingsView(),
  });
  const component = await mount(<AppShellContentFetchStory />);
  await expect(component.getByText("content answered", { exact: true })).toBeVisible();
  await expect.poll(() => calls.count("discovery.catalog")).toBe(1);
});
