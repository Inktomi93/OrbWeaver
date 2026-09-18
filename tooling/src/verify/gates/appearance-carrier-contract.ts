// An explicitly empty carrier declaration is an ordinary source occurrence. Graph integrity is
// independently enforced by appearance-carrier-health; both consume one shared appearance graph.
import { defineGate } from "../contract/policy.ts";
import { APPEARANCE_POPULATION, appearanceCarrierFact } from "../lib/appearance-carrier-fact.ts";
import { MANIFEST_FILE, SCHEMA_FILE } from "../lib/appearance-carrier-graph.ts";
export const gate = defineGate({
  id: "appearance-carrier-contract",
  family: "appearance-carrier",
  authority: "ordinary",
  severity: "error",
  population: APPEARANCE_POPULATION,
  analysis: "syntax",
  execution: "entire-population",
  facts: [appearanceCarrierFact],
  resources: [],
  message: "Appearance carrier graph drift: a manifest key has no executable carrier declaration. (tooling/src/verify/gates/GATE-AUTHORING.md)",
  fix:
    "declare the key's carrier without flattening the theme/custom-CSS planes; a deliberately empty carrier is " +
    "waived with `// @orb-waive appearance-carrier-contract(<key>): <reason>` on the line above the manifest " +
    "entry, where <key> is the bare (unquoted) manifest key name at the reported position, e.g. `width`.",
  create: (ctx) => ({
    evaluate: () => {
      const graph = ctx.fact(appearanceCarrierFact);
      ctx.receipt({ kind: "population", source: "appearance-carrier-sources", members: graph.sources });
      for (const hit of graph.occurrences) {
        ctx.report.node(hit.node, { token: hit.token, offset: hit.offset });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        [SCHEMA_FILE]: "export const appearanceSettingsSchema = z.object({ width: z.number() });",
        [MANIFEST_FILE]:
          'export const APPEARANCE_OWNER_KEYS={sizing:["width"]}; export const APPEARANCE_CARRIER_MANIFEST={width:{owner:"sizing",carriers:[]}};',
      },
      expect: { count: 1, token: "width" },
      why: "an empty carrier list retains its exact ordinary occurrence independently of graph health",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [SCHEMA_FILE]: "export const appearanceSettingsSchema = z.object({ width: z.number() });",
        [MANIFEST_FILE]:
          'export const APPEARANCE_OWNER_KEYS={sizing:["width"]}; export const APPEARANCE_CARRIER_MANIFEST={width:{owner:"sizing",carriers:["shell-grid"]}};',
      },
      why: "a nonempty carrier has no empty-list occurrence; its other obligations belong to graph health",
    },
    {
      mode: "source",
      files: {
        [SCHEMA_FILE]: "export const appearanceSettingsSchema = z.object({ width: z.number() });",
        [MANIFEST_FILE]:
          'export const APPEARANCE_OWNER_KEYS={sizing:["width"]};\n' +
          "// @orb-waive appearance-carrier-contract(width): reviewed empty carrier pending migration, tracked in #0000.\n" +
          'export const APPEARANCE_CARRIER_MANIFEST={width:{owner:"sizing",carriers:[]}};',
      },
      why:
        "the §6.2 positive identity arm: the correct marker at the exact reported bare token `width` suppresses " +
        "the twin of mustFlag[0] — one finding, one waived, zero effective findings, zero authority alarms",
    },
  ],
});
