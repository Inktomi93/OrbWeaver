import { createCharacterSchema } from "@orb/contracts/character";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const SELECTED = 2;
const REGIMES = [
  { name: "desktop 1280px", viewport: { width: 1280, height: 900 }, coarse: false },
  { name: "desktop 1440px", viewport: { width: 1440, height: 900 }, coarse: false },
  { name: "desktop 1920px", viewport: { width: 1920, height: 900 }, coarse: false },
  { name: "phone 360px", viewport: { width: 360, height: 800 }, coarse: true },
  { name: "phone 390px", viewport: { width: 390, height: 844 }, coarse: true },
] as const;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  // The count and actions are asserted visible first; a null box here is a fixture break, not a layout case.
  if (box === null) {
    throw new Error("The bulk bar control has no layout box");
  }
  return box;
}

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** True when the element at the control's centre is the control itself or one of its descendants. */
function isHitTestable(control: Locator): Promise<boolean> {
  return control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && element.contains(hit);
  });
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });

    test("the Characters bulk bar keeps its count and verbs apart, hit-testable, and the verbs on one line", async ({ page, corpus, mount }) => {
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      for (const name of ["Bulk archivist one", "Bulk archivist two", "Bulk archivist three"]) {
        await caller.character.create({
          input: createCharacterSchema.parse({ handle: name.toLowerCase().replaceAll(" ", "-"), name, description: "A character for the bulk bar." }),
        });
      }
      await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
      await routeTrpc(page, {
        ...serveCorpusProcedures(caller, [
          ...SECTION_PROCEDURES,
          "tag.listTagFilterVocabulary",
          "persona.list",
          "rosterPreset.count",
          "databank.bankHealth",
          "notifications.list",
          "plugin.listCommands",
          "automation.listRulePresets",
          "chat.getChat",
          "chat.reapTemporaryChats",
        ]),
      });
      await seedShellState(page, {
        activeSection: "characters",
        panelOverrides: { characters: { list: "docked", context: "collapsed" } },
      });
      await mount<typeof ShellAmbientStory>(STORY, {});

      await page.getByRole("button", { name: /^Select( multiple)?$/u }).click();
      const checkboxes = page.getByRole("checkbox");
      await expect(checkboxes.first()).toBeVisible();
      for (let index = 0; index < SELECTED; index += 1) {
        await checkboxes.nth(index).click();
      }

      const bar = page.locator('[data-slot="selection-bar-root"]');
      const count = bar.locator('[data-slot="selection-bar-count"]');
      await expect(count).toHaveText(`${String(SELECTED)} selected`);
      const verbs = [
        bar.getByRole("button", { name: "Tag", exact: true }),
        bar.getByRole("button", { name: "Archive", exact: true }),
        bar.getByRole("button", { name: "Delete", exact: true }),
      ];
      const parts = [count, ...verbs, bar.getByRole("button", { name: "Clear selection", exact: true })];
      for (const part of parts) {
        await expect(part).toBeVisible();
        expect(await isHitTestable(part)).toBe(true);
      }
      const boxes = await Promise.all(parts.map(boxOf));
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          expect(overlap(a, b)).toBe(false);
        }
      }
      // The verbs are one unit: they share a line, so Delete is never stranded below Tag and Archive.
      const verbTops = (await Promise.all(verbs.map(boxOf))).map((box) => box.y);
      expect(Math.max(...verbTops) - Math.min(...verbTops)).toBeLessThanOrEqual(1);
    });
  });
}
