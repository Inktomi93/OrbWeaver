// Policy: client-cache-surgery-only-in-data (UI-Gates-and-Lessons.md §11.3) — imperative QueryClient cache
// calls belong to the central `data/` seam. `invalidate(event)`/`invalidateFilters` and
// `createEntityMutation` ARE those calls; a loose one at a feature call site recreates neo's 81-site
// invalidation sprawl.
//
// AUTHORITY IS reviewed-grant. The seam's own imperative calls are a recurring repository PERMISSION — the
// seam cannot violate its own rule — so `data/` is SCANNED, each of its calls reds like any other, and each
// is licensed by one exact `(subject, operation)` row in `lib/reviewed-grants.ts`. The legacy shape was a
// DIRECTORY row in a local `SANCTIONED_HOMES` table plus a rename tripwire the gate implemented itself; both
// are gone. The central table's own liveness is stronger than the tripwire was: a directory row could not
// tell that the seam had stopped making a particular call, while a per-`(file, operation)` row that matches
// nothing after a complete run is STALE, and one that matches two findings is OVER-BROAD and licenses none.
//
// IDENTITY, NOT SPELLING. The legacy check was `expr.getName()` against six method names, so ANY receiver
// with one of them — a local cache helper, a test double, another library's client — was the offense, and
// `client["setQueryData"](…)` was invisible. The subject is the METHOD DECLARED BY `@tanstack/query-core`,
// resolved off the receiver's type (the receiver is minted by `useQueryClient()`, which the value walk
// correctly refuses as a dynamic terminal) — and, because a CAST replaces that declaration with one in the
// cast's own type literal, off the UNCAST receiver as well. Both axes live in `lib/project-home-origin.ts`
// so the whole family is fixed at once; a value with no real type behind the cast is the declared limit.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyPackageMemberOrigin } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { LOOKALIKE_HOME, tanstackQueryProof, vendorLookalikeProof } from "./_proof/client-vendors.ts";

const METHODS: ReadonlySet<string> = new Set(["invalidateQueries", "setQueryData", "cancelQueries", "getQueryData", "removeQueries", "resetQueries"]);
const QUERY_CORE = "@tanstack/query-core";
const OPERATION_PREFIX = "cache-surgery";

const MESSAGE =
  "an imperative QueryClient cache call outside the client `data/` seam — invalidation goes through " +
  "data/invalidation.ts (`invalidate(event)`/`invalidateFilters`) and optimistic writes through " +
  "`createEntityMutation`. A loose cache call here recreates neo's 81-site invalidation sprawl " +
  "(UI-Gates-and-Lessons.md §11.3).";
const UNREADABLE =
  "this call names an imperative cache method whose receiver the checker cannot place, so whether it is TanStack Query's client CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const FIX =
  "route the write through data/invalidation.ts or createEntityMutation; a genuine seam-owned call is licensed by an exact reviewed grant row keyed on (file, operation).";

/** The method name a callee reads, across dotted and computed-literal spellings. */
function calledMemberName(callee: MorphNode): string | null {
  let name: string | null = null;
  if (Node.isPropertyAccessExpression(callee)) {
    name = callee.getName();
  }
  if (Node.isElementAccessExpression(callee)) {
    const argument = callee.getArgumentExpression();
    const literal = argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument));
    name = literal ? argument.getLiteralText() : null;
  }
  return name;
}

export const gate = defineGate({
  id: "client-cache-surgery-only-in-data",
  family: "tanstack-query-origin",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy predicate: every client source file except test/spec files. The seam is NOT subtracted — a
  // sanctioned home is a grant, never population subtraction. `entire-population` because grant liveness is
  // a whole-population verdict: a narrowed selection would stale every row it did not happen to carry.
  population: { in: ["@client"], notNamed: ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"] },
  analysis: "types",
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
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            const name = calledMemberName(callee);
            if (name === null || !METHODS.has(name)) {
              return;
            }
            const verdict = classifyPackageMemberOrigin(callee, [QUERY_CORE]);
            if (verdict === "other") {
              return;
            }
            candidates.push({
              node: callee,
              subject: ctx.relativePath(sourceFile),
              operation: `${OPERATION_PREFIX}:${name}`,
              unreadable: verdict === "unreadable",
              token: name,
              offset: Math.max(callee.getText().lastIndexOf(name), 0),
            });
          },
        },
      ],
      evaluate: (): void => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/surface.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function Surface(): void {\n  useQueryClient().invalidateQueries();\n}\n',
      },
      expect: { count: 1, token: "invalidateQueries" },
      why: "the founding shape — an imperative cache call at a feature call site instead of the central data/ seam",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/data/invalidation.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function invalidate(): void {\n  useQueryClient().invalidateQueries();\n}\n',
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the seam's own call reds like any other and is licensed by an exact grant row, so a NEW imperative call in the seam is a finding until someone reviews it",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/surface.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function Surface(): void {\n  useQueryClient()["setQueryData"](["k"], 1);\n}\n',
      },
      expect: { count: 1, token: "setQueryData" },
      why: "the COMPUTED-LITERAL spelling of the same method — an ElementAccess callee was not a PropertyAccess, so the legacy `getName()` check was offered nothing (#1506)",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/data/create-entity-mutation.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport async function run(): Promise<void> {\n  const client = useQueryClient();\n  await client.cancelQueries();\n  client.removeQueries();\n}\n',
      },
      expect: { count: 2 },
      why: "GRANT GRANULARITY: two DIFFERENT operations in one file are two `(subject, operation)` findings and therefore two rows — the identity is the licensed act, not the file",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/data/invalidation-carrier.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function carry(): void {\n  const client = useQueryClient();\n  client.setQueryData(["a"], 1);\n  client.setQueryData(["b"], 2);\n}\n',
      },
      expect: { count: 1 },
      why: "the other half of grant granularity: the SAME operation twice in one file is ONE finding, because a row matching two would be OVER-BROAD and would license neither call",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/cast.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function Surface(): void {\n  (useQueryClient() as { setQueryData(key: unknown, value: unknown): void }).setQueryData(["k"], 1);\n}\n',
      },
      expect: { count: 1, token: "setQueryData" },
      why: "THE CAST DODGE: a cast declares the method in its OWN type literal, so the property-symbol reader answered 'a proven different identity' and this passed while the uncast twin reported. The RECEIVER is still `useQueryClient()`, and the shared reader now asks it (`lib/project-home-origin.ts`)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/surface.tsx":
          "interface LocalCache {\n  setQueryData(key: string, value: unknown): void;\n}\nexport function Surface(cache: LocalCache): void {\n  cache.setQueryData('k', 1);\n}\n",
      },
      why: "SAME METHOD NAME, LOCAL TYPE: a project interface with a `setQueryData` method is not TanStack Query's client — the legacy name-only check red exactly this",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        ...vendorLookalikeProof(),
        "packages/client/src/features/some-feature/surfaces/surface.tsx":
          'import { useQueryClient } from "vendor-lookalike";\nexport function Surface(): void {\n  useQueryClient().invalidateQueries();\n}\n',
      },
      why: `SAME METHOD NAME, WRONG PACKAGE: another library's client declared in ${LOOKALIKE_HOME} is not the cache this law fences, and only the declaring package can say so`,
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/hooks/use-thing.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function useThing(): unknown {\n  return useQueryClient().getQueryDataSafely?.();\n}\n',
      },
      why: "A NEAR-MISS METHOD NAME (`getQueryDataSafely`) is not one of the six imperative operations — the candidate prefilter is exact, not a prefix match",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/some-feature/surfaces/surface.test.tsx":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function Surface(): void {\n  useQueryClient().invalidateQueries();\n}\n',
        "packages/client/src/features/some-feature/surfaces/surface.tsx": "export const Surface = null;\n",
      },
      why: "THE POPULATION, not a permission: a test file driving the cache directly is a different subject and is excluded by `notNamed`, exactly as the legacy predicate said with a regex",
    },
  ],
});
