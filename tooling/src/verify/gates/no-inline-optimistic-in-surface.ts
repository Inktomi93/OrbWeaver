// Optimistic-mutation plumbing (`cancelQueries` / `setQueryData`) belongs in `features/<x>/hooks/`, not a
// surface. Surfaces compose JSX; data plumbing drifts when it lives at the call site.
//
// THE SUBJECT IS THE QueryClient METHOD, resolved through the property symbol's declaration home. The
// legacy gate matched `expr.getName()` against the two method names, so ANY object with a `setQueryData`
// method — a local cache helper, a test double, another library's client — was the offense, and a computed
// spelling (`client["setQueryData"](…)`) was invisible. The manifest recorded exactly that: "method-name-only
// detection flags lookalikes and misses aliases/computed access".
//
// THREE ANSWERS: the query-core method is the finding; a proven different member passes; a member the
// checker cannot place is REPORTED as unreadable (GATE-AUTHORING §5, #944).
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyPackageMemberOrigin } from "../lib/project-home-origin.ts";
import { LOOKALIKE_HOME, tanstackQueryProof, vendorLookalikeProof } from "./_proof/client-vendors.ts";

const OPTIMISTIC_METHODS: ReadonlySet<string> = new Set(["cancelQueries", "setQueryData"]);
const QUERY_CORE = "@tanstack/query-core";
const SURFACES = "**/features/*/surfaces/**";

const MESSAGE =
  "Optimistic-mutation plumbing (`cancelQueries` / `setQueryData`) belongs in `features/<x>/hooks/`, not a surface. Surfaces compose JSX; data plumbing drifts when it lives at the call site. Use `optimisticOptions({queryClient, queryKey, merge, invalidateOnSettled})` from `features/_shared` (see docs/architecture/history/UI-Lib-TanStack-Query.md), OR extract a hook that wraps the inline pattern (the wide-TInput tRPC exception — see `use-star-toggle.ts`).";
const UNREADABLE =
  "this surface calls a member named `cancelQueries`/`setQueryData` whose receiver the checker cannot place, so whether it is TanStack Query's client CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";

/** The method name a call's callee reads, across dotted and computed-literal spellings. */
function calledMemberName(callee: MorphNode): string | undefined {
  if (Node.isPropertyAccessExpression(callee)) {
    return callee.getName();
  }
  if (!Node.isElementAccessExpression(callee)) {
    return;
  }
  const argument = callee.getArgumentExpression();
  return argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) ? argument.getLiteralText() : undefined;
}

export const gate = defineGate({
  id: "no-inline-optimistic-in-surface",
  family: "tanstack-query-origin",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], under: [SURFACES] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "move the plumbing into features/<x>/hooks/ behind optimisticOptions(), or extract a hook that wraps it.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node): void => {
          if (!Node.isCallExpression(node)) {
            return;
          }
          const callee = node.getExpression();
          const name = calledMemberName(callee);
          if (name === undefined || !OPTIMISTIC_METHODS.has(name)) {
            return;
          }
          // THE CAST AXIS is why this goes through the shared reader rather than asking the property symbol
          // directly: a cast declares the method in its OWN type literal, so
          // `(useQueryClient() as { setQueryData(…): void }).setQueryData(…)` read as a proven different
          // identity and passed. `classifyPackageMemberOrigin` asks the UNCAST receiver as well, which the
          // cast cannot change (`lib/project-home-origin.ts`, shared with the sanctioned-home client family).
          const verdict = classifyPackageMemberOrigin(callee, [QUERY_CORE]);
          if (verdict === "other") {
            return;
          }
          const offset = Math.max(callee.getText().lastIndexOf(name), 0);
          ctx.report.node(callee, { ...(verdict === "unreadable" ? { message: UNREADABLE } : {}), token: name, offset });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function Surface(): void {\n  const queryClient = useQueryClient();\n  queryClient.setQueryData(["key"], 1);\n}\n',
      },
      expect: { count: 1, token: "setQueryData" },
      why: "the founding shape — optimistic plumbing written at a surface call site instead of in the feature's hooks/",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport async function Surface(): Promise<void> {\n  const queryClient = useQueryClient();\n  await queryClient.cancelQueries();\n  queryClient.setQueryData(["key"], 1);\n}\n',
      },
      expect: { count: 2 },
      why: "both halves of the recipe are their own finding — the verdict is per occurrence, so each gets its own waiver position",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function Surface(): void {\n  const queryClient = useQueryClient();\n  queryClient["setQueryData"](["key"], 1);\n}\n',
      },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL spelling of the same method — an ElementAccess callee is not a PropertyAccess, so the legacy `getName()` check was offered nothing it recognised (#1506)",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/cast-surface.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function Surface(): void {\n  (useQueryClient() as { setQueryData(key: unknown, value: unknown): void }).setQueryData(["key"], 1);\n}\n',
      },
      expect: { count: 1, token: "setQueryData" },
      why: "THE CAST DODGE: a cast declares the method in its own type literal, so asking the property symbol alone answered 'a proven different identity' and this surface passed while its uncast twin reported. The receiver is still `useQueryClient()` — the shared reader asks it (found by the #1584 sanctioned-home client family's review, which shares this reader)",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          'declare function opaque(): any;\nexport function Surface(): void {\n  opaque().setQueryData(["key"], 1);\n}\n',
      },
      expect: { count: 1, token: "setQueryData", messageIncludes: "CANNOT be established" },
      why: "#1990/D1 — THE UNREADABLE ARM, PROVEN: the receiver is opaque (`any`-typed), so `classifyPackageMemberOrigin` cannot place `setQueryData` and refuses. Reported rather than passed (#944)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/hooks/some-hook.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function useThing(): void {\n  const queryClient = useQueryClient();\n  queryClient.setQueryData(["key"], 1);\n}\n',
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          'import { useThing } from "../hooks/some-hook.ts";\nexport function Surface(): void {\n  useThing();\n}\n',
      },
      why: "SCOPE plus the sanctioned shape: the same plumbing in hooks/ is outside the population, and the surface that calls the hook writes none of it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          "interface LocalCache {\n  setQueryData(key: string, value: unknown): void;\n}\nexport function Surface(cache: LocalCache): void {\n  cache.setQueryData('key', 1);\n}\n",
      },
      why: "SAME METHOD NAME, LOCAL TYPE: a project interface with a `setQueryData` method is not TanStack Query's client. The legacy name-only check RED this, which is the false-positive half the manifest recorded",
    },
    {
      mode: "types",
      files: {
        ...vendorLookalikeProof(),
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          'import { useQueryClient } from "vendor-lookalike";\nexport function Surface(): void {\n  useQueryClient().setQueryData("key", 1);\n}\n',
      },
      why: `SAME METHOD NAME, WRONG PACKAGE: another library's client declared in ${LOOKALIKE_HOME} is not the cache this law fences, and only the declaring package can say so`,
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function Surface(): void {\n  const queryClient = useQueryClient();\n  // @orb-waive no-inline-optimistic-in-surface(setQueryData): the proof\'s stand-in reason; ends when this fixture stops flagging.\n  queryClient.setQueryData(["key"], 1);\n}\n',
      },
      why: "POSITIONAL IDENTITY: the report anchors the CALLEE with `token: name, offset: callee.getText().lastIndexOf(name)`, so an author waives the query-core METHOD NAME (`setQueryData`) at its own occurrence — never the receiver binding, and each of the two methods keeps its own position. The fixture is mustFlag[0] (:80, count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function Surface(): void {\n  const queryClient = useQueryClient();\n  queryClient.invalidateQueries();\n}\n',
      },
      why: "#1999 — THE TWO-METHOD SET FENCE, PINNED: `OPTIMISTIC_METHODS` (:18) admits only `cancelQueries`/`setQueryData`; `invalidateQueries` is a real QueryClient member declared by the same package, outside that set, and must pass untouched. Cutting `!OPTIMISTIC_METHODS.has(name)` at :61 turns this red",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/some-surface.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nconst setQueryData = "not-a-key";\nexport function Surface(): void {\n  const queryClient = useQueryClient();\n  queryClient[setQueryData](["key"], 1);\n}\n',
      },
      why: "#1999 — THE COMPUTED-KEY LITERAL FENCE, PINNED: `calledMemberName` (:28-37) reads a member name off an ElementAccess only when the key is a StringLiteral/NoSubstitutionTemplateLiteral; an IDENTIFIER key is not one, even when its own spelling happens to read `setQueryData` — that identifier names a runtime value, not the method. Cutting the literal-kind check and taking `argument.getText()` unconditionally would read this unrelated identifier's text as the member name and misreport it",
    },
  ],
});
