// Unit tests for the supervisor→admin control registry — a process-local mutate/read seam.

import {
  getVllmEngineController,
  registerVllmEngineController,
} from "@orb/server/infra/providers/vllm/engine";
import { afterEach, describe, expect, test } from "vitest";

// The registry is module-scope; reset it after each test so cases don't leak into one another.
afterEach(() => registerVllmEngineController(null));

describe("vllm engine control registry", () => {
  test("is null before the supervisor registers (no controller running)", () => {
    expect(getVllmEngineController()).toBeNull();
  });

  test("returns the registered controller, and restart routes through it", async () => {
    const calls: string[] = [];
    registerVllmEngineController({
      restart: (engine) => {
        calls.push(engine);
        return Promise.resolve(`bounced ${engine}`);
      },
    });

    const controller = getVllmEngineController();
    expect(controller).not.toBeNull();
    await expect(controller?.restart("gen")).resolves.toBe("bounced gen");
    expect(calls).toEqual(["gen"]);
  });

  test("deregistering with null clears the controller (drain path)", () => {
    registerVllmEngineController({ restart: () => Promise.resolve("x") });
    registerVllmEngineController(null);
    expect(getVllmEngineController()).toBeNull();
  });
});
