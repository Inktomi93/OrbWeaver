// The entry editor's Priority and Fire mode controls on a phone: both stay inside the editor's own width. The Depth and Role row wraps at enlarged text.
import { worldEntryIdInputSchema } from "@orb/contracts/world-info";
import { setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import {
  WORLD_INFO_DEPTH_SWITCH_NAME,
  WORLD_INFO_ENTRY_DEPTH_NAME,
  WORLD_INFO_ENTRY_ROLE_NAME,
  WORLD_INFO_ENTRY_TITLE_NAME,
  WORLD_INFO_FIRE_MODE_NAME,
  WORLD_INFO_PRIORITY_NAME,
} from "#client/features/world-info/lib/world-info-names.ts";
import { NUMBER_FIELD_DECREMENT_VERB, NUMBER_FIELD_INCREMENT_VERB, numberStepperName } from "#ui/primitives/number-field/number-field-names.ts";
import type { WorldInfoMemberStory } from "./_member-stories.tsx";

const STORY = "tests/client/features/world-info/surfaces/_member-stories/WorldInfoMemberStory";
const PROCEDURES = [
  "worldInfo.listBooksWithUsage",
  "worldInfo.listAttachmentsForBook",
  "worldInfo.listGlobal",
  "persona.list",
  "worldInfo.getBook",
  "worldInfo.listEntries",
  "settings.getUserSettings",
  // The depth switch and the steppers edit the entry, and its autosave can reach the wire before the case ends.
  "worldInfo.updateEntry",
] as const;
const PHONE_WIDTHS = [320, 390] as const;
// Rounding of two fractional boxes.
const EDGE_SLACK = 0.5;
const FONT_SCALES = [2, 3] as const;
const FONT_SCALE_PROPERTY = channelName("fontScale");

test.use({ hasTouch: true, isMobile: true });

for (const width of PHONE_WIDTHS) {
  test(`at ${String(width)} the Priority and Fire mode controls sit inside the editor`, async ({ corpus, mount, page }) => {
    const world = corpus.worldInfoLibrary;
    if (world === undefined) {
      throw new Error("World Info cases require the corpus library");
    }
    await using root = await createCorpusHarness();
    await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
    await page.setViewportSize({ width, height: 844 });
    const component = await mount<typeof WorldInfoMemberStory>(STORY, {
      bookId: world.reads.entry.output.worldBookId,
      entryId: worldEntryIdInputSchema.parse(world.reads.entry.input).entryId,
      context: false,
      phone: true,
    });
    const title = component.getByRole("textbox", { name: WORLD_INFO_ENTRY_TITLE_NAME, exact: true });
    await expect(title).toHaveValue(world.reads.entry.output.title);
    const editor = await title.boundingBox();
    const priority = await component.getByRole("textbox", { name: WORLD_INFO_PRIORITY_NAME, exact: true }).boundingBox();
    const fireMode = await component.getByRole("combobox", { name: WORLD_INFO_FIRE_MODE_NAME, exact: true }).boundingBox();
    if (editor === null || priority === null || fireMode === null) {
      throw new Error("The editor and its two controls must have visible geometry");
    }
    // The rest of the editor holds too: nothing in it runs past its right edge.
    const overflow = await component.evaluate((host, right) => {
      const widest = Math.max(...Array.from(host.querySelectorAll("*"), (element) => element.getBoundingClientRect().right));
      return widest - right;
    }, editor.x + editor.width);
    expect(overflow).toBeLessThanOrEqual(EDGE_SLACK);
    for (const control of [priority, fireMode]) {
      expect(control.x).toBeGreaterThanOrEqual(editor.x - EDGE_SLACK);
      expect(control.x + control.width).toBeLessThanOrEqual(editor.x + editor.width + EDGE_SLACK);
    }
  });
}

for (const width of PHONE_WIDTHS) {
  for (const factor of FONT_SCALES) {
    test(`at ${String(width)} and ${String(factor * 100)}% text the Depth and Role row wraps instead of scrolling sideways`, async ({
      corpus,
      mount,
      page,
    }) => {
      const world = corpus.worldInfoLibrary;
      if (world === undefined) {
        throw new Error("World Info cases require the corpus library");
      }
      await using root = await createCorpusHarness();
      await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
      await page.setViewportSize({ width, height: 844 });
      const component = await mount<typeof WorldInfoMemberStory>(STORY, {
        bookId: world.reads.entry.output.worldBookId,
        entryId: worldEntryIdInputSchema.parse(world.reads.entry.input).entryId,
        context: false,
        phone: true,
      });
      const title = component.getByRole("textbox", { name: WORLD_INFO_ENTRY_TITLE_NAME, exact: true });
      await expect(title).toHaveValue(world.reads.entry.output.title);
      await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
      await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeGreaterThanOrEqual(16 * factor);
      const depthSwitch = component.getByRole("switch", { name: WORLD_INFO_DEPTH_SWITCH_NAME, exact: true });
      if ((await depthSwitch.getAttribute("aria-checked")) !== "true") {
        await depthSwitch.click();
      }
      const depth = component.getByRole("textbox", { name: WORLD_INFO_ENTRY_DEPTH_NAME, exact: true });
      const role = component.getByRole("combobox", { name: WORLD_INFO_ENTRY_ROLE_NAME, exact: true });
      await expect(depth).toBeVisible();
      await expect(role).toBeVisible();
      const editor = await title.boundingBox();
      if (editor === null) {
        throw new Error("The editor must have visible geometry");
      }
      const roleBox = await role.boundingBox();
      if (roleBox === null) {
        throw new Error("The Role control must have visible geometry");
      }
      expect(roleBox.x + roleBox.width).toBeLessThanOrEqual(editor.x + editor.width + EDGE_SLACK);
      // Nothing in the editor, the stepped Depth field included, runs past its edge: the row wraps its fields and the field stacks its steppers
      // under the input instead of scrolling sideways.
      const past = await component.evaluate(
        (host, { right, slack }) =>
          Array.from(host.querySelectorAll("*"))
            .filter((element) => element.getBoundingClientRect().right > right + slack)
            .map((element) => `${element.tagName.toLowerCase()}[${element.getAttribute("data-slot") ?? ""}] ${element.textContent.slice(0, 24)}`),
        { right: editor.x + editor.width, slack: EDGE_SLACK },
      );
      expect(past).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      // Both steppers stay on the field, whole and pressable: a tap on each moves the value a step.
      const start = Number(await depth.inputValue());
      await component.getByRole("button", { name: numberStepperName(NUMBER_FIELD_INCREMENT_VERB, WORLD_INFO_ENTRY_DEPTH_NAME), exact: true }).click();
      await expect(depth).toHaveValue(String(start + 1));
      await component.getByRole("button", { name: numberStepperName(NUMBER_FIELD_DECREMENT_VERB, WORLD_INFO_ENTRY_DEPTH_NAME), exact: true }).click();
      await expect(depth).toHaveValue(String(start));
    });
  }
}
