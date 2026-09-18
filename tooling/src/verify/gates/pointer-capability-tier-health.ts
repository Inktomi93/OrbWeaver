import { defineGate } from "../contract/policy.ts";
import { liveHomeFiles, readUiTierFacts, UI_TIER_HOMES, uiTierPermissionFact } from "../lib/ui-tier-permissions.ts";

const HOME = UI_TIER_HOMES["pointer-capability"][0].path;
export const gate = defineGate({
  id: "pointer-capability-tier-health",
  family: "ui-pointer-capability-tier",
  authority: "hard",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiTierPermissionFact],
  resources: [],
  message: "the reviewed shell home or feature-root census is missing. (tooling/src/verify/gates/GATE-AUTHORING.md)",
  create: (ctx) => ({
    evaluate: () => {
      const facts = readUiTierFacts(ctx);
      const anchor = ctx.files[0];
      if (anchor === undefined) {
        return;
      }
      if (facts.featureFiles > 0 && liveHomeFiles(facts, HOME).length === 0) {
        ctx.report.node(anchor, { message: `missing reviewed pointer-capability home: ${HOME}` });
      }
      if (facts.featureFiles === 0) {
        ctx.report.node(anchor, { message: "feature-root census is blind: packages/client/src/features/ resolved zero files" });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/main.tsx": "export const x = 1;" },
      expect: { count: 1, messageIncludes: "feature-root census" },
      why: "LEGACY mustFlag[3], hard blindness arm: a vanished feature root cannot also double-report the nested shell home",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/rpg/x.ts": "export const x = 1;" },
      expect: { count: 1, messageIncludes: "features/app-shell/" },
      why: "LEGACY mustFlag[4], hard home-health arm: features remain live while the reviewed shell home is missing",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/app-shell/x.ts": "export const x = 1;" },
      why: "LEGACY mustPass[3], hard half: the feature root and reviewed shell home exist with zero raw hits",
    },
  ],
});
