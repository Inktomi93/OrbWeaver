// Gate: testid-typed-only (UI-Gates-and-Lessons.md §11.5) — a `data-testid` whose value is a FREEFORM
// string is a silently-breakable e2e selector; the typed registry (`testId("key")`, client lib/test-ids.ts)
// turns a typo into a tsc error. The subject is the value SHAPE at the attribute position, read through the
// shared `readStringValue` unwrapper so `as`/`satisfies`/parens/no-substitution templates cannot dodge it.
//
// FAMILY: a declared SINGLETON under its own id. `testid-liveness` is the only other testid policy and it
// is still legacy, asks a different question (is a registry row consumed) and shares no reader; a common
// topic is not a family, so this policy stands under its own name until that one converts.
//
// POPULATION: `@client` — the typed registry and every e2e selector
// live there. The root is a NARROWING and mustPass[1] is the row that dies without it. The other narrowing
// is the attribute NAME test, which is the subject itself rather than a fence.
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot` was `/\/packages\/client\/src\//u` over `/${p}`,
// which is exactly `@client`.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 1,319 admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (45743d76d^) — the conversion's parent.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `testid-typed-only` descriptor at 073520068d3305dfedbb481153cadfef6b30f847, the parent of the conversion
// `45743d76d` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,006 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 1,287 and final `population` admits 1,287. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readStringValue } from "../lib/ast-read.ts";

/** Does this `data-testid` initializer carry a FREEFORM string value — a bare `="foo"` StringLiteral, or a
 *  braced `={"foo"}` / `={"foo" as string}` / a braced template literal — as opposed to the typed
 *  `={testId("key")}` call (a non-literal expression, undefined) which is the sanctioned shape. */
function freeformTestidValue(init: Node | undefined): boolean {
  if (init === undefined) {
    return false;
  }
  if (Node.isStringLiteral(init)) {
    return true; // bare attribute string: data-testid="foo"
  }
  if (!Node.isJsxExpression(init)) {
    return false;
  }
  const expr = init.getExpression();
  return expr !== undefined && readStringValue(expr) !== undefined; // braced literal (through any wrapper)
}

export const gate = defineGate({
  id: "testid-typed-only",
  family: "testid-typed-only",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message:
    'freeform data-testid string — use the typed registry: data-testid={testId("key")} (lib/test-ids.ts); a typo becomes a tsc error instead of a silently-broken e2e selector. See UI-Gates-and-Lessons.md §11.5.',
  fix: 'use the typed registry: data-testid={testId("key")} (client lib/test-ids.ts). A deliberate freeform id waives that occurrence with `@orb-waive testid-typed-only(data-testid): <reason + end condition>` — the reported position is the literal text `data-testid`, which the report passes as its token at offset 0 of the attribute, never the string value and never the element.',
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxAttribute],
        visit: (node) => {
          if (Node.isJsxAttribute(node) && node.getNameNode().getText() === "data-testid" && freeformTestidValue(node.getInitializer())) {
            ctx.report.node(node, { token: "data-testid", offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div data-testid='foo' />;\n" },
      expect: { count: 1, token: "data-testid" },
      why: "freeform string literal testid",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div data-testid={'foo' as string} />;\n" },
      expect: { count: 1, token: "data-testid" },
      why: "a braced freeform testid wrapped in an AsExpression (`{'foo' as string}`) — the wrapped/braced-literal shape the plain StringLiteral reader silently PASSED before hardening",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div data-testid={(`foo` satisfies string)} />;\n" },
      expect: { count: 1, token: "data-testid" },
      why: "a no-substitution template remains a freeform testid through satisfies and parentheses",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div data-testid={testId('foo')} />;\n" },
      why: "typed testid with expression",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/components/clean.tsx": "export const Clean = () => <div />;\n",
        "packages/server/src/foo.tsx": "export const A = () => <div data-testid='foo' />;\n",
      },
      why: "outside client scope",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div {...{ 'data-testid': 'foo' }} />;\n" },
      why: "DECLARED LIMIT: a data-testid arriving through a JSX spread is outside the direct-attribute spelling policy",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "const ID = 'foo';\nexport const A = () => <div data-testid={ID} />;\n" },
      why: "DECLARED LIMIT: a freeform value reached through a resolved constant is not a literal at the attribute position",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/components/waived.tsx":
          "// @orb-waive testid-typed-only(data-testid): the proof stand-in reason; ends when this fixture stops flagging.\nexport const A = () => <div data-testid='foo' />;\n",
      },
      why: "POSITIONAL IDENTITY: the report passes the token `data-testid` explicitly at offset 0 of the JsxAttribute, so an author waives the ATTRIBUTE NAME — not the freeform value `foo` the message is about, and not the element. A hyphenated position is legal: the marker grammar's position group is `[^()\\r\\n]+`. The fixture is mustFlag[0] (count 1) plus the marker line, so exactly ONE occurrence exists for the one marker to consume, and the arm ends if that row changes",
    },
  ],
});
