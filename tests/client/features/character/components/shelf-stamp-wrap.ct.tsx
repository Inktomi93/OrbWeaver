// @subject packages/client/src/features/character/lib/character-shelf-stamp.ts
// A Recently chatted stamp that wraps in its fixed cell breaks before the "·", never after it, so no line ends on the separator.
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";

test.use({ viewport: { width: 1440, height: 1000 }, hasTouch: false, isMobile: false });

test("a wrapped stamp keeps its separator with the count that follows it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]));
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});
  const shelf = page.getByRole("list", { name: "Recently chatted", exact: true });
  const stamps = shelf.getByText(/^chatted /u);
  await expect(stamps.first()).toBeVisible();
  // Each stamp's text split into the lines it painted, by the block position of every character.
  const painted = await stamps.evaluateAll((nodes) =>
    nodes.map((node) => {
      const text = node.firstChild;
      if (text === null) {
        throw new Error("A stamp must have text");
      }
      // UTF-16 units, because that is the unit a Range offset counts.
      const content = text.textContent ?? "";
      const characters = Array.from({ length: content.length }, (_unit, at) => content.charAt(at));
      const range = document.createRange();
      const tops = characters.map((_character, at) => {
        range.setStart(text, at);
        range.setEnd(text, at + 1);
        return Math.round(range.getBoundingClientRect().top);
      });
      return [...new Set(tops)]
        .map((top) =>
          characters
            .filter((_character, at) => tops[at] === top)
            .join("")
            .trim(),
        )
        .filter((line) => line !== "");
    }),
  );
  await test.info().attach("painted-stamps", { body: JSON.stringify(painted), contentType: "application/json" });
  // The control: the fixed cell is narrower than the stamp, so every stamp wraps and the check below judges real line ends.
  for (const lines of painted) {
    expect(lines.length).toBeGreaterThan(1);
  }
  for (const lines of painted) {
    for (const line of lines.slice(0, -1)) {
      expect(line.endsWith("·")).toBe(false);
    }
  }
});
