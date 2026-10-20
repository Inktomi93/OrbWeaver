// The one import-graph consumption walk. Imports resolve to origin declarations; `import * as` and relative `import()`
// mark the whole target surface; a package-aliased `import()` credits only statically named members, never the module.
import type { BindingElement, ImportDeclaration, Node as MorphNode, ObjectBindingPattern, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../compiler/ts-workspace.ts";
import type { FileConsumptions, ImportConsumption, NamespaceSite } from "./liveness-contract.ts";
import { dynamicModuleTarget, relativeModuleTarget } from "./module-target.ts";
import { literalMemberAccess } from "./reference-fact.ts";
import { MEMBER_ACCESS_KINDS } from "./reference-fact-contract.ts";
import { declarationBindingKeys, inventoryDeclarationKey, inventoryExports, inventoryStaticTarget, semanticInventoryOf } from "./semantic-inventory-reader.ts";

// origin key → the export names `target` surfaces it under; a barrel may re-export one declaration twice.
function exposedNames(target: SourceFile, importer?: MorphNode): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [name, declarations] of inventoryExports(target, importer)) {
    for (const declaration of declarations) {
      const key = inventoryDeclarationKey(declaration);
      out.set(key, [...(out.get(key) ?? []), name]);
    }
  }
  return out;
}

function stringLiteralImport(call: MorphNode): string | undefined {
  if (!Node.isCallExpression(call) || call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
    return;
  }
  const argument = call.getArguments()[0];
  return argument !== undefined && Node.isStringLiteral(argument) ? argument.getLiteralText() : undefined;
}

/** The workspace file a relative string-literal `import()` resolves to. A stored inventory answers natively; a
 *  package-aliased specifier returns undefined so its consumers credit named members only. */
export function dynamicImportTargetOf(call: MorphNode, sf: SourceFile, project: SourceCorpus): SourceFile | undefined {
  const specifier = stringLiteralImport(call);
  if (specifier === undefined) {
    return;
  }
  if (semanticInventoryOf(call.getProject()) !== undefined) {
    return specifier.startsWith(".") ? dynamicModuleTarget(call) : undefined;
  }
  return relativeModuleTarget(project, sf.getDirectoryPath(), specifier);
}

// A computed key or a rest element names no member, so it credits nothing rather than inventing liveness.
function bindingElementMemberName(element: BindingElement): string | undefined {
  if (element.getDotDotDotToken() !== undefined) {
    return;
  }
  const property = element.getPropertyNameNode();
  if (property !== undefined) {
    if (Node.isIdentifier(property)) {
      return property.getText();
    }
    return Node.isStringLiteral(property) || Node.isNoSubstitutionTemplateLiteral(property) ? property.getLiteralText() : undefined;
  }
  const name = element.getNameNode();
  return Node.isIdentifier(name) ? name.getText() : undefined;
}

function patternMemberNames(pattern: ObjectBindingPattern): Set<string> {
  return new Set(
    pattern
      .getElements()
      .map(bindingElementMemberName)
      .filter((name): name is string => name !== undefined),
  );
}

/** Member names read off one local binding in its own file: `b.x`, `b?.x`, `b["x"]` and `const { x } = b`.
 *  Receivers match by stored lexical binding identity, so a same-spelled shadow reads nothing. The stored reference
 *  index returns no references for an `import * as` binding, so this walks the file instead of reading references. */
export function bindingMemberNames(name: MorphNode): Set<string> {
  const keys = new Set(declarationBindingKeys(name, false));
  const isBinding = (node: MorphNode): boolean => Node.isIdentifier(node) && declarationBindingKeys(node, false).some((key) => keys.has(key));
  const source = name.getSourceFile();
  const names = new Set<string>();
  for (const kind of MEMBER_ACCESS_KINDS) {
    for (const access of source.getDescendantsOfKind(kind)) {
      const read = literalMemberAccess(access);
      if (read !== undefined && isBinding(read.receiver)) {
        names.add(read.name);
      }
    }
  }
  for (const declaration of source.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const initializer = declaration.getInitializer();
    const pattern = declaration.getNameNode();
    if (initializer !== undefined && Node.isObjectBindingPattern(pattern) && isBinding(initializer)) {
      for (const member of patternMemberNames(pattern)) {
        names.add(member);
      }
    }
  }
  return names;
}

// `import(spec).then((m) => … m.X …)` or `.then(({ X }) => …)`: the callback's first parameter.
function thenCallbackMembers(call: MorphNode): Set<string> {
  const access = call.getParent();
  if (!Node.isPropertyAccessExpression(access) || access.getExpression() !== call || access.getName() !== "then") {
    return new Set();
  }
  const thenCall = access.getParent();
  const callback = Node.isCallExpression(thenCall) ? thenCall.getArguments()[0] : undefined;
  if (callback === undefined || !(Node.isArrowFunction(callback) || Node.isFunctionExpression(callback))) {
    return new Set();
  }
  const parameter = callback.getParameters()[0]?.getNameNode();
  if (parameter !== undefined && Node.isObjectBindingPattern(parameter)) {
    return patternMemberNames(parameter);
  }
  return parameter !== undefined && Node.isIdentifier(parameter) ? bindingMemberNames(parameter) : new Set();
}

// `(await import(spec)).X`, `const m = await import(spec)` and `const { X } = await import(spec)`.
function awaitedMembers(call: MorphNode): Set<string> {
  const awaited = call.getParent();
  if (!Node.isAwaitExpression(awaited)) {
    return new Set();
  }
  const holder = awaited.getParent();
  if (Node.isParenthesizedExpression(holder)) {
    const read = literalMemberAccess(holder.getParent());
    return read?.receiver === holder ? new Set([read.name]) : new Set();
  }
  if (!Node.isVariableDeclaration(holder)) {
    return new Set();
  }
  const name = holder.getNameNode();
  if (Node.isIdentifier(name)) {
    return bindingMemberNames(name);
  }
  return Node.isObjectBindingPattern(name) ? patternMemberNames(name) : new Set();
}

/** The member names a recognized lazy-import shape reads off `call`'s module, or empty for any other shape. */
export function dynamicImportMemberNames(call: MorphNode): Set<string> {
  const then = thenCallbackMembers(call);
  return then.size > 0 ? then : awaitedMembers(call);
}

function namedConsumptions(exported: ReadonlyMap<string, readonly MorphNode[]>, name: string, site: Omit<ImportConsumption, "originKey">): ImportConsumption[] {
  return (exported.get(name) ?? []).map((declaration) => ({ ...site, originKey: inventoryDeclarationKey(declaration) }));
}

function wholeSurface(exported: ReadonlyMap<string, readonly MorphNode[]>, site: Omit<ImportConsumption, "originKey">): ImportConsumption[] {
  return [...exported.values()].flat().map((declaration) => ({ ...site, originKey: inventoryDeclarationKey(declaration) }));
}

// Only import declarations consume: `export { X } from` is a pass-through, or a file re-exporting a symbol would hide its deadness.
function importConsumptions(imp: ImportDeclaration, sf: SourceFile, namespaceSites: NamespaceSite[]): ImportConsumption[] {
  const target = inventoryStaticTarget(imp);
  if (target === undefined) {
    return [];
  }
  const typeOnlyImport = imp.isTypeOnly();
  const namespace = imp.getNamespaceImport();
  if (namespace !== undefined) {
    const exposed = exposedNames(target, imp);
    namespaceSites.push({ file: sf, alias: namespace.getText(), binding: namespace, exposed });
    return [...exposed.keys()].map((originKey) => ({
      originKey,
      consumer: sf,
      site: imp,
      local: namespace.getText(),
      arm: "namespace",
      typeOnly: typeOnlyImport,
    }));
  }
  const exported = inventoryExports(target, imp);
  const out = imp.getNamedImports().flatMap((spec) =>
    namedConsumptions(exported, spec.getName(), {
      consumer: sf,
      site: imp,
      local: spec.getAliasNode()?.getText() ?? spec.getName(),
      arm: "named",
      typeOnly: typeOnlyImport || spec.isTypeOnly(),
    }),
  );
  const byDefault = imp.getDefaultImport();
  if (byDefault !== undefined) {
    out.push(...namedConsumptions(exported, "default", { consumer: sf, site: imp, local: byDefault.getText(), arm: "named", typeOnly: typeOnlyImport }));
  }
  return out;
}

function dynamicConsumptions(call: MorphNode, sf: SourceFile, project: SourceCorpus): ImportConsumption[] {
  const site = { consumer: sf, site: call, local: undefined, typeOnly: false } as const;
  const target = dynamicImportTargetOf(call, sf, project);
  if (target !== undefined) {
    return wholeSurface(inventoryExports(target, call), { ...site, arm: "dynamic" });
  }
  const members = dynamicImportMemberNames(call);
  const aliased = members.size === 0 ? undefined : dynamicModuleTarget(call);
  if (aliased === undefined) {
    return [];
  }
  const exported = inventoryExports(aliased, call);
  return [...members].flatMap((name) => namedConsumptions(exported, name, { ...site, arm: "named" }));
}

/** Every consumption one file contributes, in source order: static imports first, then `import()` calls. */
export function fileConsumptions(sf: SourceFile, project: SourceCorpus): FileConsumptions {
  const namespaceSites: NamespaceSite[] = [];
  const consumptions = sf.getImportDeclarations().flatMap((imp) => importConsumptions(imp, sf, namespaceSites));
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (stringLiteralImport(call) !== undefined) {
      consumptions.push(...dynamicConsumptions(call, sf, project));
    }
  }
  return { consumptions, namespaceSites };
}
