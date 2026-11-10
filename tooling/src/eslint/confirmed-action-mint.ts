// `orb/confirmed-action-mint`: a `ConfirmedAction` proves a confirm upstream only if no one can forge it. The mint is
// read only in its listed homes, each of which renders the confirm it opens, and no cast may produce the brand (§14).
import { relative } from "node:path";
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES as T } from "@typescript-eslint/utils";
import ts from "typescript";
import { requireTypeServices } from "./checker.ts";
import { CONFIRMED_HOME, confirmedType, UNPROVEN } from "./destructive-confirm.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { posixPath } from "./syntax.ts";

const MINT = "confirmedAction";
const MINT_MESSAGE =
  "Only a file that renders the confirm it opens may mint a ConfirmedAction; name it in CONFIRMED_ACTION_MINT_HOMES with its reason (docs/law/client-architecture-state-and-gates.md §14).";
const CAST_MESSAGE =
  "A cast cannot prove a confirm. Mint the ConfirmedAction with confirmedAction() in the file that renders the confirm (docs/law/client-architecture-state-and-gates.md §14).";

function mintSymbol(program: ts.Program, checker: ts.TypeChecker): ts.Symbol | undefined {
  const source = program.getSourceFiles().find(({ fileName }) => CONFIRMED_HOME.test(fileName));
  return source === undefined ? undefined : checker.getSymbolAtLocation(source)?.exports?.get(ts.escapeLeadingUnderscores(MINT));
}

function resolved(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
}

/** Refuses a read of `confirmedAction` outside `homes` and the brand's own module, and any cast to `ConfirmedAction`. */
export function confirmedActionMintRule(homes: Readonly<Record<string, string>>): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const { program, checker, esTreeNodeToTSNodeMap: toTs } = requireTypeServices(context);
      const filename = posixPath(relative(context.cwd, context.filename));
      const confirmed = confirmedType(program, checker);
      const mint = mintSymbol(program, checker);
      if (confirmed === null || mint === undefined) {
        return {};
      }
      const minting = Object.hasOwn(homes, filename) || CONFIRMED_HOME.test(`/${filename}`);
      const reported = new Set<number>();
      // An aliased import, a namespace member and a computed member all spell the name, so the name finds every read.
      const read = (node: TSESTree.Identifier | TSESTree.Literal): void => {
        if (minting || reported.has(node.range[0]) || resolved(checker, checker.getSymbolAtLocation(toTs.get(node))) !== mint) {
          return;
        }
        reported.add(node.range[0]);
        context.report({ node, message: MINT_MESSAGE });
      };
      const cast = (node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion): void => {
        const target = checker.getTypeFromTypeNode(toTs.get(node.typeAnnotation) as ts.TypeNode);
        // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
        if ((target.flags & UNPROVEN) === 0 && checker.isTypeAssignableTo(target, confirmed)) {
          context.report({ node, message: CAST_MESSAGE });
        }
      };
      return {
        [`Identifier[name='${MINT}']`]: read,
        [`MemberExpression[computed=true] > Literal.property[value='${MINT}']`]: read,
        [T.TSAsExpression]: cast,
        [T.TSTypeAssertion]: cast,
      };
    },
  };
}
