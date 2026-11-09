// The Settings list is its own scroll box, so its skip link is a flex item of an overfull column: focused, it keeps its whole control height.
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const SKIP_NAME = /^Skip to /u;

test.use({ viewport: { width: 1280, height: 600 } });

test("the Settings list's focused skip link keeps its control height", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]),
  });
  await seedShellState(page, { activeSection: "config", panelOverrides: { config: { list: "docked", context: "collapsed" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const skip = page.locator('[data-slot="config-list"]').getByRole("button", { name: SKIP_NAME });
  await skip.focus();
  await expect(skip).toBeFocused();
  const box = await skip.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(await resolvedLength(page, `var(${TOKENS["size.control-sm"].cssVar})`, skip));
});
