// Explicit raw questions retain their nominated locations and one importing capture.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
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
const questions: Record<
  TypeObservationQuestion["kind"],
  (question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]) => void
> = {
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
export function observeRawQuestions(demand: TypeObservationDemand, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  for (const question of demand.questions ?? []) {
    questions[question.kind](question, readers, profile);
  }
}
