// Hard vocabulary half of the floorless-control family. Its acquired source anchor replaces the legacy
// out-of-population self-file report; comments cannot keep removed sizes or the pseudo token alive.
import { defineGate } from "../contract/policy.ts";
import { floorlessControlFact } from "../lib/floorless-control-fact.ts";
export const gate = defineGate({
  id: "floorless-control-vocabulary-health",
  family: "floorless-control",
  authority: "hard",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [floorlessControlFact],
  resources: [],
  message: "the floorless Button vocabulary no longer matches its declaring source",
  create: (ctx) => ({
    evaluate: () => {
      const fact = ctx.fact(floorlessControlFact);
      ctx.receipt({ kind: "population", source: "floorless-control-sources", members: fact.sources });
      for (const hit of fact.health) {
        ctx.report.node(hit.node, { message: hit.message });
      }
    },
  }),
  mustFlag: [
    {
      files: {
        "packages/ui/src/primitives/button/variants.ts": "export const buttonVariants = { size: { sm: 'h-control-sm' } };\n",
      },
      expect: {
        count: 6,
        messageIncludes: "no longer",
      },
      why: "the §4.6 blindness tripwire: the declaring variants file lost every floorless key AND the touch-target pseudo — five key reds + one pseudo red, never silent green",
      mode: "source",
    },
    {
      files: {
        "packages/ui/src/primitives/button/variants.ts":
          "// The floorless arms — inline, glyph-xs, glyph-sm, glyph-md, glyph-lg — rode the ::after touch-target.\nexport const buttonVariants = { size: { sm: 'h-control-sm' } };\n",
      },
      expect: {
        count: 6,
        messageIncludes: "no longer",
      },
      why: "COMMENT POSTURE (issue #117/#132): the tripwire reads CODE, so a HISTORY comment listing the deleted arms (the most natural thing to leave behind when you delete them) cannot report the vocabulary healthy. A rot tripwire satisfied by prose is worse than no tripwire — it reports ✓ over a dead gate",
      mode: "source",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/button/variants.ts":
          'export const size = {inline: "touch-target", "glyph-xs": "", "glyph-sm": "", "glyph-md": "", "glyph-lg": ""};',
      },
      why: "all legacy size keys and the overflow pseudo remain declared",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/clean.ts": "export const clean = true;",
      },
      why: "the legacy health arm only judges an acquired declaring file",
    },
  ],
});
