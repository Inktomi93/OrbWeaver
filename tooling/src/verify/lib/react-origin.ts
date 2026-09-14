// Canonical React export identity, shared by the four React-19 migration policies (`no-forward-ref`,
// `no-use-context`, `no-context-provider`, and any sibling that must ask "is this REACT's X").
//
// WHY THIS EXISTS: all four legacy gates matched TEXT — `expr.getText() === "forwardRef"`, `=== "React.useContext"`,
// `tagName.getName() === "Provider"`. Text is not identity in either direction. A `forwardRef` aliased at
// its import (`import { forwardRef as fr }`) and a namespace member (`import * as R; R.useContext(…)`)
// walked past every one of them, and a local helper or an unrelated namespace component named `Provider`
// false-red'd (three live legacy ignore markers naming `no-context-provider`, all on Base UI's namespace
// components, were the standing proof).
//
// The reader is a pure function over delivered nodes: it owns no walk, no Project, and no cache beyond the
// invocation-local per-file alias index each matcher closes over.
//
// THE FAMILY'S SHARED POPULATION PORT IS DERIVED ONCE HERE (§5b.5), so the member headers cite one
// measurement instead of copying it five times — the `DRIZZLE_SCHEMA_POPULATION` precedent. It covers the
// three React-19 members whose legacy descriptors declared NO `scanRoot` at all — `no-forward-ref`,
// `no-use-context`, `no-context-provider`, all converted at `7ed48eca8` — whose legacy population was
// therefore the whole legacy harness fileset: `packages/*/src/**/*.{ts,tsx}` plus `tests/**/*.{ts,tsx}`
// (`lib/harness.ts` at `7ed48eca8^`). The final population is `@authored`, which is NOT byte-identical and
// moves in BOTH directions:
//   - NARROWS by `packages/showcase-plugins/src`, an authored package deliberately outside `@authored`
//     (#1980, `contract/population.ts`). Measured rather than assumed: the package holds ONE file and it
//     carries zero React references.
//   - WIDENS by `tooling/src` and `scripts/`. Measured with a planted control in the same invocation:
//     `ast-grep --pattern 'import $$$A from "react"'` finds ZERO import declarations under `tooling/src`
//     and `scripts` in BOTH the `ts` and `tsx` languages, against 845 matched lines in
//     `packages/client/src`. Every `forwardRef` / `useContext` / `.Provider` occurrence in the widened arm
//     is fixture TEXT inside this family's own proof modules and codemod templates — which is exactly what
//     an ORIGIN-keyed reader does not mistake for the subject, and exactly what the legacy TEXT matchers
//     this reader replaced would have red-flagged. The widening is safe BECAUSE of the conversion.
// SUPERSEDED 2026-09-13 (lane cb-b-header-residue), the refuted text kept above: "the whole legacy harness fileset:
// `packages/*/src/**/*.{ts,tsx}` plus `tests/**/*.{ts,tsx}` (`lib/harness.ts` at `7ed48eca8^`)" and "WIDENS by
// `tooling/src` and `scripts/`" are REFUTED. `lib/harness.ts` at that tree is the BASELINE WRITERS' project; the live
// legacy pass (`lib/pass.ts:434`, `getWorkspace({ root })`) loaded `_shared/ts-workspace.ts#harnessGlobs`, which
// already carried `tooling/src` and `scripts/`. Measured for each of the three members over the harness candidates at
// `7ed48eca8^`: legacy − final = {`packages/showcase-plugins/src/index.ts`}, final − legacy = ∅. The port is a
// one-file NARROWING in ONE direction; the zero-React-import measurement above stays true and is now simply not
// needed to justify a widening that never happened. Each member header carries the sets and controls.
// The other two members — `no-effect-on-shared-selection` and `registry-context-via-mint` — each had a real
// legacy `scanRoot`, so each states its own port in its own header rather than sharing this one.

import { resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import type { ModuleMemberOrigin, ReferenceFact } from "@orb/tooling/_shared/reference-fact-contract";
import type { ImportSpecifier, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ReactExportFinding, ReactOriginVerdict } from "../contract/origin-verdict.ts";
import type { GatePolicyVisitor } from "../contract/policy-primitives.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";
import { declaredByAnyPackage } from "./type-member-origin.ts";

/** The module door React is authored as. A re-export shim keeps its OWN specifier, so the canonical
 *  target is what proves the origin; this is only the cheap first-pass filter and the external-door name. */
export const REACT_MODULE = "react";

/** The `node_modules` directories that declare React's public surface. React ships no types of its own
 *  today, but a future inline `react/index.d.ts` must not silently stop matching. */
export const REACT_TYPE_HOMES: readonly string[] = ["@types/react", "react"];

/** The React export a resolved origin ultimately names. A NAMED or NAMESPACE door lands the export name
 *  directly; a DEFAULT door (`import React from "react"`) lands `default` plus a one-hop member path, and
 *  `React.forwardRef` is the same reference as `forwardRef` — a reader that only accepted the first shape
 *  would call the legacy gate's own founding member fixture unreadable. */
function namedReactExport(origin: ModuleMemberOrigin): string | undefined {
  if (origin.memberPath.length === 0) {
    return origin.exportedName;
  }
  return origin.memberPath.length === 1 && origin.exportedName === "default" ? origin.memberPath[0] : undefined;
}

/** The complete React export path named by an origin. Named imports start at the exported name; the
 * default object starts at its first member. This is the shared answer for policies that judge a
 * namespace member such as `React.Children.toArray`, rather than only a direct call target. */
export function reactExportPath(origin: ModuleMemberOrigin): readonly string[] {
  return origin.exportedName === "default" ? origin.memberPath : [origin.exportedName, ...origin.memberPath];
}

/** Whether a resolved module-member origin belongs to React. Kept separate from the export-path
 * interpretation so consumers cannot accidentally accept a same-named member from another package. */
export function isReactOrigin(origin: ModuleMemberOrigin): boolean {
  const { canonical } = origin;
  return canonical.kind === "external-door" ? canonical.moduleSpecifier === REACT_MODULE : declaredByAnyPackage([canonical.declaration], REACT_TYPE_HOMES);
}

function isReactExport(origin: ModuleMemberOrigin, exportedName: string): boolean {
  if (namedReactExport(origin) !== exportedName) {
    return false;
  }
  return isReactOrigin(origin);
}

function verdictOf(fact: ReferenceFact<ModuleMemberOrigin>, exportedName: string, node: MorphNode): ReactOriginVerdict {
  if (fact.kind === "unresolved") {
    return classifyOriginRefusal(fact.reason, node);
  }
  return isReactExport(fact.value, exportedName) ? "react" : "other";
}

/** Every local spelling in `source` that a React named import could have bound `exportedName` to, plus the
 *  canonical name itself and every namespace binding over a `react` door. The set is the CANDIDATE filter:
 *  resolving module origin for every call in the corpus costs a ten-minute run (`no-fake-disabled-id`). */
function reactSpellings(source: SourceFile, exportedName: string): ReadonlySet<string> {
  const names = new Set<string>([exportedName]);
  for (const declaration of source.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== REACT_MODULE) {
      continue;
    }
    const namespace = declaration.getNamespaceImport();
    if (namespace !== undefined) {
      names.add(namespace.getText());
    }
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport !== undefined) {
      names.add(defaultImport.getText());
    }
    for (const specifier of declaration.getNamedImports()) {
      if (specifier.getName() === exportedName) {
        names.add(specifier.getAliasNode()?.getText() ?? exportedName);
      }
    }
  }
  return names;
}

/** Could this callee POSSIBLY name the React export, judged on spelling alone? A member callee is a
 *  candidate when its leaf name matches or its receiver is a React namespace/default binding; a bare
 *  identifier is a candidate when the file's own imports could have bound it. */
function couldNameReactExport(callee: MorphNode, exportedName: string, names: ReadonlySet<string>): boolean {
  if (Node.isIdentifier(callee)) {
    return names.has(callee.getText());
  }
  if (Node.isPropertyAccessExpression(callee)) {
    return callee.getName() === exportedName || names.has(callee.getExpression().getText());
  }
  if (!Node.isElementAccessExpression(callee)) {
    return false;
  }
  const argument = callee.getArgumentExpression();
  const key =
    argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) ? argument.getLiteralText() : undefined;
  return key === exportedName || names.has(callee.getExpression().getText());
}

export interface ReactExportMatcher {
  /** Judge an expression that REFERENCES the export (a call callee, a bare reference). */
  readonly reference: (node: MorphNode) => ReactOriginVerdict;
  /** Judge an import door. Returns `undefined` when the specifier cannot name the export at all. */
  readonly importDoor: (specifier: ImportSpecifier) => ReactOriginVerdict | undefined;
}

/** Build an invocation-local matcher for ONE React export. Each source file's alias index is computed once. */
export function createReactExportMatcher(exportedName: string): ReactExportMatcher {
  const spellingsBySource = new WeakMap<object, ReadonlySet<string>>();
  const spellings = (source: SourceFile): ReadonlySet<string> => {
    let cached = spellingsBySource.get(source.compilerNode);
    if (cached === undefined) {
      cached = reactSpellings(source, exportedName);
      spellingsBySource.set(source.compilerNode, cached);
    }
    return cached;
  };
  return {
    reference: (node): ReactOriginVerdict => {
      if (!couldNameReactExport(node, exportedName, spellings(node.getSourceFile()))) {
        return "other";
      }
      return verdictOf(resolveModuleMemberOrigin(node), exportedName, node);
    },
    // AN IMPORT SPECIFIER'S OWN NAME IS THE MODULE'S EXPORT NAME, alias or not, so a specifier spelled
    // anything else is a PROVEN different export and never a candidate. Resolving every `from "react"`
    // specifier instead cost 439 false "unreadable" findings per policy on the real tree — React's own
    // overloaded hooks (`useState` has two declarations) refuse as `ambiguous`, and a refusal on a
    // non-candidate is not a verdict about this export at all.
    // DECLARED LIMIT: a re-export shim that RENAMES (`export { forwardRef as fr }`, then `import { fr }`)
    // is not a candidate at its door; the call site still resolves it.
    importDoor: (specifier): ReactOriginVerdict | undefined => {
      if (specifier.getName() !== exportedName) {
        return;
      }
      return verdictOf(resolveModuleMemberOrigin(specifier), exportedName, specifier.getNameNode());
    },
  };
}

/** The TWO doors a deprecated React export enters a file through, as one visitor pair. Both `no-forward-ref`
 *  and `no-use-context` are exactly this shape and must stay arm-for-arm identical: they are the same law
 *  applied to two exports, and a coverage difference between them would be an accident, not a decision.
 *  The caller owns the message and the report anchor. */
export function reactExportVisitors(exportedName: string, onFinding: (node: MorphNode, verdict: ReactExportFinding) => void): readonly GatePolicyVisitor[] {
  const matcher = createReactExportMatcher(exportedName);
  const emit = (node: MorphNode, verdict: ReactOriginVerdict | undefined): void => {
    if (verdict === "react" || verdict === "unreadable") {
      onFinding(node, verdict);
    }
  };
  return [
    {
      kinds: [SyntaxKind.ImportSpecifier],
      visit: (node): void => {
        if (Node.isImportSpecifier(node)) {
          emit(node, matcher.importDoor(node));
        }
      },
    },
    {
      kinds: [SyntaxKind.CallExpression],
      visit: (node): void => {
        if (Node.isCallExpression(node)) {
          const callee = node.getExpression();
          emit(callee, matcher.reference(callee));
        }
      },
    },
  ];
}
