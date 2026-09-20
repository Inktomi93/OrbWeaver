// contracts/inference/kinds — the model KIND axis. A kind decides which capability schema describes a model
// and which tasks a connection on it may serve, so the invariants are TOTALITY ones: every kind has a
// `KIND_DEFS` entry (schema + floor), every kind is served by at least one task, and no task claims a kind
// outside the tuple. A kind added to the tuple without its `KIND_DEFS` row would resolve to `undefined` at
// the synthesis floor and hand every model on it a capability of `undefined`.

import type { Capability } from "@orb/contracts/inference";
import { KIND_DEFS, MODEL_KINDS, modelKindSchema, TASK_DEFS, TASKS, tasksOfKind } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

/** The floor's own payload, by its discriminator — the value its kind's schema must accept. */
function payloadOf(floor: Capability): unknown {
  if (floor.kind === "generation") {
    return floor.generation;
  }
  return floor.kind === "embedding" ? floor.embedding : floor.rerank;
}

test("every member parses to itself and anything else is REFUSED", () => {
  for (const kind of MODEL_KINDS) {
    expect(modelKindSchema.parse(kind)).toBe(kind);
  }
  expect(modelKindSchema.safeParse("image").success, "image generation is a GENERATION model, never a fourth kind").toBe(false);
  expect(modelKindSchema.safeParse("").success).toBe(false);
});

test("`KIND_DEFS` is TOTAL over the tuple, and each floor parses under its own kind's schema", () => {
  expect(Object.keys(KIND_DEFS).toSorted()).toEqual([...MODEL_KINDS].toSorted());
  for (const kind of MODEL_KINDS) {
    const def = KIND_DEFS[kind];
    expect(def.floor.kind, "a kind's floor must be OF that kind").toBe(kind);
    expect(def.capabilitySchema.safeParse(payloadOf(def.floor)).success, `${kind}'s floor must satisfy ${kind}'s capability schema`).toBe(true);
  }
});

test("every kind is servable — and every task's kind is a member", () => {
  for (const kind of MODEL_KINDS) {
    expect(tasksOfKind(kind).length, `no task can run on a "${kind}" model`).toBeGreaterThan(0);
  }
  const known: ReadonlySet<string> = new Set<string>(MODEL_KINDS);
  for (const task of TASKS) {
    expect(known.has(TASK_DEFS[task].kind), `task "${task}" names a kind outside the tuple`).toBe(true);
  }
});

test("the kinds PARTITION the task set — no task belongs to two kinds, none to zero", () => {
  const counted = MODEL_KINDS.flatMap((kind) => tasksOfKind(kind));
  expect(counted.toSorted()).toEqual([...TASKS].toSorted());
});
