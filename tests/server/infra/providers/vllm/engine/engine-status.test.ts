// Unit tests for the supervisor↔runner status registry — a process-local set/get with an INJECTED clock.

import { allEngineStatuses, getEngineStatus, setEngineStatus } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

// Narrow a Record index access (possibly-undefined under noUncheckedIndexedAccess) or fail the test.
function need<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("expected a defined value");
  }
  return value;
}

describe("vllm engine status registry", () => {
  test("records the status + detail + injected write time, and reads it back", () => {
    setEngineStatus("embed", "starting", "warming up", 1000);
    const rec = getEngineStatus("embed");
    expect(rec).toEqual({ status: "starting", detail: "warming up", updatedAt: 1000 });
  });

  test("uses the injected `at` (no wall clock) — determinism", () => {
    setEngineStatus("rerank", "owned", "", 42);
    expect(getEngineStatus("rerank")?.updatedAt).toBe(42);
  });

  test("a later write overwrites the prior record for the same engine", () => {
    setEngineStatus("gen", "starting", "boot", 1);
    setEngineStatus("gen", "failed", "breaker open", 2);
    expect(getEngineStatus("gen")).toEqual({
      status: "failed",
      detail: "breaker open",
      updatedAt: 2,
    });
  });

  test("allEngineStatuses snapshots every recorded engine by name", () => {
    setEngineStatus("embed", "owned", "", 5);
    setEngineStatus("gen", "owned", "", 6);
    const all = allEngineStatuses();
    expect(need(all["embed"]).status).toBe("owned");
    expect(need(all["gen"]).status).toBe("owned");
  });
});
