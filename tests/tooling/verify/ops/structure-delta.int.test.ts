// THE PER-POLICY DELTA'S OWN REFUSALS (#2110, #2223) — `pnpm check:structure-delta`.
//
// WHY THIS FILE EXISTS. The instrument's stated contract is "a calm zero from a broken read is worse than
// no instrument", and an audit of it against that promise on 2026-09-12 found THREE ways it exited 0 on a
// real gap. None of them was expressible as a row on any gate: they are properties of a two-artifact
// comparison, so they are pinned here, each with the green direction beside it.
//
//   (a) a NEW AUTHORITY ALARM on an ALREADY-RED policy. The regression predicate was
//       `effective rose || (before.ok && !after.ok)`. An alarm moves no finding count, and under the mixed
//       runtime (#1584) most final policies are red by construction — so `before.ok` is already false and
//       the transition clause can never fire. A lane adding a stale or over-broad grant to one of those
//       policies was invisible.
//   (b) a VANISHED policy. `no longer present:` was PRINTED and then dropped: the loader silently
//       `continue`s past a module that exports no gate (contract/run-manifest.ts), so a policy that stops
//       registering REMOVES ITS OWN RED ROW and the delta called that no change.
//   (c) a TRANSPOSED explicit pair. `resolveBefore` enforces `startedAt` ordering only while CHOOSING a
//       slot; two explicit `--before`/`--after` ids were accepted in any order, and a reversed pair inverts
//       every comparison so a regression reads as a repair.
//
// EVERY FIXTURE IS A PAIR OF PLANTED SLOTS, never a real run: this instrument reads two published artifacts
// off disk and nothing else, so a planted pair is the whole subject. A `check:structure` over the real tree
// takes minutes and would make the red arms depend on whatever main happens to be carrying.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { runStructureDelta } from "@orb/tooling/verify";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CHECKOUT = "planted";
const BEFORE_ID = `${CHECKOUT}-1-2026-09-12T10-00-00-000Z`;
const AFTER_ID = `${CHECKOUT}-2-2026-09-12T11-00-00-000Z`;

interface PlantedPolicy {
  readonly name: string;
  readonly violations?: number;
  readonly ok?: boolean;
  readonly alarms?: number;
  readonly withheld?: boolean;
}

interface PlantedErrors {
  readonly structure?: number;
  readonly policy?: number;
  readonly fact?: number;
  readonly authority?: number;
}

/** One published slot, in the shape `ops/structure.ts` writes: a complete whole-corpus verdict from
 *  `CHECKOUT`, carrying the named final policies and the run-level authority alarms they are named by. */
function plantSlot(root: string, id: string, startedAt: string, policies: readonly PlantedPolicy[]): void {
  const dir = join(root, "reports", "runs", "structure", id);
  mkdirSync(dir, { recursive: true });
  const alarms = policies.flatMap((policy) =>
    Array.from({ length: policy.alarms ?? 0 }, (_, index) => ({
      kind: "stale-reviewed-grant",
      policyId: policy.name,
      grantId: `probe:${policy.name}-${String(index)}`,
      subject: "packages/client/src/gone.ts",
      operation: "probe",
      message: "a planted alarm",
    })),
  );
  const report = {
    run: {
      verdict: "verdict",
      nonVerdictReason: null,
      selection: { kind: "all" },
      quiet: true,
      runId: id,
      checkout: CHECKOUT,
      artifactDir: `reports/runs/structure/${id}`,
      concurrent: [],
      startedAt,
      finishedAt: startedAt,
      complete: true,
      corpusFiles: 1,
      registered: policies.length,
      unregistered: [],
      active: policies.length,
      ran: policies.length,
      legacy: { registered: 0, active: 0, ran: 0 },
      final: { registered: policies.length, ran: policies.length, withheld: 0 },
      incompleteReasons: [],
    },
    gates: policies.map((policy) => ({
      contract: "final",
      name: policy.name,
      family: policy.name,
      authority: "hard",
      severity: "error",
      workItem: null,
      ok: policy.ok ?? (policy.violations ?? 0) === 0,
      owner: { status: "success" },
      withheld: policy.withheld ?? false,
      population: { declaredSourcePaths: 1, declaredResourcePaths: 0, effectiveSourcePaths: 1, effectiveResourcePaths: 0, requestedPaths: null },
      receipts: [],
      violations: Array.from({ length: policy.violations ?? 0 }, () => ({ file: "a.ts", line: 1, message: "planted" })),
      waived: 0,
      granted: 0,
      timing: { ms: 0 },
    })),
    toolErrors: [],
    scanAlarms: [],
    populationAlarms: [],
    timing: { ms: 0 },
    policy: {
      facts: [],
      factErrors: [],
      toolErrors: [],
      waiverCarrierRefusals: [],
      authority: {
        alarms,
        toolErrors: [],
        withheldPolicyIds: [],
        ordinaryConsumption: [],
        reviewedGrantConsumption: [],
        verdict: { blocking: 0 },
      },
      timing: { ms: 0 },
    },
    total: 0,
    ok: policies.every((policy) => policy.ok ?? (policy.violations ?? 0) === 0),
  };
  writeFileSync(join(dir, "check-structure.json"), JSON.stringify(report));
}

function plantErrors(root: string, id: string, errors: PlantedErrors): void {
  const path = join(root, "reports", "runs", "structure", id, "check-structure.json");
  const report = JSON.parse(readFileSync(path, "utf8")) as {
    toolErrors: unknown[];
    policy: { toolErrors: unknown[]; factErrors: unknown[]; authority: { toolErrors: unknown[] } };
  };
  report.toolErrors = Array.from({ length: errors.structure ?? 0 }, () => "planted structure error");
  report.policy.toolErrors = Array.from({ length: errors.policy ?? 0 }, () => "planted policy error");
  report.policy.factErrors = Array.from({ length: errors.fact ?? 0 }, () => "planted fact error");
  report.policy.authority.toolErrors = Array.from({ length: errors.authority ?? 0 }, () => "planted authority error");
  writeFileSync(path, JSON.stringify(report));
}

function delta(root: string, before: string, after: string): number {
  return runStructureDelta(root, ["--before", before, "--after", after]);
}

test("the GREEN direction — an unchanged pair is clean, and a pair whose EFFECTIVE count rose is not", async ({ plantedTree }) => {
  const root = await plantedTree({});
  plantSlot(root, BEFORE_ID, "2026-09-12T10:00:00.000Z", [{ name: "alpha", violations: 2, ok: false }]);
  plantSlot(root, AFTER_ID, "2026-09-12T11:00:00.000Z", [{ name: "alpha", violations: 2, ok: false }]);
  expect(delta(root, BEFORE_ID, AFTER_ID)).toBe(EXIT.clean);

  // the harness's own positive control: the ONE regression the instrument always caught still reds.
  const worse = `${CHECKOUT}-3-2026-09-12T12-00-00-000Z`;
  plantSlot(root, worse, "2026-09-12T12:00:00.000Z", [{ name: "alpha", violations: 3, ok: false }]);
  expect(delta(root, BEFORE_ID, worse)).toBe(EXIT.violations);
});

test("the default BEFORE is the nearest usable run by startedAt, independent of PID-bearing slot-id order", async ({ plantedTree }) => {
  const root = await plantedTree({});
  const olderHighPid = `${CHECKOUT}-99-2026-09-12T09-00-00-000Z`;
  const newerLowPid = `${CHECKOUT}-1-2026-09-12T10-00-00-000Z`;
  const unusableNearest = `${CHECKOUT}-0-2026-09-12T10-30-00-000Z`;
  const after = `${CHECKOUT}-2-2026-09-12T11-00-00-000Z`;
  plantSlot(root, olderHighPid, "2026-09-12T09:00:00.000Z", [{ name: "alpha", violations: 1, ok: false }]);
  plantSlot(root, newerLowPid, "2026-09-12T10:00:00.000Z", [{ name: "alpha", violations: 3, ok: false }]);
  plantSlot(root, unusableNearest, "2026-09-12T10:30:00.000Z", [{ name: "alpha", violations: 3, ok: false }]);
  const unusablePath = join(root, "reports", "runs", "structure", unusableNearest, "check-structure.json");
  const unusableReport = JSON.parse(readFileSync(unusablePath, "utf8")) as { run: { verdict: string; nonVerdictReason: string | null } };
  unusableReport.run.verdict = "non-verdict";
  unusableReport.run.nonVerdictReason = "planted selection control";
  writeFileSync(unusablePath, JSON.stringify(unusableReport));
  plantSlot(root, after, "2026-09-12T11:00:00.000Z", [{ name: "alpha", violations: 4, ok: false }]);
  const pointer = join(root, "reports", "check-structure.json");
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(pointer, readFileSync(join(root, "reports", "runs", "structure", after, "check-structure.json")));
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    expect(runStructureDelta(root, [])).toBe(EXIT.violations);
    expect(write.mock.calls.flat().join("")).toContain(`structure-delta: ${newerLowPid} → ${after}`);
  } finally {
    write.mockRestore();
  }
});

test("a newly withheld already-red policy is a regression, while recovery is clean", async ({ plantedTree }) => {
  const root = await plantedTree({});
  plantSlot(root, BEFORE_ID, "2026-09-12T10:00:00.000Z", [{ name: "alpha", violations: 1, ok: false, withheld: false }]);
  plantSlot(root, AFTER_ID, "2026-09-12T11:00:00.000Z", [{ name: "alpha", violations: 1, ok: false, withheld: true }]);
  expect(delta(root, BEFORE_ID, AFTER_ID)).toBe(EXIT.violations);

  const recovered = `${CHECKOUT}-3-2026-09-12T12-00-00-000Z`;
  plantSlot(root, recovered, "2026-09-12T12:00:00.000Z", [{ name: "alpha", violations: 1, ok: false, withheld: false }]);
  expect(delta(root, AFTER_ID, recovered)).toBe(EXIT.clean);
});

test("a rise across all four run-level tool-error collections is a regression, while a fall is clean", async ({ plantedTree }) => {
  const root = await plantedTree({});
  plantSlot(root, BEFORE_ID, "2026-09-12T10:00:00.000Z", [{ name: "alpha", violations: 1, ok: false }]);
  plantSlot(root, AFTER_ID, "2026-09-12T11:00:00.000Z", [{ name: "alpha", violations: 1, ok: false }]);
  plantErrors(root, AFTER_ID, {
    structure: 1,
    policy: 1,
    fact: 1,
    authority: 1,
  });
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    expect(delta(root, BEFORE_ID, AFTER_ID)).toBe(EXIT.violations);
    const output = write.mock.calls.flat().join("");
    expect(output).toContain("tool errors: 0 → 4");
    expect(output).toContain("run-level tool errors REGRESSED: 0 → 4");
    expect(output).not.toContain("no per-policy change");
  } finally {
    write.mockRestore();
  }

  const recovered = `${CHECKOUT}-3-2026-09-12T12-00-00-000Z`;
  plantSlot(root, recovered, "2026-09-12T12:00:00.000Z", [{ name: "alpha", violations: 1, ok: false }]);
  expect(delta(root, AFTER_ID, recovered)).toBe(EXIT.clean);
});

test("#2223 (a) — a NEW AUTHORITY ALARM on an already-RED policy is a REGRESSION, not a zero", async ({ plantedTree }) => {
  const root = await plantedTree({});
  // `ok` is false at BOTH ends and the finding count does not move: neither clause of the old predicate can
  // fire, which is exactly the state the mixed runtime leaves nearly every final policy in.
  plantSlot(root, BEFORE_ID, "2026-09-12T10:00:00.000Z", [{ name: "alpha", violations: 1, ok: false, alarms: 0 }]);
  plantSlot(root, AFTER_ID, "2026-09-12T11:00:00.000Z", [{ name: "alpha", violations: 1, ok: false, alarms: 1 }]);

  expect(delta(root, BEFORE_ID, AFTER_ID)).toBe(EXIT.violations);
});

test("#2223 (a) NEGATIVE CONTROL — an alarm that was already there is not a new one", async ({ plantedTree }) => {
  const root = await plantedTree({});
  plantSlot(root, BEFORE_ID, "2026-09-12T10:00:00.000Z", [{ name: "alpha", violations: 1, ok: false, alarms: 1 }]);
  plantSlot(root, AFTER_ID, "2026-09-12T11:00:00.000Z", [{ name: "alpha", violations: 1, ok: false, alarms: 1 }]);

  expect(delta(root, BEFORE_ID, AFTER_ID)).toBe(EXIT.clean);
});

test("#2223 (b) — a VANISHED policy is a REGRESSION: a red row that stopped loading removed its own red", async ({ plantedTree }) => {
  const root = await plantedTree({});
  plantSlot(root, BEFORE_ID, "2026-09-12T10:00:00.000Z", [
    { name: "alpha", violations: 1, ok: false },
    { name: "beta", violations: 0 },
  ]);
  plantSlot(root, AFTER_ID, "2026-09-12T11:00:00.000Z", [{ name: "beta", violations: 0 }]);

  expect(delta(root, BEFORE_ID, AFTER_ID)).toBe(EXIT.violations);
});

test("#2223 (b) NEGATIVE CONTROL — a policy that ARRIVES clean is not a regression", async ({ plantedTree }) => {
  const root = await plantedTree({});
  plantSlot(root, BEFORE_ID, "2026-09-12T10:00:00.000Z", [{ name: "beta", violations: 0 }]);
  plantSlot(root, AFTER_ID, "2026-09-12T11:00:00.000Z", [
    { name: "alpha", violations: 0 },
    { name: "beta", violations: 0 },
  ]);

  expect(delta(root, BEFORE_ID, AFTER_ID)).toBe(EXIT.clean);
});

test("#2223 (c) — a TRANSPOSED explicit pair REFUSES (exit 2), it does not report the inverse as clean", async ({ plantedTree }) => {
  const root = await plantedTree({});
  // Forward this pair is a regression; run backward it used to read as a repair and exit 0.
  plantSlot(root, BEFORE_ID, "2026-09-12T10:00:00.000Z", [{ name: "alpha", violations: 1, ok: false }]);
  plantSlot(root, AFTER_ID, "2026-09-12T11:00:00.000Z", [{ name: "alpha", violations: 4, ok: false }]);
  expect(delta(root, BEFORE_ID, AFTER_ID)).toBe(EXIT.violations);

  expect(delta(root, AFTER_ID, BEFORE_ID)).toBe(EXIT.toolError);
});

test("#2223 (c) — the SAME slot at both ends is a refusal too: a run does not differ from itself", async ({ plantedTree }) => {
  const root = await plantedTree({});
  plantSlot(root, BEFORE_ID, "2026-09-12T10:00:00.000Z", [{ name: "alpha", violations: 1, ok: false }]);

  expect(delta(root, BEFORE_ID, BEFORE_ID)).toBe(EXIT.toolError);
});
