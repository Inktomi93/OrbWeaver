// CT: the container-responsive CONTEXT tab strip (context-tabs-panel.tsx, Context-Panel-Program CP-1 ·
// UI-Arch §4.3 rule-4 · §4b axis-1 @container). The strip compresses word labels → icon+tooltip when its
// @container can't fit every current tab's words, and restores words when it can. The shell.css
// `.ctx-tab-strip` @container rules are loaded into the CT bundle (playwright/index.css + the story module
// imports shell.css), so the collapse resolves against the story's FIXED container width — narrow ⇒
// icon-mode, wide ⇒ label-mode. Both forms are proven, and the accessible NAME (aria-label) survives in
// BOTH (icon-only-without-a-name is banned — Jordan/§9). The live-browser geometry receipt (no-clip at the
// real 291px default tablist with 5 tabs, 127px headroom) is in the executor's snap --eval report; this CT
// pins the React contract + the CSS collapse behavior.

import { expect, test } from "@playwright/experimental-ct-react";
import { ContextTabStripStory } from "../_ct-stories";

const TAB_NAMES = ["Members", "Settings", "Preview", "Injections"] as const;

test("narrow container: icon-mode — labels visually collapse, but every tab keeps its accessible name", async ({ mount }) => {
  // 291px = the real default-width tablist. The 4-tab reveal threshold is 28rem (448px), so labels collapse.
  const component = await mount(<ContextTabStripStory width={291} />);

  // Every tab still resolves BY NAME (aria-label survives icon-mode — the tab is never nameless).
  await Promise.all(TAB_NAMES.map((name) => expect(component.getByRole("tab", { name })).toBeVisible()));
  // The visible WORD is collapsed: the label span is display:none in icon-mode.
  const membersLabel = component.getByRole("tab", { name: "Members" }).locator(".ctx-tab-label");
  await expect(membersLabel).toHaveCSS("display", "none");
  // The icon carries the tab (an SVG is present inside the tab).
  await expect(component.getByRole("tab", { name: "Members" }).locator("svg")).toBeVisible();
  // No horizontal clip — icon-mode fits (scrollWidth ≤ clientWidth).
  const clipped = await component.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});

test("wide container: label-mode — the word labels are shown", async ({ mount }) => {
  // 600px comfortably clears the 4-tab 28rem (448px) reveal threshold, so words return.
  const component = await mount(<ContextTabStripStory width={600} />);

  const membersLabel = component.getByRole("tab", { name: "Members" }).locator(".ctx-tab-label");
  await expect(membersLabel).not.toHaveCSS("display", "none");
  await expect(membersLabel).toHaveText("Members");
  const clipped = await component.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});

test("5 tabs at the default width (the Trackers ceiling): icon-mode, no clip", async ({ mount }) => {
  const component = await mount(<ContextTabStripStory width={291} showTrackers={true} />);

  // All 5 resolve by name…
  await Promise.all([...TAB_NAMES, "Trackers"].map((name) => expect(component.getByRole("tab", { name })).toBeVisible()));
  // …in icon-mode (5-tab reveal threshold is 35rem = 560px, unmet at 291px)…
  await expect(component.getByRole("tab", { name: "Trackers" }).locator(".ctx-tab-label")).toHaveCSS("display", "none");
  // …and the 5-icon strip does not clip (the structural headroom the word-label strip never had).
  const clipped = await component.getByRole("tablist").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped).toBe(false);
});

test("an icon-LESS tab keeps its word label unconditionally (never compressed to a nameless glyph)", async ({ mount }) => {
  // Narrow container ⇒ the icon tabs collapse, but the icon-less contributor tab has nothing to compress TO,
  // so its word stays (data-has-icon absent ⇒ shell.css never hides its label).
  const component = await mount(<ContextTabStripStory width={291} withIconless={true} />);

  const iconlessLabel = component.getByRole("tab", { name: "Iconless" }).locator(".ctx-tab-label");
  await expect(iconlessLabel).not.toHaveCSS("display", "none");
  await expect(iconlessLabel).toHaveText("Iconless");
  // Meanwhile an icon tab in the SAME strip is collapsed — the two coexist correctly.
  await expect(component.getByRole("tab", { name: "Members" }).locator(".ctx-tab-label")).toHaveCSS("display", "none");
});
