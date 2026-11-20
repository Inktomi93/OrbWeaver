// The Corpus pieces that read behind a boundary with no fallback hold their place while the read is in flight: the census count in the
// context band, and the grouping check above a cluster's member list. Neither moves what sits beside or below it when the read lands.
// @subject packages/client/src/features/discovery/components/corpus-context-header.tsx
// @subject packages/client/src/features/discovery/surfaces/corpus-artifact-surface.tsx

import { CORPUS_WHOLE_LABEL } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { LAYOUT_SUBPIXEL_PX, seedShellState } from "@orb/testkit/browser/spec";
import { absenceWindow, holdServed, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import { distilledCensus } from "#client/features/discovery/lib/corpus-vocabulary.ts";
import type { CorpusDestinationStory } from "./_corpus-destination-stories.tsx";

const SHELL_STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const DESTINATION_STORY = "tests/client/features/discovery/surfaces/_corpus-destination-stories/CorpusDestinationStory";
const SERVED = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES];
// Long enough for a read that has been answered to have committed its answer.
const SETTLE_WINDOW_MS = 800;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("the context band keeps its height when the census count lands", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const catalog = await caller.discovery.catalog();
  const hold = holdServed();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SERVED), ...serveCorpusProcedures(caller, ["discovery.catalog"], () => hold) });
  await seedShellState(page, { activeSection: "corpus", panelOverrides: { corpus: { list: "collapsed", context: "docked" } } });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await hold.requested;
  const title = page.getByText(CORPUS_WHOLE_LABEL, { exact: true });
  await expect(title).toBeVisible();
  const band = title.locator("xpath=..");
  const held = (await band.boundingBox())?.height ?? Number.NaN;
  expect(held).toBeGreaterThan(0);

  hold.release();
  await expect(band.getByText(String(distilledCensus(catalog.totalDistilled, catalog.totalCharacters)), { exact: true })).toBeVisible();
  expect(Math.abs(((await band.boundingBox())?.height ?? Number.NaN) - held)).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
});

test("a cluster's member list stays where it is when the grouping check lands on an unchanged grouping", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [cluster] = await caller.discovery.archetypes({});
  if (cluster === undefined) {
    throw new Error("The corpus has no writing archetypes");
  }
  const hold = holdServed();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SERVED), ...serveCorpusProcedures(caller, ["discovery.archetypes"], () => hold) });
  await mount<typeof CorpusDestinationStory>(DESTINATION_STORY, {
    open: "artifact",
    destination: { kind: "cluster", cluster, visual: false, k: null, title: "A grouping" },
  });
  await hold.requested;
  const firstMember = page.getByRole("listitem").first();
  await expect(firstMember).toBeVisible();
  const held = (await firstMember.boundingBox())?.y ?? Number.NaN;

  hold.release();
  await absenceWindow(page, SETTLE_WINDOW_MS);
  await expect(firstMember).toBeVisible();
  expect(Math.abs(((await firstMember.boundingBox())?.y ?? Number.NaN) - held)).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
});
