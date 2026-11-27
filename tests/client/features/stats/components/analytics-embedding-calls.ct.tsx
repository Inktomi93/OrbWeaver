// @subject packages/client/src/features/stats/components/analytics-models-tab.tsx
// The Insights Models tab lists the owner's recent paid embedding calls, newest first, each naming the model that served
// it, its task, and its connection. The calls are the corpus root's own embedding_calls history, read through production.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { modelDisplayName } from "@orb/kit/model-name";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { ANALYTICS_EMBEDDING_CALLS_NAME } from "#client/features/stats/lib/analytics-names.ts";
import type { AccountingCoverageStory } from "./_accounting-coverage-stories.tsx";

const STORY = "tests/client/features/stats/components/_accounting-coverage-stories/AccountingCoverageStory";
const SHOWN = 25;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("the Models tab lists the newest embedding calls with the model that served each, its task and its connection", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const calls = await caller.stats.embeddingCalls({ limit: SHOWN });
  const [newest] = calls;
  if (newest === undefined) {
    throw new Error("The committed corpus has no embedding calls");
  }
  const label = newest.connectionLabel;
  if (label === null) {
    throw new Error("The committed corpus's newest embedding call must still name its connection");
  }
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "stats.freshness",
      "stats.wrapped",
      "stats.latency",
      "stats.byModel",
      "stats.embeddingCalls",
    ]),
  );
  const component = await mount<typeof AccountingCoverageStory>(STORY, {
    appearance: appearanceSettingsSchema.parse({}),
    characterId: null,
    view: "models",
    width: 440,
    height: 900,
  });

  const list = component.getByRole("list", { name: ANALYTICS_EMBEDDING_CALLS_NAME, exact: true });
  const rows = list.getByRole("listitem");
  await expect(rows).toHaveCount(calls.length);
  // Newest first: the list opens on the call the read puts first, and it says what it was and where it ran.
  const first = rows.first();
  await expect(first).toHaveAttribute("data-call-id", newest.id);
  await expect(first).toHaveAttribute("data-task", newest.task);
  await expect(first).toContainText(modelDisplayName(newest.servedModel ?? newest.model));
  await expect(first).toContainText(label);
});
