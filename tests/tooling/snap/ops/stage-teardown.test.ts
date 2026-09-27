// `stopStage` over a planted socket table: the verdict every teardown reports from. A table it cannot read, or a
// band port still held by an owner it cannot kill, is `unconfirmed`, never `stopped`. The stage dir does not
// exist, so no launcher runs and the table alone decides.

import { join } from "node:path";
import process from "node:process";
import { vi } from "vitest";
import type { ListeningPortsRead, PortOwner } from "../../../../tooling/src/_shared/platform.ts";
import { stopStage } from "../../../../tooling/src/snap/ops/stage-teardown.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const PORTS = { server: 47_811, vite: 47_812 } as const;

function holding(owners: ReadonlyMap<number, PortOwner>): () => ListeningPortsRead {
  return () => ({ kind: "read", value: owners });
}

vi.spyOn(process.stdout, "write").mockImplementation(() => true);

test("a table that reads both band ports free confirms the stop", ({ scratch }) => {
  expect(stopStage(join(scratch, "no-stage"), PORTS, holding(new Map()))).toEqual({ kind: "stopped" });
});

test("a table that cannot be read leaves the stop unconfirmed, with the refusal as its reason", ({ scratch }) => {
  const verdict = stopStage(join(scratch, "no-stage"), PORTS, () => ({ kind: "refused", reason: "socket table unreadable on linux: planted" }));
  expect(verdict).toEqual({ kind: "unconfirmed", reason: expect.stringContaining("socket table unreadable on linux: planted") });
});

test("a band port still held by an owner the OS will not name leaves the stop unconfirmed", ({ scratch }) => {
  const verdict = stopStage(join(scratch, "no-stage"), PORTS, holding(new Map([[PORTS.vite, { kind: "unknown" }]])));
  expect(verdict).toEqual({ kind: "unconfirmed", reason: expect.stringContaining(`:${String(PORTS.vite)} is still held by an owner the OS will not name`) });
});

test("a band port held by a pid that is not a stage leaves the stop unconfirmed and signals nothing", ({ scratch }) => {
  const kill = vi.spyOn(process, "kill");
  try {
    const verdict = stopStage(join(scratch, "no-stage"), PORTS, holding(new Map([[PORTS.server, { kind: "pid", pid: process.pid }]])));
    expect(verdict).toEqual({ kind: "unconfirmed", reason: expect.stringContaining(`:${String(PORTS.server)} is still held by pid ${String(process.pid)}`) });
    expect(kill).not.toHaveBeenCalled();
  } finally {
    kill.mockRestore();
  }
});
