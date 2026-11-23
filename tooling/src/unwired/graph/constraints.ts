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
// - A string literal argument whose contextual type is `keyof T` (`context.get("session")`) names T's member.
import type { CallExpression, Expression, Node, TypeNode } from "@typescript/native/ast";
import {
  isCallExpression,
  isCallSignatureDeclaration,
  isFunctionLikeDeclaration,
  isIdentifier,
  isMethodSignatureDeclaration,
  isPropertyAccessExpression,
  isTypeOperatorNode,
  isTypeReferenceNode,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Signature, Type } from "@typescript/native/sync";
import type { TypeArgumentSite } from "./sites.ts";
import { keyLiterals } from "./sites.ts";
import type { GraphState } from "./state.ts";
import { isPrimitive, literalValues } from "./state.ts";

interface Named {
  readonly type: Type;
  readonly name: string;
}

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
    },
    file: string,
  ): void {
    const state = this.#state;
    const named = [
      ...state.batch(sites.typeArguments.map((site) => this.#explicit(site))).flat(),
      ...state.batch(sites.genericCalls.map((call) => this.#handOff(call))).flat(),
      ...state.batch(sites.keyArguments.map((argument) => this.#keyArgument(argument))).flat(),
    ];
    state.roleAll(state.slotMembers(named).flat(), "key", file, 0);
  }

  *#explicit(site: TypeArgumentSite): APIRequestGenerator<readonly Named[]> {
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
