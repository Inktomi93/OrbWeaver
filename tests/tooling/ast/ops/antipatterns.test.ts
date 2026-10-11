// `pnpm ast antipatterns` verdict handling: a killed, refused or incomplete structure pass is no verdict, never a
// clean run, and a finished pass prints every class with its unwaived hits, alarms and waived sites.
import { describe } from "vitest";
import type { AntipatternVerdict } from "../../../../tooling/src/ast/index.ts";
import { ANTIPATTERN_CLASSES, judgeAntipatternPass } from "../../../../tooling/src/ast/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ARTIFACT = "reports/runs/structure/lane-1/check-structure.json";
const PASS_STDOUT = `structure done; read ${ARTIFACT}\n`;
const ALL_GATES = [...new Set(ANTIPATTERN_CLASSES.flatMap((cls) => cls.gates))];
const [FIRST_CLASS] = ANTIPATTERN_CLASSES;
const RED_GATE = FIRST_CLASS.gates[0];
const WAIVED_FILE = "packages/server/src/domain/x/queries.ts";

interface GateRowOptions {
  readonly violations?: readonly { readonly file: string; readonly line: number; readonly token?: string }[];
  readonly waived?: number;
  readonly withheld?: boolean;
}

// The artifact slice the verb reads, as the structure pass writes it.
interface GateRow {
  readonly name: string;
  readonly withheld: boolean;
  readonly violations: NonNullable<GateRowOptions["violations"]>;
  readonly waived: number;
  readonly granted: number;
  readonly population: { readonly effectiveSourcePaths: number };
}

interface Alarm {
  readonly kind: string;
  readonly policyId: string;
  readonly message: string;
}

interface ArtifactFixture {
  readonly gates: readonly GateRow[];
  readonly policy: {
    readonly toolErrors: readonly never[];
    readonly authority: {
      readonly alarms: readonly Alarm[];
      readonly toolErrors: readonly never[];
      readonly ordinaryConsumption: readonly { readonly id: string; readonly count: number }[];
    };
  };
}

function gateRow(name: string, options: GateRowOptions = {}): GateRow {
  return {
    name,
    withheld: options.withheld ?? false,
    violations: options.violations ?? [],
    waived: options.waived ?? 0,
    granted: 0,
    population: { effectiveSourcePaths: 12 },
  };
}

function artifactOf(gates: readonly GateRow[], extra: { alarms?: readonly Alarm[]; consumed?: readonly string[] } = {}): ArtifactFixture {
  return {
    gates,
    policy: {
      toolErrors: [],
      authority: {
        alarms: extra.alarms ?? [],
        toolErrors: [],
        ordinaryConsumption: (extra.consumed ?? []).map((id) => ({ id, count: 1 })),
      },
    },
  };
}

function reader(files: Readonly<Record<string, string>>): (rel: string) => string {
  return (rel) => {
    const text = files[rel];
    if (text === undefined) {
      throw new Error(`unplanted read: ${rel}`);
    }
    return text;
  };
}

function passOf(artifact: ArtifactFixture, extraFiles: Readonly<Record<string, string>> = {}, scoped = false): AntipatternVerdict {
  return judgeAntipatternPass(
    { code: 0, stdout: PASS_STDOUT, stderr: "", timedOut: false },
    scoped,
    reader({ [ARTIFACT]: JSON.stringify(artifact), ...extraFiles }),
  );
}

describe("no verdict", () => {
  test("a child killed at its time budget is no verdict even when it printed an artifact path", () => {
    const verdict = judgeAntipatternPass({ code: null, stdout: PASS_STDOUT, stderr: "", timedOut: true }, false, reader({}));
    expect(verdict).toMatchObject({ kind: "no-verdict", reason: expect.stringContaining("time budget") });
  });

  test("an unknown check refuses the selection with exit 3, which is no verdict and quotes the refusal", () => {
    const stderr = "structure argument refusal — unknown check selection(s): test-presence\n";
    const verdict = judgeAntipatternPass({ code: 3, stdout: "", stderr, timedOut: false }, false, reader({}));
    expect(verdict).toMatchObject({ kind: "no-verdict", reason: expect.stringContaining("unknown check selection(s): test-presence") });
  });

  test("a class gate missing from the artifact is no verdict, never a silently shorter class", () => {
    const verdict = passOf(artifactOf(ALL_GATES.filter((id) => id !== RED_GATE).map((id) => gateRow(id))));
    expect(verdict).toMatchObject({ kind: "no-verdict", reason: expect.stringContaining(`did not run ${RED_GATE}`) });
  });

  test("a gate withheld on a whole-tree pass is no verdict; under a scope it is listed as withheld", () => {
    const rows = ALL_GATES.map((id) => gateRow(id, { withheld: id === RED_GATE }));
    expect(passOf(artifactOf(rows))).toMatchObject({ kind: "no-verdict", reason: expect.stringContaining(`withheld ${RED_GATE}`) });
    const scoped = passOf(artifactOf(rows), {}, true);
    expect(scoped.kind === "verdict" && scoped.lines.some((line) => line.startsWith(`  withheld ${RED_GATE}`))).toBe(true);
  });
});

describe("verdict", () => {
  test("a clean pass prints every class with zero unwaived hits and fails nothing", () => {
    const verdict = passOf(artifactOf(ALL_GATES.map((id) => gateRow(id))));
    expect(verdict.kind === "verdict" ? verdict.failing : "no-verdict").toBe(0);
    const heads = verdict.kind === "verdict" ? verdict.lines.filter((line) => !line.startsWith("  ")) : [];
    expect(heads).toEqual(ANTIPATTERN_CLASSES.map((cls) => `${cls.name}: 0 unwaived, 0 waived (${cls.gates.join(", ")})`));
  });

  test("a red pass counts each unwaived hit and each marker alarm, reports a budget alarm without failing on it, and names every waived site", () => {
    const rows = ALL_GATES.map((id) =>
      id === RED_GATE ? gateRow(id, { violations: [{ file: "packages/client/src/a.ts", line: 4, token: "Row" }], waived: 1 }) : gateRow(id),
    );
    const stale = { kind: "ordinary-waiver", policyId: RED_GATE, message: `stale ordinary waiver at ${WAIVED_FILE}:9:1` };
    const budget = { kind: "waiver-budget", policyId: RED_GATE, message: `${RED_GATE} excuses 1 findings against a waiver budget of 0` };
    const marker = `// @orb-waive ${RED_GATE}(Shape): baselined; burn-down item 904.`;
    const verdict = passOf(artifactOf(rows, { alarms: [stale, budget], consumed: [`${WAIVED_FILE}:2:1`] }), { [WAIVED_FILE]: `const x = 1;\n${marker}\n` });
    expect(verdict.kind === "verdict" ? verdict.failing : "no-verdict").toBe(2);
    expect(verdict.kind === "verdict" ? verdict.lines.slice(0, 5) : []).toEqual([
      `${FIRST_CLASS.name}: 1 unwaived, 1 waived (${FIRST_CLASS.gates.join(", ")})`,
      `  unwaived ${RED_GATE}  packages/client/src/a.ts:4  Row`,
      `  alarm    ${RED_GATE}  ${stale.message}`,
      `  budget   ${RED_GATE}  ${budget.message}`,
      `  waived   ${RED_GATE}  ${WAIVED_FILE}:2 (Shape)`,
    ]);
  });
});
