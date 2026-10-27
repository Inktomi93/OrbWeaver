import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { worldEntryIdInputSchema } from "@orb/contracts/world-info";
import { resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { test as corpusTest, expect } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { LENGTH_BASE_PX } from "@orb/ui/tokens";
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
] as const;
const test = corpusTest.extend<{ root: Awaited<ReturnType<typeof createCorpusHarness>> }>({
  root: async ({}, provide) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    await provide(root);
  },
});
test.use({ hasTouch: false, isMobile: false });

for (const attached of [true, false]) {
  test(`the persona heading counts ${attached ? "attached" : "zero attached"} personas, not available personas`, async ({ corpus, root, mount, page }) => {
    const world = corpus.worldInfoLibrary;
    if (world === undefined) {
      throw new Error("World Info cases require the corpus library");
    }
    const caller = await root.internalCallerFor(root.ownerId);
    const bookId = world.ids.libraryBookId;
    if (!attached) {
      const before = await caller.worldInfo.listAttachmentsForBook({ bookId });
      for (const personaId of before.personaIds) {
        await caller.worldInfo.detachFromPersona({ bookId, personaId });
      }
    }
    const personas = await caller.persona.list();
    const targets = await caller.worldInfo.listAttachmentsForBook({ bookId });
    expect(personas.length).toBeGreaterThan(targets.personaIds.length);
    await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
    const component = await mount<typeof WorldInfoMemberStory>(STORY, { bookId, context: true });
    await expect(component.getByRole("switch", { name: `Attach to ${personas[0]?.name}`, exact: true })).toBeVisible();
    await expect(component.getByRole("heading", { name: `Attached by personas · ${targets.personaIds.length}`, exact: true })).toBeVisible();
    await expect(component.getByRole("switch")).toHaveCount(personas.length + 1);
  });
}

for (const device of [
  { name: "desktop", touch: false, viewports: [{ width: 1600, height: 1000 }] },
  {
    name: "coarse",
    touch: true,
    viewports: [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ],
  },
] as const) {
  test.describe(device.name, () => {
    test.use({ hasTouch: device.touch, isMobile: device.touch });
    for (const viewport of device.viewports) {
      test(`selected entry retains parent identity without Context at ${viewport.width}×${viewport.height}`, async ({ corpus, root, mount, page }) => {
        test.skip(viewport.width < LENGTH_BASE_PX["breakpoint.shell"], "The actual phone shell owns parent identity; its journey is covered separately");
        const world = corpus.worldInfoLibrary;
        if (world === undefined) {
          throw new Error("World Info cases require the corpus library");
        }
        const caller = await root.internalCallerFor(root.ownerId);
        const entry = world.reads.entry.output;
        const book = await caller.worldInfo.getBook({ bookId: entry.worldBookId });
        await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
        await page.setViewportSize(viewport);
        const component = await mount<typeof WorldInfoMemberStory>(STORY, {
          bookId: book.id,
          entryId: worldEntryIdInputSchema.parse(world.reads.entry.input).entryId,
          context: false,
          phone: viewport.width < LENGTH_BASE_PX["breakpoint.shell"],
        });
        await expect(component.getByRole("heading", { name: entry.title, exact: true })).toHaveCount(1);
        await expect(component.getByText(book.name, { exact: false })).toBeVisible();
      });

      test(`entry controls respect the existing authoring measure and available width at ${viewport.width}×${viewport.height}`, async ({
        corpus,
        root,
        mount,
        page,
      }) => {
        const world = corpus.worldInfoLibrary;
        if (world === undefined) {
          throw new Error("World Info cases require the corpus library");
        }
        const entry = world.reads.entry.output;
        const caller = await root.internalCallerFor(root.ownerId);
        await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
        await page.setViewportSize(viewport);
        const component = await mount<typeof WorldInfoMemberStory>(STORY, {
          bookId: entry.worldBookId,
          entryId: worldEntryIdInputSchema.parse(world.reads.entry.input).entryId,
          context: false,
          phone: viewport.width < LENGTH_BASE_PX["breakpoint.shell"],
        });
        const title = component.getByRole("textbox", { name: "Title", exact: true });
        await expect(title).toHaveValue(entry.title);
        const editor = title.locator("..");
        const host = component.getByTestId("width-probe");
        const hostBox = await host.boundingBox();
        const box = await title.boundingBox();
        if (box === null || hostBox === null) {
          throw new Error("The entry title must have visible geometry");
        }
        // Control columns use the editor measure; a paragraph's reading measure has a different owner.
        const threshold = await resolvedLength(page, "var(--container-cq-64)", host);
        const measure = hostBox.width >= threshold ? "var(--width-content-col-wide)" : "var(--width-content-col)";
        expect(box.width).toBeLessThanOrEqual((await resolvedLength(page, measure, editor)) + 1);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      });
    }
  });
}
