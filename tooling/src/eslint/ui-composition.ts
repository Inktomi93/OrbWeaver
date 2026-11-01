import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
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
  if (type.type === AST_NODE_TYPES.TSUnionType) {
    return type.types.flatMap(writtenTypeNames);
  }
  return type.type === AST_NODE_TYPES.TSTypeReference ? [type.typeName] : [];
}

function namesRegistry(typeName: TSESTree.EntityName, registryNames: ReadonlySet<string>): boolean {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return registryNames.has(typeName.name);
  }
  return typeName.type === AST_NODE_TYPES.TSQualifiedName && REGISTRY_NAME.test(typeName.right.name);
}

const PROJECT_MODULE = /^(?:\.|#|@orb\/)/u;

function recordRegistryImport(node: TSESTree.ImportDeclaration, imports: RegistryImports): void {
  const react = node.source.value === "react" || PROJECT_MODULE.test(node.source.value);
  for (const specifier of node.specifiers) {
    const local = specifier.local.name;
    if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) {
      (react ? imports.namespaces : imports.others).add(local);
      continue;
    }
    const imported = specifier.imported.type === AST_NODE_TYPES.Identifier ? specifier.imported.name : undefined;
    (react && imported === "createContext" ? imports.constructors : imports.others).add(local);
    if (imported !== undefined && REGISTRY_NAME.test(imported)) {
      imports.registryNames.add(local);
    }
  }
}

function isCreateContextMember(callee: TSESTree.Node): callee is TSESTree.MemberExpression {
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  if (!callee.computed) {
    return (callee.property as TSESTree.Identifier | TSESTree.PrivateIdentifier).name === "createContext";
  }
  const { property } = callee;
  if (property.type === AST_NODE_TYPES.TemplateLiteral) {
    return property.expressions.length === 0 && (property.quasis[0] as TSESTree.TemplateElement).value.cooked === "createContext";
  }
  return property.type === AST_NODE_TYPES.Literal && property.value === "createContext";
}

function createContextVerdict(callee: TSESTree.Node, imports: RegistryImports): "react" | "other" | "unreadable" {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return imports.constructors.has(callee.name) ? "react" : "other";
  }
  if (!isCreateContextMember(callee)) {
    return "other";
  }
  const receiver = callee.object.type === AST_NODE_TYPES.Identifier ? callee.object.name : undefined;
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
          for (let cursor: TSESTree.Node | null = node.init; cursor?.type === AST_NODE_TYPES.CallExpression; cursor = cursor.callee) {
            if (cursor.callee.type === AST_NODE_TYPES.Identifier && STATE_MINT_NAMES.includes(cursor.callee.name)) {
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
  if (call.callee.type !== AST_NODE_TYPES.Identifier || call.range[0] !== call.callee.range[0]) {
    return;
  }
  const hook = sourceCode.getText(call.callee);
  if (!STORE_HOOK_RE.test(hook) && hook !== "useStore") {
    return;
  }
  const selector = call.arguments[hook === "useStore" ? 1 : 0];
  return selector !== undefined &&
    (selector.type === AST_NODE_TYPES.ArrowFunctionExpression || selector.type === AST_NODE_TYPES.FunctionExpression) &&
    contextDirectArgument(call, selector, sourceCode)
    ? selector
    : undefined;
}

function storeCallDerivation(call: TSESTree.CallExpression, sourceCode: Source): string | undefined {
  const callee = call.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed || call.range[0] !== callee.range[0]) {
    return;
  }
  const name = callee.property.type === AST_NODE_TYPES.Identifier ? callee.property.name : undefined;
  if (
    callee.object.type === AST_NODE_TYPES.Identifier &&
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
  while (node.type === AST_NODE_TYPES.TSAsExpression || node.type === AST_NODE_TYPES.TSSatisfiesExpression) {
    node = node.expression;
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression || node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.type === AST_NODE_TYPES.ObjectExpression ? "object literal" : "array literal";
  }
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return storeFreshDerivation(node.consequent, sourceCode) ?? storeFreshDerivation(node.alternate, sourceCode);
  }
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    return storeFreshDerivation(node.left, sourceCode) ?? storeFreshDerivation(node.right, sourceCode);
  }
  const call = node.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
  return call.type === AST_NODE_TYPES.CallExpression ? storeCallDerivation(call, sourceCode) : undefined;
}

function storeReturnOwner(node: TSESTree.Node, sourceCode: Source): TSESTree.Node | undefined {
  return sourceCode.getAncestors(node).findLast((ancestor) => {
    if (ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression || ancestor.type === AST_NODE_TYPES.FunctionDeclaration) {
      return true;
    }
    // Accessor and constructor boundaries are excluded from the selector output grammar.
    if (ancestor.type !== AST_NODE_TYPES.FunctionExpression) {
      return false;
    }
    const parent = ancestor.parent;
    return !(
      (parent.type === AST_NODE_TYPES.MethodDefinition || parent.type === AST_NODE_TYPES.Property) &&
      ["get", "set", "constructor"].includes(parent.kind)
    );
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
        const outputs = selector.body.type === AST_NODE_TYPES.BlockStatement ? (returns.get(selector) ?? []) : [selector.body];
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
    node.type !== AST_NODE_TYPES.ImportDeclaration || !node.source.value.startsWith("@base-ui/react/")
      ? []
      : node.specifiers
          .filter((specifier) => specifier.type === AST_NODE_TYPES.ImportSpecifier)
          .map((specifier) => ({
            local: specifier.local.name,
            exported: specifier.imported.type === AST_NODE_TYPES.Identifier ? specifier.imported.name : specifier.imported.value,
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
          (node.init?.type === AST_NODE_TYPES.ArrowFunctionExpression || node.init?.type === AST_NODE_TYPES.FunctionExpression) &&
          (context.sourceCode.getTokenBefore(node.init) as TSESTree.Token).value === "="
        ) {
          context.report({ node: node.id, message: "Export definition values for door assembly, not a mutating register API." });
        }
      },
    };
  },
};

const FLOORLESS_WRAP = /\bflex-wrap\b/u;

// A row that floors its own block size seats its controls' hit areas: a token floor in its className, or the
// `touchFloor="block"` prop, which spells the coarse floor.
const FLOORLESS_ROW_FLOOR = /\bmin-block-\(--size-(?:touch-target|control-[a-z]+)\)|\bpointer-coarse:min-block-[^\s"'`]+/u;

const FLOORLESS_ROW_TOUCH_FLOOR = /^touchFloor\s*=\s*(?:\{\s*)?["']block["']/u;

const FLOORLESS_STACK_CONTROL = /rows\s*=\s*(?:\{\s*)?["']control["']/u;

function floorlessVariableBody(declaration: TSESTree.VariableDeclarator, sourceCode: Source): TSESTree.BlockStatement | TSESTree.Expression | undefined {
  const init = declaration.init;
  if (
    init === null ||
    !(init.type === AST_NODE_TYPES.ArrowFunctionExpression || init.type === AST_NODE_TYPES.FunctionExpression) ||
    sourceCode.getTokenBefore(init)?.value !== "="
  ) {
    return;
  }
  return init.body;
}

function floorlessComponentBodies(program: TSESTree.Program, sourceCode: Source): Map<string, TSESTree.Node | undefined> {
  const declarations = program.body
    .map((node) => {
      if (node.type === AST_NODE_TYPES.ExportNamedDeclaration || node.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
        return node.declaration;
      }
      return node.type === AST_NODE_TYPES.ExportAllDeclaration ? undefined : node;
    })
    .filter((node) => node !== null && node !== undefined);
  const bodies = new Map<string, TSESTree.Node | undefined>();
  for (const node of declarations) {
    if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id !== null && !bodies.has(node.id.name)) {
      bodies.set(node.id.name, node.body);
    }
  }
  for (const node of declarations.filter(
    (declaration): declaration is TSESTree.VariableDeclaration => declaration.type === AST_NODE_TYPES.VariableDeclaration,
  )) {
    for (const declaration of node.declarations) {
      if (declaration.id.type !== AST_NODE_TYPES.Identifier || bodies.has(declaration.id.name)) {
        continue;
      }
      bodies.set(declaration.id.name, floorlessVariableBody(declaration, sourceCode));
    }
  }
  return bodies;
}

function floorlessMapCall(node: TSESTree.Node | undefined, sourceCode: Source): TSESTree.CallExpression | undefined {
  const call = node?.type === AST_NODE_TYPES.ChainExpression ? node.expression : node;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.callee.type !== AST_NODE_TYPES.MemberExpression || call.callee.computed) {
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
  if (child.type !== AST_NODE_TYPES.JSXExpressionContainer) {
    return;
  }
  const call = floorlessMapCall(child.expression, sourceCode);
  if (call === undefined || (sourceCode.getTokenAfter(sourceCode.getFirstToken(child) as TSESTree.Token) as TSESTree.Token).range[0] !== call.range[0]) {
    return;
  }
  const callback = call.arguments[0];
  if (
    callback?.type !== AST_NODE_TYPES.ArrowFunctionExpression ||
    !floorlessDirectCallback(callback, call, sourceCode) ||
    callback.body.type !== AST_NODE_TYPES.JSXElement
  ) {
    return;
  }
  // ESTree erases parentheses; the declared map-row grammar unwraps exactly one return wrapper.
  const beforeBody = sourceCode.getTokenBefore(callback.body) as TSESTree.Token;
  const direct = beforeBody.value === "=>" || (beforeBody.value === "(" && (sourceCode.getTokenBefore(beforeBody) as TSESTree.Token).value === "=>");
  return direct ? callback.body : undefined;
}

/** `floorlessControls` names the button-family components whose every box sits under the touch floor. */
export const floorlessControlRule = (floorlessControls: ReadonlySet<string>): OrbRule => ({
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const sourceCode = context.sourceCode;
    const counts = new Map<TSESTree.Node | undefined, number>();
    const controls: { node: TSESTree.JSXOpeningElement; token: string }[] = [];
    const stacks: TSESTree.JSXElement[] = [];
    let bodies: ReturnType<typeof floorlessComponentBodies>;
    const rowIsFloorless = (element: TSESTree.JSXElement): boolean => {
      const opening = element.openingElement;
      const ownClass = opening.attributes.find((attribute) => attribute.type === AST_NODE_TYPES.JSXAttribute && attribute.name.name === "className");
      if (ownClass !== undefined && FLOORLESS_ROW_FLOOR.test(sourceCode.getText(ownClass))) {
        return false;
      }
      if (
        opening.attributes.some((attribute) => attribute.type === AST_NODE_TYPES.JSXAttribute && FLOORLESS_ROW_TOUCH_FLOOR.test(sourceCode.getText(attribute)))
      ) {
        return false;
      }
      return (counts.get(element) ?? 0) > 0 || (counts.get(bodies.get(sourceCode.getText(opening.name))) ?? 0) > 0;
    };
    const mappedWithin = (owner: TSESTree.JSXOpeningElement, container: TSESTree.JSXElement): boolean => {
      let current: TSESTree.Node | undefined = owner.parent;
      while (current.type !== AST_NODE_TYPES.Program && current !== container) {
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
          current.type === AST_NODE_TYPES.JSXElement && !current.openingElement.selfClosing && FLOORLESS_WRAP.test(sourceCode.getText(current.openingElement)),
      );
    };
    const report = (start: number, token: string): void =>
      context.report({
        loc: { start: sourceCode.getLocFromIndex(start), end: sourceCode.getLocFromIndex(start + token.length) },
        message:
          'Floorless button controls (a glyph or inline box) repeat at a wrapping or vertical pitch; use a control size, Stack rows="control", or an explicit row floor.',
      });
    const rowWeight = (child: TSESTree.JSXChild): number => {
      const mapped = floorlessMappedRow(child, sourceCode);
      const row = child.type === AST_NODE_TYPES.JSXElement ? child : mapped;
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
    const judgeControl = ({ node, token }: (typeof controls)[number]): void => {
      const container = wrapContainer(node);
      if (container !== undefined && (mappedWithin(node, container) || (counts.get(container) ?? 0) >= 2)) {
        report(node.name.range[0], token);
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
      "JSXOpeningElement:exit"(node: TSESTree.JSXOpeningElement): void {
        const token = sourceCode.getText(node.name);
        if (!floorlessControls.has(token)) {
          return;
        }
        controls.push({ node, token });
        for (const ancestor of [node, ...sourceCode.getAncestors(node)]) {
          counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1);
        }
      },
      "Program:exit"(): void {
        stacks.forEach(judgeStack);
        controls.forEach(judgeControl);
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
