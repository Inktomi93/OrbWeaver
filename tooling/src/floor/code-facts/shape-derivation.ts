// Declaration provenance for shape comparisons; matching types never establish a shared origin.
import type { Node as MorphNode, Type } from "ts-morph";
import { Node } from "ts-morph";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { INVENTORY_KEY_SEPARATOR } from "./semantic-inventory-contract.ts";
import { inventoryDeclarationKey } from "./semantic-inventory-reader.ts";
import type { NativeGenericArgumentContribution, NativeGenericArgumentInput } from "./shape-derivation-contract.ts";
import { annotationReferenceOrigin, resolved, unresolved } from "./type-member-origin-core.ts";

/** Origin declarations named by a bare alias (`type X = Y`), resolved through import/re-export hops. */
function bareAliasTargetKeys(decl: MorphNode): Set<string> {
  const keys = new Set<string>();
  if (!Node.isTypeAliasDeclaration(decl)) {
    return keys;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode) || typeNode.getTypeArguments().length > 0) {
    return keys;
  }
  const entity = typeNode.getTypeName();
  const identifier = Node.isQualifiedName(entity) ? entity.getRight() : entity;
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return keys;
  }
  for (const declaration of (symbol.getAliasedSymbol() ?? symbol).getDeclarations()) {
    keys.add(inventoryDeclarationKey(declaration));
  }
  return keys;
}

/** Contracts declarations named directly by `extends`; inherited fields are already derived. */
function heritageTargetKeys(decl: MorphNode): Set<string> {
  const keys = new Set<string>();
  let heritage = Node.isInterfaceDeclaration(decl) ? decl.getExtends() : [];
  if (Node.isClassDeclaration(decl)) {
    const clause = decl.getExtends();
    heritage = clause === undefined ? [] : [clause];
  }
  for (const clause of heritage) {
    const symbol = clause.getExpression().getSymbol();
    for (const declaration of (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []) {
      keys.add(inventoryDeclarationKey(declaration));
    }
  }
  return keys;
}

/** Direct alias and heritage targets, resolved to declaration identities rather than names. */
export function directDerivationTargetKeys(decl: MorphNode): Set<string> {
  return new Set([...bareAliasTargetKeys(decl), ...heritageTargetKeys(decl)]);
}

/** Shared `typeof value` provenance through a generic derive (`z.infer`, `ReturnType`, and equivalents). */
export function typeQueryDerivationKeys(decl: MorphNode): Set<string> {
  const keys = new Set<string>();
  if (!Node.isTypeAliasDeclaration(decl)) {
    return keys;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
    return keys;
  }
  const [argument] = typeNode.getTypeArguments();
  if (argument === undefined || typeNode.getTypeArguments().length !== 1 || !Node.isTypeQuery(argument)) {
    return keys;
  }
  const genericSymbol = typeNode.getTypeName().getSymbol();
  const genericKeys = ((genericSymbol?.getAliasedSymbol() ?? genericSymbol)?.getDeclarations() ?? []).map(inventoryDeclarationKey);
  const operandSymbol = argument.getExprName().getSymbol();
  const operandKeys = ((operandSymbol?.getAliasedSymbol() ?? operandSymbol)?.getDeclarations() ?? []).map(inventoryDeclarationKey);
  for (const genericKey of genericKeys) {
    for (const operandKey of operandKeys) {
      keys.add(`${genericKey}${INVENTORY_KEY_SEPARATOR}${operandKey}`);
    }
  }
  return keys;
}

const NATIVE_GENERIC_UTILITIES = [
  { name: "Exclude", arity: 2, secondArgument: "removed" },
  { name: "Extract", arity: 2, secondArgument: "retained" },
  { name: "NonNullable", arity: 1, secondArgument: "retained" },
] as const;

function nativeParts(type: Type): readonly Type[] {
  return type.isUnion() ? type.getUnionTypes() : [type];
}

/** Observe a supported native utility's actual retained/removed type constituents, never a spelling or structural fit. */
export function readNativeGenericArgumentContribution(input: NativeGenericArgumentInput): ReferenceFact<NativeGenericArgumentContribution> {
  const { reference, argument, program, source } = input;
  if (reference.wasForgotten() || argument.wasForgotten()) {
    return unresolved("unsupported", reference, "generic contribution received a forgotten native node");
  }
  const file = reference.getSourceFile();
  if (file.compilerNode !== source || file.getProject().getProgram().compilerObject !== program || program.getSourceFile(file.getFilePath()) !== source) {
    return unresolved("unsupported", reference, "generic contribution belongs to a foreign world or stale native epoch");
  }
  const arguments_ = reference.getTypeArguments();
  const index = arguments_.indexOf(argument);
  const first = arguments_[0];
  const origin = annotationReferenceOrigin(reference.getTypeName());
  if (origin.kind === "unresolved") {
    return origin;
  }
  const utility = origin.value.declarations[0];
  if (
    origin.value.declarations.length !== 1 ||
    utility === undefined ||
    !Node.isTypeAliasDeclaration(utility) ||
    !program.isSourceFileDefaultLibrary(utility.getSourceFile().compilerNode)
  ) {
    return unresolved("unsupported", reference, "opaque generic has no canonical native TypeScript utility declaration");
  }
  const definition = NATIVE_GENERIC_UTILITIES.find((candidate) => candidate.name === utility.getName());
  if (definition === undefined || first === undefined || index < 0 || arguments_.length !== definition.arity) {
    return unresolved("unsupported", reference, "opaque generic utility or argument grammar is outside supported native contribution facts");
  }
  const contribution = nativeArgumentWitness(
    { utility, argument, contributes: false, witnesses: [], detail: "" },
    { initial: first.getType(), argument: argument.getType(), output: reference.getType(), secondArgument: definition.secondArgument, index },
  );
  if (input.binding === undefined || contribution.kind !== "resolved") {
    return contribution;
  }
  return nativeBindingWitness(contribution.value, input.binding);
}

interface NativeGenericEffect {
  readonly initial: Type;
  readonly argument: Type;
  readonly output: Type;
  readonly secondArgument: (typeof NATIVE_GENERIC_UTILITIES)[number]["secondArgument"];
  readonly index: number;
}

function nativeArgumentWitness(fact: NativeGenericArgumentContribution, effect: NativeGenericEffect): ReferenceFact<NativeGenericArgumentContribution> {
  const { initial, argument, output, secondArgument, index } = effect;
  const types = [initial, argument, output];
  if (types.some((type) => type.isAny() || type.isUnknown() || type.isTypeParameter())) {
    return unresolved("unsupported", fact.argument, "generic contribution has any, unknown or uninstantiated native types");
  }
  if (types.some((type) => type.isNever())) {
    return resolved({ ...fact, detail: "never supplies no retained/removed value-type constituent" }, fact.argument, [fact.utility]);
  }
  const inputs = nativeParts(initial);
  const outputs = nativeParts(output);
  const inputIdentities = new Set(inputs.map((type) => type.compilerType));
  if (!outputs.every((type) => inputIdentities.has(type.compilerType))) {
    return unresolved("unsupported", fact.argument, "native output has no complete input-constituent identity witness");
  }
  let witnesses: readonly Type[] = outputs;
  if (index === 1) {
    const argumentIdentities = new Set(nativeParts(argument).map((type) => type.compilerType));
    const outputIdentities = new Set(outputs.map((type) => type.compilerType));
    const candidates = {
      removed: inputs.filter((type) => !outputIdentities.has(type.compilerType)),
      retained: outputs,
    } satisfies Readonly<Record<NativeGenericEffect["secondArgument"], readonly Type[]>>;
    witnesses = candidates[secondArgument].filter((type) => argumentIdentities.has(type.compilerType));
  }
  return witnesses.length === 0
    ? unresolved("unsupported", fact.argument, "native utility argument has no retained or removed constituent witness")
    : resolved({ ...fact, contributes: true, witnesses, detail: "native retained/removed constituents witness this supplied argument" }, fact.argument, [
        fact.utility,
      ]);
}

/** Narrow value witnesses to one actual authored binding; another member of a union cannot lend it an effect. */
function nativeBindingWitness(fact: NativeGenericArgumentContribution, binding: MorphNode): ReferenceFact<NativeGenericArgumentContribution> {
  if (binding.wasForgotten() || binding.getSourceFile() !== fact.argument.getSourceFile() || !binding.getAncestors().includes(fact.argument)) {
    return unresolved("unsupported", binding, "generic contribution binding is not inside the supplied native argument");
  }
  const origin = annotationReferenceOrigin(binding);
  if (origin.kind !== "resolved") {
    return origin;
  }
  const type = binding.getType();
  if (type.isAny() || type.isUnknown() || type.isNever() || type.isTypeParameter()) {
    return unresolved("unsupported", binding, "generic contribution binding has no resolved native value constituents");
  }
  const identities = new Set(nativeParts(type).map((part) => part.compilerType));
  const witnesses = fact.witnesses.filter((witness) => identities.has(witness.compilerType));
  return witnesses.length === 0
    ? unresolved("unsupported", binding, "generic contribution witness does not link to this authored binding")
    : resolved({ ...fact, binding, witnesses, detail: "native constituents and authored origin link this binding to the actual utility effect" }, binding, [
        fact.utility,
        ...origin.value.declarations,
      ]);
}
