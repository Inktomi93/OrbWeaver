import { defineGate } from "../contract/policy.ts";
import { liveHomeFiles, readUiTierFacts, UI_TIER_HOMES, uiTierPermissionFact } from "../lib/ui-tier-permissions.ts";

const HOME = UI_TIER_HOMES["skin-fragment"][0].path;
export const gate = defineGate({
  id: "skin-fragment-tier-health",
  family: "ui-skin-fragment-tier",
  authority: "hard",
  severity: "error",
  population: "@ui",
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiTierPermissionFact],
  resources: [],
  message: "the reviewed skin-fragment definition home is missing.",
  create: (ctx) => ({
    evaluate: () => {
      const facts = readUiTierFacts(ctx);
      const anchor = ctx.files[0];
      if (anchor !== undefined && liveHomeFiles(facts, HOME).length === 0) {
        ctx.report.node(anchor, { message: `missing reviewed skin-fragment home: ${HOME}` });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/primitives/x.ts": "export const x = 1;" },
      expect: { count: 1, messageIncludes: "packages/ui/src/lib/" },
      why: "LEGACY mustFlag[3], hard home-health arm: the reviewed definition home is missing",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/lib/x.ts": "export const x = 1;" },
      why: "LEGACY mustPass[2], hard half: the reviewed home exists even with zero raw hits",
    },
  ],
});
