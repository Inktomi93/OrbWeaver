import { testId } from "@orb/client/lib";
import type { ForgeDesignEnvelope } from "@orb/contracts/refinery";
import { refineryRunViewSchema, transpileForgeDesign } from "@orb/contracts/refinery";
import { ID_PREFIX } from "@orb/kit/ids";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder, createSeededIds, FROZEN_AT_MS, testModelId } from "@orb/testkit/iso";
import type { PayloadOwnerStory } from "./_payload-stories.tsx";

// Spellings no display table could hold: mixed case, a doubled space and a hyphen the author typed on purpose.
const AUTHORED = "needs  a Second-pass";
const AUTHORED_MOOD = "Wry  but-Kind";
const MOOD_KEY = "mood";

test("authored enum members read verbatim in the content voice, at the verdict heading and on a field row", async ({ corpus, corpusViewer, mount, page }) => {
  const design: ForgeDesignEnvelope = {
    name: "authored_verdict",
    description: "a verdict and a field whose members the author spelled",
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
      {
        path: MOOD_KEY,
        type: "string",
        description: "the voice",
        required: true,
        enum: [AUTHORED_MOOD, "flat"],
        tones: [{ member: AUTHORED_MOOD, tone: "good" }],
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
    payload: { verdict: AUTHORED, [MOOD_KEY]: AUTHORED_MOOD },
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
  // The author's tone map still tints the banner.
  await expect(banner).toHaveAttribute("data-hint-tone", "warn");

  const moodRow = page.locator(`[data-testid="${testId("refineryField")}"][data-field="${MOOD_KEY}"]`);
  const member = moodRow.locator(`[data-voice="reading"]`);
  await expect(member).toHaveJSProperty("textContent", AUTHORED_MOOD);
  await expect(member).toHaveAttribute("data-hint-tone", "good");

  // No authored word anywhere on the payload is drawn as a chip.
  await expect(page.getByTestId(testId("refineryPayloadView")).getByTestId(testId("refineryChip"))).toHaveCount(0);
});
