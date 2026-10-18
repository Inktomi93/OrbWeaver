// The bounded `shape-constituents` walk: capture and replay read the same union, intersection and argument slots.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { ShapeConstituent, ShapeDeclaredSignature, TypeObservationQuestion, TypeObservationReader } from "./type-observations-contract.ts";
import type { NativeTypeSelector } from "./type-projection-contract.ts";
import { nodeTypeSelector } from "./type-projection-contract.ts";

// Direct shape identity needs only a slot's own wrappers (`Readonly<Promise<Hand[]>>`); deeper nesting reads UNKNOWN.
const SHAPE_CONSTITUENT_DEPTH = 4;
// Alias arguments are probed by index; an alias with more arguments than this stops the walk as UNKNOWN.
const SHAPE_ALIAS_ARGUMENT_LIMIT = 4;

function aliasArgumentSelectors(selector: NativeTypeSelector, readers: TypeObservationReader): readonly NativeTypeSelector[] | undefined {
  const selected: NativeTypeSelector[] = [];
  for (let index = 0; index <= SHAPE_ALIAS_ARGUMENT_LIMIT; index += 1) {
    const argument: NativeTypeSelector = { ...selector, steps: [...selector.steps, { kind: "alias-type-argument", index }] };
    if (readers.select(argument) === null) {
      break;
    }
    selected.push(argument);
  }
  return selected.length > SHAPE_ALIAS_ARGUMENT_LIMIT ? undefined : selected;
}

/** Capture and replay walk the same bounded constituents: union and intersection parts, type and alias arguments. */
export function readShapeConstituent(selector: NativeTypeSelector, readers: TypeObservationReader): ShapeConstituent | undefined {
  const visit = (current: NativeTypeSelector, depth: number, seen: ReadonlySet<object>): ShapeConstituent | undefined => {
    const reference = readers.select(current);
    if (reference === null) {
      return;
    }
    const type = readers.type(reference);
    const primitive = Object.values(readers.primitiveFlags(current)).some((flag) => flag === true);
    const leaf = { type, primitive, unions: [], intersections: [], typeArguments: [] };
    if (primitive || type.any || type.unknown || type.never || type.typeParameter) {
      return { ...leaf, truncated: false };
    }
    const aliases = type.aliasSymbol === null ? [] : aliasArgumentSelectors(current, readers);
    if (depth >= SHAPE_CONSTITUENT_DEPTH || seen.has(type.key) || aliases === undefined) {
      return { ...leaf, truncated: true };
    }
    const next = new Set([...seen, type.key]);
    const children = (selectors: readonly NativeTypeSelector[]): ShapeConstituent[] => selectors.flatMap((child) => visit(child, depth + 1, next) ?? []);
    return {
      ...leaf,
      unions: children(readers.unions(current)),
      intersections: children(readers.intersections(current)),
      typeArguments: children([...aliases, ...readers.typeArguments(current)]),
      truncated: false,
    };
  };
  return visit(selector, 0, new Set());
}

export function observeShapeConstituents(question: TypeObservationQuestion, readers: TypeObservationReader): void {
  for (const node of question.nodes) {
    readShapeConstituent(nodeTypeSelector(node), readers);
    if (Node.isCallExpression(node)) {
      for (const parameter of readers.callParameters(node) ?? []) {
        readShapeConstituent(parameter, readers);
      }
      readDeclaredParameters(node, readers);
    }
  }
}

/** The callee declaration and which declared parameters are type parameters, read by the same question. */
export function readDeclaredParameters(call: MorphNode, readers: TypeObservationReader): ShapeDeclaredSignature | undefined {
  const signature = readers.signature(call);
  if (signature === null) {
    return;
  }
  const generic = signature.parameters.map((parameter) => {
    const reference = readers.select(parameter);
    return reference !== null && readers.type(reference).typeParameter;
  });
  return { declaration: signature.declaration, generic };
}
