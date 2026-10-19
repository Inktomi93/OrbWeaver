// Declaration provenance for shape comparisons; matching types never establish a shared origin.
import type { EntityName, Identifier, Node as MorphNode, Symbol as MorphSymbol, ts as MorphTs, Signature, Type, TypeNode } from "ts-morph";
import { Node } from "ts-morph";
import nativeTs from "typescript";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { INVENTORY_KEY_SEPARATOR } from "./semantic-inventory-contract.ts";
import { inventoryDeclarationKey } from "./semantic-inventory-reader.ts";
import type {
  NativeGenericArgumentContribution,
  NativeGenericArgumentInput,
  ParserGenericArgumentInput,
  ParserGenericDeclaration,
} from "./shape-derivation-contract.ts";
import { shapeFactsOf } from "./shape-facts.ts";
import { readParserSignatureTypeIdentities, readRealmMappedProjection, readRealmSubstitution } from "./type-member-origin.ts";
import type {
  NativeParserTypeContext,
  NativeTypeIdentityGraphInput,
  TypeIdentityOrigin,
  TypeRealmMapped,
  TypeRealmOperations,
} from "./type-member-origin-contract.ts";
import { morphTypeOperations, parserTypeOperations, resolved, unresolved } from "./type-member-origin-core.ts";

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
  const facts = shapeFactsOf(decl);
  if (facts !== undefined) {
    return new Set(facts.shape(decl).direct);
  }
  return new Set([...bareAliasTargetKeys(decl), ...heritageTargetKeys(decl)]);
}

/** A `typeof` operand's identity: the root value's declarations plus the member path read from it. A member
 *  symbol alone is shared by every value of one generic type (`typeof a.body` and `typeof b.body` resolve to
 *  the same `body` declaration of `Route<B>`), so it never identifies the operand. */
function typeQueryOperandKeys(operand: EntityName): readonly string[] {
  const path: string[] = [];
  let root: EntityName = operand;
  while (Node.isQualifiedName(root)) {
    path.unshift(root.getRight().getText());
    root = root.getLeft();
  }
  const symbol = root.getSymbol();
  const suffix = path.map((member) => `${INVENTORY_KEY_SEPARATOR}${member}`).join("");
  return ((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []).map((declaration) => `${inventoryDeclarationKey(declaration)}${suffix}`);
}

/** One instantiation argument's identity: a keyword or literal by its text, or a non-generic reference by its
 *  single resolved declaration. Anything else is unidentified, and the operand then has no key. */
function instantiationArgumentKey(argument: TypeNode): string | undefined {
  if (argument.getKindName().endsWith("Keyword") || Node.isLiteralTypeNode(argument)) {
    return argument.getText();
  }
  if (!Node.isTypeReference(argument) || argument.getTypeArguments().length > 0) {
    return;
  }
  const symbol = argument.getTypeName().getSymbol();
  const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
  const [declaration] = declarations;
  return declarations.length === 1 && declaration !== undefined ? inventoryDeclarationKey(declaration) : undefined;
}

/** The instantiation suffix of a `typeof f<A>` operand: `typeof f<string>` and `typeof f<number>` are different types. */
function instantiationKey(typeArguments: readonly TypeNode[]): string | undefined {
  const parts = typeArguments.map(instantiationArgumentKey);
  if (parts.some((part) => part === undefined)) {
    return;
  }
  return parts.length === 0 ? "" : `${INVENTORY_KEY_SEPARATOR}<${parts.join(INVENTORY_KEY_SEPARATOR)}>`;
}

/** Shared `typeof value` provenance through a generic derive (`z.infer`, `ReturnType`, and equivalents). */
export function typeQueryDerivationKeys(decl: MorphNode): Set<string> {
  const facts = shapeFactsOf(decl);
  if (facts !== undefined) {
    return new Set(facts.shape(decl).queries);
  }
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
  const instantiation = instantiationKey(argument.getTypeArguments());
  if (instantiation === undefined) {
    return keys;
  }
  const genericSymbol = typeNode.getTypeName().getSymbol();
  const genericKeys = ((genericSymbol?.getAliasedSymbol() ?? genericSymbol)?.getDeclarations() ?? []).map(inventoryDeclarationKey);
  const operandKeys = typeQueryOperandKeys(argument.getExprName()).map((key) => `${key}${instantiation}`);
  for (const genericKey of genericKeys) {
    for (const operandKey of operandKeys) {
      keys.add(`${genericKey}${INVENTORY_KEY_SEPARATOR}${operandKey}`);
    }
  }
  return keys;
}

/** The one pair derivation judgment: `decl` names `target` directly, or both share one `typeof` provenance. */
export function shapeDerivesFrom(decl: MorphNode, target: MorphNode): boolean {
  if (directDerivationTargetKeys(decl).has(inventoryDeclarationKey(target))) {
    return true;
  }
  const origins = typeQueryDerivationKeys(decl);
  return [...typeQueryDerivationKeys(target)].some((key) => origins.has(key));
}

const NATIVE_GENERIC_UTILITIES = [
  { name: "Exclude", arity: 2, secondArgument: "removed" },
  { name: "Extract", arity: 2, secondArgument: "retained" },
  { name: "NonNullable", arity: 1, secondArgument: "retained" },
] as const;

interface ContributionInput<N extends object, T, S, G, I extends object, U extends N> {
  readonly reference: N;
  readonly argument: N;
  readonly binding?: N;
  readonly ops: TypeRealmOperations<N, T, S, G, I>;
  readonly definition: (node: N) => node is U;
  readonly owned: (node: N) => boolean;
}

function ancestorsCore<N extends object, T, S, G, I extends object>(node: N, ops: TypeRealmOperations<N, T, S, G, I>): readonly N[] {
  const values: N[] = [];
  const seen = new Set<object>();
  for (let parent = ops.parent(node); parent !== undefined && !seen.has(ops.nodeIdentity(parent)); parent = ops.parent(parent)) {
    values.push(parent);
    seen.add(ops.nodeIdentity(parent));
  }
  return values;
}

function originCore<N extends object, T, S, G, I extends object>(node: N, ops: TypeRealmOperations<N, T, S, G, I>): ReferenceFact<TypeIdentityOrigin<N>, N> {
  const symbol = ops.symbol(node);
  const target = symbol === undefined ? undefined : ops.alias(symbol);
  const declarations = target === undefined ? [] : ops.declarations(target);
  return target === undefined || declarations.length === 0
    ? unresolved("missing", node, "the checker resolved no type reference declaration")
    : resolved(
        { name: ops.symbolName(target), node, aliased: declarations.some((declaration) => ops.generic(declaration)?.kind === "alias"), declarations },
        node,
        declarations,
      );
}

function contributionReferencesCore<N extends object, T, S, G, I extends object, U extends N>(
  node: N,
  input: Omit<ContributionInput<N, T, S, G, I, U>, "reference" | "argument" | "binding">,
): boolean {
  const { ops } = input;
  const ancestors = ancestorsCore(node, ops);
  if (ancestors.some(ops.parameter)) {
    return false;
  }
  for (const reference of ancestors) {
    const selected = ops.reference(reference);
    const argument = selected?.arguments.find((candidate) => ancestors.some((ancestor) => ops.nodeIdentity(ancestor) === ops.nodeIdentity(candidate)));
    if (argument === undefined) {
      continue;
    }
    const contribution = genericContributionCore({ ...input, reference, argument, binding: node });
    if (contribution.kind !== "resolved" || !contribution.value.contributes) {
      return false;
    }
  }
  return true;
}

/** Morph callers retain their actual Project/compiler ownership; no parser compiler is substituted. */
export function nativeGenericReferenceContributes(identifier: Identifier, native: Pick<NativeGenericArgumentInput, "program" | "source">): boolean {
  if (identifier.wasForgotten()) {
    return false;
  }
  const source = identifier.getSourceFile();
  if (
    source.compilerNode !== native.source ||
    source.getProject().getProgram().compilerObject !== native.program ||
    native.program.getSourceFile(source.getFilePath()) !== native.source
  ) {
    return false;
  }
  const context = morphContributionContext(identifier, native.program);
  return contributionReferencesCore(identifier, context);
}

/** Actual parser observations use only raw values from that same Program/checker/source epoch. */
export function parserGenericReferenceContributes(identifier: nativeTs.Identifier, parser: NativeParserTypeContext): boolean {
  assertParserEpoch(identifier, parser);
  return contributionReferencesCore(identifier, parserContributionContext(parser));
}

function assertParserEpoch(node: nativeTs.Node, parser: NativeParserTypeContext): void {
  if (
    parser.program.getTypeChecker() !== parser.checker ||
    node.getSourceFile() !== parser.source ||
    parser.program.getSourceFile(parser.source.fileName) !== parser.source
  ) {
    throw new Error("generic contribution parser source/checker is foreign or stale");
  }
}

function morphContributionContext(
  reference: MorphNode,
  program: MorphTs.Program,
): Pick<
  ContributionInput<MorphNode, Type, MorphSymbol, Signature, MorphTs.Type, NativeGenericArgumentContribution["utility"]>,
  "ops" | "owned" | "definition"
> {
  const project = reference.getProject();
  const ops = morphTypeOperations(program);
  const owned = (node: MorphNode): boolean => !node.wasForgotten() && node.getProject() === project && ops.contains(node);
  const definition = (node: MorphNode): node is NativeGenericArgumentContribution["utility"] =>
    (Node.isTypeAliasDeclaration(node) || Node.isInterfaceDeclaration(node) || Node.isClassDeclaration(node)) && owned(node);
  return { ops, owned, definition };
}

function parserContributionContext(
  parser: NativeParserTypeContext,
): Pick<
  ContributionInput<nativeTs.Node, nativeTs.Type, nativeTs.Symbol, nativeTs.Signature, nativeTs.Type, ParserGenericDeclaration>,
  "ops" | "owned" | "definition"
> {
  const ops = parserTypeOperations(parser);
  const owned = ops.contains;
  const definition = (node: nativeTs.Node): node is ParserGenericDeclaration =>
    (nativeTs.isTypeAliasDeclaration(node) || nativeTs.isInterfaceDeclaration(node) || nativeTs.isClassDeclaration(node)) && owned(node);
  return { ops, owned, definition };
}

/** Observe the canonical contribution in the Morph realm only. */
export function readNativeGenericArgumentContribution(input: NativeGenericArgumentInput): ReferenceFact<NativeGenericArgumentContribution> {
  const { reference, argument, program, source } = input;
  if (reference.wasForgotten() || argument.wasForgotten()) {
    return unresolved("unsupported", reference, "generic contribution received a forgotten native node");
  }
  const file = reference.getSourceFile();
  if (file.compilerNode !== source || file.getProject().getProgram().compilerObject !== program || program.getSourceFile(file.getFilePath()) !== source) {
    return unresolved("unsupported", reference, "generic contribution belongs to a foreign world or stale native epoch");
  }
  return genericContributionCore({
    reference,
    argument,
    ...(input.binding === undefined ? {} : { binding: input.binding }),
    ...morphContributionContext(reference, program),
  });
}

/** The same canonical contribution uses the parser's actual native compiler, never a Morph wrapper. */
export function readParserGenericArgumentContribution(
  input: ParserGenericArgumentInput,
): ReferenceFact<NativeGenericArgumentContribution<nativeTs.Node, nativeTs.Type, ParserGenericDeclaration>, nativeTs.Node> {
  const { reference, argument, parser } = input;
  if (
    parser.checker !== parser.program.getTypeChecker() ||
    reference.getSourceFile() !== parser.source ||
    argument.getSourceFile() !== parser.source ||
    parser.program.getSourceFile(parser.source.fileName) !== parser.source
  ) {
    return unresolved("unsupported", reference, "generic contribution parser source/checker is foreign or stale");
  }
  return genericContributionCore({
    reference,
    argument,
    ...(input.binding === undefined ? {} : { binding: input.binding }),
    ...parserContributionContext(parser),
  });
}

function partsCore<N extends object, T, S, G, I extends object>(type: T, ops: TypeRealmOperations<N, T, S, G, I>): readonly T[] {
  const parts = ops.unions(type);
  return parts.length === 0 ? [type] : parts;
}

function genericContributionCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
): ReferenceFact<NativeGenericArgumentContribution<N, T, U>, N> {
  const { ops, reference, argument } = input;
  const selected = ops.reference(reference);
  const index = selected?.arguments.findIndex((node) => ops.nodeIdentity(node) === ops.nodeIdentity(argument)) ?? -1;
  if (selected === undefined || index < 0) {
    return unresolved("unsupported", reference, "generic argument is outside the actual reference");
  }
  const origin = originCore(selected.name, ops);
  if (origin.kind !== "resolved") {
    return origin;
  }
  const declarations = origin.value.declarations;
  if (declarations.length > 1) {
    return mergedContributionCore(input, declarations, index);
  }
  const utility = declarations[0];
  if (utility === undefined || !input.definition(utility)) {
    return unresolved("unsupported", reference, "opaque generic has no single canonical native declaration");
  }
  const definition =
    ops.generic(utility)?.kind === "alias" && ops.defaultLibrary(utility)
      ? NATIVE_GENERIC_UTILITIES.find((candidate) => candidate.name === origin.value.name)
      : undefined;
  if (definition === undefined) {
    return substitutionContributionCore(input, utility, index);
  }
  return utilityContributionCore(input, utility, { definition, index, arguments: selected.arguments });
}

function mergedContributionCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
  declarations: readonly N[],
  index: number,
): ReferenceFact<NativeGenericArgumentContribution<N, T, U>, N> {
  const { ops, reference } = input;
  if (!declarations.every((node) => input.definition(node) || (ops.variable(node) && input.owned(node)))) {
    return unresolved("unsupported", reference, "merged generic has a foreign or non-interface native declaration");
  }
  for (const utility of declarations.filter(input.definition).filter((node) => ops.generic(node)?.kind === "interface")) {
    const fact = substitutionContributionCore(input, utility, index);
    if (fact.kind === "resolved" && fact.value.contributes) {
      return fact;
    }
  }
  return unresolved("unsupported", reference, "merged native formals have no substituted contribution to this binding");
}

function utilityContributionCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
  utility: U,
  selection: { readonly definition: (typeof NATIVE_GENERIC_UTILITIES)[number]; readonly index: number; readonly arguments: readonly N[] },
): ReferenceFact<NativeGenericArgumentContribution<N, T, U>, N> {
  const { ops, reference, argument } = input;
  const { definition, index, arguments: arguments_ } = selection;
  const first = arguments_[0];
  if (first === undefined || arguments_.length !== definition.arity) {
    return unresolved("unsupported", reference, "opaque generic utility or argument grammar is outside supported native contribution facts");
  }
  const initial = ops.type(first);
  const supplied = ops.type(argument);
  const output = ops.type(reference);
  if (
    [initial, supplied, output].some((type) => {
      const flags = ops.flags(type);
      return flags.any || flags.unknown || flags.parameter;
    })
  ) {
    return unresolved("unsupported", argument, "generic contribution has any, unknown or uninstantiated native types");
  }
  const fact = { utility, argument, contributes: false, witnesses: [], detail: "never supplies no retained/removed value-type constituent" };
  if ([initial, supplied, output].some((type) => ops.flags(type).never)) {
    return resolved(fact, argument, [utility]);
  }
  const inputs = partsCore(initial, ops);
  const outputs = partsCore(output, ops);
  const inputIds = new Set(inputs.map(ops.typeIdentity));
  if (!outputs.every((type) => inputIds.has(ops.typeIdentity(type)))) {
    return unresolved("unsupported", argument, "native output has no complete input-constituent identity witness");
  }
  let witnesses = outputs;
  if (index === 1) {
    const suppliedIds = new Set(partsCore(supplied, ops).map(ops.typeIdentity));
    const outputIds = new Set(outputs.map(ops.typeIdentity));
    witnesses = (definition.secondArgument === "removed" ? inputs.filter((type) => !outputIds.has(ops.typeIdentity(type))) : outputs).filter((type) =>
      suppliedIds.has(ops.typeIdentity(type)),
    );
  }
  const bound = boundWitnessesCore(input, utility, witnesses);
  if (bound.kind === "unresolved") {
    return bound;
  }
  witnesses = bound.value;
  return witnesses.length === 0
    ? unresolved("unsupported", input.binding ?? argument, "native utility argument has no retained or removed constituent witness")
    : resolved(
        {
          ...fact,
          ...(input.binding === undefined ? {} : { binding: input.binding }),
          contributes: true,
          witnesses,
          detail: "native constituents and authored origin link this binding to the actual utility effect",
        },
        input.binding ?? argument,
        bound.trace.declarations,
      );
}

function boundWitnessesCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
  utility: U,
  initial: readonly T[],
): ReferenceFact<readonly T[], N> {
  const { ops, argument } = input;
  let witnesses = initial;
  const binding = input.binding;
  if (binding === undefined) {
    return resolved(witnesses, argument, [utility]);
  }
  if (ops.forgotten(binding) || !ancestorsCore(binding, ops).some((node) => ops.nodeIdentity(node) === ops.nodeIdentity(argument))) {
    return unresolved("unsupported", binding, "generic contribution binding is not inside the supplied native argument");
  }
  const origin = originCore(binding, ops);
  if (origin.kind !== "resolved") {
    return origin;
  }
  const flags = ops.flags(ops.type(binding));
  if (flags.any || flags.unknown || flags.never || flags.parameter) {
    return unresolved("unsupported", binding, "generic contribution binding has no resolved native value constituents");
  }
  const ids = new Set(partsCore(ops.type(binding), ops).map(ops.typeIdentity));
  witnesses = witnesses.filter((type) => ids.has(ops.typeIdentity(type)));

  return resolved(witnesses, binding, [utility, ...origin.value.declarations]);
}

function bindingOriginsCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
): ReferenceFact<readonly N[], N> {
  const { binding, argument, ops } = input;
  if (binding === undefined) {
    return resolved([], argument, []);
  }
  if (ops.forgotten(binding) || !ancestorsCore(binding, ops).some((node) => ops.nodeIdentity(node) === ops.nodeIdentity(argument))) {
    return unresolved("unsupported", binding, "substituted binding is outside the delivered argument");
  }
  const origin = originCore(binding, ops);
  return origin.kind === "unresolved" ? origin : resolved(origin.value.declarations, binding, origin.value.declarations);
}

function sameFormalCore<N extends object, T, S, G, I extends object>(node: N, parameter: N, ops: TypeRealmOperations<N, T, S, G, I>): boolean {
  const reference = ops.reference(node);
  if (reference === undefined || reference.arguments.length > 0) {
    return false;
  }
  const origin = originCore(reference.name, ops);
  return (
    origin.kind === "resolved" &&
    origin.value.declarations.length === 1 &&
    origin.value.declarations.some((declaration) => ops.nodeIdentity(declaration) === ops.nodeIdentity(parameter))
  );
}

function finiteStringsCore<N extends object, T, S, G, I extends object>(type: T, ops: TypeRealmOperations<N, T, S, G, I>): readonly string[] | undefined {
  const values: string[] = [];
  for (const part of partsCore(type, ops)) {
    const value = ops.literalType(part);
    if (value === undefined) {
      return;
    }
    values.push(value);
  }
  return values;
}

function exactKeysCore<N extends object, T, S, G, I extends object>(type: T, keys: readonly string[], ops: TypeRealmOperations<N, T, S, G, I>): boolean {
  const names = ops.properties(type).map(ops.symbolName);
  return names.length === keys.length && names.every((name) => keys.includes(name)) && ops.indexes(type).length === 0;
}

function mappedKeyCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
  utility: U,
  parameter: N,
  origins: readonly N[],
): ReferenceFact<NativeGenericArgumentContribution<N, T, U>, N> | undefined {
  const { ops, argument, reference, binding } = input;
  const body = ops.generic(utility)?.body;
  const mapped = body === undefined ? undefined : ops.mapped(body);
  if (mapped === undefined || !ops.defaultLibrary(utility) || binding === undefined || mapped.remap !== undefined) {
    return;
  }
  if (mapped.constraint !== undefined && sameFormalCore(mapped.constraint, parameter, ops)) {
    const template = ops.template(argument);
    const span = template?.spans[0];
    const name = span === undefined ? undefined : ops.reference(span.type);
    const values = finiteStringsCore(ops.type(binding), ops);
    const actual = finiteStringsCore(ops.type(argument), ops);
    if (
      template === undefined ||
      template.spans.length !== 1 ||
      span === undefined ||
      name === undefined ||
      name.arguments.length > 0 ||
      ops.nodeIdentity(name.name) !== ops.nodeIdentity(binding) ||
      values === undefined ||
      actual === undefined ||
      values.length === 0
    ) {
      return unresolved("unsupported", binding, "native mapped key has no finite binding-specific template/declaration witness");
    }
    const keys = values.map((value) => `${template.head}${value}${span.tail}`);
    if (keys.length !== actual.length || !keys.every((key) => actual.includes(key)) || !exactKeysCore(ops.type(reference), keys, ops)) {
      return unresolved("unsupported", binding, "native mapped key has no finite binding-specific template/declaration witness");
    }
    return resolved(
      {
        utility,
        argument,
        binding,
        contributes: true,
        witnesses: partsCore(ops.type(argument), ops),
        detail: "native mapped key formal and instantiated properties retain this exact authored template binding",
      },
      binding,
      [utility, parameter, mapped.parameter, ...origins],
    );
  }
  return optionalKeyCore(input, utility, parameter, mapped);
}

function optionalKeyCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
  utility: U,
  parameter: N,
  mapped: TypeRealmMapped<N>,
): ReferenceFact<NativeGenericArgumentContribution<N, T, U>, N> | undefined {
  const { ops, argument, reference, binding } = input;
  if (binding === undefined) {
    return undefined;
  }
  const selected = ops.reference(argument);
  const keyArgument = selected?.arguments[0];
  if (
    !mapped.optional ||
    mapped.readonly ||
    selected === undefined ||
    selected.arguments.length !== 2 ||
    keyArgument === undefined ||
    !ancestorsCore(binding, ops).some((node) => ops.nodeIdentity(node) === ops.nodeIdentity(keyArgument))
  ) {
    return;
  }
  const inner = genericContributionCore({ ...input, reference: argument, argument: keyArgument });
  if (inner.kind !== "resolved") {
    return inner;
  }
  const innerGeneric = ops.generic(inner.value.utility);
  const innerBody = innerGeneric?.body;
  const innerMapped = innerBody === undefined ? undefined : ops.mapped(innerBody);
  const innerParameter = innerGeneric?.parameters[0];
  if (
    innerParameter === undefined ||
    innerMapped?.constraint === undefined ||
    !sameFormalCore(innerMapped.constraint, innerParameter, ops) ||
    !ops.defaultLibrary(inner.value.utility)
  ) {
    return unresolved("unsupported", binding, "the optional argument is not a native mapped key contribution");
  }
  const projected = readRealmMappedProjection({ parameter, template: utility, actual: reference, witness: argument, ops }, true);
  if (
    projected.kind !== "resolved" ||
    projected.value.length === 0 ||
    !exactKeysCore(ops.type(reference), ops.properties(ops.type(argument)).map(ops.symbolName), ops)
  ) {
    return unresolved("unsupported", binding, "native optional mapped projection does not retain the actual argument properties");
  }
  return resolved(
    { ...inner.value, utility, argument, binding, detail: "native optional mapped projection retains the binding-specific native key contribution" },
    binding,
    [utility, parameter, ...inner.trace.declarations],
  );
}

function formalNodePathCore<N extends object, T, S, G, I extends object>(
  node: N,
  parameter: N,
  ops: TypeRealmOperations<N, T, S, G, I>,
): readonly string[] | undefined {
  const indexed = ops.indexedNode(node);
  if (indexed === undefined) {
    return sameFormalCore(node, parameter, ops) ? [] : undefined;
  }
  const key = ops.literalNode(indexed.index);
  const parent = formalNodePathCore(indexed.object, parameter, ops);
  return key === undefined || parent === undefined ? undefined : [...parent, key];
}

function queryContributionCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
  utility: U,
  parameter: N,
): ReferenceFact<NativeGenericArgumentContribution<N, T, U>, N> {
  const { ops, argument, reference, binding } = input;
  const body = ops.generic(utility)?.body;
  const conditional = body === undefined ? undefined : ops.conditional(body);
  const name = ops.query(argument);
  if (name === undefined || conditional === undefined || binding === undefined || ops.nodeIdentity(binding) !== ops.nodeIdentity(name)) {
    return unresolved("unsupported", argument, "schema output requires the actual query binding and selected native conditional projection");
  }
  const supplied = ops.type(argument);
  const flags = ops.flags(supplied);
  const path = formalNodePathCore(conditional.selected, parameter, ops);
  if (flags.any || flags.unknown || flags.never || flags.parameter || ops.unions(supplied).length > 0) {
    return unresolved("unsupported", argument, "native schema query is any, unknown, never, union or uninstantiated");
  }
  if (!sameFormalCore(conditional.check, parameter, ops) || path === undefined || path.length === 0) {
    return unresolved("unsupported", argument, "native schema true branch does not retain the same formal indexed property");
  }
  if (!ops.assignable(supplied, ops.type(conditional.extends))) {
    return unresolved("unsupported", argument, "native schema query does not select the projected conditional branch");
  }
  const origin = bindingOriginsCore(input);
  if (origin.kind !== "resolved") {
    return origin;
  }
  let output = supplied;
  let declarations: readonly N[] = [];
  for (const key of path) {
    const property = ops.property(ops.nonnullable(output), key);
    if (property === undefined || ops.declarations(property).length === 0) {
      return unresolved("missing", argument, `the checker resolved no property ${key}`);
    }
    declarations = ops.declarations(property);
    output = ops.symbolType(property, argument);
  }
  const outputFlags = ops.flags(output);
  if (outputFlags.any || outputFlags.unknown || outputFlags.never || ops.typeIdentity(output) !== ops.typeIdentity(ops.type(reference))) {
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
    [utility, parameter, ...origin.value, ...declarations],
  );
}

function substitutionContributionCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
  utility: U,
  index: number,
): ReferenceFact<NativeGenericArgumentContribution<N, T, U>, N> {
  const { ops, argument, reference, binding } = input;
  const parameter = ops.generic(utility)?.parameters[index];
  if (parameter === undefined || index < 0) {
    return unresolved("unsupported", reference, "generic argument has no native formal parameter");
  }
  if (ops.query(argument) !== undefined) {
    return queryContributionCore(input, utility, parameter);
  }
  const candidate = ops.type(binding ?? argument);
  if (
    [candidate, ops.type(argument), ops.type(reference)].some((type) => {
      const flags = ops.flags(type);
      return flags.any || flags.unknown || flags.never || flags.parameter;
    })
  ) {
    return unresolved("unsupported", argument, "substituted contribution has any, unknown, never or uninstantiated types");
  }
  const origins = bindingOriginsCore(input);
  if (origins.kind !== "resolved") {
    return origins;
  }
  const keyed = mappedKeyCore(input, utility, parameter, origins.value);
  if (keyed !== undefined) {
    return keyed;
  }
  const slots = readRealmSubstitution({ parameter, template: utility, actual: reference, witness: binding ?? argument, ops });
  if (slots.kind !== "resolved") {
    return slots;
  }
  const identities = new Set(partsCore(candidate, ops).map(ops.typeIdentity));
  const witnesses = slots.value.flatMap((slot) =>
    partsCore(slot.actual, ops).filter((type) => slot.projection !== undefined || identities.has(ops.typeIdentity(type))),
  );
  witnesses.push(...mappedWitnessesCore(input, utility, parameter, candidate));
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
        [utility, parameter, ...origins.value, ...slots.value.flatMap((slot) => slot.declarations)],
      );
}

function mappedWitnessesCore<N extends object, T, S, G, I extends object, U extends N>(
  input: ContributionInput<N, T, S, G, I, U>,
  utility: U,
  parameter: N,
  candidate: T,
): readonly T[] {
  const { ops, reference, argument } = input;
  if (ops.typeIdentity(candidate) !== ops.typeIdentity(ops.type(argument))) {
    return [];
  }
  const mapped = readRealmMappedProjection({ parameter, template: utility, actual: reference, witness: argument, ops });
  return mapped.kind === "resolved" ? mapped.value : [];
}

function signatureAnnotationNodes(declaration: nativeTs.Node): readonly nativeTs.TypeNode[] {
  if (!nativeTs.isFunctionLike(declaration)) {
    return [];
  }
  return [
    ...declaration.parameters.flatMap((parameter) => (parameter.type === undefined ? [] : [parameter.type])),
    ...(declaration.type === undefined ? [] : [declaration.type]),
  ];
}

function signatureAnnotationOrigins(
  node: nativeTs.TypeNode,
  context: NativeParserTypeContext,
): {
  readonly annotations: readonly TypeIdentityOrigin<nativeTs.Node>[];
  readonly refusal?: string;
} {
  const parser = { ...context, source: node.getSourceFile() };
  const ops = parserTypeOperations(parser);
  const annotations: TypeIdentityOrigin<nativeTs.Node>[] = [];
  if (!ops.contains(node)) {
    return { annotations, refusal: "signature annotations belong to a foreign or stale native source" };
  }
  let refusal: string | undefined;
  const pending = [...ops.children(node)];
  for (const binding of pending) {
    pending.push(...ops.children(binding));
    if (!nativeTs.isIdentifier(binding)) {
      continue;
    }
    const origin = originCore(binding, ops);
    if (
      origin.kind !== "resolved" ||
      !origin.value.declarations.some((candidate) => nativeTs.isInterfaceDeclaration(candidate) || nativeTs.isTypeAliasDeclaration(candidate))
    ) {
      continue;
    }
    if (parserGenericReferenceContributes(binding, parser)) {
      annotations.push(origin.value);
    } else if (origin.value.declarations.some(nativeTs.isTypeAliasDeclaration)) {
      refusal = "an authored signature alias has no qualified native generic contribution";
    }
  }
  return { annotations, ...(refusal === undefined ? {} : { refusal }) };
}

/** Compose actual raw-parser signature annotations with the canonical graph and contribution algorithm. */
export function readParserSignatureTypeExposures(
  input: NativeTypeIdentityGraphInput,
): ReferenceFact<readonly TypeIdentityOrigin<nativeTs.Node>[], nativeTs.Node> {
  const graph = readParserSignatureTypeIdentities(input);
  const annotations: TypeIdentityOrigin<nativeTs.Node>[] = [];
  let refusal: string | undefined;
  for (const declaration of graph.trace.declarations) {
    for (const node of signatureAnnotationNodes(declaration)) {
      const fact = signatureAnnotationOrigins(node, input.parser);
      annotations.push(...fact.annotations);
      refusal = fact.refusal ?? refusal;
    }
  }
  const declarations = [...graph.trace.declarations, ...annotations.flatMap((origin) => origin.declarations)];
  if (graph.kind === "unresolved") {
    return { ...graph, trace: { ...graph.trace, declarations } };
  }
  return refusal === undefined
    ? resolved([...graph.value, ...annotations], graph.trace.origin, declarations)
    : { ...unresolved("unsupported", graph.trace.origin, refusal), trace: { ...graph.trace, declarations } };
}
