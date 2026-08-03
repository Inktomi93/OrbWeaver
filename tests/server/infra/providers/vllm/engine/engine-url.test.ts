// The engine loopback-URL leaf (engine-url.ts): `engineBaseUrl` maps an engine to its `http://127.0.0.1:<port>`
// base, reading the per-engine port off the resolved `env`. A pure deterministic mapping — asserted per engine
// against the env-resolved port (never a hardcoded literal, so a port-default change doesn't silently drift the
// test) plus the loopback shape the sleep/wake control + HTTP seam both depend on.

import { env } from "@orb/server/foundation/env";
import { engineBaseUrl } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

describe("engineBaseUrl", () => {
  test("each engine resolves to its loopback base URL on its own env-resolved port", () => {
    expect(engineBaseUrl("embed")).toBe(`http://127.0.0.1:${env.VLLM_EMBED_PORT}`);
    expect(engineBaseUrl("rerank")).toBe(`http://127.0.0.1:${env.VLLM_RERANK_PORT}`);
    expect(engineBaseUrl("gen")).toBe(`http://127.0.0.1:${env.VLLM_GEN_PORT}`);
  });

  test("the three engines get DISTINCT ports (no two engines collide on one loopback port)", () => {
    const urls = new Set([engineBaseUrl("embed"), engineBaseUrl("rerank"), engineBaseUrl("gen")]);
    expect(urls.size).toBe(3);
  });

  test("every base URL is loopback-bound (127.0.0.1) — never a routable host", () => {
    for (const engine of ["embed", "rerank", "gen"] as const) {
      expect(engineBaseUrl(engine).startsWith("http://127.0.0.1:")).toBe(true);
    }
  });
});
