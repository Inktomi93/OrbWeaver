import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { CorpusCoverageStory } from "./_coverage-stories.tsx";

test.use({ hasTouch: false, isMobile: false });

test("the grouped-character headline states visual-family coverage rather than the whole library", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  const home = await caller.discovery.home();
  const catalog = await caller.discovery.catalog();
  const capturedFamilies = await caller.discovery.visualArchetypes({ k: 1 });
  const family = capturedFamilies[0];
  const member = family?.members[0];
  if (family === undefined || member === undefined) {
    throw new Error("The corpus must expose a real visual family and member");
  }
  const families = [{ ...family, size: 1, members: [member], analysedMembers: 0 }];
  expect(home.coverage.characters).toBeGreaterThan(1);
  // A one-member captured display point isolates the headline binding, not the clustering algorithm.
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [
      "discovery.forgottenGems",
      "discovery.topKeywords",
      "discovery.unusedCharacters",
      "discovery.modelRouting",
      "workloads.list",
      "connection.listBindings",
      "connection.list",
      "settings.getUserSettings",
      "settings.getAppSettingsWithOverrides",
      "sessions.me",
      "discovery.themeDrift",
    ]),
    "discovery.home": () => ({ ...home, sceneThemes: [], arcThemes: [] }),
    "discovery.catalog": () => ({ ...catalog, totalDistilled: 0 }),
    "discovery.visualArchetypes": (input) => {
      expect(input?.k === undefined || input.k === 1).toBe(true);
      return families;
    },
  });
  const component = await mount<typeof CorpusCoverageStory>("tests/client/features/discovery/surfaces/_coverage-stories/CorpusCoverageStory", {});
  const headline = component.getByRole("heading", { level: 1 });
  await expect(headline).toContainText("grouped into");
  await expect(headline).toContainText(/(?:1|One) character, grouped into/iu);
});
