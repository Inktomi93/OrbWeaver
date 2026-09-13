import { defineGate } from "../contract/policy.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { liveHomeFiles, readUiTierFacts, tierOccurrences, UI_TIER_HOMES, uiTierPermissionFact } from "../lib/ui-tier-permissions.ts";

const HOME = UI_TIER_HOMES["skin-fragment"][0].path;
const OPERATION = "spell-skin-fragment-tier";
export const gate = defineGate({
  id: "skin-fragment-tier-permission",
  family: "ui-skin-fragment-tier",
  authority: "reviewed-grant",
  severity: "error",
  population: "@ui",
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiTierPermissionFact],
  resources: [],
  message: "reviewed skin-fragment definition-home permission",
  fix: "Keep the central grant while this exact home defines the fragment tier; otherwise remove it.",
  create: (ctx) => ({
    evaluate: () => {
      const facts = readUiTierFacts(ctx);
      const [anchor] = liveHomeFiles(facts, HOME);
      if (anchor === undefined) {
        return;
      }
      const hits = tierOccurrences(facts, "skin-fragment", HOME);
      reportReviewedGrantCandidates(
        ctx.report,
        [
          { node: anchor, subject: HOME, operation: OPERATION },
          ...hits.map((hit) => ({ node: hit.node, subject: HOME, operation: OPERATION, token: hit.token, offset: hit.offset })),
        ],
        {
          message: "the reviewed home is live and may define the tier vocabulary.",
          unreadableMessage: "the reviewed home could not be read.",
          fix: "Move the operation outside the home or retire its central grant.",
        },
      );
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/lib/x.ts": 'export const x = "bg-backdrop";' },
      expect: { count: 1, messageIncludes: "line(s)" },
      grant: { subject: HOME, operation: OPERATION },
      why: "one live home emits one grant candidate while folding its raw sites",
    },
  ],
  mustPass: [{ mode: "source", files: { "packages/ui/src/primitives/x.ts": "export const x = 1;" }, why: "no reviewed home is present" }],
});
