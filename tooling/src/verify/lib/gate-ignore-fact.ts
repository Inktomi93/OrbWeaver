// Dispatcher-owned inventory of the retired legacy gate-ignore marker. The final residue policy receives
// marker facts rather than the parser: literal spans come from the shared syntax walk, and the one historical
// grammar remains beside the legacy suppressor until the atomic cutover removes that runtime.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { GateIgnoreMarker } from "../contract/pass.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { findGateIgnoreMarkersWithSpans, GATE_IGNORE_MENTION_SPAN_KINDS } from "./gate-ignore.ts";

export const GATE_IGNORE_POPULATION = {
  in: ["@authored", "@showcase"],
  under: ["packages/**", "tests/**", "tooling/src/**"],
} as const;

export interface GateIgnoreSite {
  readonly file: string;
  readonly line: number;
  readonly marker: GateIgnoreMarker;
}

export interface GateIgnoreFacts {
  readonly sites: readonly GateIgnoreSite[];
  readonly receipt: { readonly source: string; readonly members: number };
}

export const gateIgnoreFact = defineFact({
  id: "legacy-gate-ignore-sites",
  population: GATE_IGNORE_POPULATION,
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const spans = new Map<SourceFile, [number, number][]>();
    return {
      visitFile: (sourceFile) => {
        spans.set(sourceFile, []);
      },
      visitors: [
        {
          kinds: [...GATE_IGNORE_MENTION_SPAN_KINDS],
          visit: (node: MorphNode, sourceFile) => {
            spans.get(sourceFile)?.push([node.getStart(), node.getEnd()]);
          },
        },
      ],
      finish: () => {
        const sites: GateIgnoreSite[] = [];
        for (const [sourceFile, literalSpans] of spans) {
          const file = ctx.relativePath(sourceFile);
          for (const { index, marker } of findGateIgnoreMarkersWithSpans(sourceFile, literalSpans)) {
            sites.push({ file, line: sourceFile.getLineAndColumnAtPos(index).line, marker });
          }
        }
        const receipt = { source: "legacy-gate-ignore-sites", members: spans.size };
        ctx.receipt({ kind: "population", ...receipt });
        return { sites, receipt };
      },
    };
  },
});

export function readGateIgnoreFacts(ctx: GatePolicyContext): GateIgnoreFacts {
  const facts = ctx.fact(gateIgnoreFact);
  ctx.receipt({ kind: "population", ...facts.receipt });
  return facts;
}
