// Shared scaffolding for the dev-verb tests (NOT a test file — no `.test` suffix, so test-layout ignores it): a
// stack context on a scratch run dir with no record, the verb's printed lines captured through the output sink,
// and planted socket-table reads handed to the verb through its `DevPortDeps` seam.

import { join } from "node:path";
import process from "node:process";
import { vi } from "vitest";
import { installOutputSink } from "../../../tooling/src/_shared/log.ts";
import type { PortOwner } from "../../../tooling/src/_shared/platform.ts";
import type { StackContext, StackInvocation } from "../../../tooling/src/stack/contract/types.ts";
import { stackContext } from "../../../tooling/src/stack/lib/stack-plan.ts";
import type { DevPortDeps } from "../../../tooling/src/stack/ops/dev-down.ts";

/** Ports nothing here binds: every verdict comes from the planted table, never from the box. */
export const PLANTED_PORTS = { server: 47_711, vite: 47_712 } as const;

export function devContext(scratch: string): StackContext {
  const ambient = Object.fromEntries([
    ["STACK_RUN_DIR", join(scratch, "run")],
    ["PORT", String(PLANTED_PORTS.server)],
    ["VITE_PORT", String(PLANTED_PORTS.vite)],
    ["ORB_ENV_NO_FILE", "1"],
  ]);
  return stackContext(scratch, ambient, null);
}

export const UP: StackInvocation = { verb: "up", mode: "dev", debug: false, build: false, force: false, rest: [] };

/** A socket table that could not be read. */
export const REFUSED_TABLE: DevPortDeps = { readPorts: () => ({ kind: "refused", reason: "socket table unreadable on linux: planted" }) };

/** A socket table that reads, holding exactly `owners` (port → owner). */
export function tableHolding(owners: ReadonlyMap<number, PortOwner>): DevPortDeps {
  return { readPorts: () => ({ kind: "read", value: owners }) };
}

/** Run a verb and return its exit code with every line it printed; the lines stay off the test's stdout. */
export async function captured(run: () => Promise<number>): Promise<{ readonly code: number; readonly lines: readonly string[]; readonly result: string }> {
  const lines: string[] = [];
  const release = installOutputSink({ line: (line) => lines.push(line), warn: (line) => lines.push(line) });
  const quiet = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const code = await run();
    const result = lines.findLast((line) => line.includes("RESULT stack")) ?? "";
    return { code, lines, result };
  } finally {
    quiet.mockRestore();
    release();
  }
}
