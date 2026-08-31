// CT: the Settings SEARCH (config-revamp-design.md §3.3/§6.4, #866 S2) — the typed-`@` search riding the
// LIST scroller's top, over the REAL door registries (`ConfigHostStory`). Drives the production seam: the
// static index (groups · sections · leaves), the DYNAMIC member rows (a collection's members through its own
// `useSearchRows` fiber), the token menu, the narrowing, the marked hits, and the JUMP — a selected hit
// deep-links through `openConfigTo` and the CONTENT pane lands on the section's own anchor.
//
// The three MOVED-LEAF pins from the retired shell's search live here now (their `deletions` receipts name
// this file): an ABSORBED appearance leaf ("Reduce motion" — its `motion` sub merged into Sizing & motion)
// still jumps to a live anchor; a MOVED chat-behavior leaf ("Custom stopping strings") still lands on
// message-handling; the admin leaves stay invisible to a plain viewer (`when` parity — one predicate, three
// consumers).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ConfigHostStory } from "../_ct-stories.tsx";

const USER_SETTINGS_VIEW = { userId: "user_ct_search", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** One tag, so a MEMBER row exists for the dynamic-rows pin. */
const TAG = {
  id: "tag_ct_search00000001",
  name: "slice-of-life",
  color: null,
  proposed: false,
  usage: { characters: 1, chats: 0, books: 0, personas: 0, presets: 0, total: 1 },
  createdAt: 1,
  updatedAt: 1,
};

const AMBIENT: Readonly<Record<string, unknown>> = {
  "sessions.me": { userId: USER_SETTINGS_VIEW.userId, handle: "ct_search", globalRole: "user" },
  "settings.getUserSettings": () => USER_SETTINGS_VIEW,
  // The Looks section (#866 S4) reads the theme library the moment the appearance group mounts.
  "settings.listThemes": () => [],
  "tag.listTagsWithUsage": [TAG],
  "regex.listScripts": [],
  "worldInfo.listBooksWithUsage": [],
  "rosterPreset.list": [],
  "persona.list": [],
};

async function stub(page: Page, extra: Readonly<Record<string, unknown>> = {}): Promise<void> {
  await routeTrpc(page, { ...AMBIENT, ...extra });
}

test("aria-expanded follows the LIST's existence: collapsed at rest, true with a query, back when cleared", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  const search = component.getByRole("combobox", { name: "Search settings" });
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByRole("listbox")).toHaveCount(0);

  await search.fill("avatar size");
  await expect(component.getByRole("listbox")).toHaveCount(1);
  await expect(search).toHaveAttribute("aria-expanded", "true");

  await search.fill("");
  await expect(component.getByRole("listbox")).toHaveCount(0);
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

test("typing `@` opens the TOKEN MENU and a pick completes the token in place; the funnel does the same", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const search = component.getByRole("combobox", { name: "Search settings" });

  await search.fill("@");
  await expect(component.getByRole("option", { name: /@modified/ })).toBeVisible();
  await expect(component.getByRole("option", { name: /@shelf:/ })).toBeVisible();
  await component.getByRole("option", { name: /@shelf:/ }).click();
  await expect(search).toHaveValue("@shelf:");

  // The FUNNEL is the same door for a reader who doesn't know the grammar.
  await search.fill("");
  await component.getByRole("button", { name: "Add a search filter" }).click();
  await expect(component.getByRole("option", { name: /@modified/ })).toBeVisible();
});

test("a hit jumps: the selected section's anchor lands in the CONTENT pane, marked label and all", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const search = component.getByRole("combobox", { name: "Search settings" });

  await search.fill("avatar size");
  const hit = component.getByRole("option", { name: /Avatar size/ });
  await expect(hit).toBeVisible();
  // The hit shows WHY it matched — a real <mark> inside the row label (§3.3 hits-in-place).
  await expect(hit.locator("mark").first()).toHaveText(/avatar/i);
  await hit.click();

  await expect(component.getByRole("region", { name: "Appearance settings" })).toBeVisible();
  await expect(component.locator("#config-anchor-appearance-avatars")).toBeInViewport();
  // The query SURVIVES the jump (marks live for the life of the query) — clearing is the reader's act.
  await expect(search).toHaveValue("avatar size");
});

test("@shelf:user narrows to the user shelf; an APP group's rows drop out", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const search = component.getByRole("combobox", { name: "Search settings" });

  await search.fill("model roles");
  await expect(component.getByRole("option", { name: /Model roles/ })).toBeVisible();

  await search.fill("@shelf:user model roles");
  await expect(component.getByRole("option", { name: /Model roles/ })).toHaveCount(0);
  await search.fill("@shelf:app model roles");
  await expect(component.getByRole("option", { name: /Model roles/ })).toBeVisible();
});

test("a COLLECTION MEMBER is found by name (the dynamic `useSearchRows` fiber) and opens as the member", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);
  const search = component.getByRole("combobox", { name: "Search settings" });

  await search.fill("slice-of-life");
  const hit = component.getByRole("option", { name: /slice-of-life/ });
  await expect(hit).toBeVisible();
  await hit.click();
  // The member's own editor takes the CONTENT pane (C-7: mounted, never a dialog).
  await expect(component.getByRole("region", { name: "Settings", exact: true })).toBeVisible();
});

test("an ABSORBED leaf still jumps to a LIVE anchor — 'Reduce motion' lands on Sizing & motion", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("reduce motion");
  const hit = component.getByRole("option", { name: /Reduce motion/ });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(component.locator("#config-anchor-appearance-sizing")).toBeInViewport();
  await expect(component.getByRole("switch", { name: "Reduce motion" })).toBeVisible();
});

test("a MOVED leaf still jumps — 'stopping strings' lands on chat-behavior's message handling", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("stopping strings");
  const hit = component.getByRole("option", { name: /stopping strings/i }).first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(component.locator("#config-anchor-chat-behavior-message-handling")).toBeInViewport();
  await expect(component.getByRole("textbox", { name: "Custom stopping strings" })).toBeVisible();
});

test("`when` parity: a plain viewer's search has NO admin hits — one predicate, three consumers", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("engines");
  await expect(component.getByRole("option", { name: /Engines/ })).toHaveCount(0);
});
