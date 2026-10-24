import type { ForgeDesignEnvelope } from "@orb/contracts/refinery";
import { refineryRunViewSchema, transpileForgeDesign } from "@orb/contracts/refinery";
import { ID_PREFIX } from "@orb/kit/ids";
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder, createSeededIds, FROZEN_AT_MS, testModelId } from "@orb/testkit/iso";
import type { PayloadOwnerStory } from "./_payload-stories.tsx";

const ABSENT = "—";
// A bounded string renders as a one-line datum; an unbounded one renders as prose.
const SHORT = { maxLength: 40 } as const;

function row(path: string, extra: Partial<ForgeDesignEnvelope["fields"][number]> = {}): ForgeDesignEnvelope["fields"][number] {
  return { path, type: "string", description: "an optional readout", required: false, ...extra };
}

// The forge lands any identifier as a field name, so an omitted optional field can share a name with an inherited object member.
test("an omitted field named like an inherited object member renders as absent at every payload depth", async ({ corpus, mount, page }) => {
  const design: ForgeDesignEnvelope = {
    name: "inherited_names",
    description: "fields named like object members",
    fields: [
      row("summary"),
      row("constructor", SHORT),
      row("meta.toString", SHORT),
      row("meta.kept", SHORT),
      row("mood", { enum: ["constructor", "calm"] }),
      row("issues[].valueOf", SHORT),
      row("issues[].note", SHORT),
      row("issues[].hasOwnProperty"),
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
    payload: { overallScore: 6, summary: "A readable card", meta: { kept: "present" }, mood: "constructor", issues: [{ note: "first note" }] },
  });
  await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
  });
  await mount<typeof PayloadOwnerStory>("tests/client/features/refinery/components/_payload-stories/PayloadOwnerStory", { run });

  await expect(page.locator('[data-field="constructor"]').getByText(ABSENT, { exact: true })).toBeVisible();
  const meta = page.locator('[data-field="meta"]');
  await expect(meta.locator('[data-field="toString"]').getByText(ABSENT, { exact: true })).toBeVisible();
  await expect(meta.getByText("present", { exact: true })).toBeVisible();
  // An enum member with no authored tone takes the neutral tint, not an inherited member of the tone map.
  await expect(page.locator('[data-field="mood"]').getByText("constructor", { exact: true })).toHaveAttribute("data-hint-tone", "neutral");
  const issue = page.getByRole("button", { name: `${ABSENT} first note`, exact: true });
  await issue.click();
  await expect(issue).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-field="hasOwnProperty"]').getByText(ABSENT, { exact: true })).toBeVisible();
});
