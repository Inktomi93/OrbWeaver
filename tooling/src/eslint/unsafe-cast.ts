// A cast that tells the checker a lie it cannot catch: a double cast through `unknown`, a parsed JSON blob named as a
// type, an untyped value named as a contract, row or brand, and a brand stripped to its string.

import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import ts from "typescript";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { declaredInContract } from "./trpc-output.ts";

/** One cast that is a real boundary, not a site waiting to be fixed: `site` is the source text of the expression it casts. */
export interface UnsafeCastHome {
  readonly file: string;
  readonly site: string;
  readonly reason: string;
}

/** The casts that are the boundary itself. Add one only for data that arrives untyped by construction. */
export const UNSAFE_CAST_HOMES: readonly UnsafeCastHome[] = [
  {
    file: "packages/contracts/src/plugin/manifest.ts",
    site: 'Reflect.get(globalThis, "URL")',
    reason: "the WHATWG `URL` global exists in every runtime yet in neither lib this package compiles under, so it can only be read untyped",
  },
  {
    file: "packages/inference/src/backends/local-light/model-worker.ts",
    site: "workerData",
    reason: "`workerData` arrives untyped across the thread boundary from this worker's own spawner",
  },
  {
    file: "packages/ui/src/lib/live-token-resolver.ts",
    site: "globalThis as unknown",
    reason:
      "reads DOM globals through structural shims so the module compiles in the DOM-less node world; `globalThis` has no type in common with them in either world",
  },
];

const KIT_IDS = /\/packages\/kit\/src\/ids\/index\.ts$/u;
// The shape of a drizzle row alias; the inferred select type of a table has no name to test.
const ROW_NAME = /Row$/u;
const DB_FILE = /\/packages\/db\//u;

const UNTYPED = new Set<string>([AST_NODE_TYPES.TSUnknownKeyword, AST_NODE_TYPES.TSAnyKeyword]);

// The constraint of `castId`'s type parameter is the repo's own `Branded<string>`: every brand is assignable to it and a bare string is not.
const brandCache = new WeakMap<ts.Program, ts.Type | null>();

function brandedString(program: ts.Program, checker: ts.TypeChecker): ts.Type | null {
  const cached = brandCache.get(program);
  if (cached !== undefined) {
    return cached;
  }
  const source = program.getSourceFiles().find(({ fileName }) => KIT_IDS.test(fileName));
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source)?.exports?.get(ts.escapeLeadingUnderscores("castId"));
  const [signature] =
    symbol === undefined || source === undefined ? [] : checker.getSignaturesOfType(checker.getTypeOfSymbolAtLocation(symbol, source), ts.SignatureKind.Call);
  const parameter = signature?.typeParameters?.[0];
  const brand = parameter === undefined ? null : (checker.getBaseConstraintOfType(parameter) ?? null);
  brandCache.set(program, brand);
  return brand;
}

const isJsonParse = (node: TSESTree.Node): boolean =>
  node.type === AST_NODE_TYPES.CallExpression &&
  node.callee.type === AST_NODE_TYPES.MemberExpression &&
  !node.callee.computed &&
  node.callee.object.type === AST_NODE_TYPES.Identifier &&
  node.callee.object.name === "JSON" &&
  node.callee.property.type === AST_NODE_TYPES.Identifier &&
  node.callee.property.name === "parse";

const isConstCast = (annotation: TSESTree.TypeNode): boolean =>
  annotation.type === AST_NODE_TYPES.TSTypeReference && annotation.typeName.type === AST_NODE_TYPES.Identifier && annotation.typeName.name === "const";

// `(LIST as readonly string[]).includes(value)` widens a literal tuple to test a string against it; nothing is asserted about the value.
const isIncludesReceiver = (node: TSESTree.TSAsExpression): boolean =>
  node.parent.type === AST_NODE_TYPES.MemberExpression &&
  node.parent.object === node &&
  node.parent.property.type === AST_NODE_TYPES.Identifier &&
  node.parent.property.name === "includes";

const DOUBLE_CAST = "a double cast through `unknown` hides the real mismatch from the checker: parse the value with its schema, or narrow it with a guard";
const JSON_CAST = "`JSON.parse` returns an untyped value: parse it with the schema of the type you name, never assert it";
const UNTYPED_CAST =
  "an untyped value named as a contract, row or branded type is a promise nothing checks: validate it at the boundary with the type's schema (`castId` is for a trusted seam only)";
const STRIPPED_BRAND = "`as string` strips a brand the checker was holding: a branded id is already a string where a string is wanted";

// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
const isUntyped = (type: ts.Type): boolean => (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
// `never` is assignable to every brand, so `as never` would read as a brand cast though it names none.
// biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
const isNever = (type: ts.Type): boolean => (type.flags & ts.TypeFlags.Never) !== 0;

function namesRow(type: ts.Type): boolean {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  return (
    symbol !== undefined &&
    (ROW_NAME.test(symbol.getName()) || (symbol.declarations ?? []).some((declaration) => DB_FILE.test(declaration.getSourceFile().fileName)))
  );
}

// What the syntax alone settles; null when the checker has to be asked.
function syntacticReason(node: TSESTree.TSAsExpression): string | null {
  const { expression } = node;
  if (expression.type === AST_NODE_TYPES.TSAsExpression && UNTYPED.has(expression.typeAnnotation.type)) {
    return DOUBLE_CAST;
  }
  return isJsonParse(expression) ? JSON_CAST : null;
}

/** Refuses `x as unknown as T`, `JSON.parse(x) as T`, an `unknown` or `any` value cast to a contract, row or branded type,
 *  and a branded value cast to `string`. A cast named in `homes` is exempt. */
export function noUnsafeCastRule(homes: readonly UnsafeCastHome[]): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const services = context.sourceCode.parserServices;
      const program = services?.program ?? null;
      const toTs = services?.esTreeNodeToTSNodeMap;
      const filename = context.filename.replaceAll("\\", "/");
      if (program === null || toTs === undefined) {
        return {};
      }
      const sites = new Set(homes.filter(({ file }) => filename.endsWith(file)).map(({ site }) => site));
      const checker = program.getTypeChecker();
      const brand = brandedString(program, checker);
      const isBrand = (type: ts.Type): boolean => brand !== null && !isUntyped(type) && !isNever(type) && checker.isTypeAssignableTo(type, brand);
      const typedReason = (node: TSESTree.TSAsExpression): string | null => {
        const target = checker.getTypeFromTypeNode(toTs.get(node.typeAnnotation) as ts.TypeNode);
        const carried = checker.getTypeAtLocation(toTs.get(node.expression));
        if (isUntyped(carried)) {
          return declaredInContract(checker, target) || namesRow(target) || isBrand(target) ? UNTYPED_CAST : null;
        }
        return node.typeAnnotation.type === AST_NODE_TYPES.TSStringKeyword && isBrand(carried) ? STRIPPED_BRAND : null;
      };
      const judge = (node: TSESTree.TSAsExpression): void => {
        if (
          isConstCast(node.typeAnnotation) ||
          UNTYPED.has(node.typeAnnotation.type) ||
          isIncludesReceiver(node) ||
          sites.has(context.sourceCode.getText(node.expression))
        ) {
          return;
        }
        const message = syntacticReason(node) ?? typedReason(node);
        if (message !== null) {
          context.report({ node, message });
        }
      };
      return { TSAsExpression: judge };
    },
  };
}
