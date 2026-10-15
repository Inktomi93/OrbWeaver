// Declaration provenance for shape comparisons; matching types never establish a shared origin.
import type { Node as MorphNode, Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readAssignabilityChecker } from "./assignability.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { INVENTORY_KEY_SEPARATOR } from "./semantic-inventory-contract.ts";
import { inventoryDeclarationKey } from "./semantic-inventory-reader.ts";
import type { NativeGenericArgumentContribution, NativeGenericArgumentInput } from "./shape-derivation-contract.ts";
import { readNativeSubstitutedTypeSlots } from "./type-member-origin.ts";
import { annotationReferenceOrigin, resolved, resolveTypePropertyValue, unresolved } from "./type-member-origin-core.ts";

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

/** Observe binding-specific native constituents, substituted declaration slots and selected output projections. */
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
  const origin = annotationReferenceOrigin(genericReferenceName(reference));
  if (origin.kind === "unresolved") {
    return origin;
  }
  const utility = origin.value.declarations[0];
  if (
    origin.value.declarations.length !== 1 ||
    utility === undefined ||
    !(Node.isTypeAliasDeclaration(utility) || Node.isInterfaceDeclaration(utility)) ||
    utility.getProject() !== reference.getProject() ||
    program.getSourceFile(utility.getSourceFile().getFilePath()) !== utility.getSourceFile().compilerNode
  ) {
    return unresolved("unsupported", reference, "opaque generic has no single canonical native declaration");
  }
  const definition =
    Node.isTypeAliasDeclaration(utility) && program.isSourceFileDefaultLibrary(utility.getSourceFile().compilerNode)
      ? NATIVE_GENERIC_UTILITIES.find((candidate) => candidate.name === utility.getName())
      : undefined;
  if (definition === undefined) {
    return nativeSubstitutionContribution(input, utility, index);
  }
  if (first === undefined || index < 0 || arguments_.length !== definition.arity) {
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

function nativeSubstitutionContribution(
  input: NativeGenericArgumentInput,
  utility: NativeGenericArgumentContribution["utility"],
  index: number,
): ReferenceFact<NativeGenericArgumentContribution> {
  const { reference, argument, binding } = input;
  const parameter = utility.getTypeParameters()[index];
  if (parameter === undefined || index < 0) {
    return unresolved("unsupported", reference, "generic argument has no native formal parameter");
  }
  if (Node.isTypeQuery(argument)) {
    return nativeQueryOutputContribution(input, utility, parameter);
  }
  const candidate = binding?.getType() ?? argument.getType();
  if ([candidate, argument.getType(), reference.getType()].some((type) => type.isAny() || type.isUnknown() || type.isNever() || type.isTypeParameter())) {
    return unresolved("unsupported", argument, "substituted contribution has any, unknown, never or uninstantiated types");
  }
  const origins = genericBindingOrigins(input);
  if (origins.kind !== "resolved") {
    return origins;
  }
  const keyed = nativeMappedKeyContribution(input, utility, parameter, origins.value);
  if (keyed !== undefined) {
    return keyed;
  }
  const identities = new Set(nativeParts(candidate).map((type) => type.compilerType));
  const substitution = readNativeSubstitutedTypeSlots({
    parameter,
    templateLocation: utility,
    actualLocation: reference,
    program: input.program,
    source: input.source,
  });
  if (substitution.kind !== "resolved") {
    return substitution;
  }
  const slots = substitution.value;
  const witnesses = slots.flatMap((slot) => nativeParts(slot.actual).filter((type) => identities.has(type.compilerType)));
  const mapped = mappedFormalProjection({ utility, parameter, argument, reference, candidate });
  witnesses.push(...mapped);
  return witnesses.length === 0
    ? unresolved("unsupported", binding ?? argument, "native formal has no substituted member/signature contribution to this binding")
    : resolved(
        {
          utility,
          argument,
          ...(binding === undefined ? {} : { binding }),
          contributes: true,
          witnesses,
          detail: "native formal substitution and member/signature declarations witness this authored binding",
        },
        binding ?? argument,
        [utility, parameter, ...origins.value, ...slots.flatMap((slot) => slot.declarations)],
      );
}

function finiteNativeStrings(type: Type): readonly string[] | undefined {
  const values: string[] = [];
  for (const part of nativeParts(type)) {
    const value = part.getLiteralValue();
    if (!part.isStringLiteral() || typeof value !== "string") {
      return;
    }
    values.push(value);
  }
  return values;
}

function exactNativeKeys(type: Type, keys: readonly string[]): boolean {
  const names = type.getProperties().map((property) => property.getName());
  return (
    names.length === keys.length &&
    names.every((name) => keys.includes(name)) &&
    type.getStringIndexType() === undefined &&
    type.getNumberIndexType() === undefined
  );
}

function mappedTemplateKeyWitnesses(input: NativeGenericArgumentInput): readonly Type[] | undefined {
  const { argument, binding, reference } = input;
  if (!Node.isTemplateLiteralTypeNode(argument) || binding === undefined) {
    return;
  }
  const spans = argument.getTemplateSpans();
  const span = spans[0];
  const named = span?.getFirstChildByKind(SyntaxKind.TypeReference);
  const tail = span?.getLastChildIfKind(SyntaxKind.TemplateTail);
  if (spans.length !== 1 || named === undefined || named.getTypeArguments().length > 0 || named.getTypeName() !== binding || tail === undefined) {
    return;
  }
  const values = finiteNativeStrings(binding.getType());
  const actual = finiteNativeStrings(argument.getType());
  if (values === undefined || actual === undefined || values.length === 0) {
    return;
  }
  const keys = values.map((value) => `${argument.getHead().getLiteralText()}${value}${tail.getLiteralText()}`);
  return keys.length !== actual.length || !keys.every((key) => actual.includes(key)) || !exactNativeKeys(reference.getType(), keys)
    ? undefined
    : nativeParts(argument.getType());
}

function nativeMappedKeyContribution(
  input: NativeGenericArgumentInput,
  utility: NativeGenericArgumentContribution["utility"],
  parameter: import("ts-morph").TypeParameterDeclaration,
  origins: readonly MorphNode[],
): ReferenceFact<NativeGenericArgumentContribution> | undefined {
  const mapped = Node.isTypeAliasDeclaration(utility) ? utility.getTypeNode() : undefined;
  if (
    mapped === undefined ||
    !Node.isMappedTypeNode(mapped) ||
    !input.program.isSourceFileDefaultLibrary(utility.getSourceFile().compilerNode) ||
    input.binding === undefined ||
    mapped.getNameTypeNode() !== undefined
  ) {
    return;
  }
  const constraint = mapped.getTypeParameter().getConstraint();
  if (constraint !== undefined && sameFormalBinding(constraint, parameter)) {
    const witnesses = mappedTemplateKeyWitnesses(input);
    return witnesses === undefined
      ? unresolved("unsupported", input.binding, "native mapped key has no finite binding-specific template/declaration witness")
      : resolved(
          {
            utility,
            argument: input.argument,
            binding: input.binding,
            contributes: true,
            witnesses,
            detail: "native mapped key formal and instantiated properties retain this exact authored template binding",
          },
          input.binding,
          [utility, parameter, mapped.getTypeParameter(), ...origins],
        );
  }
  return nativeOptionalKeyContribution({ ...input, binding: input.binding }, utility, parameter, mapped);
}

function nativeKeyDefinition(utility: NativeGenericArgumentContribution["utility"], program: import("ts-morph").ts.Program): boolean {
  const parameter = utility.getTypeParameters()[0];
  const body = Node.isTypeAliasDeclaration(utility) ? utility.getTypeNode() : undefined;
  const constraint = body !== undefined && Node.isMappedTypeNode(body) ? body.getTypeParameter().getConstraint() : undefined;
  return (
    parameter !== undefined &&
    constraint !== undefined &&
    sameFormalBinding(constraint, parameter) &&
    program.isSourceFileDefaultLibrary(utility.getSourceFile().compilerNode)
  );
}

function nativeOptionalKeyContribution(
  input: NativeGenericArgumentInput & { readonly binding: MorphNode },
  utility: NativeGenericArgumentContribution["utility"],
  parameter: import("ts-morph").TypeParameterDeclaration,
  mapped: import("ts-morph").MappedTypeNode,
): ReferenceFact<NativeGenericArgumentContribution> | undefined {
  if (mapped.getQuestionToken()?.getKind() !== SyntaxKind.QuestionToken || mapped.getReadonlyToken() !== undefined || !Node.isTypeReference(input.argument)) {
    return;
  }
  const argument = input.argument;
  const keyArgument = argument.getTypeArguments()[0];
  if (keyArgument === undefined || argument.getTypeArguments().length !== 2 || !input.binding.getAncestors().includes(keyArgument)) {
    return;
  }
  const inner = readNativeGenericArgumentContribution({ ...input, reference: argument, argument: keyArgument });
  if (inner.kind !== "resolved") {
    return inner;
  }
  if (!nativeKeyDefinition(inner.value.utility, input.program)) {
    return unresolved("unsupported", input.binding, "the optional argument is not a native mapped key contribution");
  }
  const projected = mappedFormalProjection({ utility, parameter, argument, reference: input.reference, candidate: argument.getType(), nativeKeys: true });
  if (
    projected.length === 0 ||
    !exactNativeKeys(
      input.reference.getType(),
      argument
        .getType()
        .getProperties()
        .map((property) => property.getName()),
    )
  ) {
    return unresolved("unsupported", input.binding, "native optional mapped projection does not retain the actual argument properties");
  }
  return resolved(
    {
      ...inner.value,
      utility,
      argument,
      binding: input.binding,
      detail: "native optional mapped projection retains the binding-specific native key contribution",
    },
    input.binding,
    [utility, parameter, ...inner.trace.declarations],
  );
}

interface NativeMappedProjectionInput {
  readonly utility: NativeGenericArgumentContribution["utility"];
  readonly parameter: import("ts-morph").TypeParameterDeclaration;
  readonly argument: import("ts-morph").TypeNode;
  readonly reference: NativeGenericArgumentInput["reference"];
  readonly candidate: Type;
  readonly nativeKeys?: true;
}

function mappedFormalProjection(input: NativeMappedProjectionInput): readonly Type[] {
  const { utility, parameter, argument, reference, candidate } = input;
  const mapped = Node.isTypeAliasDeclaration(utility) ? utility.getTypeNode() : undefined;
  if (mapped === undefined || !Node.isMappedTypeNode(mapped) || candidate.compilerType !== argument.getType().compilerType) {
    return [];
  }
  const key = mapped.getTypeParameter();
  const constraint = key.getConstraint();
  const value = mapped.getTypeNode();
  if (constraint === undefined || !Node.isTypeOperatorTypeNode(constraint) || value === undefined || !Node.isIndexedAccessTypeNode(value)) {
    return [];
  }
  if (
    constraint.getTypeNode().getType().compilerType !== parameter.getType().compilerType ||
    value.getObjectTypeNode().getType().compilerType !== parameter.getType().compilerType ||
    value
      .getIndexTypeNode()
      .getType()
      .getSymbol()
      ?.getDeclarations()
      .some((declaration) => declaration.compilerNode === key.compilerNode) !== true ||
    mapped.getNameTypeNode() !== undefined
  ) {
    return [];
  }
  const supplied = argument.getType();
  const output = reference.getType();
  const witnesses: Type[] = [];
  for (const property of output.getProperties()) {
    const origin = supplied.getProperty(property.getName());
    const declarations = property.getDeclarations();
    const originNodes = new Set(origin?.getDeclarations().map((node) => node.compilerNode));
    // Native key maps create symbols without property declarations; their proven key formal carries that origin.
    if (origin === undefined || (declarations.length === 0 && input.nativeKeys !== true) || !declarations.every((node) => originNodes.has(node.compilerNode))) {
      return [];
    }
    const initial = origin.getTypeAtLocation(argument);
    const actual = property.getTypeAtLocation(reference).getNonNullableType();
    if (actual.compilerType !== initial.getNonNullableType().compilerType || actual.isAny() || actual.isUnknown() || actual.isNever()) {
      return [];
    }
    witnesses.push(actual);
  }
  return witnesses;
}

function genericBindingOrigins(input: NativeGenericArgumentInput): ReferenceFact<readonly MorphNode[]> {
  const { binding, argument } = input;
  if (binding === undefined) {
    return resolved([], argument, []);
  }
  if (binding.wasForgotten() || binding.getSourceFile() !== argument.getSourceFile() || !binding.getAncestors().includes(argument)) {
    return unresolved("unsupported", binding, "substituted binding is outside the delivered argument");
  }
  const origin = annotationReferenceOrigin(binding);
  return origin.kind !== "resolved" ? origin : resolved(origin.value.declarations, binding, origin.value.declarations);
}

function formalIndexedPath(node: MorphNode, parameter: import("ts-morph").TypeParameterDeclaration): readonly string[] | undefined {
  if (!Node.isIndexedAccessTypeNode(node)) {
    return sameFormalBinding(node, parameter) ? [] : undefined;
  }
  const index = node.getIndexTypeNode();
  const literal = Node.isLiteralTypeNode(index) ? index.getLiteral() : undefined;
  const parent = formalIndexedPath(node.getObjectTypeNode(), parameter);
  return parent === undefined || literal === undefined || !Node.isStringLiteral(literal) ? undefined : [...parent, literal.getLiteralValue()];
}

function nativeQueryOutputContribution(
  input: NativeGenericArgumentInput,
  utility: NativeGenericArgumentContribution["utility"],
  parameter: import("ts-morph").TypeParameterDeclaration,
): ReferenceFact<NativeGenericArgumentContribution> {
  const { argument, reference, binding } = input;
  const body = Node.isTypeAliasDeclaration(utility) ? utility.getTypeNode() : undefined;
  if (!Node.isTypeQuery(argument) || body === undefined || !Node.isConditionalTypeNode(body) || binding !== argument.getExprName()) {
    return unresolved("unsupported", argument, "schema output requires the actual query binding and selected native conditional projection");
  }
  const supplied = argument.getType();
  const path = formalIndexedPath(body.getTrueType(), parameter);
  const checker = readAssignabilityChecker(reference.getProject().getTypeChecker());
  if (supplied.isAny() || supplied.isUnknown() || supplied.isNever() || supplied.isUnion() || supplied.isTypeParameter()) {
    return unresolved("unsupported", argument, "native schema query is any, unknown, never, union or uninstantiated");
  }
  if (!sameFormalBinding(body.getCheckType(), parameter) || path === undefined || path.length === 0) {
    return unresolved("unsupported", argument, "native schema true branch does not retain the same formal indexed property");
  }
  if (checker?.isTypeAssignableTo(supplied.compilerType, body.getExtendsType().getType().compilerType) !== true) {
    return unresolved("unsupported", argument, "native schema query does not select the projected conditional branch");
  }
  const origin = genericBindingOrigins(input);
  const projected = resolveTypePropertyValue(argument, path);
  if (origin.kind !== "resolved") {
    return origin;
  }
  if (projected.kind !== "resolved") {
    return projected;
  }
  const output = projected.value.type;
  if (output.isAny() || output.isUnknown() || output.isNever() || output.compilerType !== reference.getType().compilerType) {
    return unresolved("unsupported", argument, "native projected property is not this generic's actual output type");
  }
  return resolved(
    {
      utility,
      argument,
      binding,
      contributes: true,
      witnesses: [output],
      detail: "native selected conditional output retains the actual schema query property projection",
    },
    binding,
    [utility, parameter, ...origin.value, ...projected.value.declarations],
  );
}

function sameFormalBinding(node: MorphNode, parameter: import("ts-morph").TypeParameterDeclaration): boolean {
  if (!Node.isTypeReference(node) || node.getTypeArguments().length > 0) {
    return false;
  }
  const origin = annotationReferenceOrigin(node.getTypeName());
  return origin.kind === "resolved" && origin.value.declarations.length === 1 && origin.value.declarations[0]?.compilerNode === parameter.compilerNode;
}

function genericReferenceName(reference: NativeGenericArgumentInput["reference"]): MorphNode {
  return Node.isTypeReference(reference) ? reference.getTypeName() : reference.getExpression();
}
