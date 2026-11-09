// @subject packages/client/src/features/app-shell/surfaces/shell/chrome.css
// The topbar's icon buttons stay square on a touch pointer, where the shell's own block floor reaches them from outside the button.

import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";

const SHELL_AMBIENT = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const TOPBAR_ICON_BUTTON = ".shell-topbar-icon-btn";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test("every topbar icon button is as tall as it is wide at a touch pointer", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  await seedShellState(page, { activeSection: "chats" });
  await mount<typeof ShellAmbientStory>(SHELL_AMBIENT, {});
  const buttons = page.locator(TOPBAR_ICON_BUTTON);
  await expect(buttons.first()).toBeVisible();
  const boxes = await buttons.evaluateAll((nodes) =>
    nodes.map((node) => {
      const { width, height } = node.getBoundingClientRect();
      return { width, height };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const { width, height } of boxes) {
    expect(height).toBe(width);
  }
});
