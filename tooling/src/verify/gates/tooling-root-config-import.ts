// Policy: tooling-root-config-import (docs/law/Core-Tooling-Law.md §4.2) — a tooling module that
// imports OUTSIDE the tooling tree by relative path. Cross-package needs go through `@orb/*` package
// specifiers; a repo-root CONFIG whose data would otherwise be re-spelled requires an exact reviewed grant.
// Prodonly derives runtime entries from package manifests and tool conventions; knip.ts stays analysis-only.
//
// AUTHORITY IS reviewed-grant, and that is the whole reason this arm has its own policy id (docs/history/gate-runtime-worked-cases-2026-09.md §"Mixed-hook arity amendments",
// #1950). The exception is not a per-occurrence mistake an author waives with a reason — it is a recurring
// repository PERMISSION: one exact `(subject, operation)` row in the central reviewed-grant table with its
// own `why` and `endsWhen`. After a complete run a row consumed zero times is STALE and a row matching more
// than one finding is OVER-BROAD and licenses nothing — the two-sided stale sweep is owned centrally.
// Nothing here subtracts a path from the population and this policy holds no allowlist of its own.
//
// FAMILY `tooling-front-door` — the shared reader is `lib/tooling-import-door.ts` (`resolveRelativeImport`),
// the same specifier resolution the ordinary sibling judges the tooling-internal boundary with.
//
// `entire-population` because grant liveness is only sound after a COMPLETE owner run: a narrowed request
// DEFERS this policy, which is what retires the legacy defect the retired int test pinned (a scoped run's
// `visit` never saw the row's consumer and called the live row stale — measured 2026-08-30) and the
// legacy `fileLoaded(exit-contract)` anchor guard with it. The knip fixture retains an ungranted `mustFlag`
// baseline; its authored witness proves synthetic exact-grant consumption, while the family test exercises
// real central grant identity and staleness through the live argv policy (§4.3).
//
// THE OPERATION CARRIES THE RESOLVED TARGET (`root-config-import:knip.ts`), so a grant licenses one
// consumer reading ONE config: a second root config imported by the same file is a second finding.
//
// POPULATION PORT: byte-identical (`@tooling`). Legacy descriptor: `1f5e25c00`
// (`tooling/src/verify/gates/tooling-front-door.ts`, the escape arm and the `ROOT_CONFIG_IMPORTS` sweep).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `tooling-front-door` descriptor at f1bbc34e7e6961bb5cbb607c17470a642e44a1ca, the parent of the conversion
// `e2b183b80`; this module did not exist there, so it is measured against the module it was carved from,
// `tooling-front-door` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `1f5e25c00` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,445 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,105 and final `population` admits 1,105.
// legacy − final = ∅. final − legacy = ∅. Controls: inside `tooling/src/_shared/__cbbhr_in_appearance-flags.ts`
// (virtual) admitted by both; outside `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by
// both.
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
  family: "tooling-front-door",
  authority: "reviewed-grant",
  severity: "error",
  population: "@tooling",
  analysis: "syntax",
  execution: "entire-population",
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
