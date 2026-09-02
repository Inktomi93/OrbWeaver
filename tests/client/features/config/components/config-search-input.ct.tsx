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

/** EXACTLY ONE SETTING CHANGED, the live drive's own case (#1099 F16): `appearance.chatStyle` off its
 *  `bubble` default. Its section (Message style) owns two other leaves that are still at their defaults —
 *  which is the whole point: the defect was that a section-grain verdict answered for every leaf under it,
 *  so one changed setting returned five rows and three of them were untouched. */
const MODIFIED_SETTINGS_VIEW = {
  ...USER_SETTINGS_VIEW,
  config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, chatStyle: "flat" } },
};

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

// ── `@modified`: the honest answer, and the mark that makes it findable (#1099 F16 + Errand A) ───────────
// The LIST-band and shelf pins ride in THIS file rather than the list surface's own CT because they read the
// SAME derivation as the search filter (`useConfigModified`) off the SAME one-changed-setting stub: split
// across two files, the two halves could drift into disagreeing about which sections are modified, which is
// exactly the failure the one-map derivation exists to prevent.

test("@modified returns ONLY what differs — an unmodified sibling leaf of a modified section is not a hit", async ({ mount, page }) => {
  await stub(page, { "settings.getUserSettings": () => MODIFIED_SETTINGS_VIEW });
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("@modified ");
  const options = component.getByRole("listbox").getByRole("option");
  await expect(options).toHaveCount(3);
  // The group that holds it, the section that owns the key, and the leaf itself — nothing else.
  await expect(component.getByRole("option", { name: /^Appearance/ })).toHaveCount(1);
  await expect(component.getByRole("option", { name: /^Message style/ })).toHaveCount(1);
  await expect(component.getByRole("option", { name: /^Chat display/ })).toHaveCount(1);
  // The two leaves that ride the same section and were never touched.
  await expect(component.getByRole("option", { name: /Color quoted speech/ })).toHaveCount(0);
  await expect(component.getByRole("option", { name: /Auto-fix unfinished formatting/ })).toHaveCount(0);
});

test("every @modified hit CARRIES the mark — in its visible row and in its accessible name", async ({ mount, page }) => {
  await stub(page, { "settings.getUserSettings": () => MODIFIED_SETTINGS_VIEW });
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("@modified ");
  const options = component.getByRole("listbox").getByRole("option");
  await expect(options).toHaveCount(3);
  for (const option of await options.all()) {
    // The name is label (+ group) + the mark, joined with spaces by `aria-labelledby` — the visible token IS
    // the announced one, so a screen-reader user is told which hits are the changed ones too.
    await expect(option).toHaveAccessibleName(/ Modified$/);
    await expect(option.locator('[data-slot="config-search-mark"]')).toBeVisible();
  }
});

test("a modified setting is findable from a PLAIN query too: the hit says so without the token", async ({ mount, page }) => {
  await stub(page, { "settings.getUserSettings": () => MODIFIED_SETTINGS_VIEW });
  const component = await mount(<ConfigHostStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("chat display");
  await expect(component.getByRole("option", { name: /^Chat display/ }).first()).toHaveAccessibleName(/ Modified$/);
});

test("modified PROPAGATES UP: the group band and its shelf say so, at rest, with nothing typed", async ({ mount, page }) => {
  await stub(page, { "settings.getUserSettings": () => MODIFIED_SETTINGS_VIEW });
  const component = await mount(<ConfigHostStory />);

  // The band carries the word INSIDE the button, so it is part of the band's own accessible name.
  await expect(component.getByRole("button", { name: "Appearance Modified" })).toBeVisible();
  await expect(component.locator('[data-config-group="appearance"] [data-slot="config-group-modified"]')).toBeVisible();
  await expect(component.locator('[data-config-shelf="user"] [data-slot="config-shelf-modified"]')).toBeVisible();
  // A group with nothing changed inside it stays unmarked — the mark is a verdict, not decoration.
  await expect(component.locator('[data-config-group="connections"] [data-slot="config-group-modified"]')).toHaveCount(0);
});

test("nothing modified ⇒ no marks anywhere, and @modified is an honest empty", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ConfigHostStory />);

  await expect(component.locator('[data-slot="config-group-modified"]')).toHaveCount(0);
  await expect(component.locator('[data-slot="config-shelf-modified"]')).toHaveCount(0);
  await component.getByRole("combobox", { name: "Search settings" }).fill("@modified ");
  await expect(component.getByRole("listbox").getByRole("option")).toHaveCount(0);
});
