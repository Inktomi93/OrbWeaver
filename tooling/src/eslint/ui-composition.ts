import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { contextDirectArgument } from "./static-values.ts";
import type { OrbRule, OrbRuleContext, Source } from "./syntax.ts";
import { restrictionRule } from "./syntax.ts";
import { CLIENT_CONTEXT_RESTRICTIONS, STATE_FILES_SELECTORS, STATE_MINT, STATE_MINT_NAMES } from "./ui-policy.ts";

const REGISTRY_CONTEXT_MESSAGE =
  "A createContext typed over a registry belongs in the createRegistryContext mint (packages/client/src/lib/create-registry-context.tsx); a hand-rolled context, hook and provider trio drifts from the one shape.";

const REGISTRY_CONTEXT_UNREADABLE =
  "This createContext call is on a receiver that is not an import, so whether it is React's context constructor cannot be established. Reported rather than passed; call createContext through a named React import.";

const REGISTRY_NAME = /Registry$/u;

const REGISTRY_ALIAS_HOPS = 8;

function writtenTypeNames(type: TSESTree.TypeNode): TSESTree.EntityName[] {
  if (type.type === "TSUnionType") {
    return type.types.flatMap(writtenTypeNames);
  }
  return type.type === "TSTypeReference" ? [type.typeName] : [];
}

function namesRegistry(typeName: TSESTree.EntityName, registryNames: ReadonlySet<string>): boolean {
  if (typeName.type === "Identifier") {
    return registryNames.has(typeName.name);
  }
  return typeName.type === "TSQualifiedName" && REGISTRY_NAME.test(typeName.right.name);
}

const PROJECT_MODULE = /^(?:\.|#|@orb\/)/u;

function recordRegistryImport(node: TSESTree.ImportDeclaration, imports: RegistryImports): void {
  const react = node.source.value === "react" || PROJECT_MODULE.test(node.source.value);
  for (const specifier of node.specifiers) {
    const local = specifier.local.name;
    if (specifier.type !== "ImportSpecifier") {
      (react ? imports.namespaces : imports.others).add(local);
      continue;
    }
    const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : undefined;
    (react && imported === "createContext" ? imports.constructors : imports.others).add(local);
    if (imported !== undefined && REGISTRY_NAME.test(imported)) {
      imports.registryNames.add(local);
    }
  }
}

function isCreateContextMember(callee: TSESTree.Node): callee is TSESTree.MemberExpression {
  if (callee.type !== "MemberExpression") {
    return false;
  }
  if (!callee.computed) {
    return (callee.property as TSESTree.Identifier | TSESTree.PrivateIdentifier).name === "createContext";
  }
  const { property } = callee;
  if (property.type === "TemplateLiteral") {
    return property.expressions.length === 0 && (property.quasis[0] as TSESTree.TemplateElement).value.cooked === "createContext";
  }
  return property.type === "Literal" && property.value === "createContext";
}

function createContextVerdict(callee: TSESTree.Node, imports: RegistryImports): "react" | "other" | "unreadable" {
  if (callee.type === "Identifier") {
    return imports.constructors.has(callee.name) ? "react" : "other";
  }
  if (!isCreateContextMember(callee)) {
    return "other";
  }
  const receiver = callee.object.type === "Identifier" ? callee.object.name : undefined;
  if (receiver !== undefined && imports.namespaces.has(receiver)) {
    return "react";
  }
  return receiver !== undefined && imports.others.has(receiver) ? "other" : "unreadable";
}

function closeRegistryAliases(aliases: readonly RegistryAlias[], registryNames: Set<string>): void {
  for (let hop = 0; hop < REGISTRY_ALIAS_HOPS; hop += 1) {
    const known = registryNames.size;
    for (const { name, refs } of aliases) {
      if (refs.some((ref) => namesRegistry(ref, registryNames))) {
        registryNames.add(name);
      }
    }
    if (registryNames.size === known) {
      return;
    }
  }
}

export const registryContextRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const imports: RegistryImports = { constructors: new Set(), namespaces: new Set(), others: new Set(), registryNames: new Set() };
    const aliases: RegistryAlias[] = [];
    const calls: { callee: TSESTree.Expression; argument: TSESTree.TypeNode }[] = [];
    return {
      "ImportDeclaration:exit"(node: TSESTree.ImportDeclaration): void {
        recordRegistryImport(node, imports);
      },
      "TSTypeAliasDeclaration:exit"(node: TSESTree.TSTypeAliasDeclaration): void {
        aliases.push({ name: node.id.name, refs: writtenTypeNames(node.typeAnnotation) });
      },
      "CallExpression:exit"(node: TSESTree.CallExpression): void {
        const argument = node.typeArguments?.params[0];
        if (argument !== undefined) {
          calls.push({ callee: node.callee, argument });
        }
      },
      "Program:exit"(): void {
        closeRegistryAliases(aliases, imports.registryNames);
        for (const { callee, argument } of calls) {
          const verdict = createContextVerdict(callee, imports);
          if (verdict === "unreadable") {
            context.report({ node: argument, message: REGISTRY_CONTEXT_UNREADABLE });
          } else if (verdict === "react" && writtenTypeNames(argument).some((ref) => namesRegistry(ref, imports.registryNames))) {
            context.report({ node: argument, message: REGISTRY_CONTEXT_MESSAGE });
          }
        }
      },
    };
  },
};

export const stateFilesRule: OrbRule = ((): OrbRule => {
  const selectorRule = restrictionRule({ selectors: STATE_FILES_SELECTORS });
  return {
    ...selectorRule,
    create(context: OrbRuleContext): RuleVisitor {
      let mints = 0;
      return {
        ...selectorRule.create(context),
        "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator"(node: TSESTree.VariableDeclarator): void {
          for (let cursor: TSESTree.Node | null = node.init; cursor?.type === "CallExpression"; cursor = cursor.callee) {
            if (cursor.callee.type === "Identifier" && STATE_MINT_NAMES.includes(cursor.callee.name)) {
              context.report({
                node,
                message:
                  "The minted store handle is exported. Export intent-named actions and narrow read hooks, never a raw set/getState handle across the module boundary.",
              });
              return;
            }
          }
        },
        [`CallExpression[callee.name=${STATE_MINT}]`](node: TSESTree.CallExpression): void {
          mints += 1;
          if (mints > 1) {
            context.report({ node, message: "A second store-minting call in one state file; one store per file, so split them." });
          }
        },
      };
    },
  };
})();

const STORE_HOOK_RE = /^use[A-Z].*Store$/u;

const STORE_ARRAY_REBUILDS = new Set(["map", "filter", "flatMap", "slice", "concat", "toSorted", "toReversed", "toSpliced"]);

const STORE_OBJECT_DERIVATIONS = new Set(["keys", "values", "entries"]);

function storeSelector(call: TSESTree.CallExpression, sourceCode: Source): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | undefined {
  if (call.callee.type !== "Identifier" || call.range[0] !== call.callee.range[0]) {
    return;
  }
  const hook = sourceCode.getText(call.callee);
  if (!STORE_HOOK_RE.test(hook) && hook !== "useStore") {
    return;
  }
  const selector = call.arguments[hook === "useStore" ? 1 : 0];
  return selector !== undefined &&
    (selector.type === "ArrowFunctionExpression" || selector.type === "FunctionExpression") &&
    contextDirectArgument(call, selector, sourceCode)
    ? selector
    : undefined;
}

function storeCallDerivation(call: TSESTree.CallExpression, sourceCode: Source): string | undefined {
  const callee = call.callee;
  if (callee.type !== "MemberExpression" || callee.computed || call.range[0] !== callee.range[0]) {
    return;
  }
  const name = callee.property.type === "Identifier" ? callee.property.name : undefined;
  if (
    callee.object.type === "Identifier" &&
    callee.range[0] === callee.object.range[0] &&
    sourceCode.getText(callee.object) === "Object" &&
    STORE_OBJECT_DERIVATIONS.has(name as string)
  ) {
    return `Object.${name}(...) derivation`;
  }
  return STORE_ARRAY_REBUILDS.has(name as string) ? `array-rebuilding .${name}(...) call` : undefined;
}

function storeFreshDerivation(raw: TSESTree.Node, sourceCode: Source): string | undefined {
  let node = raw;
  while (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
    node = node.expression;
  }
  if (node.type === "ObjectExpression" || node.type === "ArrayExpression") {
    return node.type === "ObjectExpression" ? "object literal" : "array literal";
  }
  if (node.type === "ConditionalExpression") {
    return storeFreshDerivation(node.consequent, sourceCode) ?? storeFreshDerivation(node.alternate, sourceCode);
  }
  if (node.type === "LogicalExpression") {
    return storeFreshDerivation(node.left, sourceCode) ?? storeFreshDerivation(node.right, sourceCode);
  }
  const call = node.type === "ChainExpression" ? node.expression : node;
  return call.type === "CallExpression" ? storeCallDerivation(call, sourceCode) : undefined;
}

function storeReturnOwner(node: TSESTree.Node, sourceCode: Source): TSESTree.Node | undefined {
  return sourceCode.getAncestors(node).findLast((ancestor) => {
    if (ancestor.type === "ArrowFunctionExpression" || ancestor.type === "FunctionDeclaration") {
      return true;
    }
    // Accessor and constructor boundaries are excluded from the selector output grammar.
    if (ancestor.type !== "FunctionExpression") {
      return false;
    }
    const parent = ancestor.parent;
    return !((parent.type === "MethodDefinition" || parent.type === "Property") && ["get", "set", "constructor"].includes(parent.kind));
  });
}

export const storeDerivedRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const returns = new Map<TSESTree.Node | undefined, TSESTree.Expression[]>();
    return {
      "ReturnStatement[argument]"(node: TSESTree.ReturnStatement): void {
        if (node.argument === null) {
          return;
        }
        const owner = storeReturnOwner(node, context.sourceCode);
        const outputs = returns.get(owner) ?? [];
        outputs.push(node.argument);
        returns.set(owner, outputs);
      },
      "CallExpression:exit"(node: TSESTree.CallExpression): void {
        const selector = storeSelector(node, context.sourceCode);
        if (selector === undefined) {
          return;
        }
        const outputs = selector.body.type === "BlockStatement" ? (returns.get(selector) ?? []) : [selector.body];
        const kind = outputs.map((output) => storeFreshDerivation(output, context.sourceCode)).find((value) => value !== undefined);
        if (kind !== undefined) {
          context.report({
            node: node.callee,
            message: `Store selector returns a fresh reference; use useShallow or a stable field/default. DERIVATION: ${kind}.`,
          });
        }
      },
    };
  },
};

export function baseUiBindings(program: TSESTree.Program): { local: string; exported: string; typeOnly: boolean }[] {
  return program.body.flatMap((node) =>
    node.type !== "ImportDeclaration" || !node.source.value.startsWith("@base-ui/react/")
      ? []
      : node.specifiers
          .filter((specifier) => specifier.type === "ImportSpecifier")
          .map((specifier) => ({
            local: specifier.local.name,
            exported: specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value,
            typeOnly: node.importKind === "type" || specifier.importKind === "type",
          })),
  );
}

export const registerApiRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const entry = CLIENT_CONTEXT_RESTRICTIONS.find(({ id }) => id === "no-mutating-register-api");
    return {
      ...restrictionRule(entry as (typeof CLIENT_CONTEXT_RESTRICTIONS)[number]).create(context),
      "VariableDeclarator[id.type='Identifier'][id.name='register']:exit"(node: TSESTree.VariableDeclarator): void {
        if (
          (node.init?.type === "ArrowFunctionExpression" || node.init?.type === "FunctionExpression") &&
          (context.sourceCode.getTokenBefore(node.init) as TSESTree.Token).value === "="
        ) {
          context.report({ node: node.id, message: "Export definition values for door assembly, not a mutating register API." });
        }
      },
    };
  },
};

const FLOORLESS_WRAP = /\bflex-wrap\b/u;

const FLOORLESS_ROW_FLOOR = /\bmin-h-touch-target\b|\bmin-h-control-[a-z]+\b|pointer-coarse:min-h-[a-z-]+/u;

const FLOORLESS_STACK_CONTROL = /rows\s*=\s*(?:\{\s*)?["']control["']/u;

function floorlessVariableBody(declaration: TSESTree.VariableDeclarator, sourceCode: Source): TSESTree.BlockStatement | TSESTree.Expression | undefined {
  const init = declaration.init;
  if (init === null || !(init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") || sourceCode.getTokenBefore(init)?.value !== "=") {
    return;
  }
  return init.body;
}

function floorlessComponentBodies(program: TSESTree.Program, sourceCode: Source): Map<string, TSESTree.Node | undefined> {
  const declarations = program.body
    .map((node) => {
      if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration") {
        return node.declaration;
      }
      return node.type === "ExportAllDeclaration" ? undefined : node;
    })
    .filter((node) => node !== null && node !== undefined);
  const bodies = new Map<string, TSESTree.Node | undefined>();
  for (const node of declarations) {
    if (node.type === "FunctionDeclaration" && node.id !== null && !bodies.has(node.id.name)) {
      bodies.set(node.id.name, node.body);
    }
  }
  for (const node of declarations.filter((declaration): declaration is TSESTree.VariableDeclaration => declaration.type === "VariableDeclaration")) {
    for (const declaration of node.declarations) {
      if (declaration.id.type !== "Identifier" || bodies.has(declaration.id.name)) {
        continue;
      }
      bodies.set(declaration.id.name, floorlessVariableBody(declaration, sourceCode));
    }
  }
  return bodies;
}

function floorlessMapCall(node: TSESTree.Node | undefined, sourceCode: Source): TSESTree.CallExpression | undefined {
  const call = node?.type === "ChainExpression" ? node.expression : node;
  if (call?.type !== "CallExpression" || call.callee.type !== "MemberExpression" || call.callee.computed) {
    return;
  }
  return sourceCode.getText(call.callee).endsWith(".map") && (sourceCode.getFirstToken(call) as TSESTree.Token).range[0] === call.callee.range[0]
    ? call
    : undefined;
}

function floorlessDirectCallback(callback: TSESTree.Node, call: TSESTree.CallExpression, sourceCode: Source): boolean {
  const before = sourceCode.getTokenBefore(callback);
  const afterCallee = sourceCode.getTokenAfter(call.typeArguments ?? call.callee) as TSESTree.Token;
  const opening = afterCallee.value === "?." ? (sourceCode.getTokenAfter(afterCallee) as TSESTree.Token) : afterCallee;
  return before?.value === "," || before?.range[0] === opening.range[0];
}

function floorlessMappedRow(child: TSESTree.JSXChild, sourceCode: Source): TSESTree.JSXElement | undefined {
  if (child.type !== "JSXExpressionContainer") {
    return;
  }
  const call = floorlessMapCall(child.expression, sourceCode);
  if (call === undefined || (sourceCode.getTokenAfter(sourceCode.getFirstToken(child) as TSESTree.Token) as TSESTree.Token).range[0] !== call.range[0]) {
    return;
  }
  const callback = call.arguments[0];
  if (callback?.type !== "ArrowFunctionExpression" || !floorlessDirectCallback(callback, call, sourceCode) || callback.body.type !== "JSXElement") {
    return;
  }
  // ESTree erases parentheses; the declared map-row grammar unwraps exactly one return wrapper.
  const beforeBody = sourceCode.getTokenBefore(callback.body) as TSESTree.Token;
  const direct = beforeBody.value === "=>" || (beforeBody.value === "(" && (sourceCode.getTokenBefore(beforeBody) as TSESTree.Token).value === "=>");
  return direct ? callback.body : undefined;
}

export const floorlessControlRule = (floorlessButtonSizes: ReadonlySet<string>): OrbRule => ({
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const sourceCode = context.sourceCode;
    const counts = new Map<TSESTree.Node | undefined, number>();
    const sizes: { node: TSESTree.JSXAttribute; value: TSESTree.Literal; token: string }[] = [];
    const stacks: TSESTree.JSXElement[] = [];
    let bodies: ReturnType<typeof floorlessComponentBodies>;
    const rowIsFloorless = (element: TSESTree.JSXElement): boolean => {
      const opening = element.openingElement;
      const ownClass = opening.attributes.find((attribute) => attribute.type === "JSXAttribute" && attribute.name.name === "className");
      if (ownClass !== undefined && FLOORLESS_ROW_FLOOR.test(sourceCode.getText(ownClass))) {
        return false;
      }
      return (counts.get(element) ?? 0) > 0 || (counts.get(bodies.get(sourceCode.getText(opening.name))) ?? 0) > 0;
    };
    const mappedWithin = (owner: TSESTree.JSXOpeningElement, container: TSESTree.JSXElement): boolean => {
      let current: TSESTree.Node | undefined = owner.parent;
      while (current.type !== "Program" && current !== container) {
        if (["ArrowFunctionExpression", "FunctionExpression"].includes(current.type)) {
          const call = floorlessMapCall(current.parent, sourceCode);
          if (call !== undefined && floorlessDirectCallback(current, call, sourceCode)) {
            return true;
          }
        }
        current = current.parent;
      }
      return false;
    };
    const wrapContainer = (opening: TSESTree.JSXOpeningElement): TSESTree.JSXElement | undefined => {
      const ancestors = sourceCode.getAncestors(opening);
      if (opening.selfClosing) {
        ancestors.pop();
      }
      return ancestors.findLast(
        (current): current is TSESTree.JSXElement =>
          current.type === "JSXElement" && !current.openingElement.selfClosing && FLOORLESS_WRAP.test(sourceCode.getText(current.openingElement)),
      );
    };
    const report = (start: number, token: string): void =>
      context.report({
        loc: { start: sourceCode.getLocFromIndex(start), end: sourceCode.getLocFromIndex(start + token.length) },
        message: 'Floorless Button controls repeat at a wrapping or vertical pitch; use a control size, Stack rows="control", or an explicit row floor.',
      });
    const rowWeight = (child: TSESTree.JSXChild): number => {
      const mapped = floorlessMappedRow(child, sourceCode);
      const row = child.type === "JSXElement" ? child : mapped;
      if (row === undefined || !rowIsFloorless(row)) {
        return 0;
      }
      return mapped === undefined ? 1 : 2;
    };
    const judgeStack = (stack: TSESTree.JSXElement): void => {
      if (FLOORLESS_STACK_CONTROL.test(sourceCode.getText(stack.openingElement))) {
        return;
      }
      if (stack.children.reduce((weight, child) => weight + rowWeight(child), 0) >= 2) {
        report(stack.openingElement.name.range[0], "Stack");
      }
    };
    const judgeSize = ({ node, value, token }: (typeof sizes)[number]): void => {
      const container = wrapContainer(node.parent);
      if (container !== undefined && (mappedWithin(node.parent, container) || (counts.get(container) ?? 0) >= 2)) {
        report(value.range[0] + 1, token);
      }
    };
    return {
      ["Program"]: (program: TSESTree.Program): void => {
        bodies = floorlessComponentBodies(program, sourceCode);
      },
      "JSXElement:exit"(node: TSESTree.JSXElement): void {
        if (!node.openingElement.selfClosing && sourceCode.getText(node.openingElement.name) === "Stack") {
          stacks.push(node);
        }
      },
      "JSXAttribute:exit"(node: TSESTree.JSXAttribute): void {
        if (node.name.name !== "size" || node.value?.type !== "Literal" || sourceCode.getText(node.parent.name) !== "Button") {
          return;
        }
        const token = sourceCode.getText(node.value).slice(1, -1);
        if (!floorlessButtonSizes.has(token)) {
          return;
        }
        sizes.push({ node, value: node.value, token });
        for (const ancestor of sourceCode.getAncestors(node)) {
          counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1);
        }
      },
      "Program:exit"(): void {
        stacks.forEach(judgeStack);
        sizes.forEach(judgeSize);
      },
    };
  },
});

interface RegistryImports {
  constructors: Set<string>;
  namespaces: Set<string>;
  others: Set<string>;
  registryNames: Set<string>;
}
interface RegistryAlias {
  name: string;
  refs: TSESTree.EntityName[];
}
