// Relative escapes from tooling source require a reviewed root-config import permission.
// Singleton: native dependency rules own internal tool boundaries; this policy judges authored relative escapes.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { resolveRelativeImport, TOOLING_PREFIX } from "../lib/tooling-import-door.ts";

const OPERATION = "root-config-import";

const MESSAGE =
  "a tooling module imports outside the tree by relative path — cross-package needs go through @orb/* package " +
  "specifiers; a repo-root CONFIG read whose data would otherwise be re-spelled is licensed by an exact reviewed " +
  "grant naming the consumer and the config (docs/law/Core-Tooling-Law.md §4.2).";
const FIX =
  "use an @orb/* specifier for anything outside tooling/, or record an exact reviewed grant `(consumer, root-config-import:<config>)` for a one-home config read.";

export const gate = defineGate({
  id: "tooling-root-config-import",
  family: "tooling-root-config-import",
  authority: "reviewed-grant",
  severity: "error",
  population: "@tooling",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node, sourceFile) => {
            if (!Node.isImportDeclaration(node)) {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            const resolved = resolveRelativeImport(subject, node.getModuleSpecifierValue());
            if (resolved === null || resolved.startsWith(TOOLING_PREFIX)) {
              return;
            }
            candidates.push({ node: node.getModuleSpecifier(), subject, operation: `${OPERATION}:${resolved}` });
          },
        },
      ],
      evaluate: () => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE });
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: { "tooling/src/aa/ops/x.ts": 'import { z } from "../../../../packages/kit/src/ids/index.ts";\nexport const x = z;\n' },
      expect: { count: 1, messageIncludes: "operation: root-config-import:packages/kit/src/ids/index.ts" },
      why: "a relative escape out of the tooling tree — cross-package is @orb/* specifiers only; the message carries the exact grant subject and operation, and no row licenses it",
    },
    {
      mode: "source",
      grant: { subject: "tooling/src/aa/ops/x.ts", operation: "root-config-import:knip.ts" },
      files: {
        "tooling/src/aa/ops/x.ts": 'import cfg from "../../../../knip.ts";\nexport const x = cfg;\n',
        "knip.ts": "export default { workspaces: {} };\n",
      },
      expect: { count: 1, messageIncludes: "Subject: tooling/src/aa/ops/x.ts, operation: root-config-import:knip.ts" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: a root-config read reds like any other escape and needs an exact grant; prodonly derives runtime entries from package manifests and has no grant, so a NEW production consumer of analysis-only knip.ts is a finding until someone reviews it",
    },
    {
      mode: "source",
      files: {
        "tooling/src/aa/ops/x.ts": 'import cfg from "../../../../knip.ts";\nimport { again } from "../../../../knip.ts";\nexport const x = [cfg, again];\n',
        "knip.ts": "export default { workspaces: {} };\nexport const again = 1;\n",
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two imports of the same config from one file are ONE `(subject, operation)` finding, because a reviewed grant licenses one identity and two matching findings would make the row OVER-BROAD and license neither",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tooling/src/aa/ops/x.ts": 'import { b } from "../../bb/index.ts";\nimport { u } from "../lib/util.ts";\nexport const x = [b, u];\n',
        "tooling/src/bb/index.ts": "export const b = 1;\n",
        "tooling/src/aa/lib/util.ts": "export const u = 1;\n",
      },
      why: "relative imports that stay INSIDE tooling/src/ are the ordinary sibling's question, never an escape. Dropping the prefix test reds this row",
    },
    {
      mode: "source",
      files: {
        "tooling/src/aa/ops/x.ts":
          'import { kit } from "@orb/kit";\nimport { posix } from "node:path";\nimport { b } from "#bb";\nexport const x = [kit, posix, b];\n',
      },
      why: "package, node: and `#<tool>` specifiers are not relative and are owned by the resolver and the cruiser — the reader answers null for them. UNFALSIFIABLE for THIS policy, documented rather than faked (guide §6.1's structurally-unfalsifiable classification): with the non-relative short-circuit deleted, `posix.join(dirname, \"#bb\")` lands INSIDE the importing directory and is never an escape, so no fixture can red this row through that cut — measured with `#bb`, `node:path` and `@orb/kit`. The fence is pinned by the ordinary sibling's cli.ts row, where the same unfenced join reads as cli internals",
    },
  ],
});
