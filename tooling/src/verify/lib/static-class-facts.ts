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
 *  AND THE RECEIPT PUBLISHES NO `unresolved`, which is the same distinction one level down (owner ruling,
 *  2026-09-11). A receipt's `unresolved` means "I COULD NOT COMPLETE MY MEASUREMENT" — a broken instrument,
 *  and `receiptFailures` treats it as one. "Some members of my population have shapes I cannot parse" is a
 *  fact ABOUT THE CORPUS: an unreadable `className` was successfully measured and classified, not a failure
 *  to measure, and it is delivered where consumers read and judge it — `facts.unresolved`, untouched here as
 *  the fact's own value. The concrete cost of getting this backwards: `unresolved > 0` is the STEADY STATE
 *  for a class-string reader over the whole frontend (one mutated alias anywhere in `@client`/`@ui` is
 *  enough), so publishing it would have withheld the first production consumer essentially always — a
 *  provider nobody can consume. A consumer that would rather JUDGE unreadable syntax reads `facts.unresolved`
 *  and REPORTS it; that is a finding, never a receipt refusal. */
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
        context.receipt({ kind: "population", source: "static-class-sources", members: context.files.length });
        return facts;
      },
    };
  },
});
