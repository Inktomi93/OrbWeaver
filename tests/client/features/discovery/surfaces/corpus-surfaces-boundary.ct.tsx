// @subject packages/client/src/features/discovery/surfaces/corpus-home-surface.tsx
// The Corpus CONTENT surfaces read through the shared boundary: a held read shows the loading skeleton, a failed one the shared error
// block, and Retry refetches. A below-fold block holds and fails on its own and leaves the rest of the overview standing.

import type { CharacterId } from "@orb/kit/ids";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { heldThenFailing, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import type { CorpusDestinationStory } from "./_corpus-destination-stories.tsx";

const SHELL_STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const DESTINATION_STORY = "tests/client/features/discovery/surfaces/_corpus-destination-stories/CorpusDestinationStory";
const SERVED = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES];
const CONTENT_READS = [
  "discovery.characterDossier",
  "discovery.characterKeywords",
  "search.similarArt",
  "discovery.compareCharacters",
  "discovery.visualArchetypes",
] as const;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("a held never-played read shows the loading skeleton on its own, a failed one the error block, and Retry shows the section", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SERVED), ...serveCorpusProcedures(caller, ["discovery.unusedCharacters"], read.intercept) });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await read.hold.requested;
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  read.hold.fail();
  await expect(page.getByText("Couldn't load your never-played characters.", { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Couldn't load your never-played characters.", { exact: true })).toHaveCount(0);
});

test("a failed model-usage read says so in its own block and Retry clears it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SERVED), ...serveCorpusProcedures(caller, ["discovery.modelRouting"], read.intercept) });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await read.hold.requested;
  read.hold.fail();
  await expect(page.getByText("Couldn't load your model usage.", { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Couldn't load your model usage.", { exact: true })).toHaveCount(0);
});

test("a failed keywords read says so in the explorer and Retry clears it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SERVED), ...serveCorpusProcedures(caller, ["discovery.topKeywords"], read.intercept) });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await read.hold.requested;
  read.hold.fail();
  await expect(page.getByText("Couldn't load your top keywords.", { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Couldn't load your top keywords.", { exact: true })).toHaveCount(0);
});

test("a failed story-theme drift read says so in its own block and Retry clears it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SERVED), ...serveCorpusProcedures(caller, ["discovery.themeDrift"], read.intercept) });
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await read.hold.requested;
  read.hold.fail();
  await expect(page.getByText("Couldn't load story-theme drift.", { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Couldn't load story-theme drift.", { exact: true })).toHaveCount(0);
});

test("the dossier's similar-art strip holds, fails and retries on its own", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  // A card with no distilled summary has no dossier, so the strip under test would never mount; the corpus's own read names one that has.
  let character: { readonly characterId: CharacterId } | undefined;
  for (const candidate of (await caller.discovery.browseCharacters({ limit: 200 })).items) {
    if ((await caller.discovery.characterDossier({ characterId: candidate.characterId })) !== null) {
      character = candidate;
      break;
    }
  }
  if (character === undefined) {
    throw new Error("The corpus has no character with a dossier");
  }
  const read = heldThenFailing();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SERVED, ...CONTENT_READS]),
    ...serveCorpusProcedures(caller, ["search.similarArt"], read.intercept),
  });
  await mount<typeof CorpusDestinationStory>(DESTINATION_STORY, { open: "character", characterId: character.characterId });
  await read.hold.requested;
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  read.hold.fail();
  await expect(page.getByText("Couldn't load the similar art.", { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Couldn't load the similar art.", { exact: true })).toHaveCount(0);
});

test("a held pair comparison shows the loading skeleton, a failed one the error block, and Retry shows the result", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [first, second] = (await caller.discovery.browseCharacters({ limit: 2 })).items;
  if (first === undefined || second === undefined) {
    throw new Error("The corpus needs two characters to compare");
  }
  const read = heldThenFailing();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SERVED, ...CONTENT_READS]),
    ...serveCorpusProcedures(caller, ["discovery.compareCharacters"], read.intercept),
  });
  await mount<typeof CorpusDestinationStory>(DESTINATION_STORY, {
    open: "artifact",
    destination: {
      kind: "pair",
      pair: { kind: "characters", idA: first.characterId, idB: second.characterId, nameA: first.name, nameB: second.name, score: null },
    },
  });
  await read.hold.requested;
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  read.hold.fail();
  await expect(page.getByText("Couldn't load that comparison.", { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Couldn't load that comparison.", { exact: true })).toHaveCount(0);
});
