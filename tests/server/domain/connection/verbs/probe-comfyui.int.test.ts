// verb: probeComfyui (MA-8/D96) — the live ComfyUI reachability + catalog probe delegates to the injected
// `probeComfyui` op (bound at compose to the sealed backend's `/object_info` probe over the owner-configured
// endpoint). This verb is a thin, principal-gated pass-through; the tri-state parsing itself is covered by the
// backend suite (`backends/comfyui`). Here we prove the connection service surfaces each tri-state faithfully.

import { createConnectionService } from "@orb/server/domain/connection";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeConnHarness, principal } from "../_support.ts";

describe("probeComfyui — surfaces the injected tri-state", () => {
  test("engine-off passes through", async () => {
    const h = makeConnHarness(await freshDb());
    h.setComfyuiProbe({ state: "engine-off" });
    const result = await createConnectionService(h.ctx).probeComfyui({ principal: principal("u1") });
    expect(result).toEqual({ state: "engine-off" });
  });

  test("ok-but-empty carries the built-in samplers/schedulers (zero checkpoints)", async () => {
    const h = makeConnHarness(await freshDb());
    h.setComfyuiProbe({ state: "ok-but-empty", samplers: ["euler"], schedulers: ["normal"], checkpoints: [], vaes: [], roles: [] });
    const result = await createConnectionService(h.ctx).probeComfyui({ principal: principal("u1") });
    expect(result.state).toBe("ok-but-empty");
    expect(result.state === "ok-but-empty" && result.samplers).toEqual(["euler"]);
  });

  test("ok-with-models carries the live checkpoint catalog", async () => {
    const h = makeConnHarness(await freshDb());
    h.setComfyuiProbe({ state: "ok-with-models", samplers: ["euler"], schedulers: ["normal"], checkpoints: ["sd_xl.safetensors"], vaes: [], roles: [] });
    const result = await createConnectionService(h.ctx).probeComfyui({ principal: principal("u1") });
    expect(result.state).toBe("ok-with-models");
    expect(result.state === "ok-with-models" && result.checkpoints).toEqual(["sd_xl.safetensors"]);
  });
});
