// The workloads router's request-boundary validation, driven through the real tRPC ladder. A dependency id
// crosses from caller text into the durable scheduler graph, so the wire must prove the canonical workload
// TypeID shape before the domain sees it.

import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { WorkloadService } from "@orb/server/domain/workloads";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const VALID_DEPENDENCY = castId<WorkloadId>("workload_01m3227m7geczb93bx9h3g282r");
const STARTED = castId<WorkloadId>("workload_01m3227m7heczb93c33yz4ksvj");

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
        dependsOn: ["asset_01m3227m7heczb93c33yz4ksvj"] as any,
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
