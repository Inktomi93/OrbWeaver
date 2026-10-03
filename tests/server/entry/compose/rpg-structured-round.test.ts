// The structured state round's schema against the grammar ceilings that decide whether a row may ride it (0511).
// The counts are pinned to what Anthropic itself reported for this exact schema (the recorded 400s), so the
// checker cannot drift from the vendor's own arithmetic, and the vehicle choice is driven off a row resolved
// through the shipped curated tables rather than a hand-built capability.

import type { GenerationCapability, ProviderId } from "@orb/contracts/inference";
import { checkWireSchema } from "@orb/contracts/inference";
import type { ExtractionRefs } from "@orb/contracts/rpg";
import { constrainExtractionSchema, rpgExtractionSchema, rpgGameConfigSchema, stateRoundChangesSchema } from "@orb/contracts/rpg";
import { castId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { detectModelFamily } from "../../../../packages/inference/src/capability/families.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import { answersStateRoundStructured } from "../../../../packages/server/src/domain/rpg/substrate/readonly-axis.ts";
import { buildToolRoundWireTools } from "../../../../packages/server/src/entry/compose/rpg.ts";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { ANTHROPIC_STATE_ROUND_400S } from "./_structured-state-round-recordings.ts";

/** The probe's refs: an ongoing scene (no establish-forcing), three targets, no trackers. */
const REFS: ExtractionRefs = {
  actorRefs: ["player", "Mira", "Corvin"],
  trackerWriteGroups: [],
  gameTrackerKeys: { deltaKeys: [], setKeys: [] },
  conditionNames: [],
  establishScene: { location: false, timeOfDay: false, presentCast: false },
};

function roundSchema(): Record<string, unknown> {
  const tools = buildToolRoundWireTools(REFS, rpgGameConfigSchema.parse({}), {});
  return stateRoundChangesSchema(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), REFS), tools);
}

/** The `(count) … (limit: N` pair out of a recorded Anthropic complexity refusal. */
function reported(body: string): { readonly count: number; readonly limit: number } {
  const message = (JSON.parse(body) as { error: { message: string } }).error.message;
  const count = /\((\d+)/u.exec(message)?.[1];
  const limit = /limit: (\d+)/u.exec(message)?.[1];
  return { count: Number(count), limit: Number(limit) };
}

function resolvedGeneration(model: string, providerId: string): GenerationCapability {
  const curated = curatedRows({ model, providerId: castId<ProviderId>(providerId), wire: "openai-compat", api: "chat-completions" });
  const out = synthesizeCapability("generation", detectModelFamily(model), { curated });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

test("the union schema's weight is what Anthropic counted: 41 optionals as projected, 41 unions once strict-compatible", () => {
  const schema = roundSchema();
  const optional = reported(ANTHROPIC_STATE_ROUND_400S.asProjected.body);
  const unions = reported(ANTHROPIC_STATE_ROUND_400S.strictCompatible.body);

  expect(checkWireSchema([schema], "anthropic-format").violations).toEqual([
    { kind: "optional-props", mode: "anthropic-format", count: optional.count, limit: optional.limit },
  ]);
  // OpenRouter scrubs strict-compatible and forwards to Anthropic, so the vendor's table still binds.
  expect(checkWireSchema([schema], "strict-compatible", "anthropic-format").violations).toEqual([
    { kind: "union-props", mode: "strict-compatible", count: unions.count, limit: unions.limit },
  ]);
  // A wire class whose own row states no ceiling fits everything.
  expect(checkWireSchema([schema], "strict-compatible").fits).toBe(true);
});

test("openrouter anthropic/claude-sonnet-5.5 resolves the limits pointer and keeps the tool round; a local no-force row takes the structured one", () => {
  const schema = roundSchema();
  const sonnet = resolvedGeneration("anthropic/claude-sonnet-5.5", "openrouter");
  expect(sonnet.output.structuredLimitsFrom).toBe("anthropic-format");
  expect(sonnet.tools?.requiredChoice).toBe(false);
  expect(answersStateRoundStructured(sonnet, schema)).toBe(false);

  const local = makeGenerationCapability({
    output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] },
    tools: { parallel: true, requiredChoice: false, namedChoice: false },
  });
  expect(answersStateRoundStructured(local, schema)).toBe(true);
  // A row that can force a tool call never leaves the tool round, whatever else it states.
  expect(answersStateRoundStructured({ ...local, tools: { parallel: true } }, schema)).toBe(false);
});
