// configuredModelForSource — "which model does a CONFIG-DERIVED source serve for this role?" Pins the
// load-bearing claim the header states: `null` means the source is not config-derived (a catalog/free-text
// pick) OR the source serves this role no model at all — never "the pin is fine" to compare against.

import { env } from "@orb/server/foundation/env";
import { describe } from "vitest";
import {
  configuredModelForSource,
  localLightModelForRole,
  vllmModelForRole,
} from "../../../../../packages/server/src/domain/connection/substrate/config-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const TRIO = { embed: "embed-model", imageEmbed: "image-embed-model", rerank: "rerank-model" };

describe("vllmModelForRole", () => {
  test("embed/imageEmbed both route to the vLLM embed launch model (shared 1024-dim space)", () => {
    expect(vllmModelForRole("embed")).toBe(env.VLLM_EMBED_MODEL);
    expect(vllmModelForRole("imageEmbed")).toBe(env.VLLM_EMBED_MODEL);
  });

  test("rerank routes to the rerank launch model", () => {
    expect(vllmModelForRole("rerank")).toBe(env.VLLM_RERANK_MODEL);
  });

  test("every other role (including generateImage) falls through to the gen model", () => {
    expect(vllmModelForRole("chat")).toBe(env.VLLM_GEN_MODEL);
    expect(vllmModelForRole("generateImage")).toBe(env.VLLM_GEN_MODEL);
  });
});

describe("localLightModelForRole", () => {
  test("embed/imageEmbed/rerank resolve from the trio", () => {
    expect(localLightModelForRole("embed", TRIO)).toBe(TRIO.embed);
    expect(localLightModelForRole("imageEmbed", TRIO)).toBe(TRIO.imageEmbed);
    expect(localLightModelForRole("rerank", TRIO)).toBe(TRIO.rerank);
  });

  test("a non-derive role (chat) is null — local-light cannot generate", () => {
    expect(localLightModelForRole("chat", TRIO)).toBeNull();
  });
});

describe("configuredModelForSource", () => {
  test("a non-config-derived source (openrouter) is always null — it picks from a catalog, not config", () => {
    expect(configuredModelForSource("openrouter", "chat", TRIO)).toBeNull();
  });

  test("local-light delegates to the trio lookup", () => {
    expect(configuredModelForSource("local-light", "rerank", TRIO)).toBe(TRIO.rerank);
    expect(configuredModelForSource("local-light", "chat", TRIO)).toBeNull();
  });

  test("vllm generateImage is null (not a vllm role) even though vllm is config-derived", () => {
    expect(configuredModelForSource("vllm", "generateImage", TRIO)).toBeNull();
  });

  test("vllm on a real role resolves to the launch model", () => {
    expect(configuredModelForSource("vllm", "embed", TRIO)).toBe(env.VLLM_EMBED_MODEL);
  });
});
