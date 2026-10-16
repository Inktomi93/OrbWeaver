// Explicit raw questions retain their nominated locations and one importing capture.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { TypeObservationCaptureOwner, TypeObservationDemand, TypeObservationQuestion, TypeObservationReader } from "./type-observations-contract.ts";
import type { NativeTypeSelector } from "./type-projection-contract.ts";
import { nodeTypeSelector } from "./type-projection-contract.ts";

function propertyLiterals(readers: TypeObservationReader, selector: NativeTypeSelector, at: MorphNode, names: readonly string[]): void {
  if (readers.select(selector) === null) {
    return;
  }
  readers.literal(selector);
  for (const name of names) {
    const property: NativeTypeSelector = { ...selector, steps: [...selector.steps, { kind: "property", name, at }] };
    if (readers.select(property) === null) {
      continue;
    }
    readers.literal(property);
    for (const part of readers.unions(property)) {
      readers.literal(part);
    }
  }
}
function typeSlots(readers: TypeObservationReader, selector: NativeTypeSelector, at: MorphNode, names: readonly string[]): void {
  if (readers.select(selector) === null) {
    return;
  }
  propertyLiterals(readers, selector, at, names);
  for (const part of readers.unions(selector)) {
    propertyLiterals(readers, part, at, names);
  }
}
function nodeSlots(readers: TypeObservationReader, node: MorphNode, names: readonly string[]): void {
  readers.symbol(node);
  typeSlots(readers, nodeTypeSelector(node), node, names);
  typeSlots(readers, { ...nodeTypeSelector(node), steps: [{ kind: "nonnullable" }] }, node, names);
}
function definitionClosure(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  if (question.files === undefined) {
    throw new Error("native definition closure has no admitted source roster");
  }
  const admitted = new Set(question.files);
  if (question.nodes.some((node) => !admitted.has(node.getSourceFile().getFilePath().replaceAll("\\", "/")))) {
    throw new Error("native definition closure root is outside its admitted roster");
  }
  const seen = new Set<MorphNode>();
  const pending = [...question.nodes];
  for (const node of pending) {
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);
    for (const declaration of readers.definitions(node)) {
      if (admitted.has(declaration.getSourceFile().getFilePath().replaceAll("\\", "/"))) {
        const descendants = [declaration, ...declaration.getDescendants()];
        pending.push(...descendants.filter(Node.isIdentifier));
        for (const value of descendants.filter(isValueNode)) {
          valueProfile(question, value, profile);
        }
      }
    }
  }
}
function declarationClosure(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  if (question.files === undefined) {
    throw new Error("native declaration closure has no admitted source roster");
  }
  const admitted = new Set(question.files);
  const inside = (node: MorphNode): boolean => admitted.has(node.getSourceFile().getFilePath().replaceAll("\\", "/"));
  if (question.nodes.some((node) => !inside(node))) {
    throw new Error("native declaration closure root is outside its admitted roster");
  }
  const seen = new Set<MorphNode>();
  const sources = new Set<MorphNode>();
  const pending = [...question.nodes];
  for (const root of pending) {
    if (seen.has(root)) {
      continue;
    }
    closureSourceSymbols(root.getSourceFile(), sources, readers);
    for (const node of [root, ...root.getDescendants()]) {
      if (seen.has(node) || Node.isOmittedExpression(node)) {
        continue;
      }
      seen.add(node);
      pending.push(...closureDeclarations(node, readers).filter(inside));
      if (Node.isIdentifier(node)) {
        valueProfile(question, node, profile);
      }
      closureReceiver(node, question, readers);
    }
  }
}
function closureSourceSymbols(source: import("ts-morph").SourceFile, sources: Set<MorphNode>, readers: TypeObservationReader): void {
  if (sources.has(source)) {
    return;
  }
  sources.add(source);
  for (const declaration of [...source.getFunctions(), ...source.getVariableStatements()]) {
    readers.symbol(declaration);
  }
}
function closureDeclarations(node: MorphNode, readers: TypeObservationReader): readonly MorphNode[] {
  if (!(Node.isIdentifier(node) || Node.isFunctionDeclaration(node) || Node.isVariableStatement(node))) {
    return [];
  }
  const symbol = readers.symbol(node);
  const declarations = symbol === null ? [] : [symbol, readers.symbolData(symbol).canonical].flatMap((value) => readers.symbolData(value).declarations);
  return [...declarations, ...(Node.isIdentifier(node) ? readers.definitions(node) : [])];
}
function closureReceiver(node: MorphNode, question: TypeObservationQuestion, readers: TypeObservationReader): void {
  if (!Node.isCallExpression(node) || node.getArguments().length > 0) {
    return;
  }
  const callee = node.getExpression();
  if (Node.isPropertyAccessExpression(callee) && question.receiverMethods?.includes(callee.getName()) === true) {
    primitiveFlags(readers, nodeTypeSelector(callee.getExpression()));
  }
}
function primitiveFlags(readers: TypeObservationReader, selector: NativeTypeSelector): void {
  if (readers.select(selector) === null) {
    return;
  }
  readers.primitiveFlags(selector);
  for (const part of readers.unions(selector)) {
    readers.primitiveFlags(part);
  }
}
function isValueNode(node: MorphNode): boolean {
  return !Node.isOmittedExpression(node) && (Node.isExpression(node) || Node.isVariableDeclaration(node) || Node.isParameterDeclaration(node));
}
function valueProfile(question: TypeObservationQuestion, node: MorphNode, profile: TypeObservationCaptureOwner["profile"]): void {
  if (question.valueFacets === undefined) {
    return;
  }
  if (profile === undefined) {
    throw new Error("native value-profile demand has no captured owner");
  }
  profile(node, question.valueFacets);
}
function properties(question: TypeObservationQuestion, readers: TypeObservationReader): void {
  for (const node of question.nodes) {
    for (const selector of [nodeTypeSelector(node), { ...nodeTypeSelector(node), steps: [{ kind: "nonnullable" as const }] }]) {
      for (const property of readers.properties(selector, node)) {
        propertyLiterals(readers, property.selector, node, question.properties ?? []);
      }
    }
  }
}
function valueSlot(readers: TypeObservationReader, node: MorphNode, names: readonly string[]): void {
  const symbol = readers.symbol(node);
  if (symbol === null) {
    return;
  }
  const declaration = readers.valueDeclaration(symbol);
  if (declaration !== null) {
    nodeSlots(readers, declaration, names);
  }
}
function executableDeclaration(declaration: MorphNode): readonly MorphNode[] {
  if (Node.isVariableDeclaration(declaration)) {
    return declaration.getInitializer() === undefined ? [] : [declaration];
  }
  if (Node.isBindingElement(declaration)) {
    const owner = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    return owner === undefined ? [] : [owner];
  }
  return Node.isFunctionDeclaration(declaration) && declaration.getBody() !== undefined ? [declaration] : [];
}
function symbolBodies(node: MorphNode, readers: TypeObservationReader): readonly MorphNode[] {
  const symbol = readers.symbol(node);
  return symbol === null
    ? []
    : [symbol, readers.symbolData(symbol).canonical].flatMap((target) => readers.symbolData(target).declarations.flatMap(executableDeclaration));
}
function sourceWriteIdentifiers(source: import("ts-morph").SourceFile): readonly MorphNode[] {
  const writes: MorphNode[] = source.getDescendantsOfKind(SyntaxKind.BinaryExpression).map((node) => node.getLeft());
  writes.push(...source.getDescendantsOfKind(SyntaxKind.ForOfStatement).map((node) => node.getInitializer()));
  writes.push(...source.getDescendantsOfKind(SyntaxKind.ForInStatement).map((node) => node.getInitializer()));
  return writes.flatMap((write) => [write, ...write.getDescendants()].filter(Node.isIdentifier));
}
function observeClosureNode(node: MorphNode, question: TypeObservationQuestion, readers: TypeObservationReader): readonly MorphNode[] {
  if (Node.isIdentifier(node)) {
    readers.definitions(node);
  }
  if (!(Node.isExpression(node) || Node.isVariableDeclaration(node) || Node.isParameterDeclaration(node))) {
    return [];
  }
  const bodies = symbolBodies(node, readers);
  questions["type-details"]({ ...question, kind: "type-details", nodes: [node] }, readers);
  return bodies;
}
function symbolClosure(question: TypeObservationQuestion, readers: TypeObservationReader): void {
  const seen = new Set<MorphNode>();
  const sources = new Set<MorphNode>();
  const pending = [...question.nodes];
  for (const root of pending) {
    const source = root.getSourceFile();
    if (!sources.has(source)) {
      sources.add(source);
      pending.push(...sourceWriteIdentifiers(source));
    }
    for (const node of [root, ...root.getDescendants()]) {
      if (seen.has(node) || Node.isOmittedExpression(node)) {
        continue;
      }
      seen.add(node);
      pending.push(...observeClosureNode(node, question, readers));
    }
  }
}
function rawPropertyLiterals(readers: TypeObservationReader, selector: NativeTypeSelector, at: MorphNode, names: readonly string[]): void {
  for (const name of names) {
    const property = { ...selector, steps: [...selector.steps, { kind: "property" as const, name, at }] };
    if (readers.select(property) !== null) {
      readers.literalValue(property);
      for (const part of readers.unions(property)) {
        readers.literalValue(part);
      }
    }
  }
}
const questions: Record<
  TypeObservationQuestion["kind"],
  (
    question: TypeObservationQuestion,
    readers: TypeObservationReader,
    profile?: TypeObservationCaptureOwner["profile"],
    references?: TypeObservationCaptureOwner["references"],
  ) => void
> = {
  "declaration-closure": declarationClosure,
  "literal-values": (question, readers): void => {
    for (const node of question.nodes) {
      const selector = nodeTypeSelector(node);
      if (readers.select(selector) === null) {
        continue;
      }
      for (const part of [selector, ...readers.unions(selector)]) {
        readers.literalValue(part);
        if (readers.primitiveFlags(part).booleanLiteral) {
          readers.defaultDisplay(part);
        }
      }
    }
  },
  "primitive-flags": (question, readers): void => {
    for (const node of question.nodes) {
      primitiveFlags(readers, nodeTypeSelector(node));
    }
  },
  "property-symbols": (question, readers): void => {
    for (const node of question.nodes) {
      const selector = nodeTypeSelector(node);
      if (readers.select(selector) === null) {
        continue;
      }
      for (const part of [selector, ...readers.unions(selector)]) {
        readers.primitiveFlags(part);
        for (const name of question.properties ?? []) {
          readers.propertySymbol(part, name);
        }
      }
    }
  },
  "reference-closure": (question, readers, _profile, references): void => {
    if (references === undefined) {
      throw new Error("native raw reference closure has no strict reference owner");
    }
    for (const node of question.nodes) {
      symbolClosure({ ...question, nodes: [node, ...references(node)] }, readers);
    }
  },
  "symbol-closure": symbolClosure,
  "type-details": (question, readers): void => {
    const details = (selector: NativeTypeSelector, at: MorphNode): void => {
      if (readers.select(selector) === null) {
        return;
      }
      readers.defaultDisplay(selector);
      readers.literalValue(selector);
      for (const argument of readers.typeArguments(selector)) {
        const selected = readers.select(argument);
        if (selected !== null) {
          readers.type(selected);
        }
      }
      rawPropertyLiterals(readers, selector, at, question.properties ?? []);
    };
    for (const node of question.nodes) {
      readers.symbol(node);
      const selector = nodeTypeSelector(node);
      details(selector, node);
      for (const part of readers.unions(selector)) {
        details(part, node);
      }
    }
  },
  "function-exports": (question, readers): void => {
    for (const node of question.nodes) {
      readers.functionExport(node);
    }
  },
  "node-types": (question, readers): void => {
    for (const node of question.nodes) {
      nodeSlots(readers, node, question.properties ?? []);
    }
  },
  "type-properties": properties,
  "definition-nodes": (question, readers): void => {
    for (const node of question.nodes) {
      readers.definitions(node);
    }
  },
  "definition-closure": definitionClosure,
  "call-parameters": (question, readers): void => {
    for (const node of question.nodes) {
      for (const selector of readers.callParameters(node) ?? []) {
        typeSlots(readers, selector, node, question.properties ?? []);
      }
    }
  },
  "signature-parameters": (question, readers): void => {
    for (const node of question.nodes) {
      for (const parameters of readers.signatureParameters({ ...nodeTypeSelector(node), steps: [{ kind: "nonnullable" }] }, node)) {
        for (const selector of parameters) {
          typeSlots(readers, selector, node, question.properties ?? []);
        }
      }
    }
  },
  "symbol-values": (question, readers): void => {
    for (const node of question.nodes) {
      valueSlot(readers, node, question.properties ?? []);
    }
  },
  "value-profiles": (question, _readers, profile): void => {
    for (const node of question.nodes) {
      valueProfile(question, node, profile);
    }
  },
};
/** Capture and replay execute the same closed primitive questions. */
export function observeRawQuestions(
  demand: TypeObservationDemand,
  readers: TypeObservationReader,
  profile?: TypeObservationCaptureOwner["profile"],
  references?: TypeObservationCaptureOwner["references"],
): void {
  for (const question of demand.questions ?? []) {
    questions[question.kind](question, readers, profile, references);
  }
}
