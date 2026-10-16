// Selected signature/member paths retain actual owner-parameter origins rather than generic-name guesses.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { TypeObservationReader } from "./type-observations-contract.ts";
import type { NativeTypeSelector } from "./type-projection-contract.ts";
import type { AggregateCallPath, AggregatePathSegment } from "./type-slot-syntax.ts";

function slotInfo(selector: NativeTypeSelector, readers: TypeObservationReader): ReturnType<TypeObservationReader["type"]> | undefined {
  const value = readers.select(selector);
  return value === null ? undefined : readers.type(value);
}
/** This asks about the type's OWN symbol, not a deeply contained or same-named parameter. */
export function observedTypeParameterWithin(selector: NativeTypeSelector, owner: MorphNode, readers: TypeObservationReader): MorphNode | undefined {
  const symbol = slotInfo(selector, readers)?.symbol;
  return symbol === undefined || symbol === null
    ? undefined
    : readers.symbolData(symbol).declarations.find((candidate) => Node.isTypeParameterDeclaration(candidate) && candidate.getAncestors().includes(owner));
}
function nestedMemberType(
  member: NativeTypeSelector,
  segment: AggregatePathSegment,
  location: MorphNode,
  readers: TypeObservationReader,
): NativeTypeSelector | undefined {
  const choose = (step: NativeTypeSelector["steps"][number]): NativeTypeSelector | undefined => {
    const selector = { ...member, steps: [...member.steps, step] };
    return readers.select(selector) === null ? undefined : selector;
  };
  if (segment.kind === "property") {
    const index = Number(segment.name);
    const property = choose({ kind: "property", name: segment.name, at: location });
    if (property !== undefined) {
      return property;
    }
    const numberIndex = Number.isInteger(index) && String(index) === segment.name ? choose({ kind: "number-index" }) : undefined;
    return numberIndex ?? choose({ kind: "string-index" });
  }
  if ((slotInfo(member, readers)?.tupleCount ?? 0) > 0) {
    return choose({ kind: "tuple-member", index: segment.index });
  }
  const symbol = slotInfo(member, readers)?.symbol;
  const symbolName = symbol === undefined || symbol === null ? undefined : readers.symbolData(symbol).name;
  return (
    choose({ kind: "array-element" }) ??
    choose({ kind: "number-index" }) ??
    (symbolName === "Array" || symbolName === "ReadonlyArray" ? choose({ kind: "type-argument", index: 0 }) : undefined)
  );
}

export function memberTypeAtPath(
  type: NativeTypeSelector,
  path: AggregateCallPath,
  context: { readonly owner: MorphNode; readonly location: MorphNode; readonly readers: TypeObservationReader },
): NativeTypeSelector | undefined {
  const { owner, location, readers } = context;
  let member: NativeTypeSelector | undefined = type;
  for (const segment of path.segments) {
    if (member === undefined) {
      return;
    }
    // A parameter that is itself the owner's inferred type parameter supplies every nested member.
    // Its constraint may expose a broad index type, but that constraint is not an independent owner.
    if (observedTypeParameterWithin(member, owner, readers) !== undefined) {
      return member;
    }
    member = nestedMemberType(member, segment, location, readers);
  }
  return member;
}
