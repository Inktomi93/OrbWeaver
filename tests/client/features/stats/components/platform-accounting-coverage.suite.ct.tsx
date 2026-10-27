import { testId } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength, settledBox } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { AccountingCoverageStory } from "./_accounting-coverage-stories.tsx";

const STORY = "tests/client/features/stats/components/_accounting-coverage-stories/AccountingCoverageStory";
const IDENTITY = "Partial accounting — not your provider bill";
const SUMMARY = "Missing prices are omitted; some costs are estimates.";
const PRICES =
  "Costs sum available compatible prices and omit missing prices. They may include provider-reported prices, configured-rate estimates or subscription-notional estimates, not invoice charges.";
const OMITTED = "Prompt extraction and captioning costs are omitted. Background-work accounting is incomplete.";
const RETENTION =
  "Deleted images can lose their cost records on Recompute. Image-generation history is included in backup and restore; embedding and compaction spend history are not.";
const LIBRARY =
  "Figures use retained message generations, image-generation records, observed embedding batches and compaction spend. Image costs may lack counted samples.";
const CHARACTER = "Character costs cover recorded message generations only; image generation and compaction are library-level activity.";
const AVERAGES = "Generation averages do not cover every operation. Last active can include chat-setting changes, not just replies.";

// Compare actual content positions independently of native focus scrolling within each production scroller.
async function contentPosition(scroller: Locator, target: Locator): Promise<number> {
  const [host, subject] = await Promise.all([settledBox(scroller), settledBox(target)]);
  return subject.y - host.y + (await scroller.evaluate((node) => node.scrollTop));
}

interface ReadingSubject {
  readonly pane: Locator;
  readonly following: Locator;
  readonly scroller: Locator;
  readonly characterOnly: boolean;
}

function readingSubjects(page: Page, view: "paired" | "content" | "models", characterOnly: boolean): readonly ReadingSubject[] {
  const subjects: ReadingSubject[] = [];
  if (view !== "models") {
    const pane = page.locator('[data-slot="accounting-content-subject"]');
    subjects.push({
      pane,
      following: pane.getByRole("heading", { name: characterOnly ? "Activity" : "All-time totals", exact: true }),
      scroller: pane.locator('[data-slot="analytics-content"]'),
      characterOnly,
    });
  }
  if (view !== "content") {
    const pane = page.locator('[data-slot="accounting-models-subject"]');
    subjects.push({
      pane,
      following: pane.getByRole("heading", { name: characterOnly ? "Generations" : "Reply speed (all models)", exact: true }),
      scroller: pane.getByTestId(testId("analyticsModelsTab")),
      characterOnly: false,
    });
  }
  return subjects;
}

async function expectIndependentDisclosure(subject: ReadingSubject, others: readonly Locator[], testInfo: TestInfo): Promise<void> {
  const { pane, following, scroller, characterOnly } = subject;
  const page = pane.page();
  const notice = pane.locator('[data-slot="accounting-coverage"]');
  const trigger = notice.getByRole("button", { name: "Accounting coverage", exact: true });
  await expect(notice.getByText(IDENTITY, { exact: true })).toBeVisible();
  await expect(following).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(notice.getByText(PRICES, { exact: true })).toBeVisible();
  await expect(notice.getByText(OMITTED, { exact: true })).toBeVisible();
  await expect(notice.getByText(`${characterOnly ? CHARACTER : LIBRARY} ${RETENTION}`, { exact: true })).toBeVisible();
  await expect(notice.getByText(AVERAGES, { exact: true })).toBeVisible();
  for (const other of others) {
    await expect(other).toHaveAttribute("aria-expanded", "false");
  }
  const expandedPosition = await contentPosition(scroller, following);
  await page.keyboard.press("Space");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  // All caveats remain accessible above; full paragraphs must leave the reading flow when closed.
  await expect(notice.getByText(PRICES, { exact: true })).not.toBeVisible();
  await expect(notice.getByText(OMITTED, { exact: true })).not.toBeVisible();
  await expect(notice.getByText(SUMMARY, { exact: true })).toBeVisible();
  await expect.poll(() => contentPosition(scroller, following)).toBeLessThan(expandedPosition);
  const geometry = await actionGroupGeometry(pane, [trigger]);
  await testInfo.attach(`accounting-disclosure-${characterOnly ? "character" : "library"}`, {
    body: JSON.stringify(geometry),
    contentType: "application/json",
  });
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  const floor = await resolvedLength(page, "var(--size-control-sm)", pane);
  expect(geometry.controls[0]?.height).toBeGreaterThanOrEqual(floor);
}

const REGIMES = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, width: 440, height: 620, mobile: false, fontScale: appearanceSettingsSchema.parse({}).fontScale },
  { name: "phone portrait", viewport: { width: 390, height: 844 }, width: 390, height: 640, mobile: true, fontScale: ENLARGED_APPEARANCE_SETTINGS.fontScale },
  { name: "phone landscape", viewport: { width: 844, height: 390 }, width: 844, height: 260, mobile: true, fontScale: ENLARGED_APPEARANCE_SETTINGS.fontScale },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.mobile, hasTouch: regime.mobile });
    const subjects = regime.mobile ? (["overview", "models", "character"] as const) : (["overview", "character"] as const);
    for (const subject of subjects) {
      const characterOnly = subject === "character";
      const singleView = subject === "models" ? "models" : "content";
      const view = regime.mobile ? singleView : "paired";
      const expectedScope =
        characterOnly && !regime.mobile
          ? ["Whole library — not just the character you opened. Model usage is rolled up per model, with no per-character breakdown to narrow to."]
          : [];
      test(`${subject} retains its own full accounting explanation behind the concise notice`, async ({ mount, page }, testInfo) => {
        await using root = await createCorpusHarness(undefined, { startJobs: false });
        const caller = await root.internalCallerFor(root.ownerId);
        const ranked = (await caller.stats.leaderboard({})).rows[0];
        if (ranked === undefined || !(await caller.stats.freshness()).hasData) {
          throw new Error("The committed corpus has no populated Insights control");
        }
        const appearance = appearanceSettingsSchema.parse({ fontScale: regime.fontScale });
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        await routeTrpc(
          page,
          serveCorpusProcedures(caller, [
            "sessions.me",
            "settings.getUserSettings",
            "stats.freshness",
            "stats.wrapped",
            "stats.timeseries",
            "stats.overview",
            "stats.momentum",
            "stats.byModel",
            "stats.latency",
            "stats.character",
            "character.get",
          ]),
        );
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
        await mount<typeof AccountingCoverageStory>(STORY, {
          appearance,
          characterId: characterOnly ? ranked.characterId : null,
          view,
          width: regime.width,
          height: regime.height,
        });
        const panes = readingSubjects(page, view, characterOnly);
        const coverage = page.locator('[data-slot="accounting-coverage"]');
        await expect(coverage).toHaveCount(panes.length);
        const triggers = await coverage.getByRole("button", { name: "Accounting coverage", exact: true }).all();
        for (const trigger of triggers) {
          await expect(trigger).toHaveAttribute("aria-expanded", "false");
        }
        await expect(page.locator('[data-slot="analytics-library-scope"]')).toHaveText(expectedScope);
        for (const [index, pane] of panes.entries()) {
          await expectIndependentDisclosure(
            pane,
            triggers.filter((_, otherIndex) => otherIndex !== index),
            testInfo,
          );
        }
      });
    }
  });
}
