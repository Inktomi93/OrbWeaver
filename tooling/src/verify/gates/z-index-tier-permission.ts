import { defineGate } from "../contract/policy.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { liveHomeFiles, readUiTierFacts, tierOccurrences, UI_TIER_HOMES, uiTierPermissionFact } from "../lib/ui-tier-permissions.ts";

const OPERATION = "spell-z-index-tier";
export const gate = defineGate({
  id: "z-index-tier-permission",
  family: "ui-z-index-tier",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [uiTierPermissionFact],
  resources: [],
  message: "reviewed z-index implementation home permission (tooling/src/verify/gates/GATE-AUTHORING.md)",
  fix: "Keep the central grant while this exact home implements the z-index tier; otherwise remove it.",
  create: (ctx) => ({
    evaluate: () => {
      const facts = readUiTierFacts(ctx);
      for (const { path } of UI_TIER_HOMES["z-index"]) {
        const [anchor] = liveHomeFiles(facts, path);
        if (anchor === undefined) {
          continue;
        }
        const hits = tierOccurrences(facts, "z-index", path);
        reportReviewedGrantCandidates(
          ctx.report,
          [
            { node: anchor, subject: path, operation: OPERATION },
            ...hits.map((hit) => ({ node: hit.node, subject: path, operation: OPERATION, token: hit.token, offset: hit.offset })),
          ],
          {
            message: "the reviewed home is live and may spell the tier vocabulary. (tooling/src/verify/gates/GATE-AUTHORING.md)",
            unreadableMessage: "the reviewed home could not be read. (tooling/src/verify/gates/GATE-AUTHORING.md)",
            fix: "Move the operation outside the home or retire its central grant.",
          },
        );
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/layout/x.tsx": 'export const x = <><div className="z-50" /><div className="z-[60]" /></>;' },
      expect: { count: 1, messageIncludes: "line(s)" },
      grant: { subject: "packages/ui/src/layout/", operation: OPERATION },
      why: "LEGACY mustPass[1] plus the N-hit prospective control: one live layout home emits one grant candidate while folding every raw site",
    },
    {
      mode: "source",
      files: { "packages/ui/src/markdown/x.ts": "export const clean = true;" },
      expect: { count: 1, messageIncludes: "line(s)" },
      grant: { subject: "packages/ui/src/markdown/", operation: OPERATION },
      why: "the zero-hit prospective control: a live reviewed markdown home emits exactly one semantic candidate before it authors any raw occurrence",
    },
  ],
  mustPass: [{ mode: "source", files: { "packages/client/src/x.ts": "export const x = 1;" }, why: "no reviewed home is present" }],
});
