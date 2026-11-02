import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import type { Restatement } from "../unwired/index.ts";
import { memberLabel, passesDbHandle, RELATION, restatementsAt, runtimeTypes } from "../unwired/index.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { CONTRACT_FILE, declaredHere } from "./trpc-output.ts";

function messageFor(found: Restatement): string {
  const restating = memberLabel(found.restating);
  const owner = memberLabel(found.owner);
  if (found.foreign === null && found.relation === RELATION.params) {
    return `${restating} hand-copies the parameters of ${owner}: derive them (\`Parameters<Owner["member"]>\`) and narrow only the return.`;
  }
  if (found.foreign === null) {
    return `${restating} hand-restates ${owner}: derive it from the owner (\`Owner["member"]\`, or \`Pick<Owner, …>\` for a whole port) so the reference stays linked.`;
  }
  if (passesDbHandle(found.foreign)) {
    return `${restating} passes a db handle (${found.foreign.db.join(", ")}) across domains from ${owner} with no ledger row ruling the joint batch: rule it (tooling/src/unwired/ruled-ops.ts follows the ledger) or redesign it into an op that returns data.`;
  }
  if (runtimeTypes(found.foreign).length > 0) {
    return `${restating} restates ${owner} across domains with domain data (${found.foreign.server.join(", ")}): move that data to packages/contracts; the runtime types stay with their owners and the signature stays in this domain's contract.`;
  }
  return `${restating} restates ${owner} across domains, and no domain imports another: move the shape to packages/contracts and derive both members from it.`;
}

// A one-field type is a name for one column, not a copy of a contract's shape.
const SUBSET_MIN_FIELDS = 2;

// The element of an array type, else the type itself.
function elementOrSelf(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  return checker.isArrayLikeType(type) ? (checker.getIndexTypeOfType(type, ts.IndexKind.Number) ?? type) : type;
}

// A type parameter stands for its constraint: `Room extends Candidate` accepts what `Candidate` accepts.
function slotOf(checker: ts.TypeChecker, parameter: ts.ParameterDeclaration): ts.Type {
  const element = elementOrSelf(checker, checker.getTypeAtLocation(parameter));
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  return (element.flags & ts.TypeFlags.TypeParameter) === 0 ? element : (checker.getBaseConstraintOfType(element) ?? element);
}

// The declaration of a type that lives only in this file: not exported, so nothing else can share it.
function localDeclaration(type: ts.Type, file: ts.SourceFile): ts.InterfaceDeclaration | ts.TypeAliasDeclaration | null {
  const declaration = (type.aliasSymbol ?? type.getSymbol())?.declarations?.[0];
  if (
    declaration === undefined ||
    declaration.getSourceFile() !== file ||
    !(ts.isInterfaceDeclaration(declaration) || (ts.isTypeAliasDeclaration(declaration) && ts.isTypeLiteralNode(declaration.type))) ||
    ts.getModifiers(declaration)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) === true
  ) {
    return null;
  }
  const exported = file.statements.some(
    (statement) =>
      ts.isExportDeclaration(statement) &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some(({ propertyName, name }) => (propertyName ?? name).text === declaration.name.text),
  );
  return exported ? null : declaration;
}

interface SubsetRestatement {
  readonly local: ts.InterfaceDeclaration | ts.TypeAliasDeclaration;
  readonly fields: readonly string[];
}

// The local type `parameter` names, when the contract value passed as `argument` already holds every one of its fields.
function subsetRestatement(checker: ts.TypeChecker, argument: ts.Expression, parameter: ts.ParameterDeclaration): SubsetRestatement | null {
  const slot = slotOf(checker, parameter);
  const local = localDeclaration(slot, argument.getSourceFile());
  const carried = elementOrSelf(checker, checker.getTypeAtLocation(argument));
  const fields = checker.getPropertiesOfType(slot);
  if (parameter.dotDotDotToken !== undefined || local === null || !declaredHere(carried) || fields.length < SUBSET_MIN_FIELDS) {
    return null;
  }
  const held = fields.every((field) => {
    const owned = checker.getPropertyOfType(carried, field.getName());
    return (
      owned !== undefined && checker.isTypeAssignableTo(checker.getTypeOfSymbolAtLocation(owned, argument), checker.getTypeOfSymbolAtLocation(field, argument))
    );
  });
  return held ? { local, fields: fields.map((field) => field.getName()) } : null;
}

/** Refuses a port member whose hand-written function type is identical to the member flowing into it, and a local type
 *  that only repeats a subset of the fields of the contract type flowing into it.
 *  The restating member is the higher-tier one. A cross-domain pair has no legal derive: its data moves to contracts,
 *  and a consumer signature left naming only contracts data and runtime types, or a ledger-ruled db handle, is the
 *  consumer's own contract. */
export const derivedPortMemberRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const services = context.sourceCode.parserServices;
    const toTsMap = services?.esTreeNodeToTSNodeMap;
    const program = services?.program ?? null;
    if (program === null || toTsMap === undefined) {
      return {};
    }
    const checker = program.getTypeChecker();
    const reported = new Set<ts.Node>();
    // A contract file builds its own shapes from each other; a restatement is judged where a consumer declares one.
    const inContract = CONTRACT_FILE.test(context.filename.replaceAll("\\", "/"));
    // A local type whose every field a contract type already holds, handed that contract's values straight in as a call
    // argument or through a generic constraint, restates the contract: derive it with `Pick`.
    const judgeSubset = (node: TSESTree.CallExpression): void => {
      const call = toTsMap.get(node);
      const declaration = checker.getResolvedSignature(call)?.declaration;
      if (declaration === undefined || ts.isJSDocSignature(declaration)) {
        return;
      }
      for (const [index, argument] of call.arguments.entries()) {
        const parameter = declaration.parameters[index];
        const found = parameter === undefined ? null : subsetRestatement(checker, argument, parameter);
        const at = found === null ? undefined : services?.tsNodeToESTreeNodeMap?.get(found.local.name);
        if (found !== null && at !== undefined && !reported.has(found.local)) {
          reported.add(found.local);
          context.report({
            node: at,
            message: `${found.local.name.text} restates fields of a contract type that flows straight into it (${found.fields.join(", ")}): derive it from the contract type (\`Pick<Contract, …>\`) so the reference stays linked.`,
          });
        }
      }
    };
    const judge = (node: TSESTree.Node): void => {
      for (const found of restatementsAt(checker, toTsMap.get(node))) {
        // A ledger-ruled joint batch keeps its handle by ruling: the consumer's signature is its own contract.
        if (found.relation === RELATION.narrowed || found.ruling !== null) {
          continue;
        }
        context.report({ node, message: messageFor(found) });
      }
    };
    return {
      Property: judge,
      SpreadElement: judge,
      VariableDeclarator: judge,
      ReturnStatement: judge,
      CallExpression: (node: TSESTree.CallExpression): void => {
        judge(node);
        if (!inContract) {
          judgeSubset(node);
        }
      },
      NewExpression: judge,
    };
  },
};
