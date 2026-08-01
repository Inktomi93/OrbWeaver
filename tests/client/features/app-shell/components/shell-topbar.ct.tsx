// ShellTopbar LIST-PANE CAPABILITY CT (home-section-spec §4.4 / owner decision H3, arm L-b) — the shell
// learned that a section can declare it HAS NO list pane. What this pins is the defect it exists to
// prevent: on such a section the topbar must render NO list toggle at all, so the app's front door can
// never open a panel reading "Home list — this surface isn't wired yet". Every other section is untouched.
//
// Driven through the REAL shell + the REAL section registry, so it is the shipped `panels.list` field
// being read, not a hand-fed prop.

import { expect, test } from "@playwright/experimental-ct-react";
import { AppShellOnSectionStory } from "../_ct-stories";

const LIST_TOGGLE_RE = /^(?:Show|Hide) list panel$/u;

test("home declares no LIST pane, so the topbar renders NO list toggle", async ({ mount }) => {
  const shell = await mount(<AppShellOnSectionStory section="home" />);

  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toHaveCount(0);
  // …and the pane track stays collapsed — no half-open panel behind a missing control.
  await expect(shell.locator(".shell-grid")).toHaveAttribute("data-list-mode", "collapsed");
});

test("chats still has its list toggle — the capability is per-section, not a global removal", async ({ mount }) => {
  const shell = await mount(<AppShellOnSectionStory section="chats" />);

  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toHaveCount(1);
});
