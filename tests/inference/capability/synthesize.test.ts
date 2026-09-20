// capability/synthesize — the evidence fold in `EVIDENCE_TIERS` order (§6.2): declared > measured >
// advertised > curated > family-floor (add-only) > kind floor, field-wise; `declared_overrides_measured`
// names the field; the window is estimated unless a tier states it; the endpoint posture floors (§6.4,
// D143(c)) close `silencesProse` and widen undeclared modalities with `modalitiesEstimated`.

import type { Capability, CapabilityOverride, EmbeddingCapability, GenerationCapability, ProviderDef } from "@orb/contracts/inference";
import { builtinProvider, GENERATION_FLOOR, TURNS_FLOOR } from "@orb/contracts/inference";
import { applyEndpointPosture } from "../../../packages/inference/src/capability/floor.ts";
import { synthesizeCapability } from "../../../packages/inference/src/capability/synthesize.ts";
import { expect, test } from "../../support/fixtures.ts";

function generationOf(capability: Capability): GenerationCapability {
  if (capability.kind !== "generation") {
    throw new Error(`expected a generation capability, got ${capability.kind}`);
  }
  return capability.generation;
}

function embeddingOf(capability: Capability): EmbeddingCapability {
  if (capability.kind !== "embedding") {
    throw new Error(`expected an embedding capability, got ${capability.kind}`);
  }
  return capability.embedding;
}

const curated: CapabilityOverride = {
  kind: "generation",
  generation: { context: { window: 8192 }, reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "high"] }, tools: { parallel: true } },
  evidence: { tier: "curated", dated: "2026-09-19", cite: "test" },
};
const measured: CapabilityOverride = {
  kind: "generation",
  generation: { turns: { assistantPrefill: false } },
  evidence: { tier: "measured", dated: "2026-09-19", cite: "test" },
};

test("higher tiers override only the fields they state; nested objects merge one level deep", () => {
  const out = synthesizeCapability("generation", "other", {
    curated: [curated],
    advertised: { context: { window: 32_768 } },
    measured: [measured],
    declared: { generation: { reasoning: { effortLevels: ["medium"] } } },
  });
  const gen = generationOf(out.capability);
  expect(gen.context.window).toBe(32_768); // advertised beats curated
  expect(gen.context.windowEstimated).toBeUndefined();
  expect(gen.reasoning.mode).toBe("effort"); // curated survives beneath a declared patch of a sibling field
  expect(gen.reasoning.effortLevels).toEqual(["medium"]); // declared wins the field it states
  expect(gen.turns?.assistantPrefill).toBe(false); // measured
  expect(gen.turns?.midConversationSystem).toBe(TURNS_FLOOR.midConversationSystem); // floor fills the rest
  expect(gen.tools).toEqual({ parallel: true });
});

test("declared over measured warns per field, never silently", () => {
  const out = synthesizeCapability("generation", "other", {
    measured: [measured],
    declared: { generation: { turns: { assistantPrefill: true }, context: { window: 100 } } },
  });
  expect(out.warnings.map((w) => w.code)).toEqual(["declared_overrides_measured"]);
  expect(out.warnings[0]?.field).toBe("turns");
  expect(generationOf(out.capability).turns?.assistantPrefill).toBe(true);
});

test("the window is estimated when no tier above the floor states one", () => {
  const gen = generationOf(synthesizeCapability("generation", "other", {}).capability);
  expect(gen.context.windowEstimated).toBe(true);
  expect(gen.context.window).toBe(GENERATION_FLOOR.context.window);
});

test("the family floor ADDS tools/structured for an anthropic id and never subtracts", () => {
  const out = synthesizeCapability("generation", "anthropic", { advertised: { output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] } } });
  const gen = generationOf(out.capability);
  expect(gen.tools?.parallel).toBe(true);
  expect(gen.output.structured).toBe(true);
  expect(gen.output.maxTokens.max).toBe(4096);
});

test("embedding: maxInputTokens stated by curated clears windowEstimated; declared dims win", () => {
  const out = synthesizeCapability("embedding", "other", {
    curated: [{ kind: "embedding", embedding: { dims: 768, maxInputTokens: 512 }, evidence: { tier: "curated", dated: "2026-09-19", cite: "t" } }],
    declared: { embedding: { dims: 1024, mrl: true } },
  });
  const emb = embeddingOf(out.capability);
  expect(emb.dims).toBe(1024);
  expect(emb.mrl).toBe(true);
  expect(emb.maxInputTokens).toBe(512);
  expect(emb.windowEstimated).toBeUndefined();
  expect(embeddingOf(synthesizeCapability("embedding", "other", {}).capability).windowEstimated).toBe(true);
});

function rowOf(id: string): ProviderDef {
  const row = builtinProvider(id);
  if (row === undefined) {
    throw new Error(`${id} row missing`);
  }
  return row;
}
const endpointRow = (): ProviderDef => rowOf("vllm");
const hostedRow = (): ProviderDef => rowOf("openrouter");

test("endpoint posture: tools without coEmitsProse ⇒ silencesProse; undeclared modalities widen with modalitiesEstimated", () => {
  const base = synthesizeCapability("generation", "other", { declared: { generation: { tools: { parallel: false } } } }).capability;
  const out = generationOf(applyEndpointPosture(endpointRow(), base, false));
  expect(out.tools).toEqual({ parallel: false, silencesProse: true });
  expect(out.input).toEqual(["text", "image", "video"]);
  expect(out.modalitiesEstimated).toBe(true);
  // A declared modality set is never widened.
  const declared = synthesizeCapability("generation", "other", { declared: { generation: { input: ["text"] } } }).capability;
  const kept = generationOf(applyEndpointPosture(endpointRow(), declared, true));
  expect(kept.input).toEqual(["text"]);
  expect(kept.modalitiesEstimated).toBeUndefined();
  // A hosted row is untouched.
  expect(applyEndpointPosture(hostedRow(), base, false)).toBe(base);
});

// `sampling` is the STATED SET of knobs a tier vouches for (§8.7 step 2: absent ⇒ not honoured; D68: absence is
// the fail-closed truth), so a tier that states it REPLACES the set beneath — a patch grammar cannot express a
// measured absence. Founding case (B3, measured 2026-09-20 `gen-1789884252-n94Ebcm1uMVMG1XhxsbB`): OpenRouter's
// catalog ADVERTISES `temperature` for anthropic/claude-opus-5 and strips it upstream; a dated measured `{}` must
// win, and under the one-level merge `{...advertised, ...{}}` it could not.
test("sampling is a stated SET: a measured `{}` erases an advertised range; a declared list is the whole list", () => {
  const advertised = { sampling: { temperature: { min: 0, max: 2 }, topP: { min: 0, max: 1 } } };
  const measuredEmpty: CapabilityOverride = {
    kind: "generation",
    generation: { sampling: {} },
    evidence: { tier: "measured", dated: "2026-09-20", cite: "test" },
  };
  expect(generationOf(synthesizeCapability("generation", "anthropic", { advertised, measured: [measuredEmpty] }).capability).sampling).toEqual({});
  // PLANTED CONTROL: without the measured row the advertised set stands (the fold is not simply dropping sampling).
  expect(generationOf(synthesizeCapability("generation", "anthropic", { advertised }).capability).sampling).toEqual(advertised.sampling);
  // A declared `temperature` alone is "this server honours temperature" — the advertised topP does NOT survive beside it.
  const declared = synthesizeCapability("generation", "other", { advertised, declared: { generation: { sampling: { temperature: { min: 0, max: 1 } } } } });
  expect(generationOf(declared.capability).sampling).toEqual({ temperature: { min: 0, max: 1 } });
  // The sibling nested blocks keep their one-level merge (a declared effort list leaves the curated mode in place).
  const nested = synthesizeCapability("generation", "other", { curated: [curated], declared: { generation: { reasoning: { effortLevels: ["low"] } } } });
  expect(generationOf(nested.capability).reasoning).toMatchObject({ mode: "effort", effortLevels: ["low"] });
});
