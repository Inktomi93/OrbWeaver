// domain/refinery/substrate/schema-forge — pins the substrate directly (the two verbs are thin: they call
// resolveForgeCall + runForgeTurn). Covers what the verb suites exercise per-verb-arm: the `needsRaw` honest
// refusal routes to its own arm with the transpiled skeleton attached, and a design with zero fields is a
// `failed` arm rather than a silently-empty draft.

import type { SchemaForgeResult } from "@orb/server/domain/refinery";
import { resolveForgeCall, runForgeTurn } from "../../../../../packages/server/src/domain/refinery/substrate/schema-forge.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, seedUser } from "../_support.ts";

/** Narrow a forge result to one arm, THROWING (never `expect`-inside-an-`if`) so the assertions after it are
 *  unconditional (the `noConditionalExpect` shape, the generate-schema.int.test.ts precedent). */
function asArm<K extends SchemaForgeResult["kind"]>(result: SchemaForgeResult, kind: K): Extract<SchemaForgeResult, { kind: K }> {
  if (result.kind !== kind) {
    throw new Error(`expected the ${kind} arm, got ${result.kind}: ${JSON.stringify(result)}`);
  }
  return result as Extract<SchemaForgeResult, { kind: K }>;
}

function fieldRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { path: "mood", type: "string", description: "the dominant mood", required: true, ...over };
}
function designReply(over: Record<string, unknown> = {}): string {
  return JSON.stringify({ name: "vibe_scorer", description: "a vibe readout", fields: [fieldRow()], ...over });
}

test("needsRaw routes to its own arm, carrying the transpiled partial as the raw door's starter skeleton", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_forge_raw" });
  const h = makeRefineryHarness(db);
  h.queueReply(designReply({ needsRaw: true, needsRawReason: "a recursive tree structure" }));
  const call = await resolveForgeCall(h.ctx, owner);
  const result = asArm(
    await runForgeTurn({
      stage: "score",
      arm: "single",
      userPrompt: "score a recursive tree",
      overrides: call.overrides,
      sampleOpts: call.sampleOpts,
      rc: call.rc,
    }),
    "needs-raw",
  );
  expect(result.message).toContain("a recursive tree structure");
  expect(result.skeleton).toBeDefined();
});

test("a design the model returned with ZERO fields is a `failed` arm, never a silently-empty draft", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_forge_empty" });
  const h = makeRefineryHarness(db);
  h.queueReply(designReply({ fields: [] }));
  const call = await resolveForgeCall(h.ctx, owner);
  const result = asArm(
    await runForgeTurn({ stage: "score", arm: "single", userPrompt: "anything", overrides: call.overrides, sampleOpts: call.sampleOpts, rc: call.rc }),
    "failed",
  );
  expect(result.raw).toBeNull();
});

test("a design that fails the schema belt (a name outside the identifier grammar) is `failed` carrying the raw transpiled document", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_forge_belt" });
  const h = makeRefineryHarness(db);
  h.queueReply(designReply({ name: "not a valid identifier!!!" }));
  const call = await resolveForgeCall(h.ctx, owner);
  const result = asArm(
    await runForgeTurn({ stage: "score", arm: "single", userPrompt: "anything", overrides: call.overrides, sampleOpts: call.sampleOpts, rc: call.rc }),
    "failed",
  );
  expect(result.raw).not.toBeNull();
});
