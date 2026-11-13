// @subject packages/client/src/features/discovery/components/corpus-archetypes-tab.tsx
// The Corpus CONTEXT Archetypes tab reads through the shared boundary: a held read shows the shared loading skeleton,
// a failed one the shared error block with a Retry that refetches, and one section's failure leaves the other standing.

import { contextToggleLabel } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { holdServed, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import { CORPUS_CONTEXT_TAB_LABELS, CORPUS_PARAM_NAMES, CORPUS_READ_LABELS } from "#client/features/discovery/lib/corpus-control-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const SERVED = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES].filter((path) => path !== "discovery.catalog" && path !== "discovery.visualArchetypes");

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

async function openContextTab(page: Page, tab: string): Promise<ReturnType<Page["locator"]>> {
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  const context = page.locator(CONTEXT);
  await context.getByRole("tab", { name: tab, exact: true }).click();
  return context;
}

test("a held catalog read shows the loading skeleton, a failed one the shared error block, and Retry refetches", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  let held = false;
  let failing = true;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["discovery.visualArchetypes"]),
    ...serveCorpusProcedures(caller, ["discovery.catalog"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const context = await openContextTab(page, CORPUS_CONTEXT_TAB_LABELS.archetypes);
  await hold.requested;
  await expect(context.locator('[aria-busy="true"]')).toBeVisible();
  hold.fail();
  await expect(context.getByText(queryFailedLabel(CORPUS_READ_LABELS.archetypes), { exact: true })).toBeVisible();
  failing = false;
  await context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(context.getByText(queryFailedLabel(CORPUS_READ_LABELS.archetypes), { exact: true })).toHaveCount(0);
  await expect(context.getByRole("combobox", { name: CORPUS_PARAM_NAMES.clusters })).toBeVisible();
});

test("a failed art-archetypes read says so in its own section and leaves the writing section standing", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  let held = false;
  let failing = true;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, ["discovery.catalog"]),
    ...serveCorpusProcedures(caller, ["discovery.visualArchetypes"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const context = await openContextTab(page, CORPUS_CONTEXT_TAB_LABELS.archetypes);
  await hold.requested;
  await expect(context.locator('[aria-busy="true"]')).toBeVisible();
  hold.fail();
  await expect(context.getByText(queryFailedLabel(CORPUS_READ_LABELS.artArchetypes), { exact: true })).toBeVisible();
  await expect(context.getByText(queryFailedLabel(CORPUS_READ_LABELS.writingArchetypes), { exact: true })).toHaveCount(0);
  failing = false;
  await context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(context.getByText(queryFailedLabel(CORPUS_READ_LABELS.artArchetypes), { exact: true })).toHaveCount(0);
});

const SIMILARITY_READS = ["discovery.duplicateCharacters", "discovery.duplicateChats", "discovery.imageDuplicates"] as const;

test("a held nearest-pairs read shows the loading skeleton, a failed one the shared error block, and Retry refetches", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  let held = false;
  let failing = true;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, SIMILARITY_READS),
    ...serveCorpusProcedures(caller, ["discovery.catalog", "discovery.visualArchetypes"]),
    ...serveCorpusProcedures(caller, ["discovery.similarityGraph"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const context = await openContextTab(page, CORPUS_CONTEXT_TAB_LABELS.similarity);
  await hold.requested;
  await expect(context.locator('[aria-busy="true"]')).toBeVisible();
  hold.fail();
  await expect(context.getByText(queryFailedLabel(CORPUS_READ_LABELS.similarityGraph), { exact: true })).toBeVisible();
  failing = false;
  await context.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(context.getByText(queryFailedLabel(CORPUS_READ_LABELS.similarityGraph), { exact: true })).toHaveCount(0);
  await expect(context.getByRole("combobox", { name: CORPUS_PARAM_NAMES.minSimilarity })).toBeVisible();
});

test("changing a nearest-pairs knob keeps the settled pairs on screen while the new read is held", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  let reads = 0;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, SIMILARITY_READS),
    ...serveCorpusProcedures(caller, ["discovery.catalog", "discovery.visualArchetypes"]),
    ...serveCorpusProcedures(caller, ["discovery.similarityGraph"], () => {
      reads += 1;
      return reads === 2 ? hold : undefined;
    }),
  });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const context = await openContextTab(page, CORPUS_CONTEXT_TAB_LABELS.similarity);
  const knob = context.getByRole("combobox", { name: CORPUS_PARAM_NAMES.minSimilarity });
  await expect(knob).toBeVisible();
  await expect(context.locator('[aria-busy="true"]')).toHaveCount(0);
  const settled = await context
    .getByText(/pairs|No similarity edges at this threshold\./u)
    .first()
    .textContent();
  await knob.click();
  await page.getByRole("option", { name: "90%", exact: true }).click();
  await hold.requested;
  await expect(knob).toContainText("90%");
  await expect(context.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(context.getByText(settled ?? "", { exact: true }).first()).toBeVisible();
  hold.release();
  await expect(context.locator('[aria-busy="true"]')).toHaveCount(0);
});

test("a room pair's button name contains the relation badge it shows", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [...SERVED, ...SIMILARITY_READS, "discovery.catalog", "discovery.visualArchetypes", "discovery.similarityGraph"]),
  );
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const context = await openContextTab(page, CORPUS_CONTEXT_TAB_LABELS.similarity);
  await expect(context.getByRole("combobox", { name: CORPUS_PARAM_NAMES.minSimilarity })).toBeVisible();
  const forked = context.getByRole("button", { name: /compare rooms/u }).filter({ has: page.getByText("forked", { exact: true }) });
  await expect(forked.first()).toBeVisible();
  await expect(forked.first()).toHaveAccessibleName(/, forked, /u);
});

test("each archetype card is a group named for its archetype, so a character in several archetypes has one door under each name", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SERVED, "discovery.catalog", "discovery.visualArchetypes"]));
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const context = await openContextTab(page, CORPUS_CONTEXT_TAB_LABELS.archetypes);
  await expect(context.getByRole("combobox", { name: CORPUS_PARAM_NAMES.clusters })).toBeVisible();
  // A card's first door opens the archetype and carries its name, so the card's group is named by it.
  const cards = await context
    .getByRole("group")
    .evaluateAll((groups) => groups.map((group) => ({ label: group.getAttribute("aria-label"), opens: group.querySelector("button")?.textContent ?? null })));
  expect(cards.length).toBeGreaterThan(1);
  for (const card of cards) {
    expect(card.label).toBe(card.opens);
  }
  expect(new Set(cards.map((card) => card.label)).size).toBe(cards.length);
});
