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

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const SERVED = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES].filter((path) => path !== "discovery.catalog" && path !== "discovery.visualArchetypes");

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

async function openArchetypes(page: Page): Promise<ReturnType<Page["locator"]>> {
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  const context = page.locator(CONTEXT);
  await context.getByRole("tab", { name: "Archetypes", exact: true }).click();
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
  const context = await openArchetypes(page);
  await hold.requested;
  await expect(context.locator('[aria-busy="true"]')).toBeVisible();
  hold.fail();
  await expect(context.getByText("Couldn't load archetypes.", { exact: true })).toBeVisible();
  failing = false;
  await context.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(context.getByText("Couldn't load archetypes.", { exact: true })).toHaveCount(0);
  await expect(context.getByRole("combobox", { name: "Clusters" })).toBeVisible();
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
  const context = await openArchetypes(page);
  await hold.requested;
  await expect(context.locator('[aria-busy="true"]')).toBeVisible();
  hold.fail();
  await expect(context.getByText("Couldn't load the art archetypes.", { exact: true })).toBeVisible();
  await expect(context.getByText("Couldn't load the writing archetypes.", { exact: true })).toHaveCount(0);
  failing = false;
  await context.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(context.getByText("Couldn't load the art archetypes.", { exact: true })).toHaveCount(0);
});
