// The desktop rail's active cell paints the primary tone's roles (D336): its tint, its on-tint ink, and on the Home brand
// the pigment glyph and accent bar. The cell stamps that tone itself, so no inner stamp can reset it to neutral.

import { computedStyle, seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_LABELS, SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ToneRole } from "@orb/ui/tokens";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { AppShellStory } from "../surfaces/_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "../surfaces/app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const ACTIVE = '.shell-rail [aria-current="page"]';

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

let root: Root;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** A primary-tone role as the page resolves it: a probe stamped with the primary tone inside the rail. */
function primaryRole(page: Page, role: ToneRole): Promise<string> {
  return page.locator(".shell-rail").evaluate((rail, cssVar) => {
    const probe = document.createElement("span");
    probe.dataset["tone"] = "primary";
    probe.style.color = `var(${cssVar})`;
    rail.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, TOKENS[`color.tone-${role}`].cssVar);
}

test("the active section cell takes the primary tint and its on-tint ink", async ({ corpus, mount, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedShellState(page, { activeSection: "characters" });
  await mount<typeof AppShellStory>(STORY, {});
  const cell = page.locator(ACTIVE);
  await expect(cell).toHaveAccessibleName(SECTION_LABELS.characters);
  await page.locator(".shell-topbar").hover();
  expect(await computedStyle(cell, "background-color")).toBe(await primaryRole(page, "tint"));
  expect(await computedStyle(cell.locator("svg").first(), "color")).toBe(await primaryRole(page, "text-on-tint"));
});

test("the active phone tab keeps the rail's tint and on-tint ink, a pair the D336 floors judge", async ({ corpus, mount, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
  await page.setViewportSize({ width: 430, height: 900 });
  await seedShellState(page, { activeSection: "characters" });
  await mount<typeof AppShellStory>(STORY, {});
  const cell = page.locator(ACTIVE);
  await expect(cell).toHaveAccessibleName(SECTION_LABELS.characters);
  await page.locator(".shell-topbar").hover();
  expect(await computedStyle(cell, "background-color")).toBe(await primaryRole(page, "tint"));
  expect(await computedStyle(cell.locator(".shell-rail-button-label"), "color")).toBe(await primaryRole(page, "text-on-tint"));
  expect(await computedStyle(cell.locator("svg").first(), "color")).toBe(await primaryRole(page, "text-on-tint"));
});

test("the active Home brand takes the primary tint, the pigment glyph and the accent bar", async ({ corpus, mount, page }) => {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedShellState(page, { activeSection: "home" });
  await mount<typeof AppShellStory>(STORY, {});
  const brand = page.locator('.shell-rail-brand-button[aria-current="page"]');
  await expect(brand).toBeVisible();
  await page.locator(".shell-topbar").hover();
  expect(await computedStyle(brand, "background-color")).toBe(await primaryRole(page, "tint"));
  expect(await computedStyle(brand.locator("svg"), "color")).toBe(await primaryRole(page, "solid"));
  expect(await computedStyle(brand, "background-color", "::before")).toBe(await primaryRole(page, "solid"));
});
