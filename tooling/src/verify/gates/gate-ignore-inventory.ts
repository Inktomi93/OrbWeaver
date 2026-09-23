// Policy: gate-ignore-inventory — the Phase-F residue owner for the retired `@orb-gate-ignore` grammar.
// Final policies have only central ordinary waivers, reviewed grants, or hard authority; a legacy marker can
// bind no final owner and must not remain looking like protection. Every real marker comment is therefore a
// hard finding. The shared fact retains the historical mention fence so fixture strings and prose quotations
// remain inert, while malformed/registered/consumed distinctions retire with the legacy suppressor.
//
// POPULATION PORT: the legacy scanRoot admitted packages, tests, and all tooling/src TypeScript sources. The
// final authored population spells the same three roots. The policy is entire-population because residue is a
// whole-workspace claim; narrowed requests defer it rather than certifying an incomplete marker census.
import { defineGate } from "../contract/policy.ts";
import { GATE_IGNORE_POPULATION, gateIgnoreFact, readGateIgnoreFacts } from "../lib/gate-ignore-fact.ts";

const MESSAGE =
  "a dead `@orb-gate-ignore` marker remains in authored source. It cannot bind a final policy and reads like protection it no longer provides. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX =
  "delete the legacy marker. If the occurrence is still permitted, use the final owner's exact `@orb-waive` spelling or add a reviewed grant through the central table, according to that policy's authority.";

export const gate = defineGate({
  id: "gate-ignore-inventory",
  family: "gate-ignore-inventory",
  authority: "hard",
  severity: "error",
  population: GATE_IGNORE_POPULATION,
  analysis: "syntax",
  execution: "entire-population",
  facts: [gateIgnoreFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      for (const site of readGateIgnoreFacts(ctx).sites) {
        ctx.report.file(site.file, { line: site.line, column: 1, token: site.marker.gate, message: MESSAGE, fix: FIX });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore no-such-gate: retired marker\nexport const x = 1;\n",
      },
      expect: { count: 1, line: 1, token: "no-such-gate" },
      why: "an attempted marker naming no owner remains visible as retired residue",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/x.ts": "// @orb-gate-ignore old-gate(position): retired marker\nexport const x = 1;\n",
      },
      expect: { count: 1, line: 1, token: "old-gate" },
      why: "the gate corpus is part of the marker-bearing surface",
    },
    {
      mode: "source",
      files: {
        "tooling/src/stack/lib/x.ts": "export const x = 1; // @orb-gate-ignore old-gate: trailing residue\n",
      },
      expect: { count: 1, line: 1, token: "old-gate" },
      why: "a trailing marker is a real comment opener and remains visible",
    },
    {
      mode: "source",
      files: {
        "packages/showcase-plugins/src/index.ts": "// @orb-gate-ignore old-gate: showcase residue\nexport const plugin = true;\n",
      },
      expect: { count: 1, line: 1, token: "old-gate" },
      why: "the legacy packages/<member>/src scan included the showcase workspace; the shipped-package classification keeps that workspace inside @authored",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/tooling/x.ts": 'export const fixture = "// @orb-gate-ignore no-such-gate: text";\n',
      },
      why: "a spelling inside a string literal is fixture data, not a marker",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/x.ts": "// the retired grammar was `// @orb-gate-ignore old-gate(position): <reason>`\nexport const x = 1;\n",
      },
      why: "a marker quotation later in prose is a mention under the historical fence",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/x.ts": "export const x = 1;\n" },
      why: "authored source with no legacy marker is clean",
    },
  ],
});
