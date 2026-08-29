// The PERMANENT PIN for `db-structure`'s schema-dir read (tooling/src/verify/gates/db-structure.ts) — the
// #751 caught-failure-ownership campaign. The gate USED to `catch { return [] }` over EVERY readdirSync
// failure with a stale "pre-Phase-3, nothing to assert" justification: a permission error (EACCES) or a
// broken symlink on the always-present schema dir was swallowed into a CLEAN gate verdict — a LYING GATE.
// The fix narrows the swallow to the ONE benign code (ENOENT = genuinely absent) and RE-THROWS everything
// else, so the harness turns it into a per-gate tool-error (exit 2) instead of a false ✓.
//
// Both directions are pinned here — conformance never exercises the read failure (every fsBacked example
// plants a real schema dir, so readdirSync always succeeds there). This drives the REAL descriptor's `run`
// with `readdirSync` faulted, and asserts: EACCES REFUSES (throws), ENOENT is benign (empty, no throw).
import type * as Fs from "node:fs";
import { Project } from "ts-morph";
import { vi } from "vitest";
import type { Finding, GateRunCtx } from "../../../../tooling/src/verify/contract/gate.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SCHEMA_DIR_SUFFIX = "packages/db/src/schema";
const ROOT = "/planted-db-root";

const fault = vi.hoisted(() => ({ kind: "" as "" | "eacces" | "enoent" }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  return {
    ...real,
    readdirSync: (path: Parameters<typeof real.readdirSync>[0], options: Parameters<typeof real.readdirSync>[1]) => {
      if (String(path).endsWith(SCHEMA_DIR_SUFFIX)) {
        if (fault.kind === "eacces") {
          throw Object.assign(new Error("planted EACCES: permission denied reading the schema dir"), { code: "EACCES" });
        }
        if (fault.kind === "enoent") {
          throw Object.assign(new Error("planted ENOENT: no such directory"), { code: "ENOENT" });
        }
      }
      return (real.readdirSync as (...args: unknown[]) => unknown)(path, options);
    },
  };
});

const { gate } = await import("../../../../tooling/src/verify/gates/db-structure.ts");

/** Drive the real descriptor's whole-project `run`, collecting any reported findings. The ts-morph Project
 *  is in-memory so the mocked `node:fs` governs only the gate's own schema-dir read. */
function runGate(): readonly Finding[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const findings: Finding[] = [];
  const ctx: GateRunCtx = {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: [],
    checker: () => project.getTypeChecker(),
    report: (arg) => {
      if ("file" in arg) {
        findings.push(arg);
      }
    },
    scan: () => undefined,
  };
  gate.run?.(ctx);
  return findings;
}

test("a non-ENOENT schema-dir read failure (EACCES) REFUSES as a tool-error, never a clean empty verdict", () => {
  fault.kind = "eacces";
  // The narrowed catch re-throws; the harness (lib/pass.ts `guard`) turns this into a per-gate ToolError
  // (exit 2). The OLD `catch { return [] }` swallowed it and returned zero findings — a false ✓.
  expect(() => runGate()).toThrow("planted EACCES");
});

test("a genuinely-absent schema dir (ENOENT) is the documented benign case — empty result, no throw", () => {
  fault.kind = "enoent";
  expect(runGate()).toEqual([]);
});
