// Policy: no-inline-invalidate-outside-seam (UI-Gates-and-Lessons.md §11.3 — "the central invalidation
// seam"). ALL invalidation routes through ONE chokepoint: `data/invalidation.ts` owns the exhaustive
// event→`queryFilter()` maps and the sole `invalidateQueries` call. Everything else calls
// `invalidate(event)`/`invalidateUser(event)` or hands `invalidates` filters to `createEntityMutation`.
//
// WHY THIS IS ITS OWN POLICY BESIDE `client-cache-surgery-only-in-data`. The sibling fences the six
// imperative cache operations at the `data/` DIRECTORY grain; this one fences ONE operation at a single
// FILE. They overlap on the seam's own call by design and each licenses it with its own row — that is what
// the two doc rows say, and collapsing them would lose the file-grain claim (a new `data/` module may not
// invalidate).
//
// AUTHORITY IS reviewed-grant: the seam's own call is a recurring repository PERMISSION with an exact
// `(subject, operation)` row in `lib/reviewed-grants.ts`, not a per-occurrence mistake. The legacy predicate
// SUBTRACTED the seam file from the corpus, which the final law forbids — a subtracted path carries its
// exemption silently through a rename, while a grant row that stops matching goes RED.
//
// IDENTITY, NOT SPELLING: the legacy check was `getName() === "invalidateQueries"` on any receiver, so any
// object with that method name was the offense and `client["invalidateQueries"]()` was invisible. The
// subject is the METHOD DECLARED BY `@tanstack/query-core`, judged on the receiver's type AND on the UNCAST
// receiver — a cast declares the method in its own type literal and would otherwise read as a different
// identity (`lib/project-home-origin.ts`, shared with the rest of the family).
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyPackageMemberOrigin } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { LOOKALIKE_HOME, tanstackQueryProof, vendorLookalikeProof } from "./_proof/client-vendors.ts";

const METHOD = "invalidateQueries";
const QUERY_CORE = "@tanstack/query-core";
const OPERATION = "inline-invalidate-queries";

const MESSAGE =
  "an inline `invalidateQueries` call outside the central seam — route invalidation through " +
  "data/invalidation.ts (`invalidate(event)`/`invalidateUser(event)`), or pass `invalidates` filters to " +
  "`createEntityMutation`. A loose call recreates neo's 81-site invalidation sprawl " +
  "(UI-Gates-and-Lessons.md §11.3).";
const UNREADABLE =
  "this call names `invalidateQueries` on a receiver the checker cannot place, so whether it is TanStack Query's client CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the binding a readable import origin; the three-answer rule is tooling/src/verify/lib/origin-verdict.ts (#944).";
const FIX =
  "call invalidate(event)/invalidateUser(event) from data/invalidation.ts, or pass `invalidates` filters to createEntityMutation; the seam's own call is licensed by an exact reviewed grant.";

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
  id: "no-inline-invalidate-outside-seam",
  family: "tanstack-query-origin",
  authority: "reviewed-grant",
  severity: "error",
  population: "@client",
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
            if (calledMemberName(callee) !== METHOD) {
              return;
            }
            const verdict = classifyPackageMemberOrigin(callee, [QUERY_CORE]);
            if (verdict === "other") {
              return;
            }
            candidates.push({
              node: callee,
              subject: ctx.relativePath(sourceFile),
              operation: OPERATION,
              unreadable: verdict === "unreadable",
              token: METHOD,
              offset: Math.max(callee.getText().lastIndexOf(METHOD), 0),
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
      grant: { subject: "packages/client/src/features/a/mutation.ts", operation: "inline-invalidate-queries" },
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/a/mutation.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function run(): void {\n  useQueryClient().invalidateQueries();\n}\n',
      },
      expect: { count: 1, token: METHOD },
      why: "a loose invalidateQueries call outside the seam — the neo 81-site sprawl reborn",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/data/invalidation.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function invalidate(): void {\n  useQueryClient().invalidateQueries();\n}\n',
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the ONE sanctioned call reds like any other and is licensed by an exact grant row keyed on the seam FILE, so the same call in a NEW data/ module is a finding",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/a/mutation.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function run(): void {\n  useQueryClient()["invalidateQueries"]();\n}\n',
      },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL spelling of the same method, invisible to the legacy PropertyAccess-only check (#1506)",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/a/cast.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport function run(): void {\n  (useQueryClient() as { invalidateQueries(): void }).invalidateQueries();\n}\n',
      },
      expect: { count: 1 },
      why: "THE CAST DODGE: the cast declares `invalidateQueries` in its own type literal, which the property-symbol reader read as a proven different identity — a one-line escape from the seam until the shared reader started asking the UNCAST receiver too",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/a/opaque.ts": "declare function opaque(): any;\nexport function run(): void {\n  opaque().invalidateQueries();\n}\n",
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), reached by no row before #2014: an OPAQUE receiver resolves no property symbol and its uncast type declares nothing, so both axes of `classifyPackageMemberOrigin` refuse and the seam escape is REPORTED rather than passed. Without the `messageIncludes` the row is worthless — the unreadable arm emits exactly one finding, the same as the ordinary verdict, so a `{ count: 1 }` row passes whether the arm fires or is unreachable",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/a/mutation2.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport async function run(): Promise<void> {\n  await useQueryClient().cancelQueries();\n}\n',
      },
      why: "`cancelQueries` (createEntityMutation's optimistic flow) is a different concern this policy does not own — the sibling `client-cache-surgery-only-in-data` does",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/a/local.ts":
          "interface LocalBus {\n  invalidateQueries(): void;\n}\nexport function run(bus: LocalBus): void {\n  bus.invalidateQueries();\n}\n",
      },
      why: "SAME METHOD NAME, LOCAL TYPE: a project interface with an `invalidateQueries` method is not the query cache — the legacy name-only check red it",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        ...vendorLookalikeProof(),
        "packages/client/src/features/a/vendor.ts":
          'import { useQueryClient } from "vendor-lookalike";\nexport function run(): void {\n  useQueryClient().invalidateQueries();\n}\n',
      },
      why: `SAME METHOD NAME, WRONG PACKAGE: the identical call on another library's client declared in ${LOOKALIKE_HOME} is not this seam's subject`,
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/features/a/reference.ts":
          'import { useQueryClient } from "@tanstack/react-query";\nexport const handle = (): unknown => useQueryClient().invalidateQueries;\n',
      },
      why: "a bare METHOD REFERENCE is not a call and is not sprawl — the legacy gate required a CallExpression parent and this keeps that narrowing, with its row",
    },
  ],
});
