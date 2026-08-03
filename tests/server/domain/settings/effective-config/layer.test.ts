// effective-config/layer — the floor-merge resolver (pure). Asserts the floor rule:
// `layer({})` reads the env floor for env-mirrored fields; an override field WINS; a
// `null`/absent override falls through to the floor (the null=CLEAR sentinel). Plus the D17 governance
// floors (born-in-DB: local-compute ON, max-pro-sub OFF, budget null).

import { DEFAULT_MAX_IMAGE_BYTES, DEFAULT_STRUCTURED_OUTPUT_SHAPE } from "@orb/contracts/settings";
import { env } from "@orb/server/foundation/env";
import { describe } from "vitest";
import { layer } from "../../../../../packages/server/src/domain/settings/effective-config/layer.ts";
import { expect, test } from "../../../../support/fixtures";

describe("layer (floor-merge)", () => {
  test("layer({}) reads the env floor for env-mirrored fields", () => {
    const cfg = layer({});
    expect(cfg.corpusAutoindex).toBe(env.CORPUS_AUTOINDEX);
    expect(cfg.logLevel).toBe(env.LOG_LEVEL);
    expect(cfg.rateLimits.authed).toBe(env.RATE_LIMIT_AUTHED);
    expect(cfg.rateLimits.login).toBe(env.RATE_LIMIT_LOGIN);
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
    // `override ?? global` chain (in domain/chat's resolveSeatDeco render-policy resolution) can likewise opt a character in.
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

  test("auth-modes floors (FINAL-Auth-Modes §9): localMultiUser OFF, discreetLogin OFF; overrides win", () => {
    const cfg = layer({});
    // A fresh local install is SINGLE-human until the owner flips the toggle (ruling 2 — static/config).
    expect(cfg.localMultiUser).toBe(false);
    expect(cfg.discreetLogin).toBe(false);
    expect(layer({ localMultiUser: true }).localMultiUser).toBe(true);
    expect(layer({ discreetLogin: true }).discreetLogin).toBe(true);
    expect(layer({ localMultiUser: null }).localMultiUser).toBe(false); // null = clear → floor
  });

  test("born-in-DB floor: maxImageBytes defaults to 5 MB; an admin override raises it", () => {
    expect(layer({}).maxImageBytes).toBe(DEFAULT_MAX_IMAGE_BYTES);
    expect(layer({ maxImageBytes: null }).maxImageBytes).toBe(DEFAULT_MAX_IMAGE_BYTES); // clear → floor
    expect(layer({ maxImageBytes: 20_000_000 }).maxImageBytes).toBe(20_000_000);
  });

  test("born-in-DB floor: structuredOutputShape is `as-projected`; an admin override switches the wire shape", () => {
    // D126 — the default STANDS (the strict reshape costs output tokens and reads worse to a small local
    // model); what the tier buys is that switching is a click, not a redeploy.
    expect(layer({}).structuredOutputShape).toBe(DEFAULT_STRUCTURED_OUTPUT_SHAPE);
    expect(layer({ structuredOutputShape: "strict-compatible" }).structuredOutputShape).toBe("strict-compatible");
    expect(layer({ structuredOutputShape: null }).structuredOutputShape).toBe(DEFAULT_STRUCTURED_OUTPUT_SHAPE); // clear → floor
  });

  describe("engineLaunch (#14 LAUNCH tier)", () => {
    test("no override → the env floor per field", () => {
      const el = layer({}).engineLaunch;
      expect(el.genModel).toBe(env.VLLM_GEN_MODEL);
      expect(el.genMaxModelLen).toBe(env.VLLM_GEN_MAX_MODEL_LEN);
      expect(el.embedMaxModelLen).toBe(env.VLLM_EMBED_MAX_MODEL_LEN);
      expect(el.embedGpuUtil).toBe(env.VLLM_EMBED_GPU_UTIL);
      expect(el.genMaxPixels).toBe(env.VLLM_GEN_MAX_PIXELS);
      expect(el.genRepetitionPenalty).toBe(env.VLLM_GEN_REPETITION_PENALTY); // #23 — the Qwen loop-fix floor
    });

    test("an admin override wins per field; unset fields stay on the floor", () => {
      const el = layer({ engineLaunch: { genMaxModelLen: 65_536, genGpuUtilMulti: 0.35, genRepetitionPenalty: 1.1 } }).engineLaunch;
      expect(el.genMaxModelLen).toBe(65_536);
      expect(el.genGpuUtilMulti).toBe(0.35);
      expect(el.genRepetitionPenalty).toBe(1.1);
      expect(el.embedMaxModelLen).toBe(env.VLLM_EMBED_MAX_MODEL_LEN); // floor
    });

    test("a null (CLEAR) engineLaunch section falls entirely to the env floor", () => {
      expect(layer({ engineLaunch: null }).engineLaunch.genModel).toBe(env.VLLM_GEN_MODEL);
    });
  });
});
