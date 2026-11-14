// @subject packages/client/src/features/refinery/components/lane-band.tsx
// A lane walked back to a superseded run offers Back to latest, and pressing it returns the lane to its current run.
import { REFINERY_SCORE_MODES, refineryRunViewSchema, refineryScorePayloadSchema } from "@orb/contracts/refinery";
import { ID_PREFIX } from "@orb/kit/ids";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder, createSeededIds, FROZEN_AT_MS, testModelId } from "@orb/testkit/iso";
import { REFINERY_BACK_TO_LATEST_NAME } from "#client/features/refinery/lib/refinery-names.ts";
import type { PayloadWalkedBackStory } from "./_payload-stories.tsx";

const STORY = "tests/client/features/refinery/components/_payload-stories/PayloadWalkedBackStory";

test("a lane held on a superseded run returns to its latest through Back to latest", async ({ corpus, corpusViewer, mount, page }) => {
  const ids = createSeededIds();
  const parsedRun = refineryRunViewSchema.options[0].parse({
    id: ids.next(ID_PREFIX.refineryRun),
    sessionId: ids.next(ID_PREFIX.refinerySession),
    iteration: 0,
    model: testModelId("fixture-model"),
    promptTokens: null,
    outputTokens: null,
    durationMs: 0,
    sourceRunId: null,
    strippedKeys: [],
    createdAt: FROZEN_AT_MS,
    stage: "score",
    payloadConfig: { kind: "fixed", mode: REFINERY_SCORE_MODES[0] },
    payload: refineryScorePayloadSchema.parse({
      fieldScores: [{ field: "description", score: 7, strengths: "Recognizable voice", weaknesses: "Missing context", suggestions: "Add a scene anchor" }],
      overallScore: 7,
      priorityImprovements: [],
      summary: "A readable card",
    }),
  });
  // The wire shape of a score run omits an absent greeting index rather than carrying `undefined`.
  const run = {
    ...parsedRun,
    payload: {
      ...parsedRun.payload,
      fieldScores: parsedRun.payload.fieldScores.map(({ greetingIndex, ...score }) => ({
        ...score,
        ...(greetingIndex === undefined ? {} : { greetingIndex }),
      })),
    },
  };
  await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
  });
  await mount<typeof PayloadWalkedBackStory>(STORY, { run });
  const lane = page.locator('[data-lane="score"]');
  const back = lane.getByRole("button", { name: REFINERY_BACK_TO_LATEST_NAME, exact: true });
  await expect(back).toBeVisible();
  await back.click();
  await expect(back).toHaveCount(0);
});
