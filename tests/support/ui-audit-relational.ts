import { vi } from "vitest";
import { expect } from "./fixtures.ts";

export const RELATIONAL_CLI_TIMEOUT_MS = 90_000;
vi.setConfig({ testTimeout: RELATIONAL_CLI_TIMEOUT_MS, hookTimeout: RELATIONAL_CLI_TIMEOUT_MS });

/** THE ARGV every walker suite adds (#1315). The scan is `pnpm snap <route> --design-audit`; a local
 *  fixture is `--file <path>` rather than a `file://` BASE plus a route, because snap tells the two apart
 *  on purpose — a `--base` origin is an APP origin and owes the `__orb` bridge, a `--file` document does
 *  not. The three suppressed defaults are snap's own: none of these suites asserts a pixel. */
export const AUDIT_ARGV = ["--design-audit", "--no-shot", "--no-deadcss", "--no-failure-evidence"] as const;

/** The `report <path>` line the arm prints — the ONE door onto its filed JSON. The retired CLI took
 *  `--out <path>` and wrote the report exactly there; snap's `--out` names the SHOT base, and the arm
 *  files its report inside the run slot under its own producer arm (#1342). */
export function auditReport(stdout: string): string {
  const line = stdout.split("\n").find((entry) => entry.startsWith("report "));
  expect(line, `no report line in:\n${stdout}`).toBeTypeOf("string");
  return String(line).slice("report".length).trim();
}

/** Every findings-table selector for one rule. The table is `severity rule selector message (value)` with
 *  fixed-width columns. Read from the TABLE rather than by substring: the same selectors also appear in
 *  the withheld/obscured denominators above it, where their presence says nothing about the verdict.
 *  ONE home (2026-09-05, #1103): census-decor's and census-accent's suites ask the identical question of
 *  the identical output, and a second copy is the shape tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md row 4 was paid for. */
export function findingSelectors(stdout: string, rule: string): readonly string[] {
  const rows: string[] = [];
  for (const line of stdout.split("\n")) {
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
  readonly findings: readonly { readonly rule: string }[];
  readonly obscuredRecentred?: number;
  readonly obscuredUnaskable?: readonly {
    readonly selector: string;
    readonly reason: string;
    readonly centre: { readonly x: number; readonly y: number };
    readonly rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  }[];
  readonly populationAccounting?: Readonly<
    Record<
      string,
      {
        readonly candidates: number;
        readonly emitted: number;
        readonly excluded: Readonly<Record<string, number>>;
        readonly judged: number;
        readonly withheld: Readonly<Record<string, number>>;
      }
    >
  >;
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
