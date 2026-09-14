// A diagnostic naming a missing repair home is no longer actionable. This is hard
// source health, independent of the ordinary draft occurrence and its waiver door.
import { defineGate } from "../contract/policy.ts";
import { DRAFT_DECISION_HOME, DRAFT_TREE_ANCHOR, draftDecisionHomeMissing } from "../lib/stale-draft-read.ts";

export const gate = defineGate({
  id: "stale-draft-decision-health",
  family: "draft-commit",
  authority: "hard",
  severity: "error",
  population: { in: ["@client", "@db"], under: [DRAFT_DECISION_HOME, DRAFT_TREE_ANCHOR] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: "the draft decision home no longer resolves; restore packages/client/src/lib/edit-session.ts or retarget the diagnostic and remedy.",
  fix: "restore the EditSession/resolveCommit home or update the draft family to its replacement and preserve the concurrent-writer behavior.",
  create: (ctx) => ({
    evaluate: () => {
      const paths = new Set(ctx.files.map(ctx.relativePath));
      ctx.receipt({ kind: "population", source: "draft-decision-health-sources", members: paths.size });
      if (draftDecisionHomeMissing(paths)) {
        ctx.report.file(DRAFT_TREE_ANCHOR, { line: 1 });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/db/src/schema/index.ts": "export {};" },
      expect: { count: 1, line: 1 },
      why: "the real-tree source anchor remains but the diagnostic's repair home disappeared",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/db/src/schema/index.ts": "export {};",
        "packages/client/src/lib/edit-session.ts": "export {};",
      },
      why: "the decision home is still present beside the real-tree source anchor",
    },
    {
      mode: "source",
      files: { "packages/client/src/lib/edit-session.ts": "export {};" },
      why: "a partial source fixture without the real-tree anchor does not establish a missing-home claim",
    },
  ],
});
