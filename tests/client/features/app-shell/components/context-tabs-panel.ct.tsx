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
import { ContextBracketStory, ContextDefaultTabStory, ContextTabStripStory } from "../_ct-stories";

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

// ── The two-strip bracket (Context-Panel-Program §4.2/§4.6 — W3a generic mechanism) ──────────────────

test("backward-compat: a meta-only tab set renders ONE strip, no bracket (byte-identical to today)", async ({ mount }) => {
  // Every standard section's tabs default strip:"meta" — the existing story is all meta, so it must stay
  // a SINGLE tablist. The bracket appears ONLY when a game tab exists.
  const component = await mount(<ContextTabStripStory width={291} />);
  await expect(component.getByRole("tablist")).toHaveCount(1);
  await expect(component.getByRole("tablist")).toHaveAttribute("aria-label", "Detail");
});

test("game+meta: TWO labeled strips, ONE selection crossing both", async ({ mount }) => {
  const component = await mount(<ContextBracketStory />);

  // Two strips, each its own a11y group.
  const gameStrip = component.getByRole("tablist", { name: "Game" });
  const chatStrip = component.getByRole("tablist", { name: "Chat" });
  await expect(gameStrip).toBeVisible();
  await expect(chatStrip).toBeVisible();
  // The game tabs live in the game strip; the meta tabs in the chat strip.
  await expect(gameStrip.getByRole("tab", { name: "Status" })).toBeVisible();
  await expect(chatStrip.getByRole("tab", { name: "Members" })).toBeVisible();

  // One selection: activate a GAME tab → its panel shows, only it is selected.
  await gameStrip.getByRole("tab", { name: "Status" }).click();
  await expect(component.getByTestId("ctx-body-status")).toBeVisible();
  await expect(gameStrip.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");

  // Now activate a META tab (the other strip) → viewport follows, the game tab deselects.
  await chatStrip.getByRole("tab", { name: "Settings" }).click();
  await expect(component.getByTestId("ctx-body-settings")).toBeVisible();
  await expect(chatStrip.getByRole("tab", { name: "Settings" })).toHaveAttribute("aria-selected", "true");
  await expect(gameStrip.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "false");
  // Exactly one tab is selected across BOTH strips.
  await expect(component.getByRole("tab", { selected: true })).toHaveCount(1);
});

test("defaultTab (§4.1): a fresh panel lands on the flagged tab, not the declared-order first", async ({ mount }) => {
  // `members` is first in declared order, but `rpg.status` flags `defaultTab` — a game chat must land on
  // Status (the game-state centerpiece), not the roster's Members. No stored contextTab ⇒ the flag decides.
  const component = await mount(<ContextDefaultTabStory />);
  await expect(component.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "false");
  await expect(component.getByTestId("ctx-body-status")).toBeVisible();

  // Continuity holds: an explicit selection of a DIFFERENT visible tab still wins over the default.
  await component.getByRole("tab", { name: "Members" }).click();
  await expect(component.getByRole("tab", { name: "Members" })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "false");
});

test("indicator: exactly ONE underline, in the strip that holds the active tab (never a spurious twin)", async ({ mount }) => {
  // Both strips share the one Tabs.Root value, so a naive per-strip <TabsIndicator/> parks the OTHER strip's
  // indicator at position 0 — a second underline on the wrong strip. The fix renders the indicator ONLY in
  // the strip that contains the active tab (§4.2 "exactly ONE tab selected across both strips").
  const component = await mount(<ContextBracketStory />);
  const gameStrip = component.getByRole("tablist", { name: "Game" });
  const chatStrip = component.getByRole("tablist", { name: "Chat" });
  const indicator = component.locator('[data-slot="tabs-indicator"]');

  // Activate a GAME tab → the underline lives in the GAME strip only, none in the Chat strip.
  await gameStrip.getByRole("tab", { name: "Status" }).click();
  await expect(indicator).toHaveCount(1);
  await expect(gameStrip.locator('[data-slot="tabs-indicator"]')).toHaveCount(1);
  await expect(chatStrip.locator('[data-slot="tabs-indicator"]')).toHaveCount(0);

  // Activate a META tab → the underline moves to the CHAT strip only, none in the Game strip.
  await chatStrip.getByRole("tab", { name: "Settings" }).click();
  await expect(indicator).toHaveCount(1);
  await expect(chatStrip.locator('[data-slot="tabs-indicator"]')).toHaveCount(1);
  await expect(gameStrip.locator('[data-slot="tabs-indicator"]')).toHaveCount(0);
});

test("PHASE disabled: aria-disabled + reason on title, focusable-discoverable (not `disabled`)", async ({ mount }) => {
  const component = await mount(<ContextBracketStory />);
  const map = component.getByRole("tab", { name: "Map" });
  await expect(map).toHaveAttribute("aria-disabled", "true");
  await expect(map).toHaveAttribute("title", "Maps unlock with the map arc (MA-3)");
  // Discoverable, not removed from the a11y tree — the reason stays reachable (the OSRS locked-tab pattern).
  await expect(map).toBeVisible();
});

test("badge: a boolean dot + a count, never on the active tab", async ({ mount }) => {
  const component = await mount(<ContextBracketStory />);
  // The count badge (badge:3 on Game) renders its number.
  await expect(component.getByRole("tab", { name: "Game" }).getByText("3")).toBeVisible();
  // The boolean-badge tab (Scene) shows the corner dot.
  await expect(component.getByRole("tab", { name: "Scene" }).locator("span.rounded-full")).toBeVisible();

  // Activating a badged tab drops its badge (never on the active tab).
  await component.getByRole("tab", { name: "Scene" }).click();
  await expect(component.getByRole("tab", { name: "Scene" })).toHaveAttribute("aria-selected", "true");
  await expect(component.getByRole("tab", { name: "Scene" }).locator("span.rounded-full")).toHaveCount(0);
});
