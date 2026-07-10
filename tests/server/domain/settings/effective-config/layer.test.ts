// effective-config/layer — the floor-merge resolver (pure). Asserts the floor rule:
// `layer({})` reads the env floor for env-mirrored fields; an override field WINS; a
// `null`/absent override falls through to the floor (the null=CLEAR sentinel). Plus the D17 governance
// floors (born-in-DB: local-compute ON, max-pro-sub OFF, budget null).

import { DEFAULT_MAX_IMAGE_BYTES } from "@orb/contracts/settings";
import { env } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { layer } from "../../../../../packages/server/src/domain/settings/effective-config/layer.ts";
import { expect, test } from "../../../../support/fixtures";

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

  test("born-in-DB floors: forbidExternalMedia FORBIDS by default, memory empty, vllm concurrency code floor", () => {
    const cfg = layer({});
    // D44 §12.3 — external media does NOT auto-load by default (the load is the tracking-pixel/exfil); the
    // no-override default forbids (a per-character/admin override can still opt IN to allow — see below).
    expect(cfg.forbidExternalMedia).toBe(true);
    expect(cfg.memoryDefaults).toEqual({});
    expect(cfg.vllmConcurrency.embed).toBeGreaterThan(0);
  });

  test("forbidExternalMedia default is OVERRIDABLE: an admin `false` opts the deployment IN to allow", () => {
    // Confirms the flipped default is an overridable default, not a hard clamp — the per-character
    // `override ?? global` chain (in domain/chat's resolveRenderPolicy) can likewise opt a character in.
    expect(layer({ forbidExternalMedia: false }).forbidExternalMedia).toBe(false);
    expect(layer({ forbidExternalMedia: null }).forbidExternalMedia).toBe(true); // null = clear → floor
  });

  test("born-in-DB floor: trustHtml is UNTRUSTED (false) by default; an override opts in", () => {
    // D44 §12.0 — the safe default is untrusted; only an explicit admin override (or a per-character
    // `trustHtml`) escalates. Mirrors forbidExternalMedia's floor discipline.
    expect(layer({}).trustHtml).toBe(false);
    expect(layer({ trustHtml: null }).trustHtml).toBe(false);
    expect(layer({ trustHtml: true }).trustHtml).toBe(true);
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

  test("born-in-DB floor: maxImageBytes defaults to 5 MB; an admin override raises it", () => {
    expect(layer({}).maxImageBytes).toBe(DEFAULT_MAX_IMAGE_BYTES);
    expect(layer({ maxImageBytes: null }).maxImageBytes).toBe(DEFAULT_MAX_IMAGE_BYTES); // clear → floor
    expect(layer({ maxImageBytes: 20_000_000 }).maxImageBytes).toBe(20_000_000);
  });
});
