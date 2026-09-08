import { vi } from "vitest";
import type { GateDescriptor, GateRunCtx } from "../../../../tooling/src/verify/contract/gate.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { resolveModuleMemberOrigin } from "../../../../tooling/src/verify/lib/reference-fact.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

function readerGate(run: (ctx: GateRunCtx) => void): GateDescriptor {
  return {
    name: "reader-probe",
    docRow: "Spine-Testing.md",
    status: "active",
    scopeSafety: "incremental-safe",
    message: "reader integration probe",
    run,
    mustFlag: [{ files: "export const invalid = 1;" }],
    mustPass: [{ files: "export const valid = 1;" }],
  };
}

function readerContext(): Omit<GateRunCtx, "report" | "scan"> {
  const { root, project } = ctxFor({
    "packages/kit/src/source.ts": "export const holder = { n: 1 };",
    "packages/kit/src/consumer.ts": 'import { holder } from "./source.ts"; const unrelated = 1; const alias = holder; export const subject = alias;',
  });
  return { root, project, files: project.getSourceFiles(), scope: { kind: "project" }, checker: () => project.getTypeChecker() };
}

test("shared reference readers reuse per-file write facts across queries in one pass", () => {
  const ctx = readerContext();
  const source = ctx.project.getSourceFileOrThrow(`${ctx.root}/packages/kit/src/consumer.ts`);
  const reference = source.getVariableDeclarationOrThrow("subject").getInitializerOrThrow();
  // This unrelated binding is inspected by the file-wide write scan, never by the queried alias chain.
  const inspection = vi.spyOn(source.getVariableDeclarationOrThrow("unrelated").getNameNode(), "getParent");
  let firstScan = 0;
  let secondScan = 0;
  const gate = readerGate(() => {
    expect(resolveModuleMemberOrigin(reference).kind).toBe("resolved");
    firstScan = inspection.mock.calls.length;
    expect(resolveModuleMemberOrigin(reference).kind).toBe("resolved");
    secondScan = inspection.mock.calls.length - firstScan;
  });
  expect(runPass([gate], ctx).toolErrors).toEqual([]);
  expect(firstScan).toBeGreaterThan(0);
  expect(secondScan).toBe(0);
});

test("reader caches close after a failed pass and do not hide later writes in a reused project", () => {
  const ctx = readerContext();
  const source = ctx.project.getSourceFileOrThrow(`${ctx.root}/packages/kit/src/consumer.ts`);
  const gate = readerGate(() => {
    const reference = source.getVariableDeclarationOrThrow("subject").getInitializerOrThrow();
    expect(resolveModuleMemberOrigin(reference).kind).toBe("resolved");
    throw new Error("planted reader failure");
  });
  expect(runPass([gate], ctx).toolErrors).toMatchObject([{ message: "planted reader failure" }]);
  source.addStatements("alias.n = 2;");
  let observed = "";
  const next = readerGate(() => {
    const reference = source.getVariableDeclarationOrThrow("subject").getInitializerOrThrow();
    const origin = resolveModuleMemberOrigin(reference);
    observed = origin.kind === "unresolved" ? origin.reason : origin.kind;
  });
  expect(runPass([next], ctx).toolErrors).toEqual([]);
  expect(observed).toBe("write");
});
