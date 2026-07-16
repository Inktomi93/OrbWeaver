// Rail CT — the persistent nav column in isolation: every section + footer action renders as a real
// <button> with an accessible name (a11y baseline, §4a), the active section carries aria-current, and
// the buttons are keyboard-focusable in order.

import { expect, test } from "@playwright/experimental-ct-react";
import { RailStory } from "../_ct-stories";

test("renders every section + footer action as a named button; active = aria-current", async ({ mount }) => {
  const rail = await mount(<RailStory />);

  await Promise.all(["Chats", "Characters", "Corpus", "Refinery", "Analytics"].map((name) => expect(rail.getByRole("button", { name })).toBeVisible()));
  await expect(rail.getByRole("button", { name: "Switch theme" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Account" })).toBeVisible();

  // Active section (chats) is marked current; a sibling is not.
  await expect(rail.getByRole("button", { name: "Chats" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("button", { name: "Corpus" })).not.toHaveAttribute("aria-current");
});

test("rail buttons are keyboard-focusable", async ({ mount }) => {
  const rail = await mount(<RailStory />);
  const chats = rail.getByRole("button", { name: "Chats" });
  await chats.focus();
  await expect(chats).toBeFocused();
});
