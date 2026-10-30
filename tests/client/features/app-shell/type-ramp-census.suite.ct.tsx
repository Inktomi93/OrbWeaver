// The type-ramp census: every registered section, modal and settings group, mounted through the production door with the
// viewer's font-scale setting raised, paints every text run at a `--text-*` step of the scaled root (UI-Density-Law.md §2.3,
// integer-line-boxes.md §2). The rosters are the production tuples, never a list here.

import { CONFIG_GROUP_IDS, MODAL_SLOT_IDS, SECTION_IDS } from "@orb/client/state";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { auditSurface, formatDensityFindings } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { routeSurfaceReads } from "./_surface-harness.ts";
import { groupScenario, modalScenario, sectionScenario } from "./_surface-scenarios.ts";
import type { ConfigGroupStory, ModalShellStory, SectionShellStory } from "./_surface-stories.tsx";

const STORIES = "tests/client/features/app-shell/_surface-stories";
// At this slider stop no ramp step lands on a whole pixel, so a raw integer size can never pass as a scaled step.
const FONT_SCALE = 1.15;
// The UA root the `:root { font-size }` scale multiplies; no token names a browser default.
const UA_ROOT_PX = 16;
const DEFAULTS = appearanceSettingsSchema.parse({});
// The reading knobs multiply a step for transcript prose; at their defaults the prose is the step itself.
const APPEARANCE = { fontScale: FONT_SCALE, readingBodyScale: DEFAULTS.readingBodyScale, readingNameScale: DEFAULTS.readingNameScale };
// A step sized by its art container rather than the root (Text `artScale`, UI-Density-Law.md §2.3).
const CONTAINER_UNIT = /\dcq(?:min|max|[whib])\b/u;
const TEXT_PATHS = (Object.keys(TOKENS) as (keyof typeof TOKENS)[]).filter((path) => path.startsWith("text."));
/** The ramp: every `text.*` token that is a served dimension. */
const RAMP_VARS = TEXT_PATHS.filter((path) => path in LENGTH_BASE_PX).map((path) => TOKENS[path].cssVar);
/** The container-sized steps' utility classes; a run that wears one is the one exemption. */
const CONTAINER_SIZED_CLASSES = TEXT_PATHS.filter((path) => CONTAINER_UNIT.test(TOKENS[path].value)).map((path) => TOKENS[path].cssVar.slice("--".length));

interface OffRampRun {
  readonly text: string;
  readonly slot: string | null;
  readonly fontSize: number;
}

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeSurfaceReads(page, corpus, root, { appearance: APPEARANCE });
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** Every visible text run under `scope`, read against the ramp steps the same scope resolves. */
async function expectScaledRamp(scope: Locator): Promise<void> {
  const reading = await scope.evaluate(
    (subject, { rampVars, exempt }) => {
      const steps = rampVars.map((cssVar) => {
        const probe = document.createElement("span");
        probe.style.fontSize = `var(${cssVar})`;
        probe.style.position = "fixed";
        subject.append(probe);
        const px = Number.parseFloat(getComputedStyle(probe).fontSize);
        probe.remove();
        return px;
      });
      const offRamp: OffRampRun[] = [];
      let checked = 0;
      for (const element of [subject, ...subject.querySelectorAll("*")]) {
        const painted = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
        const containerSized = exempt.some((name) => element.closest(`.${name}`) !== null);
        if (containerSized || !(painted && element.checkVisibility())) {
          continue;
        }
        checked += 1;
        const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
        if (!steps.some((step) => Math.abs(step - fontSize) < 0.01)) {
          offRamp.push({ text: element.textContent.trim().slice(0, 40), slot: element.getAttribute("data-slot"), fontSize });
        }
      }
      return { rootPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize), checked, offRamp };
    },
    { rampVars: RAMP_VARS, exempt: CONTAINER_SIZED_CLASSES },
  );
  expect(reading.rootPx).toBeCloseTo(UA_ROOT_PX * FONT_SCALE, 3);
  expect(reading.checked).toBeGreaterThan(0);
  expect(reading.offRamp).toEqual([]);
}

for (const section of SECTION_IDS) {
  test(`section ${section} paints every text run on the scaled ramp`, async ({ mount, page }) => {
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    const scenario = sectionScenario(page, section);
    expect(formatDensityFindings((await auditSurface({ ...scenario, checks: ["density"] })).density)).toBe("");
    await expectScaledRamp(scenario.scope);
  });
}

for (const modal of MODAL_SLOT_IDS) {
  test(`modal ${modal} paints every text run on the scaled ramp`, async ({ mount, page }) => {
    await mount<typeof ModalShellStory>(`${STORIES}/ModalShellStory`, { modal });
    const scenario = modalScenario(page, modal);
    expect(formatDensityFindings((await auditSurface({ ...scenario, checks: ["density"] })).density)).toBe("");
    await expectScaledRamp(scenario.scope);
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} paints every text run on the scaled ramp`, async ({ mount, page }) => {
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group, appearance: APPEARANCE });
    const scenario = groupScenario(page, group);
    expect(formatDensityFindings((await auditSurface({ ...scenario, checks: ["density"] })).density)).toBe("");
    await expectScaledRamp(scenario.scope);
  });
}
