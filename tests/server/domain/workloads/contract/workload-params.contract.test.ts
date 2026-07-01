// Contract test: the per-kind params schemas + the `startWorkloadInput` discriminated union. Pins the parse
// seam (every kind validates uniformly, tunables OPTIONAL, the discriminator narrows params) + the
// exhaustive `PARAMS_SCHEMAS` Record (one entry per WORKLOAD_KIND).

import { WORKLOAD_KINDS } from "@orb/contracts/workloads";
import { describe } from "vitest";
import {
  PARAMS_SCHEMAS,
  parseParamsForKind,
  startWorkloadInput,
} from "../../../../../packages/server/src/domain/workloads/contract/workload-params.ts";
import { expect, test } from "../../../../support/fixtures";

describe("workload-params", () => {
  test("PARAMS_SCHEMAS has exactly one schema per WORKLOAD_KIND (exhaustive)", () => {
    expect(Object.keys(PARAMS_SCHEMAS).sort()).toEqual([...WORKLOAD_KINDS].sort());
  });

  test("a tunable-less kind accepts an empty params object", () => {
    expect(parseParamsForKind("reconcile-stats", {})).toEqual({});
  });

  test("compute-themes accepts an optional k and rejects a non-positive k", () => {
    expect(parseParamsForKind("compute-themes", { k: 8 })).toEqual({ k: 8 });
    expect(parseParamsForKind("compute-themes", {})).toEqual({});
    expect(() => parseParamsForKind("compute-themes", { k: 0 })).toThrow();
    expect(() => parseParamsForKind("compute-themes", { k: -3 })).toThrow();
  });

  test("embed kinds accept an optional force flag", () => {
    expect(parseParamsForKind("embed-corpus", { force: true })).toEqual({ force: true });
    expect(parseParamsForKind("embed-corpus", {})).toEqual({});
  });

  test("startWorkloadInput discriminates on kind and narrows params", () => {
    const parsed = startWorkloadInput.parse({ kind: "compute-themes", params: { k: 5 } });
    expect(parsed.kind).toBe("compute-themes");
    expect(parsed.params).toEqual({ k: 5 });
  });

  test("startWorkloadInput rejects an unknown kind", () => {
    expect(() => startWorkloadInput.parse({ kind: "not-a-kind", params: {} })).toThrow();
  });
});
