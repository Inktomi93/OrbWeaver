// `stack status` over a planted socket table: a table it cannot read, or a port held by an owner the OS will
// not name, must end in `status=unknown` and exit 2, never `down` or "not bound".

import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { doDevStatus } from "../../../../tooling/src/stack/ops/dev-status.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { captured, devContext, PLANTED_PORTS, REFUSED_TABLE, tableHolding } from "../_dev-verbs.ts";

test("status over a socket table it cannot read reports status=unknown and exits 2, never down", async ({ scratch }) => {
  const run = await captured(async () => await doDevStatus(devContext(scratch), REFUSED_TABLE));
  expect(run.code).toBe(EXIT.toolError);
  expect(run.result).toContain("status=unknown pidfile=none reason=socket-table-unreadable");
  expect(run.lines.join("\n")).not.toContain("status=down");
});

test("status over a port bound by an owner the OS will not name shows it bound and reports status=unknown, exit 2", async ({ scratch }) => {
  const held = tableHolding(new Map([[PLANTED_PORTS.vite, { kind: "unknown" }]]));
  const run = await captured(async () => await doDevStatus(devContext(scratch), held));
  expect(run.code).toBe(EXIT.toolError);
  expect(run.result).toContain(`status=unknown pidfile=none ports=${String(PLANTED_PORTS.vite)} reason=port-owner-unknown`);
  expect(run.lines).toContain(`vite   :${String(PLANTED_PORTS.vite)}  : bound, owner unknown`);
  expect(run.lines.join("\n")).not.toContain("not bound · healthz");
});
