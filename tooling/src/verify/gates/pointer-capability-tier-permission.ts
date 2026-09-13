import { defineGate } from "../contract/policy.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { liveHomeFiles, readUiTierFacts, tierOccurrences, UI_TIER_HOMES, uiTierPermissionFact } from "../lib/ui-tier-permissions.ts";

const HOME = UI_TIER_HOMES["pointer-capability"][0].path;
const OPERATION = "spell-pointer-capability-tier";
export const gate = defineGate({
  id: "pointer-capability-tier-permission",
  family: "ui-pointer-capability-tier",
  authority: "reviewed-grant",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiTierPermissionFact],
  resources: [],
  message: "reviewed shell permission for raw pointer capability variants",
  fix: "Keep the central grant while this exact home owns shell capability adaptation; otherwise remove it.",
  create: (ctx) => ({
    evaluate: () => {
      const facts = readUiTierFacts(ctx);
      const [anchor] = liveHomeFiles(facts, HOME);
      if (anchor === undefined) {
        return;
      }
      const hits = tierOccurrences(facts, "pointer-capability", HOME);
      reportReviewedGrantCandidates(
        ctx.report,
        [
          { node: anchor, subject: HOME, operation: OPERATION },
          ...hits.map((hit) => ({ node: hit.node, subject: HOME, operation: OPERATION, token: hit.token, offset: hit.offset })),
        ],
        {
          message: "the reviewed shell home is live and may spell capability variants.",
          unreadableMessage: "the reviewed shell home could not be read.",
          fix: "Move the operation outside the home or retire its central grant.",
        },
      );
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/app-shell/x.tsx":
          'export const x = <><div className="pointer-coarse:hidden" /><div className="pointer-fine:block" /></>;',
      },
      expect: { count: 1, messageIncludes: "line(s)" },
      grant: { subject: HOME, operation: OPERATION },
      why: "LEGACY mustPass[3] plus the N-hit prospective control: the live shell emits one grant candidate while folding every capability site",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/app-shell/x.ts": "export const clean = true;" },
      expect: { count: 1, messageIncludes: "line(s)" },
      grant: { subject: HOME, operation: OPERATION },
      why: "the zero-hit prospective control: a live shell earns exactly one candidate before any raw capability spelling exists",
    },
  ],
  mustPass: [{ mode: "source", files: { "packages/client/src/features/x/x.ts": "export const x = 1;" }, why: "no reviewed shell home is present" }],
});
