// CT: the settings shell (ux-flow-revamp J11 · Task #15 IA). Drives the PRODUCTION path — the category
// nav (USER/APP groups), the Discord-style subcategory rows under the active category, the default
// Appearance pane resolving over `settings.getUserSettings` (routeTrpc), switching to a placeholder
// category showing ITS distinct copy, and the fuzzy search-to-anchor (cmdk) jumping to a pane section.

// biome-ignore-all lint/security/noSecrets: the CSS attribute selectors used inside page.evaluate
// (`[role="…"]`, `[id$="…"]`, `[aria-current="…"]`) trip biome's entropy heuristic; none are secrets.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SettingsModalStory, SettingsShellStory } from "../_ct-stories";

/** The getUserSettings read-model the Appearance pane suspends on — defaults are enough to render it. */
const USER_SETTINGS_VIEW = {
  userId: "user_ct_settings",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

/** A resolved EffectiveAppConfig + owner viewer — the System pane suspends on these (Task #37). */
const APP_CONFIG = {
  corpusAutoindex: false,
  importSkipCharacters: [],
  logLevel: "info",
  forbidExternalMedia: true,
  trustHtml: false,
  memoryDefaults: {},
  memorySummarizer: {},
  rateLimits: { general: 100, aiTurn: 10, publicIp: 50, authed: 200 },
  vllmConcurrency: { embed: 4, summarize: 2 },
  allowNonOwnerLocalCompute: true,
  nonOwnerLocalComputeBudget: null,
  allowNonOwnerMaxProSub: false,
  maxImageBytes: 5_000_000,
};
const OWNER_VIEWER = { userId: "user_owner", handle: "owner", globalRole: "owner" };

test("renders the USER + APP group headings and the category rows", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await expect(component.getByText("User", { exact: true })).toBeVisible();
  await expect(component.getByText("App", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Appearance" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Connections" })).toBeVisible();
});

test("the nav is a navigation landmark and the active category carries aria-current", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await expect(component.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  // Appearance is the default active category → its row is aria-current.
  await expect(component.getByRole("button", { name: "Appearance" })).toHaveAttribute("aria-current", "true");
});

test("the active category expands into indented subcategory rows (Discord grammar)", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  // Appearance is active → its subcategory rows render as their own nav buttons.
  await expect(component.getByRole("button", { name: "Avatars" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Reading typography" })).toBeVisible();
  // Connections is NOT active → no subcategory rows appear for it (it has none anyway).
  await component.getByRole("button", { name: "Connections" }).click();
  await expect(component.getByRole("button", { name: "Avatars" })).toHaveCount(0);
});

test("Appearance is the default pane (a real setting-row surface, not a placeholder)", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  // The migrated #31 appearance surface renders its "Message style" SECTION heading (the nav also has a
  // "Message style" subcategory row — target the pane's <h2> heading specifically).
  await expect(component.getByRole("heading", { name: "Message style" })).toBeVisible();
});

test("clicking a subcategory row marks it aria-current", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("button", { name: "Avatars" }).click();
  await expect(component.getByRole("button", { name: "Avatars" })).toHaveAttribute("aria-current", "true");
});

test("switching to an unbuilt category shows ITS distinct teaching copy", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  // Automation is still an unbuilt teaching placeholder — its distinct copy renders on switch.
  await component.getByRole("button", { name: "Automation" }).click();
  await expect(component.getByText("Scheduled and triggered actions across your library.")).toBeVisible();
});

// Task #37 — System and Connections are now REAL panes (the placeholder is GONE for both), while the
// last unbuilt APP category (Automation) STAYS a teaching placeholder; Admin is a REAL pane too (its own
// gate tests below + admin-settings-surface.ct.tsx).
test("System + Connections are real panes; Automation stays a teaching placeholder", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "settings.getAppSettings": () => APP_CONFIG,
    "sessions.me": () => OWNER_VIEWER,
    "credentials.list": () => [],
  });
  const component = await mount(<SettingsShellStory />);

  // System → the real form surface (a "Media & trust" SECTION heading), NOT the teaching copy.
  await component.getByRole("button", { name: "System", exact: true }).click();
  await expect(component.getByRole("heading", { name: "Media & trust" })).toBeVisible();
  await expect(component.getByText("Deployment-wide media safety, compute, shared access, and operations.")).toHaveCount(0);

  // Connections → the real role-slot + key-library surface (its "Model roles" SECTION heading), NOT the
  // old teaching copy.
  await component.getByRole("button", { name: "Connections" }).click();
  await expect(component.getByRole("heading", { name: "Model roles" })).toBeVisible();
  await expect(component.getByText("Provider credentials and model connections.")).toHaveCount(0);

  // The last unbuilt APP category still renders its OWN distinct teaching copy.
  await component.getByRole("button", { name: "Automation" }).click();
  await expect(component.getByText("Scheduled and triggered actions across your library.")).toBeVisible();
});

// The admin gate (settings-nav-model `adminOnly` — UX honesty over the server's adminProcedure floor):
// the Admin category exists in the nav + search ONLY for owner ∪ admin viewers.
test("a plain user never sees the Admin category (nav row + search entry hidden)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "sessions.me": () => ({ userId: "user_plain", handle: "plain", globalRole: "user" }),
  });
  const component = await mount(<SettingsShellStory />);

  // The APP group renders (Connections is there) but Admin's row is absent.
  await expect(component.getByRole("button", { name: "Connections" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Admin" })).toHaveCount(0);

  // The search index hides the admin entries too.
  await component.getByRole("combobox", { name: "Search settings" }).fill("create user");
  await expect(component.getByRole("option", { name: "Create user" })).toHaveCount(0);
});

test("an admin viewer sees the Admin category and it mounts the REAL pane", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "sessions.me": () => ({ userId: "user_admin", handle: "admin", globalRole: "admin" }),
    "admin.listUsers": () => [],
    "admin.vllmEngines": () => ({}),
  });
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("button", { name: "Admin" }).click();
  // The real pane's registry-anchored sub-nav (Users + Engines sections) — not the old teaching
  // placeholder. The admin pane renders its sections as sub-navigation buttons (like every category
  // with subcategories), so the REAL-pane proof is the presence of those section entries.
  await expect(component.getByRole("button", { name: "Users" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Engines" })).toBeVisible();
});

// Task #37 — the System knobs are fuzzy-searchable like everything else; a hit jumps to its pane + anchor.
test("fuzzy search jumps to a System subcategory anchor", async ({ mount, page }) => {
  await routeTrpc(page, {
    "settings.getUserSettings": () => USER_SETTINGS_VIEW,
    "settings.getAppSettings": () => APP_CONFIG,
    "sessions.me": () => OWNER_VIEWER,
  });
  const component = await mount(<SettingsShellStory />);

  // "log level" matches the System › Operations › Log level setting (fuzzy over label + keywords).
  await component.getByRole("combobox", { name: "Search settings" }).fill("log level");
  const result = component.getByRole("option", { name: "Log level" }).first();
  await expect(result).toBeVisible();
  await result.click();

  // The jump switched into the System pane and scrolled its Operations section into view.
  await expect(component.getByRole("heading", { name: "Operations" })).toBeInViewport();
  await expect(component.getByRole("button", { name: "System", exact: true })).toBeVisible();
});

test("fuzzy search surfaces a setting result and jumps its pane into view", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);

  // Start on a placeholder pane so the jump has to switch panes back to Appearance.
  await component.getByRole("button", { name: "Connections" }).click();

  // "avatar size" matches the Appearance › Avatars › Avatar size setting (fuzzy over label + keywords).
  await component.getByRole("combobox", { name: "Search settings" }).fill("avatar size");
  const result = component.getByRole("option", { name: "Avatar size" }).first();
  await expect(result).toBeVisible();
  await result.click();

  // The jump switched back to the Appearance pane (its Avatars section heading is now on screen) and
  // cleared the query (the category tree returned).
  await expect(component.getByRole("heading", { name: "Avatars" })).toBeInViewport();
  await expect(component.getByRole("button", { name: "Appearance" })).toBeVisible();
});

// Each column OWNS its scroll axis: the Row is `align="stretch"`, so both the nav landmark and the pane
// region FILL the row height and their own `overflow-y-auto` caps + scrolls them internally — the outer
// modal wrapper never scrolls (side-eye round-3, nav-button top 262→-1516).
test("both settings columns fill the row height (own their scroll axis; nav can't be swept)", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await expect(component.getByRole("combobox", { name: "Search settings" })).toBeVisible();

  const heights = await page.evaluate(() => {
    const nav = document.querySelector('[role="navigation"]');
    const content = document.querySelector('[role="region"]');
    const row = nav?.parentElement ?? null;
    const isScroller = (el: Element | null): boolean => el !== null && ["auto", "scroll"].includes(getComputedStyle(el).overflowY);
    return {
      row: row?.clientHeight ?? -1,
      nav: nav?.clientHeight ?? -2,
      content: content?.clientHeight ?? -3,
      navScrolls: isScroller(nav),
      contentScrolls: isScroller(content),
    };
  });
  expect(heights.navScrolls).toBe(true);
  expect(heights.contentScrolls).toBe(true);
  expect(Math.abs(heights.nav - heights.row)).toBeLessThan(2);
  expect(Math.abs(heights.content - heights.row)).toBeLessThan(2);
});

// Scroll-spy (owner ruling): scrolling the pane updates which subcategory row is aria-current, and a
// short trailing section still wins once you scroll to the very bottom.
test("scrolling to the bottom activates the last subcategory (scroll-spy)", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();
  // At rest, the first section is active — Effects is NOT.
  await expect(component.getByRole("button", { name: "Effects" })).not.toHaveAttribute("aria-current", "true");

  // Scroll the pane region to the very bottom → the short trailing "Effects" section wins.
  await page.evaluate(() => {
    const region = document.querySelector('[role="region"]') as HTMLElement | null;
    if (region !== null) {
      region.scrollTop = region.scrollHeight;
    }
  });

  await expect(component.getByRole("button", { name: "Effects" })).toHaveAttribute("aria-current", "true");
});

// Click-jump suppresses the spy so the nav never flickers through intermediate sections during the
// programmatic smooth scroll: a MutationObserver records EVERY subcategory that gains aria-current from
// the click until the scroll settles — only the target should ever appear.
test("a distant subcategory click lands on the target, never an intermediate (spy suppressed)", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  // Record every nav row that gains aria-current from now on (before the click).
  await page.evaluate(() => {
    const w = globalThis as unknown as { __seen: string[] };
    w.__seen = [];
    const nav = document.querySelector('[role="navigation"]');
    if (nav === null) {
      return;
    }
    const record = (): void => {
      // Every element that is aria-current at this mutation (the active CATEGORY row is always current
      // AND a subcategory row) — collect all so an intermediate subcategory flicker can't hide.
      for (const el of nav.querySelectorAll('[aria-current="true"]')) {
        const label = el.textContent?.trim();
        if (label !== undefined && label !== "" && !w.__seen.includes(label)) {
          w.__seen.push(label);
        }
      }
    };
    new MutationObserver(record).observe(nav, {
      attributeFilter: ["aria-current"],
      attributes: true,
      subtree: true,
    });
  });

  await component.getByRole("button", { name: "Effects" }).click();
  await expect(component.getByRole("button", { name: "Effects" })).toHaveAttribute("aria-current", "true");

  // Wait for the programmatic smooth-scroll to fully settle (scrollTop stable for several polls), so any
  // post-settle spy tick is included in the sample.
  await page.waitForFunction(() => {
    const w = globalThis as unknown as { __top?: number; __stable?: number };
    const region = document.querySelector('[role="region"]') as HTMLElement | null;
    if (region === null) {
      return false;
    }
    if (w.__top === region.scrollTop) {
      w.__stable = (w.__stable ?? 0) + 1;
    } else {
      w.__stable = 0;
      w.__top = region.scrollTop;
    }
    return (w.__stable ?? 0) > 4;
  });

  const seen = await page.evaluate(() => (globalThis as unknown as { __seen: string[] }).__seen);
  // The only rows that ever held aria-current during the jump are the target subcategory (Effects) and
  // its parent category (Appearance, always current) — no INTERMEDIATE section flickered through.
  expect(seen.filter((label) => label !== "Effects" && label !== "Appearance")).toEqual([]);
});

// Flash geometry (owner P3): after a jump the flashed SECTION carries the inset-ring highlight, its box
// hugs the section's own content (height == the section's height, no grid stretch), and it sits fully
// within the scroll container's visible width (the inset ring can't be clipped at the scroll edge).
test("the jump flash hugs the section box and stays within the scroll container", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const component = await mount(<SettingsShellStory />);
  await component.getByRole("heading", { name: "Message style" }).waitFor();

  await component.getByRole("button", { name: "Avatars" }).click();

  // Wait for the transient flash ring to land on the section (rAF-polled + smooth scroll), then measure
  // while it is present.
  await page.waitForFunction(() => {
    const section = document.querySelector('[id$="-avatars"]');
    return section !== null && getComputedStyle(section).boxShadow.includes("inset");
  });

  const geo = await page.evaluate(() => {
    const section = document.querySelector('[id$="-avatars"]') as HTMLElement | null;
    const region = document.querySelector('[role="region"]') as HTMLElement | null;
    if (section === null || region === null) {
      return null;
    }
    const sb = section.getBoundingClientRect();
    const rb = region.getBoundingClientRect();
    return {
      hasInsetRing: getComputedStyle(section).boxShadow.includes("inset"),
      sectionHeight: Math.round(sb.height),
      scrollHeight: section.scrollHeight,
      withinLeft: sb.left >= rb.left - 1,
      withinRight: sb.right <= rb.left + region.clientWidth + 1,
    };
  });

  expect(geo).not.toBeNull();
  // The flash is an INSET ring on the section (never an outset outline clipped at the scroll edge).
  expect(geo?.hasInsetRing).toBe(true);
  // The box hugs content — its rendered height is its own content height (no grid-stretch dead space).
  expect(Math.abs((geo?.sectionHeight ?? 0) - (geo?.scrollHeight ?? -1))).toBeLessThanOrEqual(2);
  expect(geo?.withinLeft).toBe(true);
  expect(geo?.withinRight).toBe(true);
});

// Header divider + top alignment (owner item 3): inside the real modal chrome, the `.shell-modal-header`
// hairline spans the FULL modal content width (not a nav-column orphan), and the nav's "User" heading
// starts at the SAME baseline as the pane's first section (the full-width search no longer offsets them).
test("the modal header divider spans the full content width and the columns share a top baseline", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  await mount(<SettingsModalStory />);
  await page.getByRole("heading", { name: "Message style" }).waitFor();

  const geo = await page.evaluate(() => {
    const popup = document.querySelector('[data-slot="dialog-popup"]') as HTMLElement | null;
    const header = document.querySelector(".shell-modal-header") as HTMLElement | null;
    const firstSection = document.querySelector('[id^="settings-anchor-appearance-"]') as HTMLElement | null;
    const userLabel = [...document.querySelectorAll("*")].find((n) => n.textContent === "User");
    if (popup === null || header === null || firstSection === null || userLabel === undefined) {
      return null;
    }
    const popupCS = getComputedStyle(popup);
    const contentWidth = popup.clientWidth - Number.parseFloat(popupCS.paddingLeft) - Number.parseFloat(popupCS.paddingRight);
    return {
      headerWidth: Math.round(header.getBoundingClientRect().width),
      contentWidth: Math.round(contentWidth),
      hasBorder: getComputedStyle(header).borderBottomWidth !== "0px",
      userTop: Math.round(userLabel.getBoundingClientRect().top),
      sectionTop: Math.round(firstSection.getBoundingClientRect().top),
    };
  });

  expect(geo).not.toBeNull();
  // The divider (header border) spans the full modal content box, not the nav column.
  expect(geo?.hasBorder).toBe(true);
  expect(Math.abs((geo?.headerWidth ?? 0) - (geo?.contentWidth ?? -1))).toBeLessThanOrEqual(2);
  // "User" (nav) and the first section (pane) start at the same baseline.
  expect(Math.abs((geo?.userTop ?? 0) - (geo?.sectionTop ?? -1))).toBeLessThanOrEqual(2);
});
