// contracts/inference — derived policy (§5.7) + the task registry (§5.5) + the feature fold (§8.1b):
// `connectionTasks` intersects the provider's tasks with the model's kind; `canFund` gates background spend
// on the row's flag; `requirementMet` reads the resolved capability; `foldFeatures` is connection > provider
// > wire default; the belt keys are the eight named ones and nothing else.

import type { Capability, EndpointFeatures } from "@orb/contracts/inference";
import {
  BELT_OWNED_BODY_KEYS,
  bindingTaskOf,
  builtinProvider,
  canFund,
  connectionTasks,
  EVIDENCE_TIERS,
  evidenceRank,
  foldFeatures,
  GENERATION_FLOOR,
  isBeltOwnedBodyKey,
  ROUTABLE_TASKS,
  requirementMet,
  TASK_DEFS,
  TASKS,
  tasksOfKind,
  WIRE_DEFAULT_FEATURES,
} from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

function provider(id: string): NonNullable<ReturnType<typeof builtinProvider>> {
  const row = builtinProvider(id);
  if (row === undefined) {
    throw new Error(`no built-in provider ${id}`);
  }
  return row;
}

test("connectionTasks = providerTasks ∩ tasksOfKind: one connection, one model, one kind", () => {
  const openrouter = provider("openrouter");
  expect(connectionTasks(openrouter, "generation").toSorted()).toEqual(["chat", "generateImage", "structured", "summarize"]);
  expect(connectionTasks(openrouter, "embedding").toSorted()).toEqual(["embed", "imageEmbed"]);
  // Rerank rides the wire's plain-POST arm: OpenRouter's row and the vllm row both name a `rerankPath`.
  expect(connectionTasks(openrouter, "rerank")).toEqual(["rerank"]);
  expect(openrouter.features?.rerankPath).toBe("/rerank");
  expect(connectionTasks(provider("vllm"), "rerank")).toEqual(["rerank"]);
  // OpenAI narrows: no rerank, no imageEmbed.
  expect(connectionTasks(provider("openai"), "rerank")).toEqual([]);
  expect(connectionTasks(provider("openai"), "embedding")).toEqual(["embed"]);
  // local-light serves no generation task at all.
  expect(connectionTasks(provider("local-light"), "generation")).toEqual([]);
  // agent-sdk: chat/agent/summarize/structured, nothing vector-shaped.
  expect(connectionTasks(provider("claude-sub"), "embedding")).toEqual([]);
});

test("every task's kind is one of tasksOfKind's, and non-routable tasks ride a routable one", () => {
  for (const task of TASKS) {
    const def = TASK_DEFS[task];
    expect(tasksOfKind(def.kind)).toContain(task);
    expect(ROUTABLE_TASKS).toContain(bindingTaskOf(task));
  }
  const nonRoutableWithoutRide = TASKS.filter((task) => !TASK_DEFS[task].routable && TASK_DEFS[task].ridesOn === undefined);
  expect(nonRoutableWithoutRide).toEqual([]);
  expect(bindingTaskOf("structured")).toBe("summarize");
  expect(bindingTaskOf("agent")).toBe("chat");
});

test("canFund: foreground spends any row; background needs allowBackground", () => {
  expect(canFund({ allowBackground: false }, "chat")).toBe(true);
  expect(canFund({ allowBackground: false }, "summarize")).toBe(false);
  expect(canFund({ allowBackground: true }, "summarize")).toBe(true);
  expect(TASK_DEFS.summarize.spend).toBe("background");
  expect(TASK_DEFS.embed.spend).toBe("background");
  expect(TASK_DEFS.chat.spend).toBe("foreground");
});

test("requirementMet names every missing clause; a satisfied requirement is ok", () => {
  const textOnly: Capability = { kind: "generation", generation: GENERATION_FLOOR };
  const caption = requirementMet(textOnly, { input: ["image"] });
  expect(caption).toEqual({ ok: false, missing: ["input:image"] });
  const withImage: Capability = { kind: "generation", generation: { ...GENERATION_FLOOR, input: ["text", "image"] } };
  expect(requirementMet(withImage, { input: ["image"] })).toEqual({ ok: true });
  expect(requirementMet(withImage, undefined)).toEqual({ ok: true });
  // An embedding capability against a generation requirement is a kind mismatch, spelled.
  const embedding: Capability = {
    kind: "embedding",
    embedding: { dims: 1024, mrl: true, maxInputTokens: 512, input: ["text"], output: ["vector"], instructionAware: false },
  };
  expect(requirementMet(embedding, { output: ["image"] }).ok).toBe(false);
  expect(requirementMet(embedding, { dims: 1024 })).toEqual({ ok: true });
  // A wider MRL model FITS a narrower space (it truncates); a narrower model never fits (it would pad).
  expect(requirementMet(embedding, { dims: 768 })).toEqual({ ok: true });
  const narrow: Capability = { kind: "embedding", embedding: { ...embedding.embedding, dims: 512 } };
  expect(requirementMet(narrow, { dims: 1024 })).toEqual({ ok: false, missing: ["dims:1024"] });
});

test("foldFeatures: connection > provider row > wire default, field-wise", () => {
  const vllm = provider("vllm");
  const folded = foldFeatures(vllm.features, { prefill: "none" });
  expect(folded.prefill).toBe("none");
  expect(folded.strictJson).toBe(vllm.features?.strictJson);
  expect(folded.sleep).toEqual(vllm.features?.sleep);
  // A bare custom row gets the wire default.
  const custom = foldFeatures(provider("custom-openai").features, undefined);
  expect(custom).toEqual(WIRE_DEFAULT_FEATURES);
  const override: EndpointFeatures = { effort: "reasoning_effort" };
  expect(foldFeatures(undefined, override).effort).toBe("reasoning_effort");
});

test("the belt is exactly eight named keys", () => {
  expect([...BELT_OWNED_BODY_KEYS].toSorted()).toEqual(
    [
      "add_generation_prompt",
      "continue_final_message",
      "messages",
      "model",
      "stream",
      "stream_options",
      "truncate_prompt_tokens",
      "truncation_side",
    ].toSorted(),
  );
  expect(isBeltOwnedBodyKey("model")).toBe(true);
  expect(isBeltOwnedBodyKey("chat_template_kwargs")).toBe(false);
});

test("EVIDENCE_TIERS is the one ladder, ranked highest first", () => {
  expect(EVIDENCE_TIERS).toEqual(["declared", "measured", "advertised", "curated", "family-floor", "kind-floor"]);
  expect(evidenceRank("declared")).toBeLessThan(evidenceRank("kind-floor"));
});
