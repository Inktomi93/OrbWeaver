import { REFINERY_SCORE_MODES, refineryRunViewSchema, refineryScorePayloadSchema } from "@orb/contracts/refinery";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { createCorpusReadResponder } from "@orb/testkit/iso/corpus-read-responder.ts";
import { createSeededIds } from "@orb/testkit/iso/ids.ts";
import { testModelId } from "@orb/testkit/iso/inference-identities.ts";
import { expect, test } from "@orb/testkit/node/ct-corpus.ts";
import { routeTrpc } from "@orb/testkit/node/route-trpc.ts";
import { PayloadOwnerStory } from "./_payload-stories.tsx";

test("assay expansion survives a same-run clone but not a different immutable run", async ({ corpus, mount, page }) => {
  const ids = createSeededIds();
  const payload = refineryScorePayloadSchema.parse({
    fieldScores: [{ field: "description", score: 7, strengths: "Recognizable voice", weaknesses: "Missing context", suggestions: "Add a scene anchor" }],
    overallScore: 7,
    priorityImprovements: [],
    summary: "A readable card",
  });
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
    payload,
  });
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
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
  });
  const component = await mount(<PayloadOwnerStory run={run} />);
  const assay = page.getByRole("button", { name: "description — 7", exact: true });
  await assay.click();
  await expect(assay).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Recognizable voice", { exact: true })).toBeVisible();

  await component.update(<PayloadOwnerStory run={structuredClone(run)} />);
  await expect(assay).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Recognizable voice", { exact: true })).toBeVisible();

  const nextRun = { ...run, id: refineryRunViewSchema.options[0].shape.id.parse(ids.next(ID_PREFIX.refineryRun)), createdAt: FROZEN_AT_MS + 1 };
  await component.update(<PayloadOwnerStory run={nextRun} />);
  await expect(assay).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Recognizable voice", { exact: true })).toHaveCount(0);
});
