// Object, join-composer, and tv/cva collection semantics for the static class evaluator. These are the
// shapes where "all strings" is wrong: clsx object KEYS are classes, while variant selectors/defaults are not.
import { Node } from "ts-morph";
import type { Composer, StaticValue } from "./static-class-expression-model.ts";
import { dedupeValues, exportedDeclarations, importedSource, literalValue, localDeclarations, unwrap } from "./static-class-expression-model.ts";
import type { CollectionHost } from "./static-class-object.ts";
import { propertyName, resolveObjects } from "./static-class-object.ts";

export function evalComposerCall(
  host: CollectionHost,
  call: import("ts-morph").CallExpression,
  composer: Exclude<Composer, "tv-factory" | "join-factory">,
  path: Set<Node>,
): StaticValue[] {
  const args = call.getArguments();
  if (composer === "join") {
    return args.flatMap((argument) => evalJoin(host, argument, path));
  }
  if (composer === "cva") {
    return [...(args[0] === undefined ? [] : host.evalClass(args[0], path)), ...(args[1] === undefined ? [] : evalVariantConfig(host, args[1], path))];
  }
  if (args[0] === undefined) {
    host.diagnose("unresolved", call, "tv composer has no configuration argument");
    return [];
  }
  return evalVariantConfig(host, args[0], path);
}

function evalJoin(host: CollectionHost, raw: Node, path: Set<Node>): StaticValue[] {
  const node = unwrap(raw);
  if (Node.isSpreadElement(node)) {
    return evalJoin(host, node.getExpression(), path);
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().flatMap((element) => evalJoin(host, element, path));
  }
  const objects = resolveObjects(host, node, new Set(path));
  if (objects.length > 0) {
    return objects.flatMap((object) => joinObjectKeys(host, object, path));
  }
  return Node.isIdentifier(node) ? evalJoinIdentifier(host, node, path) : host.evalClass(node, path);
}

function evalJoinIdentifier(host: CollectionHost, node: import("ts-morph").Identifier, path: Set<Node>): StaticValue[] {
  if (path.has(node)) {
    host.diagnose("unresolved", node, "static join-expression cycle");
    return [];
  }
  path.add(node);
  let values: StaticValue[] = [];
  try {
    values = host.identifierDeclarations(node).flatMap((declaration) => joinDeclarationValues(host, declaration, path));
  } finally {
    path.delete(node);
  }
  return values.length === 0 ? host.evalClass(node, path) : dedupeValues(values);
}

function joinDeclarationValues(host: CollectionHost, declaration: Node, path: Set<Node>): StaticValue[] {
  if (path.has(declaration)) {
    host.diagnose("unresolved", declaration, "static join-declaration cycle");
    return [];
  }
  path.add(declaration);
  try {
    return joinDeclarationInner(host, declaration, path);
  } finally {
    path.delete(declaration);
  }
}

function joinDeclarationInner(host: CollectionHost, declaration: Node, path: Set<Node>): StaticValue[] {
  if (Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    return initializer === undefined ? [] : evalJoin(host, initializer, path);
  }
  if (Node.isImportSpecifier(declaration)) {
    const source = importedSource(host.sourceIndex, declaration.getSourceFile(), declaration.getImportDeclaration().getModuleSpecifierValue());
    return source === undefined
      ? []
      : exportedDeclarations(host.sourceIndex, source, declaration.getNameNode().getText()).flatMap((target) => joinDeclarationValues(host, target, path));
  }
  return joinExportDeclaration(host, declaration, path);
}

function joinExportDeclaration(host: CollectionHost, declaration: Node, path: Set<Node>): StaticValue[] {
  if (Node.isExportSpecifier(declaration)) {
    const moduleName = declaration.getExportDeclaration().getModuleSpecifierValue();
    if (moduleName === undefined) {
      return localDeclarations(declaration.getSourceFile(), declaration.getNameNode().getText())
        .filter((target) => target !== declaration)
        .flatMap((target) => joinDeclarationValues(host, target, path));
    }
    const source = importedSource(host.sourceIndex, declaration.getSourceFile(), moduleName);
    return source === undefined
      ? []
      : exportedDeclarations(host.sourceIndex, source, declaration.getNameNode().getText()).flatMap((target) => joinDeclarationValues(host, target, path));
  }
  if (Node.isExportAssignment(declaration)) {
    return evalJoin(host, declaration.getExpression(), path);
  }
  if (declaration.getKindName() === "ImportClause") {
    const importDeclaration = declaration.getFirstAncestor(Node.isImportDeclaration);
    const source =
      importDeclaration === undefined ? undefined : importedSource(host.sourceIndex, declaration.getSourceFile(), importDeclaration.getModuleSpecifierValue());
    return source === undefined ? [] : exportedDeclarations(host.sourceIndex, source, "default").flatMap((target) => joinDeclarationValues(host, target, path));
  }
  return [];
}

function joinObjectKeys(host: CollectionHost, object: import("ts-morph").ObjectLiteralExpression, path: Set<Node>): StaticValue[] {
  const values: StaticValue[] = [];
  for (const member of object.getProperties()) {
    if (Node.isSpreadAssignment(member)) {
      const spread = resolveObjects(host, member.getExpression(), new Set(path));
      if (spread.length === 0) {
        host.diagnose("opaque", member, "runtime object spread in class composer");
      }
      values.push(...spread.flatMap((item) => joinObjectKeys(host, item, path)));
    } else {
      values.push(...classMapKey(host, member, path));
    }
  }
  return values;
}

function classMapKey(host: CollectionHost, member: Node, path: Set<Node>): StaticValue[] {
  if (!(Node.isPropertyAssignment(member) || Node.isShorthandPropertyAssignment(member))) {
    return [];
  }
  const nameNode = member.getNameNode();
  const name = propertyName(host, nameNode, path);
  if (name === undefined) {
    host.diagnose("unresolved", nameNode, "computed class-map key is unresolved");
    return [];
  }
  const quoted = literalValue(nameNode);
  return [quoted ?? { value: name, segments: [{ node: nameNode, valueStart: 0, valueEnd: name.length, sourceStart: nameNode.getStart() }] }];
}

function evalVariantConfig(host: CollectionHost, raw: Node, path: Set<Node>): StaticValue[] {
  const configs = variantObjects(host, raw, path, "runtime variant configuration");
  return configs.flatMap((config) => variantConfigValues(host, config, path));
}

function variantObjects(host: CollectionHost, raw: Node, path: Set<Node>, reason: string): import("ts-morph").ObjectLiteralExpression[] {
  const objects = resolveObjects(host, raw, new Set(path));
  if (objects.length === 0) {
    host.diagnose("opaque", raw, reason);
  }
  return objects;
}

function variantConfigValues(host: CollectionHost, config: import("ts-morph").ObjectLiteralExpression, path: Set<Node>): StaticValue[] {
  const values: StaticValue[] = [];
  for (const member of config.getProperties()) {
    if (Node.isSpreadAssignment(member)) {
      values.push(
        ...variantObjects(host, member.getExpression(), path, "runtime object spread in variant configuration").flatMap((spread) =>
          variantConfigValues(host, spread, path),
        ),
      );
      continue;
    }
    if (Node.isPropertyAssignment(member)) {
      values.push(...variantPropertyValues(host, member, path));
    }
  }
  return values;
}

function variantPropertyValues(host: CollectionHost, member: import("ts-morph").PropertyAssignment, path: Set<Node>): StaticValue[] {
  const name = propertyName(host, member.getNameNode(), path);
  const initializer = member.getInitializer();
  if (name === undefined || initializer === undefined) {
    return [];
  }
  if (name === "base" || name === "class" || name === "className") {
    return host.evalClass(initializer, path);
  }
  if (name === "slots") {
    return slotValues(host, initializer, path);
  }
  if (name === "variants") {
    return variantAxes(host, initializer, path);
  }
  return name === "compoundVariants" || name === "compoundSlots" ? compoundValues(host, initializer, path) : [];
}

function slotValues(host: CollectionHost, raw: Node, path: Set<Node>): StaticValue[] {
  return variantObjects(host, raw, path, "runtime variant slots").flatMap((object) =>
    object.getProperties().flatMap((member) => {
      if (Node.isSpreadAssignment(member)) {
        return slotValues(host, member.getExpression(), path);
      }
      if (Node.isPropertyAssignment(member)) {
        const initializer = member.getInitializer();
        return initializer === undefined ? [] : host.evalClass(initializer, path);
      }
      return Node.isShorthandPropertyAssignment(member) ? host.evalIdentifier(member.getNameNode(), path) : [];
    }),
  );
}

function variantAxes(host: CollectionHost, raw: Node, path: Set<Node>): StaticValue[] {
  return variantObjects(host, raw, path, "runtime variant axes").flatMap((axis) =>
    axis.getProperties().flatMap((member) => variantAxisValues(host, member, path)),
  );
}

function variantAxisValues(host: CollectionHost, member: Node, path: Set<Node>): StaticValue[] {
  if (Node.isSpreadAssignment(member)) {
    return variantAxes(host, member.getExpression(), path);
  }
  if (!Node.isPropertyAssignment(member)) {
    return [];
  }
  const options = member.getInitializer();
  return options === undefined
    ? []
    : resolveObjects(host, options, new Set(path)).flatMap((object) => object.getProperties().flatMap((option) => variantOption(host, option, path)));
}

function variantOption(host: CollectionHost, option: Node, path: Set<Node>): StaticValue[] {
  if (Node.isSpreadAssignment(option)) {
    return variantOptionValues(host, option.getExpression(), path);
  }
  if (!Node.isPropertyAssignment(option)) {
    return [];
  }
  const initializer = option.getInitializer();
  return initializer === undefined ? [] : variantOptionValues(host, initializer, path);
}

function variantOptionValues(host: CollectionHost, raw: Node, path: Set<Node>): StaticValue[] {
  const objects = resolveObjects(host, raw, new Set(path));
  return objects.length === 0 ? host.evalClass(raw, path) : objects.flatMap((object) => slotValues(host, object, path));
}

function compoundValues(host: CollectionHost, raw: Node, path: Set<Node>): StaticValue[] {
  const node = unwrap(raw);
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().flatMap((element) => compoundValues(host, element, path));
  }
  return variantObjects(host, node, path, "runtime compound variant collection").flatMap((object) =>
    object.getProperties().flatMap((member) => compoundMember(host, member, path)),
  );
}

function compoundMember(host: CollectionHost, member: Node, path: Set<Node>): StaticValue[] {
  if (Node.isSpreadAssignment(member)) {
    return compoundValues(host, member.getExpression(), path);
  }
  if (!Node.isPropertyAssignment(member)) {
    return [];
  }
  const name = propertyName(host, member.getNameNode(), path);
  const initializer = member.getInitializer();
  return (name === "class" || name === "className") && initializer !== undefined ? host.evalClass(initializer, path) : [];
}
