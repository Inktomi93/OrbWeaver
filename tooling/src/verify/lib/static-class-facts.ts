// Public final-runtime class/JSX fact boundary; allocate once in GatePolicy.create and stream visitors.
import { SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { StaticClassFactReader } from "./static-class-fact-collector.ts";
import { createStaticClassFactReader as createReader } from "./static-class-fact-collector.ts";

export const STATIC_CLASS_FACT_KINDS = [
  SyntaxKind.JsxAttribute,
  SyntaxKind.JsxSpreadAttribute,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.ShorthandPropertyAssignment,
  SyntaxKind.CallExpression,
  SyntaxKind.Identifier,
  SyntaxKind.JsxOpeningElement,
  SyntaxKind.JsxSelfClosingElement,
] as const;

export function createStaticClassFactReader(files: readonly import("ts-morph").SourceFile[]): StaticClassFactReader {
  return createReader(files);
}

/** One frontend-wide class/JSX derivation shared by every consuming policy.
 *
 *  THE RECEIPT STATES WHAT THIS COLLECTOR MEASURED, NEVER WHAT IT FOUND. `members` is the denominator it
 *  walked — the authored frontend sources its population admitted — because `factReceiptFailures`
 *  (`lib/policy-pass.ts:641`) refuses `members === 0` and `withholdFactDependents` (`:679`) drops every
 *  consumer before `evaluate`, so receipting the TOKEN CENSUS made a frontend tree that authors no class
 *  token preempt any policy that would report it (#1962; same ruling as `bus-fact.ts`, #1955).
 *
 *  `unresolved` STAYS, and it is the asymmetric half: it counts authored syntax this reader could NOT read
 *  (a mutated alias, a composer fed a runtime configuration object — see
 *  `tests/tooling/verify/lib/static-class-facts.test.ts`), which is exactly what §12.3 reserves the field
 *  for, and it is NOT the census. It is also the one number a consumer cannot recover from a clean zero:
 *  unread syntax and absent syntax look identical in `tokens`. NOTE FOR THE FIRST PRODUCTION CONSUMER
 *  (there is none as of 2026-09-11): publishing it means any frontend file this reader cannot follow
 *  withholds you, so if your policy would rather JUDGE that syntax, read `facts.unresolved` and report it —
 *  and the provider drops the field, per §12.3's discriminator. */
export const staticClassFact = defineFact({
  id: "static-class",
  population: "@frontend",
  analysis: "types",
  resources: [],
  create: (context) => {
    const reader = createReader(context.files);
    return {
      visitors: [{ kinds: STATIC_CLASS_FACT_KINDS, visit: reader.visit }],
      finish: () => {
        const facts = reader.finish();
        context.receipt({ kind: "population", source: "static-class-sources", members: context.files.length, unresolved: facts.unresolved.length });
        return facts;
      },
    };
  },
});
