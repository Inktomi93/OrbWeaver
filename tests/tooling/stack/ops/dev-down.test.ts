// `stack down` over a planted socket table: a table it cannot read, or a port held by an owner the OS will not
// name, must end in `status=unknown` and exit 2, never `status=stopped`. The free-table control proves the same
// capture does see a real `stopped`.

import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { doDevDown } from "../../../../tooling/src/stack/ops/dev-down.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { captured, devContext, PLANTED_PORTS, REFUSED_TABLE, tableHolding } from "../_dev-verbs.ts";

test("down over a socket table it cannot read reports status=unknown and exits 2, never stopped", async ({ scratch }) => {
  const run = await captured(async () => await doDevDown(devContext(scratch), {}, REFUSED_TABLE));
  expect(run.code).toBe(EXIT.toolError);
  expect(run.result).toContain("status=unknown pgid=none reason=socket-table-unreadable");
  expect(run.lines.join("\n")).not.toContain("status=stopped");
});

test("down over a port bound by an owner the OS will not name reports it held, status=unknown, exit 2", async ({ scratch }) => {
  const held = tableHolding(new Map([[PLANTED_PORTS.server, { kind: "unknown" }]]));
  const run = await captured(async () => await doDevDown(devContext(scratch), {}, held));
  expect(run.code).toBe(EXIT.toolError);
  expect(run.result).toContain(`status=unknown pgid=none ports=${String(PLANTED_PORTS.server)} reason=port-owner-unknown`);
  expect(run.lines.join("\n")).toContain(`:${String(PLANTED_PORTS.server)} is bound, but the OS names no owner`);
  expect(run.lines.join("\n")).not.toContain("status=stopped");
});

test("down over a table that reads both ports free reports stopped: the control the refusals are measured against", async ({ scratch }) => {
  const run = await captured(async () => await doDevDown(devContext(scratch), {}, tableHolding(new Map())));
  expect(run.code).toBe(EXIT.clean);
  expect(run.result).toContain("status=stopped pgid=none");
});
