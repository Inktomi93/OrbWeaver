import { EMBEDDING_FLOOR } from "@orb/contracts/inference";
import { structuredTargetOf } from "../../../packages/inference/src/structured/target.ts";
import { makeGenerationCapability, makeResolved } from "../../support/factories/resolved-connection.ts";
import { expect, test } from "../../support/fixtures.ts";

const GENERATION = makeGenerationCapability({
  tools: { parallel: true, requiredChoice: true, namedChoice: true },
  output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"], structured: true, structuredLimits: { maxDepth: 4 } },
});

test("the actual endpoint exposes native, forced and offered carriers with its configured grammar ceilings", () => {
  const resolved = makeResolved({ generation: GENERATION });
  const target = structuredTargetOf({ ...resolved, features: { ...resolved.features, structuredMode: "guided-decoding", strictJson: "default-on" } });
  expect(target).toMatchObject({
    mode: "guided-decoding",
    limits: { maxDepth: 4 },
    vehicles: ["response-format", "forced-tool", "offered-tool"],
    strictTools: "default-on",
    requiredChoice: true,
    namedChoice: true,
    toolsSupported: true,
  });
});

test("a non-generation connection offers no structured carrier or forced tool guarantee", () => {
  const resolved = makeResolved({ capability: { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: 768, input: ["text"] } } });
  expect(structuredTargetOf(resolved)).toMatchObject({
    vehicles: [],
    limits: undefined,
    toolsSupported: false,
    requiredChoice: false,
    namedChoice: false,
    noneChoice: false,
  });
});

test("agent SDK structured output is not grammar-compiled and cannot force its MCP tools", () => {
  const resolved = makeResolved({ providerId: "claude-sub", generation: GENERATION });
  expect(structuredTargetOf(resolved)).toMatchObject({ vehicles: ["response-format"], limits: undefined, toolsSupported: false });
});

test("a model that declines named choice retains offered tools, never a forced carrier", () => {
  const generation = makeGenerationCapability({
    ...GENERATION,
    tools: { parallel: false, requiredChoice: false, namedChoice: false, noneChoice: false, requiresReasoningOff: true },
  });
  expect(structuredTargetOf(makeResolved({ generation }))).toMatchObject({
    vehicles: ["response-format", "offered-tool"],
    requiredChoice: false,
    namedChoice: false,
    noneChoice: false,
    requiresReasoningOff: true,
  });
});
