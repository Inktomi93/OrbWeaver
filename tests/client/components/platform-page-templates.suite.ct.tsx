// @subject packages/client/src/components/list-page.tsx
// @subject packages/client/src/components/detail-header.tsx
// @subject packages/client/src/components/editor-page.tsx
// @subject packages/client/src/components/collection-grid.tsx
// @subject packages/client/src/components/settings-pane.tsx
// Each page template holds its tier, its one scroll box and its control floors in every seed, density and pointer class.
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type {
  CollectionGridMatrixStory,
  DetailHeaderMatrixStory,
  EditorPageMatrixStory,
  ListPageMatrixStory,
  SettingsPaneMatrixStory,
} from "./_page-template-stories.tsx";
import { TEMPLATE_CASES } from "./page-template-cases.ts";

const STORIES = "tests/client/components/_page-template-stories";

/** A custom property resolved as a length in the element's own scope, so density and tier both apply. */
function resolved(locator: Locator, cssVar: string): Promise<number> {
  return locator.evaluate((element, variable) => {
    const probe = document.createElement("div");
    probe.style.inlineSize = `var(${variable})`;
    element.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, cssVar);
}

const box = async (locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> => {
  const found = await locator.boundingBox();
  if (found === null) {
    throw new Error("The element has no box");
  }
  return found;
};

const px = (locator: Locator, property: string): Promise<number> =>
  locator.evaluate((element, name) => Number.parseFloat(getComputedStyle(element).getPropertyValue(name)), property);

for (const coarse of [false, true]) {
  test.describe(coarse ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch: coarse, isMobile: coarse, viewport: { width: 1600, height: 1000 } });

    test("ListPage: instrument islands, the row rhythm, a field at the control step and one scroll box under the search", async ({ mount }) => {
      const root = await mount<typeof ListPageMatrixStory>(`${STORIES}/ListPageMatrixStory`, {});
      for (const { caseId: id } of TEMPLATE_CASES) {
        const cell = root.locator(`[data-case="${id}"]`);
        const pane = cell.locator('[data-surface-tier="instrument"] > [tabindex="-1"]');
        await expect(pane, id).toHaveCount(1);
        expect(await px(pane, "row-gap"), `${id}: the pane rhythm is the density's row step`).toBe(await resolved(pane, TOKENS["spacing.row"].cssVar));
        const card = cell.locator('[data-probe="lead-card"]');
        expect(await px(card, "padding-top"), `${id}: a lead island takes the instrument pad`).toBe(await resolved(card, TOKENS["spacing.row"].cssVar));
        const field = cell.locator('[data-slot="list-search"] [data-slot="input-root"]');
        expect(Math.round((await field.boundingBox())?.height ?? 0), `${id}: the template leaves the field at its control step`).toBe(
          Math.round(await resolved(pane, TOKENS["size.control-sm"].cssVar)),
        );
        const scrollers = await pane.evaluate(
          (element) =>
            [element, ...element.querySelectorAll("*")].filter(
              (node) => node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY === "auto",
            ).length,
        );
        expect(scrollers, `${id}: exactly one scroll box`).toBe(1);
        const body = pane.locator('[data-slot="library-list-scroll"]');
        const searchTop = (await field.boundingBox())?.y ?? Number.NaN;
        await body.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        expect((await field.boundingBox())?.y, `${id}: the search holds while the body scrolls`).toBe(searchTop);
      }
    });

    test("ListPage: a narrow search row wraps its aside below the search's floor, and a pane arm scrolls its chrome away", async ({ mount }) => {
      const root = await mount<typeof ListPageMatrixStory>(`${STORIES}/ListPageMatrixStory`, {});
      const aside = root.locator('[data-case="aside"]');
      const field = aside.locator('[data-slot="list-search"] [data-slot="input-root"]');
      const sort = aside.getByRole("button", { name: "Sort by recent activity", exact: true });
      expect((await field.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(await resolved(aside, TOKENS["width.field-floor"].cssVar));
      expect((await sort.boundingBox())?.y ?? 0, "the aside wraps to its own line").toBeGreaterThan((await field.boundingBox())?.y ?? 0);

      const pane = root.locator('[data-case="pane"] [data-surface-tier="instrument"] > [tabindex="-1"]');
      const paneField = pane.locator('[data-slot="list-search"] [data-slot="input-root"]');
      const before = (await paneField.boundingBox())?.y ?? Number.NaN;
      await pane.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      expect((await paneField.boundingBox())?.y ?? Number.NaN).toBeLessThan(before);
    });

    test("ListPage: the skip link is the pane's first stop and lands on the first row", async ({ mount }) => {
      const root = await mount<typeof ListPageMatrixStory>(`${STORIES}/ListPageMatrixStory`, {});
      const cell = root.locator('[data-case="aside"]');
      const skip = cell.getByRole("button", { name: "Skip to rows", exact: true });
      await skip.focus();
      await skip.press("Enter");
      await expect(cell.locator('[data-slot="list-row-body"]').first()).toBeFocused();
    });
    test("DetailHeader: one h2 names the subject, the visible name takes its step, and the verbs hold the trailing edge", async ({ mount }) => {
      const root = await mount<typeof DetailHeaderMatrixStory>(`${STORIES}/DetailHeaderMatrixStory`, {});
      for (const { caseId: id } of TEMPLATE_CASES) {
        const cell = root.locator(`[data-case="${id}"]`);
        await expect(cell.getByRole("heading", { level: 2, name: "Elias Thorn", exact: true }), id).toHaveCount(1);
        const name = cell.locator('[data-shell-identity="defer"]');
        expect(await px(name, "font-size"), `${id}: the name is at the title step`).toBe(await resolved(cell, TOKENS["text.title"].cssVar));
        const verb = cell.getByRole("button", { name: "Edit scope", exact: true });
        expect(Math.round((await box(verb)).x + (await box(verb)).width), `${id}: the verbs end at the header's edge`).toBe(
          Math.round((await box(cell)).x + (await box(cell)).width),
        );
        expect(Math.round((await box(verb)).height), `${id}: the template leaves a verb at its control step`).toBe(
          Math.round(await resolved(cell, TOKENS["size.control-sm"].cssVar)),
        );
      }
      const masthead = root.locator('[data-case="masthead"]');
      expect(await px(masthead.locator('[aria-hidden="true"][data-voice]'), "font-size")).toBe(await resolved(masthead, TOKENS["text.display"].cssVar));
      await expect(masthead.locator("[data-shell-identity]")).toHaveCount(0);

      const narrow = root.locator('[data-case="narrow"]');
      const narrowName = narrow.locator('[data-shell-identity="defer"]');
      const firstVerb = narrow.getByRole("button", { name: "Open card", exact: true });
      expect((await box(firstVerb)).y, "a narrow header wraps its verbs below the name").toBeGreaterThan((await box(narrowName)).y);
      expect((await box(narrowName)).width).toBeGreaterThanOrEqual(await resolved(narrow, TOKENS["width.title-floor"].cssVar));
    });

    test("EditorPage: a form column breathes past the container step, an instrument holds the cap, and each declares its tier", async ({ mount }) => {
      const root = await mount<typeof EditorPageMatrixStory>(`${STORIES}/EditorPageMatrixStory`, {});
      for (const { caseId: id } of TEMPLATE_CASES) {
        const cell = root.locator(`[data-case="${id}"]`);
        const formCard = cell.locator('[data-probe="form-card"]');
        const instrumentCard = cell.locator('[data-probe="instrument-card"]');
        expect(await px(formCard, "padding-top"), `${id}: a form island takes the block pad`).toBe(await resolved(formCard, TOKENS["spacing.block"].cssVar));
        expect(await px(instrumentCard, "padding-top"), `${id}: an instrument island takes the row pad`).toBe(
          await resolved(instrumentCard, TOKENS["spacing.row"].cssVar),
        );
        for (const kind of ["form", "instrument"]) {
          const column = cell.locator(`[data-probe="${kind}"]`);
          expect(Math.round((await box(column)).width), `${id}: ${kind} below the step holds the cap`).toBe(
            Math.round(await resolved(cell, TOKENS["width.content-col"].cssVar)),
          );
          const left = (await box(column)).x - (await box(cell)).x;
          const right = (await box(cell)).x + (await box(cell)).width - ((await box(column)).x + (await box(column)).width);
          expect(Math.abs(left - right), `${id}: ${kind} is centered`).toBeLessThanOrEqual(1);
        }
      }
      const wideForm = root.locator('[data-case="wide-form"]');
      expect(Math.round((await box(wideForm.locator('[data-probe="form"]'))).width)).toBe(
        Math.round(await resolved(wideForm, TOKENS["width.content-col-wide"].cssVar)),
      );
      const wideInstrument = root.locator('[data-case="wide-instrument"]');
      expect(Math.round((await box(wideInstrument.locator('[data-probe="instrument"]'))).width)).toBe(
        Math.round(await resolved(wideInstrument, TOKENS["width.content-col"].cssVar)),
      );
    });

    test("CollectionGrid: every cell is a listitem of one named list, and a wider pane shows more tiles, never wider ones", async ({ mount }) => {
      const root = await mount<typeof CollectionGridMatrixStory>(`${STORIES}/CollectionGridMatrixStory`, {});
      const columns = (cell: Locator): Promise<number> =>
        cell.getByRole("list", { name: "Tiles", exact: true }).evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
      for (const { caseId: id } of TEMPLATE_CASES) {
        const cell = root.locator(`[data-case="${id}"]`);
        const list = cell.getByRole("list", { name: "Tiles", exact: true });
        await expect(list.getByRole("listitem"), id).toHaveCount(5);
        await expect(list.locator(":scope > :not([role='listitem'])"), `${id}: nothing but listitems in the list`).toHaveCount(0);
        expect(await px(list, "row-gap"), `${id}: the tile gap is the density's row step`).toBe(await resolved(cell, TOKENS["spacing.row"].cssVar));
        const tile = list.getByRole("listitem").first();
        expect((await box(tile)).width, `${id}: a tile keeps its floor`).toBeGreaterThanOrEqual(await resolved(cell, TOKENS["width.cell-auto"].cssVar));
        expect(await columns(cell), id).toBe(2);
      }
      expect(await columns(root.locator('[data-case="wide"]'))).toBe(3);
    });

    test("SettingsPane: the form tier pads its islands and the section step separates the title and every section", async ({ mount }) => {
      const root = await mount<typeof SettingsPaneMatrixStory>(`${STORIES}/SettingsPaneMatrixStory`, {});
      for (const { caseId: id } of TEMPLATE_CASES) {
        const cell = root.locator(`[data-case="${id}"]`);
        const card = cell.locator('[data-probe="card"]');
        expect(await px(card, "padding-top"), `${id}: a section island takes the form pad`).toBe(await resolved(card, TOKENS["spacing.block"].cssVar));
        const title = cell.locator('[data-probe="title"]');
        const first = cell.locator('[data-probe="first"]');
        expect(Math.round((await box(first)).y - ((await box(title)).y + (await box(title)).height)), `${id}: the title sits a section step above`).toBe(
          Math.round(await resolved(cell, TOKENS["spacing.section"].cssVar)),
        );
      }
    });
  });
}
