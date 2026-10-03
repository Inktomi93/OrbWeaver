// The workloads router's request-boundary validation, driven through the real tRPC ladder. A dependency id
// crosses from caller text into the durable scheduler graph, so the wire must prove the canonical workload
// TypeID shape before the domain sees it.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { WorkloadService } from "@orb/server/domain/workloads";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const VALID_DEPENDENCY = mintTypeId(ID_PREFIX.workload);
const STARTED = mintTypeId(ID_PREFIX.workload);

function setup(): { readonly call: ReturnType<typeof caller>; readonly start: ReturnType<typeof vi.fn<WorkloadService["start"]>> } {
  const start = vi.fn<WorkloadService["start"]>(() => Promise.resolve({ id: STARTED }));
  return {
    call: caller(makeContext({ auth: principal("user"), services: { workloads: { start } } })),
    start,
  };
}

describe("workloads.start dependency TypeID boundary", () => {
  test("a canonical workload dependency reaches the domain as a WorkloadId", async () => {
    const { call, start } = setup();

    await expect(
      call.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular", dependsOn: [VALID_DEPENDENCY] }),
    ).resolves.toEqual({ id: STARTED });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ dependsOn: [VALID_DEPENDENCY] }));
  });

  test("a canonical TypeID with the wrong prefix is BAD_REQUEST and never reaches the domain", async () => {
    const { call, start } = setup();

    await expect(
      call.workloads.start({
        input: { kind: "index", params: { source: "text" } },
        mode: "singular",
        // biome-ignore lint/suspicious/noExplicitAny: deliberately wrong wire prefix; the runtime schema is the subject.
        // @orb-waive no-test-fabrication(any): deliberately wrong TypeID prefix proves the real wire schema refuses before the domain; ends when the caller accepts unknown input directly.
        dependsOn: [STARTED.replace(`${ID_PREFIX.workload}_`, `${ID_PREFIX.asset}_`)] as any,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(start).not.toHaveBeenCalled();
  });

  test("malformed nonempty dependency text is BAD_REQUEST and never reaches the domain", async () => {
    const { call, start } = setup();

    await expect(
      call.workloads.start({
        input: { kind: "index", params: { source: "text" } },
        mode: "singular",
        // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed wire text; the runtime schema is the subject.
        // @orb-waive no-test-fabrication(any): deliberately malformed TypeID proves the real wire schema refuses before the domain; ends when the caller accepts unknown input directly.
        dependsOn: ["workload_not-a-typeid"] as any,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(start).not.toHaveBeenCalled();
  });
});

describe("workloads.estimateModelCalls", () => {
  test("a bulk estimate is refused to a non-owner at the edge, before the domain counts anything", async () => {
    const estimateModelCalls = vi.fn<WorkloadService["estimateModelCalls"]>(() => Promise.resolve({ calls: 3 }));
    const call = caller(makeContext({ auth: principal("user"), services: { workloads: { estimateModelCalls } } }));

    await expect(call.workloads.estimateModelCalls({ input: { kind: "distill-characters", params: {} }, mode: "bulk" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(estimateModelCalls).not.toHaveBeenCalled();
  });

  test("a singular estimate reaches the domain as the caller's own, and returns its count", async () => {
    const estimateModelCalls = vi.fn<WorkloadService["estimateModelCalls"]>(() => Promise.resolve({ calls: 3 }));
    const auth = principal("user");
    const call = caller(makeContext({ auth, services: { workloads: { estimateModelCalls } } }));

    await expect(call.workloads.estimateModelCalls({ input: { kind: "distill-characters", params: {} } })).resolves.toEqual({ calls: 3 });
    expect(estimateModelCalls).toHaveBeenCalledWith({ input: { kind: "distill-characters", params: {} }, caller: auth, mode: "singular" });
  });
});
