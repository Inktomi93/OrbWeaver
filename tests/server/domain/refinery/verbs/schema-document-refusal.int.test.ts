// A custom schema the authoring belt refuses is the caller's mistake, so create and update answer it as a typed BAD_REQUEST that carries
// the belt's own sentences, never the unclassified fault the author cannot act on.
// @subject packages/server/src/domain/refinery/verbs/create-schema.ts
// @subject packages/server/src/domain/refinery/verbs/update-schema.ts
import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import { expect, test } from "@orb/testkit/node";
import { SCORE_MAX, SCORE_MIN } from "#contracts/refinery/core.ts";

const SCORE_SCHEMA = {
  type: "object",
  properties: { overallScore: { type: "integer", minimum: SCORE_MIN, maximum: SCORE_MAX } },
  required: ["overallScore"],
};
const NO_OVERALL_SCORE = { type: "object", properties: { mood: { type: "string" } }, required: ["mood"] };
const VALID = { name: "mood_scorer", description: "", stage: "score", schema: SCORE_SCHEMA } as const;

/** The sentences the belt writes for `doc`, the lines a refusal must carry. */
function beltLines(doc: unknown): string {
  const parsed = refinerySchemaDocumentSchema.safeParse(doc);
  if (parsed.success) {
    throw new Error("The draft was meant to fail the belt");
  }
  return parsed.error.issues.map((issue) => issue.message).join("\n");
}

test("createSchema refuses a name outside the identifier grammar and a score schema without overallScore with the belt's sentences", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const badName = { ...VALID, name: "my schema" };
  const noScore = { ...VALID, schema: NO_OVERALL_SCORE };
  await expect(caller.refinery.createSchema(badName)).rejects.toMatchObject({ code: "BAD_REQUEST", message: beltLines(badName) });
  await expect(caller.refinery.createSchema(noScore)).rejects.toMatchObject({ code: "BAD_REQUEST", message: beltLines(noScore) });
  // Positive control: the same wiring saves the valid document, so the refusals above came from the belt and nothing else.
  expect(await caller.refinery.createSchema(VALID)).toMatchObject({ name: VALID.name, stage: VALID.stage });
  expect((await caller.refinery.listSchemas()).map((row) => row.name)).toEqual([VALID.name]);
});

test("createSchema states every issue of a draft that fails the belt twice", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const both = { ...VALID, name: "my schema", schema: NO_OVERALL_SCORE };
  expect(beltLines(both).split("\n")).toHaveLength(2);
  await expect(caller.refinery.createSchema(both)).rejects.toMatchObject({ code: "BAD_REQUEST", message: beltLines(both) });
});

test("updateSchema refuses a patch whose merged document fails the belt, and leaves the saved row as it was", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const saved = await caller.refinery.createSchema(VALID);
  const renamed = { ...VALID, name: "9lives" };
  const restaged = { ...VALID, stage: "analyze" } as const;
  await expect(caller.refinery.updateSchema({ schemaId: saved.id, patch: { name: renamed.name } })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: beltLines(renamed),
  });
  // The stage flip refuses through the stored schema, which the patch never carried.
  await expect(caller.refinery.updateSchema({ schemaId: saved.id, patch: { stage: restaged.stage } })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: beltLines(restaged),
  });
  expect((await caller.refinery.listSchemas()).map((row) => ({ name: row.name, stage: row.stage, version: row.version }))).toEqual([
    { name: VALID.name, stage: VALID.stage, version: saved.version },
  ]);
  // Positive control: a patch the belt accepts lands.
  expect(await caller.refinery.updateSchema({ schemaId: saved.id, patch: { name: "mood_scorer_two" } })).toMatchObject({ name: "mood_scorer_two" });
});

test("testSchema refuses a draft the belt refuses as a typed BAD_REQUEST once the card is the caller's own", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const card = await caller.character.create({ input: { handle: "lantern", name: "Lantern", description: "A lamp on the outer ring." } });
  const draft = { name: "draft_preview", description: "", stage: VALID.stage, schema: NO_OVERALL_SCORE };
  await expect(caller.refinery.testSchema({ schema: draft.schema, stage: draft.stage, characterId: card.id })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: beltLines(draft),
  });
});
