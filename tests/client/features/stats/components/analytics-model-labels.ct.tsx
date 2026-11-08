// @subject packages/client/src/features/stats/components/analytics-models-tab.tsx
// Several models from one provider each paint a distinct axis label in Generations by model, at desktop and phone
// widths, and the text equivalent still names every model whole.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { modelDisplayName } from "@orb/kit/model-name";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { AccountingCoverageStory } from "./_accounting-coverage-stories.tsx";

const STORY = "tests/client/features/stats/components/_accounting-coverage-stories/AccountingCoverageStory";
const CHART = "Generations by model";
const ELLIPSIS = "…";
// Four releases of one vendor: the vendor prefix and the date suffix are shared across pairs.
const ONE_PROVIDER_MODELS = [
  "anthropic/claude-sonnet-4-5-20250929",
  "anthropic/claude-sonnet-4-5-20251001",
  "anthropic/claude-haiku-4-5-20251001",
  "anthropic/claude-opus-4-1-20250805",
] as const;

const REGIMES = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, width: 440, mobile: false },
  { name: "phone", viewport: { width: 390, height: 844 }, width: 390, mobile: true },
] as const;

declare global {
  // The strings the chart canvas drew in its latest repaint.
  var paintedChartText: string[] | undefined;
}

/** Record what the chart canvas draws: axis labels are canvas text, invisible to the DOM. */
async function recordPaintedText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const painted: string[] = [];
    globalThis.paintedChartText = painted;
    const { fillText, clearRect } = CanvasRenderingContext2D.prototype;
    CanvasRenderingContext2D.prototype.clearRect = function record(this: CanvasRenderingContext2D, ...rest: [number, number, number, number]): void {
      painted.length = 0;
      clearRect.call(this, ...rest);
    };
    CanvasRenderingContext2D.prototype.fillText = function record(this: CanvasRenderingContext2D, text: string, ...rest: [number, number, number?]): void {
      painted.push(text);
      fillText.call(this, text, ...rest);
    };
  });
}

/** Whether a painted string could stand for `name`: the whole name, or the name with a stretch replaced by an ellipsis. */
function standsFor(painted: string, name: string): boolean {
  const [head = "", tail, ...extra] = painted.split(ELLIPSIS);
  if (tail === undefined) {
    return painted === name;
  }
  return extra.length === 0 && head !== "" && name.startsWith(head) && name.endsWith(tail);
}

/** Whether a painted string could be this model: its id, or the readable name the axis may paint for it. */
function paintsModel(painted: string, id: string): boolean {
  return standsFor(painted, id) || standsFor(painted, modelDisplayName(id));
}

/** What the latest repaint drew, the models it names no label for, and the labels that name more than one model. */
async function readLabelFit(page: Page): Promise<{ readonly painted: string[]; readonly unlabelled: string[]; readonly ambiguous: string[] }> {
  const painted = await page.evaluate(() => globalThis.paintedChartText ?? []);
  return {
    painted,
    unlabelled: ONE_PROVIDER_MODELS.filter((id) => !painted.some((text) => paintsModel(text, id))),
    ambiguous: painted.filter((text) => ONE_PROVIDER_MODELS.filter((id) => paintsModel(text, id)).length > 1),
  };
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.mobile, hasTouch: regime.mobile });

    test("each model paints a label that no other model also fits", async ({ mount, page }) => {
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const template = (await caller.stats.byModel())[0];
      if (template === undefined) {
        throw new Error("The committed corpus has no model usage");
      }
      // The corpus row keeps its production shape; only the ids become one provider's releases.
      const rows = ONE_PROVIDER_MODELS.map((model, index) => ({ ...template, model, generations: ONE_PROVIDER_MODELS.length - index }));
      await recordPaintedText(page);
      await routeTrpc(page, {
        ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "stats.freshness", "stats.wrapped", "stats.latency"]),
        "stats.byModel": (input) => rows.slice(0, input?.limit),
      });
      const component = await mount<typeof AccountingCoverageStory>(STORY, {
        appearance: appearanceSettingsSchema.parse({}),
        characterId: null,
        view: "models",
        width: regime.width,
        height: 640,
      });
      // Positive control: the text equivalent names every id whole, so all four bars rendered.
      await expect(component.getByRole("table", { name: CHART, exact: true }).getByRole("rowheader")).toHaveText([...ONE_PROVIDER_MODELS]);
      await expect.poll(() => readLabelFit(page)).toMatchObject({ unlabelled: [], ambiguous: [] });
    });
  });
}
