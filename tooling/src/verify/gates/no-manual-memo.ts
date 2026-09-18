// Policy: no-manual-memo — React Compiler full-compile makes hand-written useMemo/useCallback/memo
// redundant except at three reviewed, recurring subjects. React identity is resolved canonically through
// lib/react-origin.ts; aliases, namespace members, computed members and re-export doors remain the same API.
// Findings aggregate by (file, manual-react-memo), preserving the legacy file-grant cardinality.
import type { Node as MorphNode } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { reactExportVisitors } from "../lib/react-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { REACT_LOOKALIKE_HOME, REACT_TYPES_HOME, reactLookalikeProofModule, reactProofModule } from "./_proof/react.ts";

const EXPORTS = ["useMemo", "useCallback", "memo"] as const;
const OPERATION = "manual-react-memo";
const MESSAGE =
  "manual React memoization in compiler-managed code. The React Compiler already memoizes compiled components and hooks; a dependency array adds maintenance and can re-arm effects. (tooling/src/verify/gates/GATE-AUTHORING.md)";
const FIX =
  "delete the manual memo. A recurring exception needs an exact reviewed grant in tooling/src/verify/lib/reviewed-grants.ts; inline waivers cannot grant this policy.";
const UNREADABLE =
  "this reference is spelled like a banned React memo export but its canonical origin cannot be established. It is reported rather than passed because it may still be React's API. (tooling/src/verify/gates/GATE-AUTHORING.md)";

function position(node: MorphNode, exportedName: string): { readonly token: string; readonly offset: number } | undefined {
  const offset = node.getText().lastIndexOf(exportedName);
  return offset < 0 ? undefined : { token: exportedName, offset };
}

export const gate = defineGate({
  id: "no-manual-memo",
  family: "react-origin",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@client", "@ui", "@tests"],
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: EXPORTS.flatMap((exportedName) =>
        reactExportVisitors(exportedName, (node, verdict) => {
          candidates.push({
            node,
            subject: ctx.relativePath(node.getSourceFile()),
            operation: OPERATION,
            unreadable: verdict === "unreadable",
            ...position(node, exportedName),
          });
        }),
      ),
      evaluate: (): void => {
        reportReviewedGrantCandidates(ctx.report, candidates, {
          message: MESSAGE,
          fix: FIX,
          unreadableMessage: UNREADABLE,
        });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/features/x/components/x.tsx": 'import { useMemo } from "react";\nexport const v = useMemo(() => 1, []);\n',
      },
      expect: { count: 1, token: "useMemo" },
      grant: { subject: "packages/client/src/features/x/components/x.tsx", operation: OPERATION },
      why: "the founding named-import shape; the door and call aggregate to the one file-level reviewed act",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/features/x/components/x.tsx": 'import { useCallback as cb } from "react";\nexport const v = cb(() => 1, []);\n',
      },
      expect: { count: 1 },
      why: "an import alias remains React's useCallback and cannot escape the policy",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import * as R from "react";\nexport const C = R.memo(() => null);\n',
      },
      expect: { count: 1 },
      why: "a namespace member is resolved by origin instead of the legacy React-dot text spelling",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import { memo } from "react";\nexport const C = memo(() => null);\n',
      },
      expect: { count: 1, token: "memo" },
      why: "the component-level memo export is the same compiler-redundant operation",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/features/x/components/x.tsx": 'import React from "react";\nexport const v = React.useCallback(() => 1, []);\n',
      },
      expect: { count: 1, token: "useCallback" },
      why: "the legacy default-object member arm remains covered",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/shim.ts": 'export { useMemo } from "react";\n',
        "packages/client/src/features/x/components/x.tsx": 'import { useMemo as cache } from "../../../shim.ts";\nexport const v = cache(() => 1, []);\n',
      },
      expect: { count: 1 },
      why: "a project re-export preserves the canonical React export identity",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import * as R from "react";\nexport const v = R.useMemo;\n',
      },
      expect: { count: 1, token: "useMemo" },
      why: "THE NAMESPACE MEMBER IN A NON-CALLEE POSITION (#2353): `reactExportVisitors` subscribed `ImportSpecifier` + `CallExpression`, and a namespace import produces no specifier while a bare reference is no call — so NO visitor ever received this node and the namespace respelling of the unresolved-candidate row below stopped flagging. The member door is the third visitor, narrowed by the export NAME so the fail-closed `unreadable` verdict cannot spread to unrelated members of a React namespace binding",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/x/components/x.tsx": 'import { useMemo } from "./missing.ts";\nexport const v = useMemo;\n' },
      expect: { count: 1, messageIncludes: "cannot be established" },
      why: "an unresolved candidate fails closed rather than becoming a silent pass",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/fuzzy-search/fuzzy-search.ts": 'import { useMemo } from "react";\nexport const index = useMemo(() => 1, []);\n',
      },
      expect: { count: 1 },
      grant: { subject: "packages/ui/src/fuzzy-search/fuzzy-search.ts", operation: OPERATION },
      why: "the value-keyed MiniSearch permission is exact and remains live only while this subject emits the operation",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/primitives/media-grid/media-grid.tsx": 'import { useMemo } from "react";\nexport const grid = useMemo(() => 1, []);\n',
      },
      expect: { count: 1 },
      grant: { subject: "packages/ui/src/primitives/media-grid/media-grid.tsx", operation: OPERATION },
      why: "the virtualizer media-grid permission binds the exact file and operation",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/primitives/message-list/message-list.tsx": 'import { useCallback } from "react";\nexport const row = useCallback(() => 1, []);\n',
      },
      expect: { count: 1 },
      grant: { subject: "packages/ui/src/primitives/message-list/message-list.tsx", operation: OPERATION },
      why: "the virtualizer message-list permission binds the exact file and operation",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [REACT_LOOKALIKE_HOME]: reactLookalikeProofModule(),
        "packages/client/src/features/x/components/x.tsx": 'import { useMemo } from "not-react";\nexport const v = useMemo(() => 1, []);\n',
      },
      why: "the same export name from another package is a different identity",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/local-memo.ts": "export const memo = (value: number): number => value;\n",
        "packages/client/src/features/x/components/x.tsx": 'import { memo } from "../../../local-memo.ts";\nexport const v = memo(1);\n',
      },
      why: "memo imported from a project module is somebody else's function",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/ui/src/x/x.tsx": 'import * as R from "react";\nexport const v = R.useState;\n',
      },
      why: "THE ACQUITTING HALF OF THE MEMBER DOOR (#2353): the third visitor is narrowed to reads whose member NAME is one of this policy's exports, so an unrelated member of the same React namespace binding is not even a candidate. Drop that name prefilter and every `R.<anything>` becomes a resolution attempt whose refusals report as `unreadable` — a blind spot traded for a false positive",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/components/x.tsx":
          'import { useShallow } from "zustand/react/shallow";\nexport const sel = useShallow((s: { a: number }) => s.a);\n',
      },
      why: "the sanctioned Zustand selector-stability helper is outside the React memo export set",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/components/x.tsx":
          "function useCallback(fn: () => void): void { fn(); }\nexport const v = useCallback(() => undefined);\n",
      },
      why: "a file-local helper is provably not React's API",
    },
  ],
});
