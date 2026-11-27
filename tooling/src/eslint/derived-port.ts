import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import { requireTypeServices } from "./checker.ts";
import { librarySources } from "./library-source.ts";
import { passesDbHandle, runtimeTypes } from "./port-ownership/foreign-types.ts";
import { procedureRestatements } from "./port-ownership/procedure-bound.ts";
import type { Restatement } from "./port-ownership/restated-port.ts";
import { memberLabel, placementOf, RELATION, restatementsAt } from "./port-ownership/restated-port.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { CONTRACT_FILE, declaredHere } from "./trpc-output.ts";

const MESSAGES = {
  copiedParameters: '{{restating}} hand-copies the parameters of {{owner}}: derive them (`Parameters<Owner["member"]>`) and narrow only the return.',
  handRestated:
    '{{restating}} hand-restates {{owner}}: derive it from the owner (`Owner["member"]`, or `Pick<Owner, …>` for a whole port) so the reference stays linked.',
  crossDomainDbHandle:
    "{{restating}} passes a db handle ({{handles}}) across domains from {{owner}} with no ledger row ruling the joint batch: rule it (tooling/src/eslint/port-ownership/ruled-ops.ts follows the ledger) or redesign it into an op that returns data.",
  crossDomainData:
    "{{restating}} restates {{owner}} across domains with domain data ({{types}}): move that data to packages/contracts; the runtime types stay with their owners and the signature stays in this domain's contract.",
  crossDomainShape:
    "{{restating}} restates {{owner}} across domains, and no domain imports another: move the shape to packages/contracts and derive both members from it.",
  restatedFields:
    "{{local}} restates fields of a contract type that flows straight into it ({{fields}}): derive it from the contract type (`Pick<Contract, …>`) so the reference stays linked.",
  restatedProcedure:
    "{{written}} restates the {{side}} of {{procedure}} ({{fields}}): derive it (`inferInput<…>` or `inferOutput<…>`, or the contracts type) and intersect only the client-only fields, so the reference stays linked.",
};

function reportFor(found: Restatement): { readonly messageId: keyof typeof MESSAGES; readonly data: Record<string, string> } {
  const pair = { restating: memberLabel(found.restating), owner: memberLabel(found.owner) };
  if (found.foreign === null) {
    return { messageId: found.relation === RELATION.params ? "copiedParameters" : "handRestated", data: pair };
  }
  if (passesDbHandle(found.foreign)) {
    return { messageId: "crossDomainDbHandle", data: { ...pair, handles: found.foreign.db.join(", ") } };
  }
  if (runtimeTypes(found.foreign).length > 0) {
    return { messageId: "crossDomainData", data: { ...pair, types: found.foreign.server.join(", ") } };
  }
  return { messageId: "crossDomainShape", data: pair };
}

// A one-field type picked from a wider contract shape is a name for one column; one that is the whole shape copies it.
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

const writtenLabel = (node: ts.TypeNode): string => {
  if (ts.isTypeReferenceNode(node)) {
    return node.typeName.getText();
  }
  return ts.isTypeLiteralNode(node) ? "This inline type" : "This type argument";
};

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
  const column = fields.length < SUBSET_MIN_FIELDS && checker.getPropertiesOfType(carried).length > fields.length;
  if (parameter.dotDotDotToken !== undefined || local === null || !declaredHere(carried) || fields.length === 0 || column) {
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
 *  that only repeats a subset of the fields of the contract type flowing into it, and a hand-written type argument a
 *  library binds to a tRPC procedure's whole input or output.
 *  The restating member is the higher-tier one. A cross-domain pair has no legal derive: its data moves to contracts,
 *  and a consumer signature left naming only contracts data and runtime types, or a ledger-ruled db handle, is the
 *  consumer's own contract. */
export const derivedPortMemberRule: OrbRule = {
  meta: { type: "problem", schema: [], messages: MESSAGES },
  create(context: OrbRuleContext): RuleVisitor {
    const { program, checker, esTreeNodeToTSNodeMap: toTsMap, tsNodeToESTreeNodeMap: toEsMap } = requireTypeServices(context);
    const sources = librarySources(program, context.cwd);
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
        const at = found === null ? undefined : toEsMap.get(found.local.name);
        if (found !== null && at !== undefined && !reported.has(found.local)) {
          reported.add(found.local);
          context.report({ node: at, messageId: "restatedFields", data: { local: found.local.name.text, fields: found.fields.join(", ") } });
        }
      }
    };
    // A type argument the call's library binds to a tRPC procedure's input or output, written by hand, restates it.
    // Only the linting package's own declarations are hand-written: a contracts, server or library field is a home.
    const site = placementOf(context.filename)?.pkg ?? null;
    const handWritten = (declaration: ts.Declaration): boolean => {
      const file = declaration.getSourceFile();
      return !(sources.isLibrary(file) || sources.isDefaultLibrary(file)) && (placementOf(file.fileName)?.pkg ?? null) === site;
    };
    const judgeProcedure = (node: TSESTree.CallExpression): void => {
      for (const found of procedureRestatements(checker, toTsMap.get(node), handWritten)) {
        const data = { written: writtenLabel(found.typeArgument), side: found.side, procedure: found.procedure, fields: found.fields.join(", ") };
        context.report({ node: toEsMap.get(found.typeArgument), messageId: "restatedProcedure", data });
      }
    };
    const judge = (node: TSESTree.Node): void => {
      for (const found of restatementsAt(sources, checker, toTsMap.get(node))) {
        // A ledger-ruled joint batch keeps its handle by ruling: the consumer's signature is its own contract.
        if (found.relation === RELATION.narrowed || found.ruling !== null) {
          continue;
        }
        context.report({ node, ...reportFor(found) });
      }
    };
    return {
      Property: judge,
      SpreadElement: judge,
      VariableDeclarator: judge,
      ReturnStatement: judge,
      CallExpression: (node: TSESTree.CallExpression): void => {
        judge(node);
        judgeProcedure(node);
        if (!inContract) {
          judgeSubset(node);
        }
      },
      NewExpression: judge,
    };
  },
};
