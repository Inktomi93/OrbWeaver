// `staleTime: "static"` silently ignores invalidateQueries — it would disable the SSE bus→cache seam with a
// green check. `Infinity` is the honest spelling: invalidation still overrides it.
//
// TWO IDENTITIES the legacy gate asserted by text and this one resolves:
//   · the KEY — the legacy check was `node.getName() === "staleTime"`, so any object anywhere with a
//     `staleTime` key qualified ("any `staleTime` property currently qualifies; wrappers/spreads and
//     unrelated objects are unproved"). The subject is the key of a TanStack QUERY OPTIONS object, which the
//     CONTEXTUAL type names — an object literal's own key symbol declares on the literal and carries no
//     identity at all.
//   · the VALUE — the legacy check compared `initializer.getText()` against three quoted spellings, so a
//     `const STATIC = "static"` alias walked past. `readStaticString` resolves the authored value through
//     const chains, imports and wrappers, and refuses a mutable or computed one.
//
// THREE ANSWERS: a query-options `staleTime` set to "static" is the finding; the same value on an unrelated
// object passes; a "static" whose contextual owner cannot be placed is REPORTED (GATE-AUTHORING §5, #944).
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readStaticString } from "../lib/reference-fact.ts";
import { declaredByPackage, resolveContextualMemberOrigin } from "../lib/type-member-origin.ts";
import { LOOKALIKE_HOME, tanstackQueryProof, vendorLookalikeProof } from "./_proof/client-vendors.ts";

const KEY = "staleTime";
const BANNED = "static";
const QUERY_CORE = "@tanstack/query-core";

const MESSAGE =
  "staleTime:'static' silently ignores invalidateQueries — it would disable the SSE bus→cache seam with a green check. Use Infinity (invalidation still overrides it). See UI-Lib-TanStack-Query.md §F (item 2) / UI-Architecture-and-Layout.md §6.1.";
const UNREADABLE =
  'this `staleTime: "static"` sits in an object whose contextual type the checker cannot place, so whether it is a TanStack query-options bag — and therefore whether it disables the bus→cache seam — CANNOT be established. Reported rather than passed: the spelling alone is not the identity.';

/** Is this object literal an ARGUMENT — the one position whose contextual type the checker owes an answer
 *  for, and therefore the only place a missing contextual type is a give-up rather than a plain bag? */
function isCallArgument(literal: MorphNode): boolean {
  const parent = literal.getParent();
  return (Node.isCallExpression(parent) || Node.isNewExpression(parent)) && parent.getArguments().some((argument) => argument === literal);
}

export const gate = defineGate({
  id: "no-static-staletime",
  family: "tanstack-query-origin",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored"], notNamed: ["*.test.ts", "*.test.tsx"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "Change staleTime to Infinity.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.PropertyAssignment],
        visit: (node): void => {
          if (!Node.isPropertyAssignment(node) || node.getName() !== KEY) {
            return;
          }
          const initializer = node.getInitializer();
          if (initializer === undefined) {
            return;
          }
          const value = readStaticString(initializer);
          if (value.kind === "unresolved" || value.value !== BANNED) {
            return;
          }
          const owner = resolveContextualMemberOrigin(node);
          if (owner.kind === "unresolved") {
            // A literal with no contextual type at all is CHECKED AGAINST NOTHING — a free-standing config
            // bag, not an unreadable query-options object. The unreadable arm is for a literal in a position
            // TypeScript WOULD have contextually typed (a call argument) where the checker still gave up.
            if (isCallArgument(node.getParent())) {
              ctx.report.node(node, { message: UNREADABLE, token: KEY, offset: 0 });
            }
            return;
          }
          if (declaredByPackage(owner.value.declarations, QUERY_CORE)) {
            ctx.report.node(node, { token: KEY, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/feature/query.ts":
          'import { useQuery } from "@tanstack/react-query";\nexport const q = useQuery({ queryKey: ["key"], staleTime: "static" });\n',
      },
      expect: { count: 1, token: "staleTime" },
      why: "the founding shape — the banned sentinel on a real query-options bag, where it silently disables invalidation",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/feature/query.ts":
          'import { useQuery } from "@tanstack/react-query";\nconst FOREVER = "static";\nexport const q = useQuery({ queryKey: ["key"], staleTime: FOREVER });\n',
      },
      expect: { count: 1 },
      why: "A CONST ALIAS of the sentinel: the legacy check compared the initializer's TEXT against three quoted spellings, so naming the string was a one-line escape. The shared static-string reader follows the binding",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/feature/ratio.ts": 'export const FOREVER = "static";\n',
        "packages/client/src/feature/query.ts":
          'import { useQuery } from "@tanstack/react-query";\nimport { FOREVER } from "./ratio.ts";\nexport const q = useQuery({ queryKey: ["key"], staleTime: FOREVER });\n',
      },
      expect: { count: 1 },
      why: "the same alias one module away — the reader traverses the import door, which no text comparison can",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/feature/query.ts":
          'import { useQuery } from "@tanstack/react-query";\nexport const q = useQuery({ queryKey: ["key"], staleTime: `static` });\n',
      },
      expect: { count: 1 },
      why: "the no-substitution TEMPLATE spelling of the same value — one of the three the legacy gate enumerated by hand, now covered by the reader rather than by a list",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/feature/query.ts":
          'declare function untypedSeam(options: any): unknown;\nexport const q = untypedSeam({ queryKey: ["key"], staleTime: "static" });\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "FAIL-CLOSED: an options bag handed to a seam the checker cannot contextually type is an ARGUMENT the checker owes an answer for, so the query-options claim is UNKNOWN and is reported rather than passed (#944)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/feature/query.ts":
          'import { useQuery } from "@tanstack/react-query";\nexport const q = useQuery({ queryKey: ["key"], staleTime: Number.POSITIVE_INFINITY });\n',
      },
      why: "the replacement this policy exists to drive traffic to — Infinity, which invalidation still overrides",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/feature/query.ts": 'export const config = { staleTime: "static" };\n',
      },
      why: "SAME KEY, NO QUERY: a free-standing bag with a `staleTime` key is not a TanStack options object and disables nothing. The legacy name-only check RED this — the manifest's recorded false positive",
    },
    {
      mode: "types",
      files: {
        ...vendorLookalikeProof(),
        "packages/client/src/feature/query.ts": 'import { configure } from "vendor-lookalike";\nconfigure({ staleTime: "static" });\nexport const g = 1;\n',
      },
      why: `SAME KEY, WRONG PACKAGE: another library's options type declared in ${LOOKALIKE_HOME} accepts the same literal and has nothing to do with the bus→cache seam`,
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/feature/query.ts":
          'import { useQuery } from "@tanstack/react-query";\ndeclare function pick(): "static";\nexport const q = useQuery({ queryKey: ["key"], staleTime: pick() });\n',
      },
      why: "A COMPUTED value is not an authored sentinel — the reader refuses to read it, and the ban this policy states is on writing the literal, so the refusal is the right answer rather than a guess",
    },
    {
      mode: "types",
      files: {
        ...tanstackQueryProof(),
        "packages/client/src/feature/query.ts":
          'import { useQuery } from "@tanstack/react-query";\nconst BASE = { staleTime: "static" as const };\nexport const q = useQuery({ queryKey: ["key"], ...BASE });\n',
      },
      why: "THE DECLARED LIMIT, written down: a SPREAD source is checked against nothing at its own site, so its `staleTime` has no contextual owner and is not reported. Closing it needs value-flow from the constant to the call, which a per-node policy cannot do without a private walk — the directly-authored key at the call site is still caught",
    },
  ],
});
