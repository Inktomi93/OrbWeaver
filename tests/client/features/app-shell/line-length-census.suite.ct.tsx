// The line-length census: every registered section and settings group, mounted through the production door at a desktop width with
// every pane open, sets no prose line past its reading measure under the design audit's own `line-length` rule. The rosters are the
// production tuples, never a list here.

import { CONFIG_GROUP_IDS, SECTION_IDS } from "@orb/client/state";
import { auditSurface, readSurfaceDesignAudit } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { routeSurfaceReads } from "./_surface-harness.ts";
import { groupScenario, sectionScenario } from "./_surface-scenarios.ts";
import type { ConfigGroupStory, SectionShellStory } from "./_surface-stories.tsx";

const STORIES = "tests/client/features/app-shell/_surface-stories";
const RULE = "line-length";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.beforeEach(async ({ corpus, page }) => {
  await routeSurfaceReads(page, corpus, root);
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test.use({ viewport: { width: 1440, height: 1000 } });

interface LineLengthCensus {
  /** How many prose samples the rule judged: the positive control that the surface was read at all. */
  readonly judged: number;
  /** The samples the rule could not measure, by reason. */
  readonly withheld: Readonly<Record<string, number>>;
  /** Each finding with its measure. */
  readonly findings: readonly string[];
}

async function lineLengthCensus(page: Page, scenario: ReturnType<typeof sectionScenario>): Promise<LineLengthCensus> {
  await auditSurface({ ...scenario, checks: ["density"] });
  const { audit } = await readSurfaceDesignAudit(page);
  const accounting = audit.populationAccounting[RULE];
  return {
    judged: accounting?.judged ?? 0,
    withheld: accounting?.withheld ?? {},
    findings: audit.findings.filter(({ rule }) => rule === RULE).map(({ selector, value }) => `${selector} ${value}`),
  };
}

for (const section of SECTION_IDS) {
  test(`section ${section} sets no prose line past its measure`, async ({ mount, page }) => {
    await mount<typeof SectionShellStory>(`${STORIES}/SectionShellStory`, { section });
    const census = await lineLengthCensus(page, sectionScenario(page, section));
    expect(census.judged).toBeGreaterThan(0);
    expect(census.withheld).toEqual({});
    expect(census.findings).toEqual([]);
  });
}

for (const group of CONFIG_GROUP_IDS) {
  test(`settings group ${group} sets no prose line past its measure`, async ({ mount, page }) => {
    await mount<typeof ConfigGroupStory>(`${STORIES}/ConfigGroupStory`, { group });
    const census = await lineLengthCensus(page, groupScenario(page, group));
    expect(census.judged).toBeGreaterThan(0);
    expect(census.withheld).toEqual({});
    expect(census.findings).toEqual([]);
  });
}
