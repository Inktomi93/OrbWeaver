// @subject packages/client/src/features/databank/surfaces/databank-detail-surface.tsx
// An empty Databank has one empty state: the LIST's, with its Add door, while the list is on screen; the CONTENT pane
// then carries a heading and a note instead of a second empty state, and stands in for the list only when it is off screen.

import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  "databank.bankHealth",
  "databank.listGlobal",
  "databank.listAttachments",
  "databank.get",
] as const;
const EMPTY_STATE = '[data-slot="empty-state-root"]:visible';

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

async function openEmptyDatabank(
  page: Page,
  root: Awaited<ReturnType<typeof createFirstBootHarness>>,
  signedIn: Parameters<typeof routeAuthConfig>[1],
  list: "docked" | "collapsed",
): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, signedIn);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await seedShellState(page, { activeSection: "databank", panelOverrides: { databank: { list, context: "collapsed" } } });
}

test("with the list on screen an empty bank shows the list's one empty state and a heading and note in CONTENT", async ({ corpus, mount, page }) => {
  await using root = await createFirstBootHarness();
  await openEmptyDatabank(page, root, corpus.auth.signedInConfig, "docked");
  await mount<typeof ShellAmbientStory>(STORY, {});
  const content = page.locator('[data-slot="databank-content"]');
  await expect(content.getByRole("heading", { level: 2 })).toBeVisible();
  // The control: the list's own empty state and its Add door are on screen, so the count below is not an empty page.
  await expect(page.getByRole("button", { name: "Add a document", exact: true }).first()).toBeVisible();
  await expect(page.locator(EMPTY_STATE)).toHaveCount(1);
  await expect(content.locator(EMPTY_STATE)).toHaveCount(0);
});

test("with the list off screen CONTENT is the one empty state", async ({ corpus, mount, page }) => {
  await using root = await createFirstBootHarness();
  await openEmptyDatabank(page, root, corpus.auth.signedInConfig, "collapsed");
  await mount<typeof ShellAmbientStory>(STORY, {});
  const content = page.locator('[data-slot="databank-content"]');
  await expect(content.locator(EMPTY_STATE)).toHaveCount(1);
  await expect(page.locator(EMPTY_STATE)).toHaveCount(1);
});
