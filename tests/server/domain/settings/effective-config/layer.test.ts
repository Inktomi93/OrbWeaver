// effective-config/layer — the floor-merge resolver (pure). Asserts the floor rule (settings-and-config
// invariant #6): `layer({})` reads the env floor for env-mirrored fields; an override field WINS; a
// `null`/absent override falls through to the floor (the null=CLEAR sentinel). Plus the D17 governance
// floors (born-in-DB: local-compute ON, max-pro-sub OFF, budget null).

import { env } from "@orb/server/foundation/env";
import { describe, expect, test } from "vitest";
import { layer } from "../../../../../packages/server/src/domain/settings/effective-config/layer.ts";

describe("layer (floor-merge)", () => {
  test("layer({}) reads the env floor for env-mirrored fields", () => {
    const cfg = layer({});
    expect(cfg.corpusAutoindex).toBe(env.CORPUS_AUTOINDEX);
    expect(cfg.logLevel).toBe(env.LOG_LEVEL);
    expect(cfg.rateLimits.general).toBe(env.RATE_LIMIT_GENERAL);
  });

  test("an override field WINS over the floor", () => {
    expect(layer({ logLevel: "debug" }).logLevel).toBe("debug");
    expect(layer({ corpusAutoindex: false }).corpusAutoindex).toBe(false);
  });

  test("a null (CLEAR) or absent override falls through to the floor", () => {
    expect(layer({ logLevel: null }).logLevel).toBe(env.LOG_LEVEL);
    expect(layer({ corpusAutoindex: null }).corpusAutoindex).toBe(env.CORPUS_AUTOINDEX);
  });

  test("born-in-DB floors: forbidExternalMedia off, memory empty, vllm concurrency code floor", () => {
    const cfg = layer({});
    expect(cfg.forbidExternalMedia).toBe(false);
    expect(cfg.memoryDefaults).toEqual({});
    expect(cfg.vllmConcurrency.embed).toBeGreaterThan(0);
  });

  test("D17 governance floors: local-compute ON, max-pro-sub OFF, budget null", () => {
    const cfg = layer({});
    expect(cfg.allowNonOwnerLocalCompute).toBe(true);
    expect(cfg.allowNonOwnerMaxProSub).toBe(false);
    expect(cfg.nonOwnerLocalComputeBudget).toBeNull();
  });

  test("a governance override wins (owner-flipped)", () => {
    expect(layer({ allowNonOwnerMaxProSub: true }).allowNonOwnerMaxProSub).toBe(true);
    expect(layer({ nonOwnerLocalComputeBudget: 7 }).nonOwnerLocalComputeBudget).toBe(7);
  });
});
