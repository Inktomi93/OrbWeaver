import type { RuleVisitor } from "@eslint/core";
import type { ParserServicesWithTypeInformation, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { baseUiBindings } from "./ui-composition.ts";

function nativeDeclarationContext(
  context: OrbRuleContext,
): Pick<ParserServicesWithTypeInformation, "program" | "esTreeNodeToTSNodeMap" | "tsNodeToESTreeNodeMap"> & { checker: ts.TypeChecker } {
  const services = context.sourceCode.parserServices;
  if (
    services?.program === undefined ||
    services.program === null ||
    services.esTreeNodeToTSNodeMap === undefined ||
    services.tsNodeToESTreeNodeMap === undefined
  ) {
    throw new Error("Native declaration contracts require the parser's owning TypeScript Program and node maps");
  }
  return {
    program: services.program,
    esTreeNodeToTSNodeMap: services.esTreeNodeToTSNodeMap,
    tsNodeToESTreeNodeMap: services.tsNodeToESTreeNodeMap,
    checker: services.program.getTypeChecker(),
  };
}

function nativeAliasFlag(symbol: ts.Symbol): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0;
}

function nativeDeclarationExported(node: ts.FunctionDeclaration, checker: ts.TypeChecker): boolean {
  if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true) {
    return true;
  }
  if (node.name === undefined) {
    return false;
  }
  const symbol = checker.getSymbolAtLocation(node.name);
  const module = checker.getSymbolAtLocation(node.getSourceFile());
  return (
    symbol !== undefined &&
    module !== undefined &&
    checker.getExportsOfModule(module).some((exported) => exported === symbol || (nativeAliasFlag(exported) && checker.getAliasedSymbol(exported) === symbol))
  );
}

export const testFactoryContractRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = nativeDeclarationContext(context);
    const check = (node: TSESTree.FunctionDeclaration | TSESTree.TSDeclareFunction) => {
      const declaration = native.esTreeNodeToTSNodeMap.get(node);
      if (!ts.isFunctionDeclaration(declaration) || declaration.name === undefined || !nativeDeclarationExported(declaration, native.checker)) {
        return;
      }
      const name = declaration.name.text;
      const parameters = declaration.parameters;
      const typeFlags =
        // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript formatting options compose a compiler-owned bitfield.
        ts.TypeFormatFlags.UseTypeOfFunction |
        ts.TypeFormatFlags.NoTruncation |
        ts.TypeFormatFlags.UseFullyQualifiedType |
        ts.TypeFormatFlags.WriteTypeArgumentsOfSignature;
      const pure =
        name.startsWith("make") &&
        parameters.some(
          (parameter) =>
            parameter.name.getText() === "db" ||
            native.checker.typeToString(native.checker.getTypeAtLocation(parameter), parameter, typeFlags).includes("Database"),
        );
      if (pure) {
        context.report({
          node: native.tsNodeToESTreeNodeMap.get(declaration.name),
          message: "a `make*` PURE builder accepts a db — a pure builder must stay db-free; persistence belongs to a `seed*` builder (Spine-Testing §4).",
        });
      }
    };
    return { FunctionDeclaration: check, TSDeclareFunction: check };
  },
};

const ROW_WRITE_METHODS = new Set(["insert", "update", "delete", "run", "execute", "batch"]);
const ROW_WRITE_OWNERS = new Set(["BaseSQLiteDatabase", "LibSQLDatabase", "SQLiteTransaction", "LibSQLTransaction"]);
const ROW_WRITE_PACKAGES = /\/node_modules\/drizzle-orm\//u;

function nativeRowWriteDeclaration(declaration: ts.Declaration | undefined): boolean {
  if (declaration === undefined || !(ts.isMethodDeclaration(declaration) || ts.isMethodSignature(declaration)) || !ts.isIdentifier(declaration.name)) {
    return false;
  }
  const owner = declaration.parent;
  return (
    ROW_WRITE_METHODS.has(declaration.name.text) &&
    (ts.isClassDeclaration(owner) || ts.isInterfaceDeclaration(owner)) &&
    owner.name !== undefined &&
    ROW_WRITE_OWNERS.has(owner.name.text) &&
    ROW_WRITE_PACKAGES.test(owner.getSourceFile().fileName.replaceAll("\\", "/"))
  );
}

// Spine-Testing §9: outside the persistence tier a test writes rows only through verbs. The resolved signature names the
// drizzle method however the call reaches it: a transaction handle, a root's db and a held db resolve alike. The raw
// libSQL client (`$client.execute`) is out of reach; no test calls it.
export const directRowWriteRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = nativeDeclarationContext(context);
    return {
      CallExpression: (node: TSESTree.CallExpression): void => {
        const call = native.esTreeNodeToTSNodeMap.get(node);
        if (ts.isCallExpression(call) && nativeRowWriteDeclaration(native.checker.getResolvedSignature(call)?.declaration)) {
          context.report({
            node: node.callee,
            message:
              "A direct database write outside the persistence tier: seed through a root seed from @orb/testkit/node/composed or the production verb; a test whose subject is the table moves under tests/db/ or a persistence/ directory (Spine-Testing §9).",
          });
        }
      },
    };
  },
};

export const contextReturnTypeRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = nativeDeclarationContext(context);
    const check = (node: TSESTree.Identifier) => {
      if (node.name !== "ReturnType") {
        return;
      }
      const declaration = native.esTreeNodeToTSNodeMap.get(node);
      const symbol = native.checker.getSymbolAtLocation(declaration);
      const declarations = symbol?.declarations ?? [];
      if (declarations.length > 0) {
        if (
          declarations.some(
            (item) =>
              native.program.isSourceFileDefaultLibrary(item.getSourceFile()) ||
              item.getSourceFile().fileName.replaceAll("\\", "/").includes("/node_modules/@types/"),
          ) &&
          declarations.every((item) => {
            const source = item.getSourceFile();
            const current = ts.findAncestor(item.parent, ts.isModuleDeclaration);
            return (
              source.isDeclarationFile &&
              (!source.statements.some((statement) => ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
                (current !== undefined && current.name.getText().replaceAll(/["']/gu, "") === "global"))
            );
          })
        ) {
          context.report({ node, message: "The DI bundle type must be an explicit, hand-written interface, never reflected off a builder with ReturnType." });
        }
        return;
      }
      context.report({
        node,
        message: "Whether this ReturnType is TypeScript's reflected utility or a local type CANNOT be established: the checker binds it to no declaration.",
      });
    };
    return { Identifier: check };
  },
};

export const AMBIENT_GLOBAL_RECEIVERS = new Set(["globalThis", "self", "window"]);

function nativeUnwrapExpression(raw: ts.Node): ts.Node {
  let node = raw;
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
    node = node.expression;
  }
  return node;
}

function nativeSubtreeSome(node: ts.Node, predicate: (node: ts.Node) => boolean): boolean {
  return predicate(node) || ts.forEachChild(node, (child) => nativeSubtreeSome(child, predicate) || undefined) === true;
}

function nativeOwningCallable(node: ts.Node): ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression | ts.MethodDeclaration | undefined {
  return ts.findAncestor(
    node.parent,
    (ancestor): ancestor is ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression | ts.MethodDeclaration =>
      ts.isFunctionDeclaration(ancestor) || ts.isArrowFunction(ancestor) || ts.isFunctionExpression(ancestor) || ts.isMethodDeclaration(ancestor),
  );
}

function nativePortalExpression(attribute: ts.JsxAttribute | undefined): ts.Node | undefined {
  const initializer = attribute?.initializer;
  return initializer !== undefined && ts.isJsxExpression(initializer) && initializer.expression !== undefined
    ? nativeUnwrapExpression(initializer.expression)
    : undefined;
}

export const baseUiPortalContainerRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = nativeDeclarationContext(context);
    const tags = new Set(
      baseUiBindings(context.sourceCode.ast)
        .filter((binding) => !binding.typeOnly)
        .map((binding) => `${binding.local}.Portal`),
    );
    const declarations = (node: ts.Node) => native.checker.getSymbolAtLocation(node)?.declarations ?? [];
    const check = (node: TSESTree.JSXOpeningElement) => {
      if (!tags.has(context.sourceCode.getText(node.name))) {
        return;
      }
      const portal = native.esTreeNodeToTSNodeMap.get(node);
      const callable = nativeOwningCallable(portal);
      const parameters = callable?.parameters ?? [];
      const present = parameters.some((parameter) => native.checker.getTypeAtLocation(parameter).getProperty("container") !== undefined);
      if (!present) {
        context.report({
          node: node.name,
          message: "The owning callable accepts no `container` prop at all; the caller cannot place this sealed Base UI portal.",
        });
        return;
      }
      const attribute = portal.attributes.properties.find(
        (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText() === "container",
      );
      const expression = nativePortalExpression(attribute);
      const parameterRead = (value: ts.Node) =>
        ts.isIdentifier(value) && declarations(value).some((declaration) => parameters.some((parameter) => parameter === declaration));
      const bindingFromParameter = (binding: ts.BindingElement) => {
        const parameter = ts.findAncestor(binding.parent, ts.isParameter);
        if (parameter !== undefined) {
          return parameters.some((candidate) => candidate === parameter);
        }
        const declaration = ts.findAncestor(binding.parent, ts.isVariableDeclaration);
        return declaration?.initializer !== undefined && parameterRead(nativeUnwrapExpression(declaration.initializer));
      };
      const forbidden =
        expression === undefined ||
        (ts.isIdentifier(expression) && expression.text === "undefined") ||
        expression.kind === ts.SyntaxKind.NullKeyword ||
        nativeSubtreeSome(
          expression,
          (value) => ts.isPropertyAccessExpression(value) && value.name.text === "body" && value.expression.getText() === "document",
        );
      const consumes =
        !forbidden &&
        nativeSubtreeSome(
          expression,
          (value) =>
            (ts.isPropertyAccessExpression(value) && value.name.text === "container" && parameterRead(nativeUnwrapExpression(value.expression))) ||
            (ts.isIdentifier(value) &&
              value.text === "container" &&
              declarations(value).some((declaration) => ts.isBindingElement(declaration) && bindingFromParameter(declaration))),
        );
      if (!consumes) {
        context.report({
          node: attribute === undefined ? node.name : native.tsNodeToESTreeNodeMap.get(attribute.name),
          message: "The container prop exists but this Base UI Portal target does not consume it; the caller seam is a dead wire.",
        });
      }
    };
    return { JSXOpeningElement: check };
  },
};
