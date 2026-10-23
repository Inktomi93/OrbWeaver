import { capabilitySchema, EMBEDDING_FLOOR, GENERATION_FLOOR, modelKindSchema, RERANK_FLOOR, TASK_DEFS, TASKS, tasksOfKind } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("canonical capability floors retain their complete payloads through parsing and serialization", () => {
  for (const input of [
    { kind: "generation", generation: GENERATION_FLOOR },
    { kind: "embedding", embedding: EMBEDDING_FLOOR },
    { kind: "rerank", rerank: RERANK_FLOOR },
  ]) {
    const parsed = capabilitySchema.parse(input);
    expect(parsed).toEqual(input);
    expect(capabilitySchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  }
});

test("capabilities refuse missing, mismatched and unknown discriminators or payloads", () => {
  expect(capabilitySchema.parse({ kind: "embedding", embedding: EMBEDDING_FLOOR }).kind).toBe("embedding");
  for (const input of [
    { kind: "generation" },
    { kind: "embedding", generation: GENERATION_FLOOR },
    { kind: "rerank", embedding: EMBEDDING_FLOOR },
    { kind: "image", generation: GENERATION_FLOOR },
    { generation: GENERATION_FLOOR },
  ]) {
    expect(capabilitySchema.safeParse(input).success).toBe(false);
  }
});

test("a valid capability strips another kind's payload", () => {
  expect(capabilitySchema.parse({ kind: "embedding", embedding: EMBEDDING_FLOOR, generation: GENERATION_FLOOR })).toEqual({
    kind: "embedding",
    embedding: EMBEDDING_FLOOR,
  });
});

test("the canonical kinds parse and partition all production tasks", () => {
  for (const kind of modelKindSchema.options) {
    expect(modelKindSchema.parse(kind)).toBe(kind);
    expect(tasksOfKind(kind).length).toBeGreaterThan(0);
  }
  expect(modelKindSchema.safeParse("image").success).toBe(false);
  expect(modelKindSchema.safeParse("").success).toBe(false);
  for (const task of TASKS) {
    expect(modelKindSchema.safeParse(TASK_DEFS[task].kind).success).toBe(true);
  }
  expect(modelKindSchema.options.flatMap((kind) => tasksOfKind(kind)).toSorted()).toEqual([...TASKS].toSorted());
});
