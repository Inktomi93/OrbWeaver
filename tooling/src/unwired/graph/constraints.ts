// Type parameter constraints: a type argument fills its parameter's constraint member by member, so the compiler
// requires each member of the argument the constraint names, whether a caller writes it or not.
//
// Invariants:
// - A key use, never a read: a member a constraint names is touched by the type system, so it is never untouched, and
//   a member the product writes but nothing reads stays write-only.
// - An explicit type argument fills its type parameter's constraint, a library's included (`customType<{ data }>`). A
//   literal type argument whose constraint is `keyof` another type parameter names that argument's member
//   (`everyRow<Row, "plane">`).
// - Inside a generic function, a call that hands its own type parameter to another generic's (`claiming(verb)` in
//   `claim<P extends …>`) fills that generic's constraint with its own: the walk pairs the two signatures' parameter
//   types in parallel, ending on a seen-set.
// - A string literal argument whose contextual type is `keyof T` (`context.get("session")`) names T's member, and so
//   does a literal returned where the function's return type is an alias of `keyof T`.
// - A generic type spelled with type arguments fills its declaration's constraints as a call's type arguments do, and
//   a list handed to a generic's list parameter fills that parameter's element constraint with its own. An alias whose
//   body is a conditional that checks one of its parameters against a type literal (`Needs<T> = T extends { b } ? …`)
//   keys the argument's members that literal names, as a constraint does: checked bare, wrapped (`[T] extends [{ b }]`),
//   over the argument's list elements (`T extends readonly { b }[]`), or in a conditional nested in a branch.
// - A value a call's type argument is inferred from (`split(rows)` for `split<Room extends Candidate>(items: Room[])`)
//   fills the constraint as a flow too: the body reads the value through the constraint's members, so those reads
//   carry to the value's (inferredPairs). A generic hand-off flows our constraint into the callee's the same way. Only a
//   generic the tree declares takes the flow.
import type { CallExpression, Expression, InterfaceDeclaration, Node, TypeAliasDeclaration, TypeNode, TypeReferenceNode } from "@typescript/native/ast";
import {
  isArrayTypeNode,
  isCallExpression,
  isCallSignatureDeclaration,
  isConditionalTypeNode,
  isFunctionLikeDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodSignatureDeclaration,
  isPropertyAccessExpression,
  isQualifiedName,
  isTupleTypeNode,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isTypeOperatorNode,
  isTypeReferenceNode,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, NodeHandle, Signature, Type, TypeParameter } from "@typescript/native/sync";
import { SymbolFlags } from "@typescript/native/sync";
import { hasFlag } from "../native.ts";
import type { FlowPair } from "./flows.ts";
import { unparenType } from "./resolve.ts";
import type { TypeArgumentSite } from "./sites.ts";
import { keyLiterals } from "./sites.ts";
import type { GraphState } from "./state.ts";
import { isPrimitive, literalValues } from "./state.ts";

const declarationKey = (handle: NodeHandle): string => `${handle.path}#${String(handle.index)}`;

interface Named {
  readonly type: Type;
  readonly name: string;
}

// Each site's named members, at that site's position.
const sited = (lists: readonly (readonly Named[])[], at: (y: number) => number): readonly (Named & { readonly at: number })[] =>
  lists.flatMap((list, y) => list.map((ask) => ({ ...ask, at: at(y) })));

// The operand of the `keyof` a parameter's type parameter is constrained by, as the declaration spells it:
// `get<K extends keyof V>(key: K)` gives `V`. The checker hands back the constraint already evaluated to its keys, so
// only the declaration still names the type they are keys of.
function keyofOperand(declaration: Node, index: number): TypeNode | undefined {
  if (!(isFunctionLikeDeclaration(declaration) || isCallSignatureDeclaration(declaration) || isMethodSignatureDeclaration(declaration))) {
    return undefined;
  }
  const type = declaration.parameters[index]?.type;
  const name = type !== undefined && isTypeReferenceNode(type) && isIdentifier(type.typeName) ? type.typeName.text : undefined;
  const constraint = declaration.typeParameters?.find((parameter) => parameter.name.text === name)?.constraint;
  return constraint !== undefined && isTypeOperatorNode(constraint) && constraint.operator === SyntaxKind.KeyOfKeyword ? constraint.type : undefined;
}

// A parameter a conditional alias checks, the type literal it checks it against, and whether the check is over the
// argument's list elements.
interface CheckedPattern {
  readonly parameter: string;
  readonly pattern: TypeNode;
  readonly list: boolean;
}

// The type literal a check's extends side names, and whether it names a list of it: `{ … }`, `[{ … }]` for a wrapped
// check, `{ … }[]` or `readonly { … }[]` for a list check.
function patternOf(node: TypeNode, wrapped: boolean): { readonly pattern: TypeNode; readonly list: boolean } | undefined {
  let at = unparenType(node);
  if (wrapped) {
    const [only] = isTupleTypeNode(at) && at.elements.length === 1 ? at.elements : [];
    at = only === undefined ? at : unparenType(only);
  }
  if (isTypeOperatorNode(at) && at.operator === SyntaxKind.ReadonlyKeyword) {
    at = unparenType(at.type);
  }
  if (isArrayTypeNode(at)) {
    const element = unparenType(at.elementType);
    return isTypeLiteralNode(element) ? { pattern: element, list: true } : undefined;
  }
  return isTypeLiteralNode(at) ? { pattern: at, list: false } : undefined;
}

// The parameter a check names bare, alone or wrapped in a one-element tuple (`[T] extends [{ … }]`).
function checkedParameter(node: TypeNode): { readonly parameter: string; readonly wrapped: boolean } | undefined {
  const at = unparenType(node);
  const [only] = isTupleTypeNode(at) && at.elements.length === 1 ? at.elements : [];
  const bare = only === undefined ? at : unparenType(only);
  return isTypeReferenceNode(bare) && isIdentifier(bare.typeName) && bare.typeArguments === undefined
    ? { parameter: bare.typeName.text, wrapped: only !== undefined }
    : undefined;
}

// `type Needs<T> = T extends { readonly b: string } ? A : B`: each parameter a conditional alias checks against a type
// literal, bare, wrapped (`[T] extends [{ … }]`) or over its list (`T extends readonly { … }[]`), in the body or in a
// conditional nested in one of its branches.
function checkedPatterns(declaration: TypeAliasDeclaration | InterfaceDeclaration): readonly CheckedPattern[] {
  const out: CheckedPattern[] = [];
  const visit = (node: TypeNode | undefined): void => {
    const body = node === undefined ? undefined : unparenType(node);
    if (body === undefined || !isConditionalTypeNode(body)) {
      return;
    }
    const checked = checkedParameter(body.checkType);
    const found = checked === undefined ? undefined : patternOf(body.extendsType, checked.wrapped);
    if (checked !== undefined && found !== undefined) {
      out.push({ parameter: checked.parameter, ...found });
    }
    visit(body.trueType);
    visit(body.falseType);
  };
  visit(isTypeAliasDeclaration(declaration) ? declaration.type : undefined);
  return out;
}

export class Constraints {
  readonly #state: GraphState;

  constructor(state: GraphState) {
    this.#state = state;
  }

  /** Key every member a file's type arguments, generic hand-offs and keyof literals name. */
  file(
    sites: {
      readonly typeArguments: readonly TypeArgumentSite[];
      readonly genericCalls: readonly CallExpression[];
      readonly keyArguments: readonly Expression[];
      readonly keyReturns: readonly { readonly value: Expression; readonly type: TypeNode }[];
    },
    file: string,
  ): void {
    const state = this.#state;
    const named = [
      ...sited(state.batch(sites.typeArguments.map((site) => this.#explicit(site))), (y) => sites.typeArguments[y]?.call.pos ?? 0),
      ...sited(state.batch(sites.genericCalls.map((call) => this.#handOff(call))), (y) => sites.genericCalls[y]?.pos ?? 0),
      ...sited(state.batch(sites.keyArguments.map((argument) => this.#keyArgument(argument))), (y) => sites.keyArguments[y]?.pos ?? 0),
      ...sited(state.batch(sites.keyReturns.map((returned) => this.#keyReturn(returned))), (y) => sites.keyReturns[y]?.value.pos ?? 0),
    ];
    state.roleNamed(named, "key", file);
  }

  /** The flow pairs of each call whose callee's type parameter is inferred from a concrete argument: the parameter's
   *  constraint is the slot, the argument's part that bound it the value. */
  inferredPairs(calls: readonly CallExpression[]): readonly FlowPair[] {
    return this.#state.batch(calls.map((call) => this.#inferred(call))).flat();
  }

  *#inferred(call: CallExpression): APIRequestGenerator<readonly FlowPair[]> {
    const { checker } = this.#state.world;
    const generic = yield* (yield* checker.getResolvedSignature.gen(call)).getTarget.gen();
    // a library's constraint is no reader of ours: its rules live with the library slots (flows.ts)
    if (generic?.declaration === undefined || !this.#state.resolver.ours(generic.declaration)) {
      return [];
    }
    const own = new Set((yield* generic.getTypeParameters.gen()).map(({ id }) => id));
    const slots = yield* this.#parameterTypes(generic);
    const seen = new Set<string>();
    const out: FlowPair[] = [];
    for (const [at, argument] of call.arguments.entries()) {
      const slot = slots[at];
      const bound = slot === undefined ? [] : yield* this.#boundBy(slot, yield* checker.getTypeAtLocation.gen(argument), own, seen);
      for (const [parameter, value] of bound) {
        const constraint = yield* parameter.getConstraint.gen();
        // a type parameter of ours handed on holds what its own constraint requires
        const held = value.isTypeParameter() ? yield* value.getConstraint.gen() : value;
        if (constraint !== undefined && held !== undefined && !isPrimitive(constraint) && !isPrimitive(held)) {
          out.push({ slot: constraint, value: held, site: argument.pos });
        }
      }
    }
    return out;
  }

  // Walk a generic parameter's type and an argument's type together to each of the callee's own type parameters and the
  // part of the argument that binds it.
  *#boundBy(slot: Type, value: Type, own: ReadonlySet<number>, seen: Set<string>): APIRequestGenerator<readonly (readonly [TypeParameter, Type])[]> {
    const pair = `${String(slot.id)}>${String(value.id)}`;
    if (seen.has(pair)) {
      return [];
    }
    seen.add(pair);
    if (slot.isTypeParameter()) {
      return own.has(slot.id) ? [[slot, value]] : [];
    }
    const out: (readonly [TypeParameter, Type])[] = [];
    for (const [inner, outer] of yield* this.#children(slot, value)) {
      out.push(...(yield* this.#boundBy(inner, outer, own, seen)));
    }
    return out;
  }

  *#explicit(site: TypeArgumentSite): APIRequestGenerator<readonly Named[]> {
    if (isTypeReferenceNode(site.call)) {
      return yield* this.#referenced(site.call, site.arguments);
    }
    const { checker } = this.#state.world;
    const signature = yield* checker.getResolvedSignature.gen(site.call);
    const generic = (yield* signature.getTarget.gen()) ?? signature;
    const parameters = yield* generic.getTypeParameters.gen();
    const argumentTypes: Type[] = [];
    for (const node of site.arguments) {
      argumentTypes.push(yield* checker.getTypeFromTypeNode.gen(node));
    }
    const out: Named[] = [];
    for (const [at, parameter] of parameters.entries()) {
      const argument = argumentTypes[at];
      const constraint = yield* parameter.getConstraint.gen();
      if (argument === undefined || constraint === undefined) {
        continue;
      }
      if (constraint.isIndexType()) {
        const keyed = yield* constraint.getTarget.gen();
        const holder = argumentTypes[parameters.findIndex((other) => other.id === keyed.id)];
        const keys = yield* literalValues(argument);
        out.push(...(holder === undefined ? [] : (keys ?? []).map((name) => ({ type: holder, name }))));
      } else {
        out.push(...(yield* this.#filled(constraint, argument)));
      }
    }
    return out;
  }

  // A generic type spelled with its type arguments (`DbAssemblyInput<Deps>`): each argument fills the constraint its
  // declaration gives that parameter, a `keyof` constraint naming the members its argument spells on the parameter it
  // is keyof.
  *#referenced(reference: TypeReferenceNode, argumentNodes: readonly TypeNode[]): APIRequestGenerator<readonly Named[]> {
    const { checker } = this.#state.world;
    const declaration = yield* this.#declarationOf(reference);
    const parameters = declaration === undefined ? [] : (declaration.typeParameters ?? []);
    const argumentTypes: Type[] = [];
    for (const node of argumentNodes) {
      argumentTypes.push(yield* checker.getTypeFromTypeNode.gen(node));
    }
    const out: Named[] = [];
    for (const checked of declaration === undefined ? [] : checkedPatterns(declaration)) {
      out.push(...(yield* this.#checked(checked, argumentTypes[parameters.findIndex((parameter) => parameter.name.text === checked.parameter)])));
    }
    for (const [at, parameter] of parameters.entries()) {
      const argument = argumentTypes[at];
      if (argument !== undefined && parameter.constraint !== undefined) {
        out.push(
          ...(yield* this.#referencedArgument(
            parameter.constraint,
            argument,
            (name) => argumentTypes[parameters.findIndex((other) => other.name.text === name)],
          )),
        );
      }
    }
    return out;
  }

  // The members a conditional check names on its argument, or on the argument's elements for a list check. A list
  // pattern also names its own members, which the walk keys only for a bare pattern (sites.ts).
  *#checked(checked: CheckedPattern, argument: Type | undefined): APIRequestGenerator<readonly Named[]> {
    const pattern = yield* this.#state.world.checker.getTypeFromTypeNode.gen(checked.pattern);
    const held = argument === undefined || !checked.list ? argument : yield* argument.getNumberIndexType.gen();
    return [...(held === undefined ? [] : yield* this.#filled(pattern, held)), ...(checked.list ? yield* this.#filled(pattern, pattern) : [])];
  }

  // The declaration a type reference names, imports followed.
  *#referencedDeclaration(reference: TypeReferenceNode): APIRequestGenerator<NodeHandle | undefined> {
    const { checker } = this.#state.world;
    const named = yield* checker.getSymbolAtLocation.gen(isQualifiedName(reference.typeName) ? reference.typeName.right : reference.typeName);
    const symbol = named !== undefined && hasFlag(named.flags, SymbolFlags.Alias) ? yield* checker.getAliasedSymbol.gen(named) : named;
    return symbol?.declarations[0];
  }

  // The type alias or interface a reference names.
  *#declarationOf(reference: TypeReferenceNode): APIRequestGenerator<TypeAliasDeclaration | InterfaceDeclaration | undefined> {
    const handle = yield* this.#referencedDeclaration(reference);
    const declaration = handle === undefined ? undefined : yield* handle.resolve.gen();
    return declaration !== undefined && (isTypeAliasDeclaration(declaration) || isInterfaceDeclaration(declaration)) ? declaration : undefined;
  }

  *#referencedArgument(constraint: TypeNode, argument: Type, argumentOf: (parameter: string) => Type | undefined): APIRequestGenerator<readonly Named[]> {
    const keyed = isTypeOperatorNode(constraint) && constraint.operator === SyntaxKind.KeyOfKeyword ? constraint.type : undefined;
    if (keyed === undefined) {
      return yield* this.#filled(yield* this.#state.world.checker.getTypeFromTypeNode.gen(constraint), argument);
    }
    const holder = isTypeReferenceNode(keyed) && isIdentifier(keyed.typeName) ? argumentOf(keyed.typeName.text) : undefined;
    const keys = yield* literalValues(argument);
    return holder === undefined ? [] : (keys ?? []).map((name) => ({ type: holder, name }));
  }

  // The members of `argument` a constraint names: each one the constraint requires the argument to carry.
  *#filled(constraint: Type, argument: Type): APIRequestGenerator<readonly Named[]> {
    if (isPrimitive(constraint)) {
      return [];
    }
    const names = (yield* this.#state.membersOf(constraint)).map(({ name }) => name);
    return [...new Set(names)].map((name) => ({ type: argument, name }));
  }

  // A call inside a generic function: where the callee's parameter type holds one of its type parameters and the
  // argument's type holds one of ours, our constraint fills the callee's.
  *#handOff(call: CallExpression): APIRequestGenerator<readonly Named[]> {
    const { checker } = this.#state.world;
    const signature = yield* checker.getResolvedSignature.gen(call);
    const generic = yield* signature.getTarget.gen();
    if (generic === undefined) {
      return [];
    }
    const slots = yield* this.#parameterTypes(generic);
    const out: Named[] = [];
    const seen = new Set<string>();
    for (const [at, argument] of call.arguments.entries()) {
      const slot = slots[at];
      if (slot !== undefined) {
        out.push(...(yield* this.#parallel(slot, yield* checker.getTypeAtLocation.gen(argument), seen)));
      }
    }
    return out;
  }

  *#parameterTypes(signature: Signature): APIRequestGenerator<readonly Type[]> {
    const { checker } = this.#state.world;
    const types: Type[] = [];
    for (const parameter of yield* signature.getParameters.gen()) {
      types.push(yield* checker.getTypeOfSymbol.gen(parameter));
    }
    return types;
  }

  // Walk a callee's parameter type and an argument's type together, through function parameters and returns and the
  // type arguments of one generic, to the places where both are type parameters.
  *#parallel(slot: Type, value: Type, seen: Set<string>): APIRequestGenerator<readonly Named[]> {
    const pair = `${String(slot.id)}>${String(value.id)}`;
    if (seen.has(pair)) {
      return [];
    }
    seen.add(pair);
    if (slot.isTypeParameter() && value.isTypeParameter()) {
      const [required, held] = [yield* slot.getConstraint.gen(), yield* value.getConstraint.gen()];
      return required === undefined || held === undefined ? [] : yield* this.#filled(required, held);
    }
    const out: Named[] = [];
    for (const [inner, outer] of yield* this.#children(slot, value)) {
      out.push(...(yield* this.#parallel(inner, outer, seen)));
    }
    return out;
  }

  *#children(slot: Type, value: Type): APIRequestGenerator<readonly (readonly [Type, Type])[]> {
    const { checker } = this.#state.world;
    // a list into a list, a mutable one into a readonly one too: their elements
    if (slot.isTypeReference() && value.isTypeReference() && (yield* checker.isArrayLikeType.gen(slot)) && (yield* checker.isArrayLikeType.gen(value))) {
      const [[slotElement], [valueElement]] = [yield* checker.getTypeArguments.gen(slot), yield* checker.getTypeArguments.gen(value)];
      return slotElement === undefined || valueElement === undefined ? [] : [[slotElement, valueElement]];
    }
    if (slot.isTypeReference() && value.isTypeReference() && (yield* slot.getTarget.gen()).id === (yield* value.getTarget.gen()).id) {
      const [slotArguments, valueArguments] = [yield* checker.getTypeArguments.gen(slot), yield* checker.getTypeArguments.gen(value)];
      return slotArguments.flatMap((type, at) => {
        const other = valueArguments[at];
        return other === undefined ? [] : [[type, other] as const];
      });
    }
    const [slotSignature] = yield* slot.getCallSignatures.gen();
    const [valueSignature] = yield* value.getCallSignatures.gen();
    if (slotSignature === undefined || valueSignature === undefined) {
      return [];
    }
    const [slotParameters, valueParameters] = [yield* this.#parameterTypes(slotSignature), yield* this.#parameterTypes(valueSignature)];
    const pairs: (readonly [Type, Type])[] = slotParameters.flatMap((type, at) => {
      const other = valueParameters[at];
      return other === undefined ? [] : [[type, other] as const];
    });
    pairs.push([yield* slotSignature.getReturnType.gen(), yield* valueSignature.getReturnType.gen()]);
    return pairs;
  }

  // `return "restored"` from a function declared to return `Disposition`, an alias of `keyof Report`: the literal
  // names Report's member, as the compiler checks it against Report's keys.
  *#keyReturn({ value, type }: { readonly value: Expression; readonly type: TypeNode }): APIRequestGenerator<readonly Named[]> {
    const operand = yield* this.#keyofOperandOf(type);
    if (operand === undefined) {
      return [];
    }
    const holder = yield* this.#state.world.checker.getTypeFromTypeNode.gen(operand);
    return (keyLiterals(value) ?? []).map((name) => ({ type: holder, name }));
  }

  // The operand of the `keyof` a type node spells: directly, through a type alias, or inside a default-library wrapper
  // such as `Promise<…>`. The walk ends on its seen-set of declarations.
  *#keyofOperandOf(start: TypeNode): APIRequestGenerator<TypeNode | undefined> {
    const seen = new Set<string>();
    let at: TypeNode | undefined = start;
    while (at !== undefined && !(isTypeOperatorNode(at) && at.operator === SyntaxKind.KeyOfKeyword)) {
      at = isTypeReferenceNode(at) ? yield* this.#referencedType(at, seen) : undefined;
    }
    return at?.type;
  }

  // The type a reference stands for: an alias's own, or a default-library wrapper's single argument.
  *#referencedType(reference: TypeReferenceNode, seen: Set<string>): APIRequestGenerator<TypeNode | undefined> {
    const handle = yield* this.#referencedDeclaration(reference);
    if (handle === undefined || seen.has(declarationKey(handle))) {
      return undefined;
    }
    seen.add(declarationKey(handle));
    const declaration = yield* handle.resolve.gen();
    if (declaration !== undefined && isTypeAliasDeclaration(declaration)) {
      return declaration.type;
    }
    return (yield* this.#state.world.isDefaultLibrary(handle)) && reference.typeArguments?.length === 1 ? reference.typeArguments[0] : undefined;
  }

  // `get("session")` where the parameter is `K extends keyof Vars`: the literal names Vars's member. The generic's
  // `keyof` target is spelled in its own type parameters (`keyof V`, `keyof E["Variables"]`), bound through the type
  // arguments of the callee's type (`Get<Env>`) or its receiver's (`Context<Vars>`).
  *#keyArgument(argument: Expression): APIRequestGenerator<readonly Named[]> {
    const { checker } = this.#state.world;
    const keys = keyLiterals(argument);
    const call = argument.parent;
    const contextual = yield* checker.getContextualType.gen(argument);
    // a parameter typed `string` takes no key; an inferred `K` takes the literal itself
    if (keys === null || !isCallExpression(call) || contextual === undefined || !(contextual.isStringLiteralType() || contextual.isTypeParameter())) {
      return [];
    }
    const signature = yield* checker.getResolvedSignature.gen(call);
    const declaration = signature.declaration === undefined ? undefined : yield* signature.declaration.resolve.gen();
    const keyed =
      declaration === undefined
        ? undefined
        : keyofOperand(
            declaration,
            call.arguments.findIndex((other) => other.pos === argument.pos),
          );
    if (keyed === undefined) {
      return [];
    }
    const bindings = new Map<number, Type>();
    for (const bound of [call.expression, ...(isPropertyAccessExpression(call.expression) ? [call.expression.expression] : [])]) {
      yield* this.#bind(yield* checker.getTypeAtLocation.gen(bound), bindings);
    }
    const holder = yield* this.#bound(yield* checker.getTypeFromTypeNode.gen(keyed), bindings);
    return holder === undefined ? [] : keys.map((name) => ({ type: holder, name }));
  }

  // A generic instance's type parameters, each bound to its type argument.
  *#bind(type: Type, bindings: Map<number, Type>): APIRequestGenerator<void> {
    if (!type.isTypeReference()) {
      return;
    }
    const parameters = yield* (yield* type.getTarget.gen()).getTypeParameters.gen();
    const typeArguments = yield* this.#state.world.checker.getTypeArguments.gen(type);
    for (const [at, parameter] of parameters.entries()) {
      const bound = typeArguments[at];
      if (bound !== undefined) {
        bindings.set(parameter.id, bound);
      }
    }
  }

  // A type spelled in a generic's own parameters, with each parameter replaced by what it is bound to.
  *#bound(type: Type, bindings: ReadonlyMap<number, Type>): APIRequestGenerator<Type | undefined> {
    if (type.isTypeParameter()) {
      return bindings.get(type.id);
    }
    if (!type.isIndexedAccessType()) {
      return type;
    }
    const object = yield* this.#bound(yield* type.getObjectType.gen(), bindings);
    const index = yield* type.getIndexType.gen();
    if (object === undefined || !index.isStringLiteralType()) {
      return undefined;
    }
    const property = yield* this.#state.world.checker.getPropertyOfType.gen(object, index.value);
    return property === undefined ? undefined : yield* this.#state.world.checker.getTypeOfSymbol.gen(property);
  }
}
