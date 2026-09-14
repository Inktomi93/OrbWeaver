// Appearance schema/owner/consumer/lifecycle integrity cannot be licensed by a source waiver.
import { defineGate } from "../contract/policy.ts";
import { APPEARANCE_POPULATION, appearanceCarrierFact } from "../lib/appearance-carrier-fact.ts";
import { MANIFEST_FILE, SCHEMA_FILE } from "../lib/appearance-carrier-graph.ts";
export const gate = defineGate({
  id: "appearance-carrier-health",
  family: "appearance-carrier",
  authority: "hard",
  severity: "error",
  population: APPEARANCE_POPULATION,
  analysis: "syntax",
  execution: "entire-population",
  facts: [appearanceCarrierFact],
  resources: [],
  message:
    "Appearance carrier graph drift: schema, editor owner, carrier, live consumer, or first-frame parity no longer agrees with the canonical 41-key manifest (client-architecture-lockdown.md §4).",
  fix: `repair ${MANIFEST_FILE} and the named live binding together; do not flatten the theme/custom-CSS planes`,
  create: (ctx) => ({
    evaluate: () => {
      const graph = ctx.fact(appearanceCarrierFact);
      ctx.receipt({ kind: "population", source: "appearance-carrier-sources", members: graph.sources });
      if (graph.keys > 0) {
        ctx.receipt({ kind: "population", source: "appearance-schema-keys", members: graph.keys });
      }
      for (const finding of graph.health) {
        ctx.report.file(MANIFEST_FILE, finding);
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        [SCHEMA_FILE]: 'import { z } from "zod"; export const appearanceSettingsSchema = z.object({ ghost: z.boolean() });',
        [MANIFEST_FILE]: "export const APPEARANCE_OWNER_KEYS = { sizing: [] }; export const APPEARANCE_CARRIER_MANIFEST = {};",
      },
      expect: { count: 2, messageIncludes: "schema↔manifest: missing ghost" },
      why: "missing-carrier control: a new schema leaf cannot exist outside the manifest",
    },
    {
      mode: "source",
      files: {
        [SCHEMA_FILE]: 'import { z } from "zod"; export const appearanceSettingsSchema = z.object({ density: z.string() });',
        [MANIFEST_FILE]:
          'const C={file:"packages/client/src/x.ts",symbol:"AppShell"}; export const APPEARANCE_OWNER_KEYS={sizing:["density"]}; export const APPEARANCE_CARRIER_MANIFEST={density:{owner:"effects",carriers:["theme-scope"],consumer:C,lifecycle:"hydrated-from-prepaint-hint",portal:"shared-theme-scope-sibling",requiredDistinctArms:["compact","comfortable"]}}; export const APPEARANCE_CARRIER_OBSERVABLES={density:{kind:"attribute",selector:"x",signal:"data-density"}};',
        "packages/client/src/x.ts": "export function AppShell(){ const density = 1; return density; }",
      },
      expect: { count: 1, messageIncludes: "wrong owner for density" },
      why: "wrong-owner control: a valid key assigned to the wrong editor group is red",
    },
    {
      mode: "source",
      files: {
        [SCHEMA_FILE]: 'import { z } from "zod"; export const appearanceSettingsSchema = z.object({ density: z.string() });',
        [MANIFEST_FILE]:
          'const C={file:"packages/client/src/x.ts",symbol:"AppShell"}; export const APPEARANCE_OWNER_KEYS={sizing:["density"]}; export const APPEARANCE_CARRIER_MANIFEST={density:{owner:"sizing",carriers:["theme-scope"],consumer:C,lifecycle:"hydrated-from-prepaint-hint",portal:"grid-only",requiredDistinctArms:["compact","compact"]}}; export const APPEARANCE_CARRIER_OBSERVABLES={density:{kind:"attribute",selector:"x",signal:"data-density"}};',
        "packages/client/src/x.ts": "export function AppShell(){ const other = 1; return other; }",
      },
      expect: { count: 3 },
      why: "equal-arm + wrong-carrier + live-binding controls all bite the same composed bad row",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [SCHEMA_FILE]: 'import { z } from "zod"; export const appearanceSettingsSchema = z.object({ width: z.number() });',
        [MANIFEST_FILE]:
          'const C={file:"packages/client/src/x.ts",symbol:"AppShell"}; export const APPEARANCE_OWNER_KEYS={sizing:["width"]}; export const APPEARANCE_CARRIER_MANIFEST={width:{owner:"sizing",carriers:["shell-grid"],consumer:C,lifecycle:"hydrated",portal:"grid-only",requiredDistinctArms:[60,90]}}; export const APPEARANCE_CARRIER_OBSERVABLES={width:{kind:"inline-style",selector:"x",signal:"--width"}};',
        "packages/client/src/x.ts": "export function AppShell(){ const width = 90; return width; }",
      },
      why: "one schema leaf, its owner, a legal carrier/portal pair, distinct arms, and a live named consumer all agree",
    },
  ],
});
