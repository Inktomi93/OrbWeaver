// The engine base-URL leaf (engine-url.ts): `engineBaseUrl` maps an engine to
// `http://<VLLM_ENGINE_HOST>:<port>`, reading host + per-engine port off the resolved `env`. Default host
// is loopback (the bare-metal/all-in-one fleet shares the network namespace); a slim/app-only deployment
// pointing at an EXTERNAL engine relocates the host via VLLM_ENGINE_HOST (profile-2/D2,
// docs/design/containerize-prod-image-spec.md §3.6). Asserted against the env-resolved values (never a
// hardcoded literal, so a default change doesn't silently drift the test).

import process from "node:process";
import { fleetEnv as env } from "@orb/tooling/stack/lib/engine-fleet";
import { engineBaseUrl } from "@orb/tooling/stack/lib/engine-fleet";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../../support/tool-fixtures.ts";

describe("engineBaseUrl", () => {
  test("each engine resolves to its base URL on its own env-resolved host + port", () => {
    expect(engineBaseUrl("embed")).toBe(`http://${env.VLLM_ENGINE_HOST}:${env.VLLM_EMBED_PORT}`);
    expect(engineBaseUrl("rerank")).toBe(`http://${env.VLLM_ENGINE_HOST}:${env.VLLM_RERANK_PORT}`);
    expect(engineBaseUrl("gen")).toBe(`http://${env.VLLM_ENGINE_HOST}:${env.VLLM_GEN_PORT}`);
  });

  test("the three engines get DISTINCT ports (no two engines collide on one port)", () => {
    const urls = new Set([engineBaseUrl("embed"), engineBaseUrl("rerank"), engineBaseUrl("gen")]);
    expect(urls.size).toBe(3);
  });

  test("under the DEFAULT env the host is loopback (127.0.0.1) — bare-metal/all-in-one unchanged", () => {
    // The runner's env floor never sets VLLM_ENGINE_HOST, so this pins the schema DEFAULT: the fleet is
    // reached on loopback unless a deployment explicitly relocates it.
    for (const engine of ["embed", "rerank", "gen"] as const) {
      expect(engineBaseUrl(engine).startsWith("http://127.0.0.1:")).toBe(true);
    }
  });
});

// ── VLLM_ENGINE_HOST relocation (profile-2/D2 external engine) ────────────────────────────────────────────
// The env floor is parsed ONCE at module load, so the override is exercised the same way
// tests/server/foundation/env/index.test.ts does: wipe process.env, craft the override, reset the module
// registry, and import a FRESH copy of the engine subsystem (whose engine-url re-reads the fresh floor).
describe("engineBaseUrl — VLLM_ENGINE_HOST relocates the engine host (ports intact)", () => {
  let snapshot: Record<string, string | undefined>;

  // biome-ignore-start lint/style/noProcessEnv: the relocation describe DRIVES the sole env reader by crafting process.env (the reimport pattern from tests/server/foundation/env/index.test.ts).
  beforeEach(() => {
    snapshot = { ...process.env };
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    Object.assign(process.env, snapshot);
    vi.resetModules();
  });
  // biome-ignore-end lint/style/noProcessEnv: end of the block above

  // biome-ignore-start lint/style/noProcessEnv: the relocation describe DRIVES the sole env reader by crafting process.env (the reimport pattern from tests/server/foundation/env/index.test.ts).
  async function reimportEngineUrl(overrides: Record<string, string>): Promise<{
    readonly engineBaseUrl: typeof engineBaseUrl;
    readonly env: typeof env;
  }> {
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    // Hermetic floor: keep the runner pin + skip any cwd `.env` so ONLY the crafted overrides apply.
    process.env["VITEST"] = "1";
    process.env["ORB_ENV_NO_FILE"] = "1";
    // NO AUTH_FALLBACK pin: #2406 made it resolve per mode, so a wiped env boots at single-user + owner.
    // (Between #1864 and #2406 this floor had to state it or the re-import threw before any engine code ran.)
    for (const [k, v] of Object.entries(overrides)) {
      process.env[k] = v;
    }
    vi.resetModules();
    const fresh = await import("@orb/tooling/stack/lib/engine-fleet");
    return { engineBaseUrl: fresh.engineBaseUrl, env: fresh.fleetEnv };
  }
  // biome-ignore-end lint/style/noProcessEnv: end of the block above

  test("VLLM_ENGINE_HOST set → every engine base URL targets that host on its own env-resolved port", async () => {
    // biome-ignore lint/style/useNamingConvention: env var keys (VLLM_ENGINE_HOST, VLLM_GEN_PORT, …) are SCREAMING_SNAKE_CASE by external convention; the crafted override literals must match that shape.
    const fresh = await reimportEngineUrl({ VLLM_ENGINE_HOST: "engine-box.internal" });
    expect(fresh.engineBaseUrl("embed")).toBe(`http://engine-box.internal:${fresh.env.VLLM_EMBED_PORT}`);
    expect(fresh.engineBaseUrl("rerank")).toBe(`http://engine-box.internal:${fresh.env.VLLM_RERANK_PORT}`);
    expect(fresh.engineBaseUrl("gen")).toBe(`http://engine-box.internal:${fresh.env.VLLM_GEN_PORT}`);
  });

  test("the host lever moves ONLY the host — an explicit port override still lands beside it", async () => {
    // biome-ignore lint/style/useNamingConvention: env var keys (VLLM_ENGINE_HOST, VLLM_GEN_PORT, …) are SCREAMING_SNAKE_CASE by external convention; the crafted override literals must match that shape.
    const fresh = await reimportEngineUrl({ VLLM_ENGINE_HOST: "10.9.8.7", VLLM_GEN_PORT: "9703" });
    expect(fresh.engineBaseUrl("gen")).toBe("http://10.9.8.7:9703");
    expect(fresh.engineBaseUrl("embed")).toBe(`http://10.9.8.7:${fresh.env.VLLM_EMBED_PORT}`);
  });

  test("unset → the loopback default (the schema default, not an accident of the runner env)", async () => {
    const fresh = await reimportEngineUrl({});
    expect(fresh.env.VLLM_ENGINE_HOST).toBe("127.0.0.1");
    expect(fresh.engineBaseUrl("gen")).toBe(`http://127.0.0.1:${fresh.env.VLLM_GEN_PORT}`);
  });
});
