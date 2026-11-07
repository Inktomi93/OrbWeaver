import { readFile } from "node:fs/promises";
import type { DesignAuditRuleId, PopulationAccounting, RulePopulationAccounting } from "@orb/tooling/ui-audit";
import { vi } from "vitest";
import { expect } from "./fixtures.ts";

/** Why a rule said nothing on a live run. The causes read the same in the findings table, and a withheld or unreached
 *  subject is never a clean one. `no-candidate` says the census offered the rule nothing to look at, and
 *  `no-population` says the rule publishes no row, so the report holds no evidence that it looked at all. */
export type SilentDisposition =
  | { readonly kind: "judged" }
  | { readonly kind: "excluded" | "withheld"; readonly reason: string }
  | { readonly kind: "no-candidate" | "no-population" };

interface ProofFields {
  readonly rule: DesignAuditRuleId;
  readonly reason: string;
}

export type FiresAuditRuleProof = ProofFields & { readonly kind: "fires" };

/** One proof a live `auditRuleTest` attaches to a rule. A silent row must state its disposition, and the
 *  registration reads it from the run's report. */
export type AuditRuleProof = FiresAuditRuleProof | (ProofFields & { readonly kind: "silent"; readonly disposition: SilentDisposition });

/** A proof over a pure check. No run stands behind it, so there is no population to name. */
export type PureAuditRuleProof = ProofFields & { readonly kind: "fires" | "silent" };

export const RELATIONAL_CLI_TIMEOUT_MS = 90_000;

/** Register per suite: Vitest resets runtime config between files while retaining the helper module. */
export function configureRelationalCliBudget(): void {
  vi.setConfig({ testTimeout: RELATIONAL_CLI_TIMEOUT_MS, hookTimeout: RELATIONAL_CLI_TIMEOUT_MS });
}

/** THE ARGV every walker suite adds. The scan is `pnpm snap <route> --design-audit`; a local
 *  fixture is `--file <path>` rather than a `file://` BASE plus a route, because snap tells the two apart
 *  on purpose — a `--base` origin is an APP origin and owes the `__orb` bridge, a `--file` document does
 *  not. The three suppressed defaults are snap's own: none of these suites asserts a pixel. */
export const AUDIT_ARGV = ["--design-audit", "--no-shot", "--no-deadcss", "--no-failure-evidence"] as const;

/** The `report <path>` line the arm prints — the ONE door onto its filed JSON. Snap's `--out` names the SHOT base, not the report; the arm
 *  files its report inside the run slot under its own producer arm. */
export function auditReport(stdout: string): string {
  const line = stdout.split(/\r?\n/u).find((entry) => entry.startsWith("report "));
  expect(line, `no report line in:\n${stdout}`).toBeTypeOf("string");
  return String(line).slice("report".length).trim();
}

/** Every findings-table selector for one rule. The table is `severity rule selector message (value)` with
 *  fixed-width columns. Read from the TABLE rather than by substring: the same selectors also appear in
 *  the withheld/obscured denominators above it, where their presence says nothing about the verdict.
 *  ONE home: the census suites ask the identical question of the identical output, and a second copy is
 *  the shape tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md row 4 warns against. */
export function findingSelectors(stdout: string, rule: string): readonly string[] {
  const rows: string[] = [];
  for (const line of stdout.split(/\r?\n/u)) {
    const fields = line.trim().split(/\s+/u);
    if (fields[1] === rule && (fields[0] ?? "").startsWith("P") && fields[2] !== undefined) {
      rows.push(fields[2]);
    }
  }
  return rows;
}

export function relationalDocument(body: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>relational population</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui"><main>${body}</main></body></html>`;
}

export interface RelationalPopulationReport {
  readonly findings: readonly { readonly rule: DesignAuditRuleId }[];
  readonly obscuredRecentred?: number;
  readonly obscuredUnaskable?: readonly {
    readonly selector: string;
    readonly reason: string;
    readonly centre: { readonly x: number; readonly y: number };
    readonly rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  }[];
  readonly populationAccounting?: PopulationAccounting;
}

function isAuditReport(value: unknown): value is RelationalPopulationReport {
  return typeof value === "object" && value !== null && "findings" in value && Array.isArray(value.findings);
}

/** The filed report behind a run's `report <path>` line. */
export async function readAuditReport(stdout: string): Promise<RelationalPopulationReport> {
  const path = auditReport(stdout);
  const report = JSON.parse(await readFile(path, "utf8"));
  if (!isAuditReport(report)) {
    throw new Error(`${path} holds no findings list`);
  }
  return report;
}

/** How many of a row's subjects the disposition accounts for. Zero means the rule was silent for another cause. */
function subjectsDisposed(row: RulePopulationAccounting | undefined, disposition: SilentDisposition, alongsideFires: boolean): number {
  if (row === undefined) {
    return disposition.kind === "no-population" ? 1 : 0;
  }
  switch (disposition.kind) {
    case "judged": {
      return row.judged - row.affected;
    }
    case "excluded": {
      return row.excluded[disposition.reason] ?? 0;
    }
    case "withheld": {
      return row.withheld[disposition.reason] ?? 0;
    }
    case "no-candidate": {
      return (alongsideFires ? row.judged === row.affected : row.candidates === 0) ? 1 : 0;
    }
    case "no-population": {
      return 0;
    }
  }
}

/** Read one rule's disposition from a report. `alongsideFires` marks a run where another subject of the same rule
 *  fires by design, so the row keeps its affected count and the silence is what remains beside it. */
export function expectPopulation(report: RelationalPopulationReport, rule: DesignAuditRuleId, disposition: SilentDisposition, alongsideFires = false): void {
  const row = report.populationAccounting?.[rule];
  expect(subjectsDisposed(row, disposition, alongsideFires), `${rule} ${JSON.stringify(row)} is not ${JSON.stringify(disposition)}`).toBeGreaterThan(0);
  expect(alongsideFires ? [] : report.findings.filter((finding) => finding.rule === rule), `${rule} was silent, so it files nothing`).toEqual([]);
}

export function stateTwin(kind: "checked" | "current" | "selected", selectedStyle: string, baseStyle = ""): string {
  const attributes = {
    checked: { selected: "data-checked", unselected: "data-unchecked" },
    current: { selected: 'aria-current="page"', unselected: 'aria-current="false"' },
    selected: { selected: "data-selected", unselected: 'aria-selected="false"' },
  } as const;
  const { selected, unselected } = attributes[kind];
  return `<section data-slot="choice-group"><div data-slot="choice" ${selected} style="${baseStyle};${selectedStyle};width:120px;height:40px"><span>chosen</span></div>
<div data-slot="choice" ${unselected} style="${baseStyle};width:120px;height:40px"><span>other</span></div></section>`;
}
