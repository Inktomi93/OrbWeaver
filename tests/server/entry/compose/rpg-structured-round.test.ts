// The structured state round's schema against the grammar ceilings that decide whether a row may ride it (0511).
// The counts are pinned to what Anthropic itself reported for this exact schema (the recorded 400s), so the
// checker cannot drift from the vendor's own arithmetic, and the shape and forced-round answers are the structured
// plan's for a row resolved through the shipped curated tables rather than a hand-built capability.

import type { GenerationCapability, ProviderId, WireSchemaMode } from "@orb/contracts/inference";
import { checkWireSchema, effectiveStructuredLimits, structuredSchemaComplexity } from "@orb/contracts/inference";
import type { ExtractionRefs, RpgToolCall } from "@orb/contracts/rpg";
import {
  constrainExtractionSchema,
  patchChangesToToolCalls,
  rpgExtractionSchema,
  rpgGameConfigSchema,
  stateRoundChangesSchema,
  stateRoundPatchSchema,
} from "@orb/contracts/rpg";
import { castId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { detectModelFamily } from "../../../../packages/inference/src/capability/families.ts";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { StateRoundPlans } from "../../../../packages/server/src/domain/rpg/index.ts";
import { fallbackStateRound, primaryStateRound } from "../../../../packages/server/src/domain/rpg/substrate/readonly-axis.ts";
import { buildToolRoundWireTools, structuredShapes } from "../../../../packages/server/src/entry/compose/rpg.ts";
import { makeGenerationCapability, makeResolved } from "../../../support/factories/resolved-connection.ts";
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
const ANTHROPIC_LIMITS = effectiveStructuredLimits("anthropic-format", undefined);

function wireTools(): ReturnType<typeof buildToolRoundWireTools> {
  return buildToolRoundWireTools(REFS, rpgGameConfigSchema.parse({}), {});
}

function roundSchema(): Record<string, unknown> {
  return stateRoundChangesSchema(constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), REFS), wireTools());
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

/** The planner's answers for the round on an openai-compat row speaking `mode`. */
function plansOn(generation: GenerationCapability, mode: WireSchemaMode): StateRoundPlans {
  const base = makeResolved({ capability: { kind: "generation", generation } });
  return structuredShapes({ ...base, features: { ...base.features, structuredMode: mode } }, REFS, wireTools()).plans;
}

test("the union schema's weight is what Anthropic counted: 41 optionals as projected, 41 unions once strict-compatible", () => {
  const schema = roundSchema();
  const optional = reported(ANTHROPIC_STATE_ROUND_400S.asProjected.body);
  const unions = reported(ANTHROPIC_STATE_ROUND_400S.strictCompatible.body);

  expect(checkWireSchema([schema], "anthropic-format", ANTHROPIC_LIMITS).violations).toEqual([
    { kind: "optional-props", mode: "anthropic-format", count: optional.count, limit: optional.limit },
  ]);
  // OpenRouter scrubs strict-compatible and forwards to Anthropic, so the vendor's table still binds.
  expect(checkWireSchema([schema], "strict-compatible", ANTHROPIC_LIMITS).violations).toEqual([
    { kind: "union-props", mode: "strict-compatible", count: unions.count, limit: unions.limit },
  ]);
  // A target that states no ceiling fits everything.
  expect(checkWireSchema([schema], "strict-compatible", undefined).fits).toBe(true);
});

function patchSchema(): Record<string, unknown> {
  return projectJsonSchema(stateRoundPatchSchema(wireTools()));
}

const LOCAL_NO_FORCE = makeGenerationCapability({
  output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] },
  tools: { parallel: true, requiredChoice: false, namedChoice: false },
});
const MALFORMED: RpgToolCall = { name: "update_scene", arguments: "{not json" };
const QUIET: RpgToolCall = { name: "no_changes", arguments: "{}" };

test("the patch list carries no optional and no union-typed property, so it fits Anthropic's table on every wire", () => {
  const patch = patchSchema();

  expect(structuredSchemaComplexity(patch)).toEqual({ optionalProps: 0, unionProps: 0 });
  expect(checkWireSchema([patch], "anthropic-format", ANTHROPIC_LIMITS).fits).toBe(true);
  expect(checkWireSchema([patch], "strict-compatible", ANTHROPIC_LIMITS).fits).toBe(true);
});

test("openrouter anthropic/claude-sonnet-5.5: the plan cannot fit the union (41/16) and picks the patch list; `required` goes out as auto", () => {
  const sonnet = resolvedGeneration("anthropic/claude-sonnet-5.5", "openrouter");
  expect(sonnet.output.structuredLimitsFrom).toBe("anthropic-format");
  const plans = plansOn(sonnet, "strict-compatible");
  expect(plans.toolRoundForced).toBe(false);
  expect(plans.structuredShape()).toBe("patch");

  // `auto` keeps Claude on its tool round; the patch list is reached by the knob or by the empty-round retry only.
  expect(primaryStateRound("auto", sonnet, plans)).toBeNull();
  expect(primaryStateRound("structured", sonnet, plans)).toBe("patch");
  expect(fallbackStateRound(sonnet, [], plans)).toBe("patch");
  expect(fallbackStateRound(sonnet, [MALFORMED], plans)).toBe("patch");
  expect(fallbackStateRound(sonnet, [QUIET], plans)).toBeNull();
  // An invented tool name is not a usable call: the round is retried, unless a real call rode beside it.
  expect(fallbackStateRound(sonnet, [{ name: "update_location", arguments: '{"location":"x"}' }], plans)).toBe("patch");
  expect(fallbackStateRound(sonnet, [{ name: "update_location", arguments: "{}" }, QUIET], plans)).toBeNull();
  // A patch call whose every value its field refuses is a recorded drop, not a usable call: the round is still retried.
  const refusedWhole = patchChangesToToolCalls({ changes: [{ plane: "update_scene", call: 0, field: "timeOfDay", item: 0, value: "Evening" }] }, wireTools());
  expect(fallbackStateRound(sonnet, refusedWhole?.calls ?? [], plans)).toBe("patch");
});

test("a local no-force row takes the union round under `auto`; `tools` keeps it on tools; a forcible row never retries", () => {
  const local = plansOn(LOCAL_NO_FORCE, "gbnf");
  expect(local.toolRoundForced).toBe(false);
  expect(primaryStateRound("auto", LOCAL_NO_FORCE, local)).toBe("union");
  expect(primaryStateRound("tools", LOCAL_NO_FORCE, local)).toBeNull();

  const forcible = { ...LOCAL_NO_FORCE, tools: { parallel: true } };
  const forced = plansOn(forcible, "gbnf");
  expect(forced.toolRoundForced).toBe(true);
  expect(primaryStateRound("auto", forcible, forced)).toBeNull();
  expect(primaryStateRound("structured", forcible, forced)).toBe("union");
  expect(fallbackStateRound(forcible, [], forced)).toBeNull();
});
