// SectionContent CT: a section inside the keep-mounted window survives leaving and returning, so the rail
// swap back is a reveal, not a fresh mount of the whole section.

import { expect, test } from "@playwright/experimental-ct-react";
import { SectionContentKeepMountedStory } from "../_ct-stories.tsx";

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
