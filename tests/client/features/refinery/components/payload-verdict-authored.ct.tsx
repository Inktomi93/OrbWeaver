import { testId } from "@orb/client/lib";
import type { ForgeDesignEnvelope } from "@orb/contracts/refinery";
import { refineryRunViewSchema, transpileForgeDesign } from "@orb/contracts/refinery";
import { ID_PREFIX } from "@orb/kit/ids";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder, createSeededIds, FROZEN_AT_MS, testModelId } from "@orb/testkit/iso";
import type { PayloadOwnerStory } from "./_payload-stories.tsx";

// A spelling no display table could hold: mixed case, a doubled space and a hyphen the author typed on purpose.
const AUTHORED = "needs  a Second-pass";

test("the verdict banner shows the member the schema author wrote verbatim, in the content voice", async ({ corpus, corpusViewer, mount, page }) => {
  const design: ForgeDesignEnvelope = {
    name: "authored_verdict",
    description: "a verdict whose members the author spelled",
    fields: [
      {
        path: "verdict",
        type: "string",
        description: "the call",
        required: true,
        enum: [AUTHORED, "ship"],
        role: "verdict",
        tones: [{ member: AUTHORED, tone: "warn" }],
      },
    ],
  };
  const { schema, dropped } = transpileForgeDesign(design, "score");
  expect(dropped).toEqual([]);
  const ids = createSeededIds();
  const run = refineryRunViewSchema.options[1].parse({
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
    payloadConfig: { kind: "custom", schemaId: ids.next(ID_PREFIX.refinerySchema), schemaVersion: 1, schema },
    payload: { verdict: AUTHORED },
  });
  await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
  });
  await mount<typeof PayloadOwnerStory>("tests/client/features/refinery/components/_payload-stories/PayloadOwnerStory", { run });

  const banner = page.getByTestId(testId("refineryVerdictBanner"));
  const heading = banner.getByRole("heading", { level: 3 });
  await expect(heading).toHaveJSProperty("textContent", AUTHORED);
  await expect(heading).toHaveAttribute("data-voice", "reading");
  // The author's tone map still tints the banner; the word itself is not drawn as a chip.
  await expect(banner).toHaveAttribute("data-hint-tone", "warn");
  await expect(banner.getByTestId(testId("refineryChip"))).toHaveCount(0);
});
