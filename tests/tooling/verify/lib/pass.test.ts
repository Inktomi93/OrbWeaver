import { resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import { vi } from "vitest";
import type { GateDescriptor, GateRunCtx } from "../../../../tooling/src/verify/contract/gate.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
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

// ── #2234 — `ok` IS A TWO-TERM VERDICT: nothing to report AND nothing broken ─────────────────────────
//
// RED-FIRST against the unmodified `lib/pass.ts` (`git show HEAD:` in place, then `cp` back): the first row
// below FAILED with `expected true to be false` — `{ ok: true, findings: [] }` for a gate whose `run` phase
// THREW, the failure visible only in the sibling `toolErrors`. cb-v-wave-5 measured the same shape on the
// real corpus (`css-length-tokens` over 1,685 files, "Maximum call stack size exceeded") and it silently
// converted two of that verifier's own runs into false cleans.
//
// FOUR ROWS, AND ONLY TWO OF THEM ARE DEFECT PROOFS — labelled honestly, because a row that was green
// before the fix is a FENCE and never evidence. RED before / green after: "threw with an empty finding
// list" and "a sibling gate's tool error". ALREADY GREEN before the fix, kept as fences: "reports AND
// throws" (`findings.length !== 0` already made it false, so it pins that the two terms do not cancel) and
// "a HEALTHY silent gate stays ok" (the control that stops a fix returning a blanket `false` from
// reddening the whole corpus).
test("a gate whose run phase THREW is not ok, even with an empty finding list", () => {
  const ctx = readerContext();
  const result = runPass(
    [
      readerGate(() => {
        throw new Error("planted phase failure");
      }),
    ],
    ctx,
  );
  expect(result.toolErrors, "the sibling channel still carries the reason").toMatchObject([
    { gate: "reader-probe", phase: "run", message: "planted phase failure" },
  ]);
  const row = result.gates[0];
  expect(row?.findings, "nothing was reported — which is exactly why `ok` alone used to read clean").toEqual([]);
  expect(row?.ok, "a consumer reading `ok` must not see a clean gate").toBe(false);
});

test("a gate that reports AND throws is not ok either — the two terms do not cancel", () => {
  const ctx = readerContext();
  const result = runPass(
    [
      readerGate((gateCtx) => {
        gateCtx.report({ file: "packages/kit/src/source.ts", line: 1, column: 0, message: "planted finding" });
        throw new Error("planted phase failure");
      }),
    ],
    ctx,
  );
  expect(result.gates[0]?.findings).toHaveLength(1);
  expect(result.gates[0]?.ok).toBe(false);
});

test("a HEALTHY silent gate stays ok — the control that stops the fix from reddening the whole corpus", () => {
  const ctx = readerContext();
  const result = runPass([readerGate(() => undefined)], ctx);
  expect(result.toolErrors).toEqual([]);
  expect(result.gates[0]?.ok).toBe(true);
});

test("a sibling gate's tool error does not touch THIS gate's verdict — brokenness is attributed by name", () => {
  const ctx = readerContext();
  const healthy: GateDescriptor = { ...readerGate(() => undefined), name: "healthy-probe" };
  const result = runPass(
    [
      healthy,
      readerGate(() => {
        throw new Error("planted phase failure");
      }),
    ],
    ctx,
  );
  const byName = new Map(result.gates.map((gate) => [gate.name, gate.ok]));
  expect(byName.get("healthy-probe")).toBe(true);
  expect(byName.get("reader-probe")).toBe(false);
});
