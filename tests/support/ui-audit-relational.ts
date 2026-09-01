import { vi } from "vitest";

export const RELATIONAL_CLI_TIMEOUT_MS = 90_000;
vi.setConfig({ testTimeout: RELATIONAL_CLI_TIMEOUT_MS, hookTimeout: RELATIONAL_CLI_TIMEOUT_MS });

export function relationalDocument(body: string): string {
  return `<!doctype html>
<html data-app-ready="settled"><head><meta charset="utf-8"><title>relational population</title></head>
<body style="margin:0;background:#000;color:#fff;font:14px system-ui"><main>${body}</main></body></html>`;
}

export interface RelationalPopulationReport {
  readonly findings: readonly { readonly rule: string }[];
  readonly populationAccounting?: Readonly<
    Record<
      string,
      {
        readonly candidates: number;
        readonly emitted: number;
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
