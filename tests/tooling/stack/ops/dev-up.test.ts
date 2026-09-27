// `stack up` over a planted socket table: a table it cannot read refuses with `status=unknown` and exit 2, and a
// port held by an owner the OS will not name is busy, never free. Neither case may boot a leader.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { LEADER_RECORD_FILE } from "../../../../tooling/src/stack/index.ts";
import { doDevUp } from "../../../../tooling/src/stack/ops/dev-up.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { captured, devContext, PLANTED_PORTS, REFUSED_TABLE, tableHolding, UP } from "../_dev-verbs.ts";

test("up over a socket table it cannot read reports status=unknown, exits 2 and boots nothing", async ({ scratch }) => {
  const run = await captured(async () => await doDevUp(devContext(scratch), UP, REFUSED_TABLE));
  expect(run.code).toBe(EXIT.toolError);
  expect(run.result).toContain("status=unknown pgid=none reason=socket-table-unreadable");
  expect(existsSync(join(scratch, "run", LEADER_RECORD_FILE))).toBe(false);
});

test("up over a port bound by an owner the OS will not name refuses it as busy and boots nothing", async ({ scratch }) => {
  const held = tableHolding(new Map([[PLANTED_PORTS.server, { kind: "unknown" }]]));
  const run = await captured(async () => await doDevUp(devContext(scratch), UP, held));
  expect(run.code).toBe(EXIT.violations);
  expect(run.result).toContain("status=port-conflict server-pid=unknown vite-pid=0");
  expect(existsSync(join(scratch, "run", LEADER_RECORD_FILE))).toBe(false);
});

test("up --force over an owner-unknown port stops at down's refusal: status=unknown, exit 2", async ({ scratch }) => {
  const held = tableHolding(new Map([[PLANTED_PORTS.vite, { kind: "unknown" }]]));
  const run = await captured(async () => await doDevUp(devContext(scratch), { ...UP, force: true }, held));
  expect(run.code).toBe(EXIT.toolError);
  expect(run.result).toContain(`ports=${String(PLANTED_PORTS.vite)} reason=port-owner-unknown`);
});
