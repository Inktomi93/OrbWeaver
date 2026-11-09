// The shell's page structure on the production registry: every section has exactly one level-one heading and an outline that
// descends without skipping, and a popup mounts inside a landmark. axe reads the same rules the evidence walk reads.
import { POPUP_LAYER_NAME, rowActionsName } from "@orb/client/lib";
import { SECTION_IDS } from "@orb/client/state";
import { accessibilityScan, seedShellState } from "@orb/testkit/browser/spec";
import { SECTION_PROCEDURES } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_LIST_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import type { AppShellStory } from "./_app-shell-stories.tsx";
import { routeShell, SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellStory`;
const STRUCTURE_RULES = ["page-has-heading-one", "region", "heading-order", "aria-required-children"];

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

type Fixtures = Parameters<Parameters<typeof test>[2]>[0];

async function openSection(page: Page, corpus: Fixtures["corpus"], mount: Fixtures["mount"], section: string): Promise<void> {
  await routeShell(page, corpus, await root.internalCallerFor(root.ownerId), SECTION_PROCEDURES);
  await seedShellState(page, { activeSection: section });
  await mount<typeof AppShellStory>(STORY, {});
}

/** The heading levels the screen reader's outline holds, in document order. */
function outline(page: Page): Promise<number[]> {
  return page.getByRole("heading").evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
}

async function structureViolations(page: Page): Promise<string[]> {
  const { violations } = await accessibilityScan(page);
  return violations
    .filter(({ id }) => STRUCTURE_RULES.includes(id))
    .map(({ id, nodes }) => `${id}: ${nodes.map(({ target }) => target.join(" ")).join(" | ")}`);
}

for (const section of SECTION_IDS) {
  test(`${section} has one level-one heading and an outline that does not skip a level`, async ({ corpus, mount, page }) => {
    await openSection(page, corpus, mount, section);
    const titles = page.getByRole("heading", { level: 1 });
    await expect(titles).toHaveCount(1);
    await expect(titles).not.toHaveText(/^\s*$/u);
    const levels = await outline(page);
    expect(levels.filter((level, index) => index > 0 && level > (levels[index - 1] ?? 0) + 1)).toEqual([]);
    expect(await structureViolations(page)).toEqual([]);
  });
}

test("a menu opens inside the popup landmark, so no content sits outside every landmark", async ({ corpus, mount, page }) => {
  await openSection(page, corpus, mount, "characters");
  const actions = page.getByRole("button", { name: new RegExp(`^${rowActionsName("")}`, "u") }).first();
  await actions.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: POPUP_LAYER_NAME, exact: true }).getByRole("menu")).toBeVisible();
  expect(await structureViolations(page)).toEqual([]);
});

test("chat rows that share a title carry distinct names", async ({ corpus, mount, page }) => {
  await openSection(page, corpus, mount, "chats");
  const rows = page.getByRole("list", { name: CHAT_LIST_NAME, exact: true }).locator('[data-slot="list-row-body"]');
  await expect(rows.first()).toBeVisible();
  const names = await rows.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
  expect(names.length).toBeGreaterThan(1);
  expect(new Set(names).size).toBe(names.length);
});
