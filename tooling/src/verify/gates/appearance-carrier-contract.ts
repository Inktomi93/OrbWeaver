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
  message: "Appearance carrier graph drift: a manifest key has no executable carrier declaration.",
  fix: "declare the key's carrier without flattening the theme/custom-CSS planes",
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
  ],
});
