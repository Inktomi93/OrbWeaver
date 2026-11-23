// The variance of a generic's type parameters, read from its declaration by a polarity walk: the native checker
// computes variance internally and exposes none. The walk measures where a value of the parameter moves, not
// assignability. A use in the parameter of a function type, a call signature, a construct signature or a set accessor
// flips the polarity: a value goes in there (`mutationFn: (vars: V) => …`). A return, a property, an index signature, a
// conditional's branches, a mapped type's template and any other position keep it. A type argument handed to another
// generic takes that generic's variance for its position, so an alias such as `MutationFunction<TData, TVariables> =
// (variables: TVariables) => …` is followed. An explicit `in` or `out` modifier wins over the walk.
//
// - A method's or a constructor's parameter takes a value in, as a function-typed member's does (`mutationFn?(vars: V)`,
//   `set(key: K, value: V): this`), unless the method answers with a value computed from it: a primitive result other
//   than `void` (`includes(x: T): boolean`, `indexOf`, `has`) or a result naming one of the generic's own type
//   parameters (`reduce(…, initialValue: T): T`, `concat`). Those compare or pass the value through the call, and
//   counting them would make every library collection pair both ways.
// - A method keeps its value in the instance it is called on. A generic that holds such an instance in a member or a
//   return (`ReadonlySet<T>.difference(): Set<T>` hands back a fresh set) receives nothing from it, so a generic a
//   type argument is handed to lends only the variance its function-typed positions give. Where the flow walk pairs
//   two instances of the held generic itself (`Map<string, Leaf>` handed as `Map<string, Wide>`), its methods count.
// - Positions that move no value count for nothing: a conditional's check and extends types, a mapped type's key
//   constraint and name type, and a `keyof` operand. A parameter only they use is `none`, which pairs forward, so none
//   drops a pairing.
// - The walk is keyed by the declaring symbol. A generic reached again while its own walk runs on the same stack (a
//   tree node holding `Node<T>[]`, two mutually recursive aliases) answers the polarity seen so far, its declared
//   modifiers applied, so every walk ends. Another walk running beside it never reads that partial answer.
// - A parameter the declaration never uses is `none`.
import type { Node, TypeParameterDeclaration } from "@typescript/native/ast";
import {
  isCallSignatureDeclaration,
  isClassDeclaration,
  isConditionalTypeNode,
  isConstructorDeclaration,
  isConstructorTypeNode,
  isConstructSignatureDeclaration,
  isFunctionTypeNode,
  isIdentifier,
  isInterfaceDeclaration,
  isMappedTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isQualifiedName,
  isSetAccessorDeclaration,
  isTypeAliasDeclaration,
  isTypeOperatorNode,
  isTypeReferenceNode,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol } from "@typescript/native/sync";
import { SymbolFlags } from "@typescript/native/sync";
import { declarationKeys, hasFlag } from "../native.ts";
import type { GraphState } from "./state.ts";

const VARIANCES = ["none", "out", "in", "both"] as const;
/** How a type argument's value moves through the generic: `out` as the instance's value does, `in` against it,
 *  `both` either way, `none` not at all. */
export type Variance = (typeof VARIANCES)[number];

type Polarity = 1 | -1;

// A generic whose walk is running: its variances so far and the modifiers its declaration fixes.
interface Running {
  readonly result: readonly Variance[];
  readonly fixed: readonly (Variance | null)[];
}

// What one walk records into: the parameters by name, their variances so far, the generics running on its stack, and
// whether the generic's own methods count (they do not for a generic a type argument is handed to).
interface Walk {
  readonly names: ReadonlyMap<string, number>;
  readonly result: Variance[];
  readonly stack: ReadonlyMap<string, Running>;
  readonly methods: boolean;
}

// The cache mark of a walk whose methods count for nothing.
const HELD_MARK = "!held";

const settle = ({ result, fixed }: Running): readonly Variance[] => result.map((variance, at) => fixed[at] ?? variance);

const flip = (polarity: Polarity): Polarity => (polarity === 1 ? -1 : 1);

// A use at `polarity` added to what a parameter already has.
function joined(variance: Variance, polarity: Polarity): Variance {
  const used: Variance = polarity === 1 ? "out" : "in";
  return variance === "none" || variance === used ? used : "both";
}

// A parameter's declared modifier, or null when the declaration leaves variance to the walk.
function declared(parameter: TypeParameterDeclaration): Variance | null {
  const kinds = new Set((parameter.modifiers ?? []).map(({ kind }) => kind));
  const [input, output] = [kinds.has(SyntaxKind.InKeyword), kinds.has(SyntaxKind.OutKeyword)];
  if (input && output) {
    return "both";
  }
  if (input) {
    return "in";
  }
  return output ? "out" : null;
}

// A declaration whose members or body take its parameters: an interface, a type alias or a class.
const isGenericDeclaration = (node: Node): boolean => isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isClassDeclaration(node);

// A signature a value is handed into through its parameters, against the polarity of its return.
const isSignature = (node: Node): boolean =>
  isFunctionTypeNode(node) ||
  isConstructorTypeNode(node) ||
  isCallSignatureDeclaration(node) ||
  isConstructSignatureDeclaration(node) ||
  isSetAccessorDeclaration(node);

// A member whose parameters a call hands in: a method or a constructor.
const isMemberSignature = (node: Node): boolean => isMethodSignatureDeclaration(node) || isMethodDeclaration(node) || isConstructorDeclaration(node);

// The results a method computes from what it takes rather than keeping it: a comparison, a position, a count, a text.
const COMPUTED_RESULTS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.BooleanKeyword,
  SyntaxKind.NumberKeyword,
  SyntaxKind.StringKeyword,
  SyntaxKind.BigIntKeyword,
  SyntaxKind.SymbolKeyword,
]);

// Whether a type node names one of the walked generic's own type parameters anywhere inside it.
function namesParameter(node: Node, names: ReadonlyMap<string, number>): boolean {
  if (isTypeReferenceNode(node) && isIdentifier(node.typeName) && names.has(node.typeName.text)) {
    return true;
  }
  return childrenOf(node).some((child) => namesParameter(child, names));
}

// Whether a method or constructor keeps the values its parameters take: a constructor and a method with no declared
// result do, and so does any method whose result is neither computed nor handed back (the module header holds why).
function keepsWhatItTakes(node: Node, names: ReadonlyMap<string, number>): boolean {
  const result = isMethodSignatureDeclaration(node) || isMethodDeclaration(node) ? node.type : undefined;
  return result === undefined || !(COMPUTED_RESULTS.has(result.kind) || namesParameter(result, names));
}

const childrenOf = (node: Node): readonly Node[] => {
  const out: Node[] = [];
  node.forEachChild((child) => {
    out.push(child);
  });
  return out;
};

/** The variances of each generic's type parameters, walked once per declaring symbol. */
export class Variances {
  readonly #state: GraphState;
  readonly #done = new Map<string, readonly Variance[]>();

  constructor(state: GraphState) {
    this.#state = state;
  }

  /** Each type parameter's variance, in declaration order; empty for a symbol no generic declaration of which is found. */
  *of(symbol: NativeSymbol): APIRequestGenerator<readonly Variance[]> {
    return yield* this.#of(symbol, new Map(), true);
  }

  // A generic already on `stack` is a cycle of this walk, answered with what it has seen so far.
  *#of(symbol: NativeSymbol, stack: ReadonlyMap<string, Running>, methods: boolean): APIRequestGenerator<readonly Variance[]> {
    const key = `${declarationKeys(symbol).join(",")}${methods ? "" : HELD_MARK}`;
    const running = stack.get(key);
    const known = this.#done.get(key) ?? (running === undefined ? undefined : settle(running));
    if (known !== undefined) {
      return known;
    }
    const declarations: Node[] = [];
    for (const handle of symbol.declarations) {
      const node = yield* handle.resolve.gen();
      if (node !== undefined && isGenericDeclaration(node)) {
        declarations.push(node);
      }
    }
    const parameters = declarations.map(typeParametersOf).find((list) => list.length > 0) ?? [];
    const fixed = parameters.map(declared);
    const result: Variance[] = parameters.map(() => "none");
    const walk: Walk = {
      names: new Map(parameters.map(({ name }, at) => [name.text, at])),
      result,
      stack: new Map([...stack, [key, { result, fixed }]]),
      methods,
    };
    for (const node of declarations) {
      for (const child of childrenOf(node)) {
        yield* this.#walk(child, 1, walk);
      }
    }
    const settled = settle({ result, fixed });
    this.#done.set(key, settled);
    return settled;
  }

  *#walk(node: Node | undefined, polarity: Polarity, walk: Walk): APIRequestGenerator<void> {
    if (node === undefined) {
      return;
    }
    if (isTypeReferenceNode(node)) {
      const at = isIdentifier(node.typeName) ? walk.names.get(node.typeName.text) : undefined;
      if (at !== undefined) {
        walk.result[at] = joined(walk.result[at] ?? "none", polarity);
        return;
      }
      yield* this.#arguments(node, polarity, walk);
      return;
    }
    if (isSignature(node) || isMemberSignature(node)) {
      yield* this.#signature(node, polarity, walk);
      return;
    }
    if (isConditionalTypeNode(node)) {
      yield* this.#walk(node.trueType, polarity, walk);
      yield* this.#walk(node.falseType, polarity, walk);
      return;
    }
    if (isMappedTypeNode(node)) {
      yield* this.#walk(node.type, polarity, walk);
      return;
    }
    if (isTypeOperatorNode(node) && node.operator === SyntaxKind.KeyOfKeyword) {
      return;
    }
    // a declaration's own type parameters shadow nothing the walk reads; their constraints take no value
    if (node.kind === SyntaxKind.TypeParameter) {
      return;
    }
    for (const child of childrenOf(node)) {
      yield* this.#walk(child, polarity, walk);
    }
  }

  // A signature's parameters take values against its polarity, and a method's only when it keeps them; its return and
  // its other parts keep the polarity.
  *#signature(node: Node, polarity: Polarity, walk: Walk): APIRequestGenerator<void> {
    const takes = !isMemberSignature(node) || (walk.methods && keepsWhatItTakes(node, walk.names));
    for (const child of childrenOf(node)) {
      if (child.kind !== SyntaxKind.Parameter) {
        yield* this.#walk(child, polarity, walk);
      } else if (takes) {
        yield* this.#walk(child, flip(polarity), walk);
      }
    }
  }

  // A type argument handed to another generic moves as that generic's parameter at its position does.
  *#arguments(
    node: Node & { readonly typeName: Node; readonly typeArguments?: readonly Node[] | undefined },
    polarity: Polarity,
    walk: Walk,
  ): APIRequestGenerator<void> {
    const typeArguments = node.typeArguments ?? [];
    if (typeArguments.length === 0) {
      return;
    }
    const { checker } = this.#state.world;
    const name = isQualifiedName(node.typeName) ? node.typeName.right : node.typeName;
    const found = yield* checker.getSymbolAtLocation.gen(name);
    const symbol = found !== undefined && hasFlag(found.flags, SymbolFlags.Alias) ? yield* checker.getAliasedSymbol.gen(found) : found;
    const variances = symbol === undefined ? [] : yield* this.#of(symbol, walk.stack, false);
    for (const [at, argument] of typeArguments.entries()) {
      // a position the referenced generic does not use, or one it is still walking, moves forward
      const variance = variances[at] ?? "none";
      if (variance !== "in") {
        yield* this.#walk(argument, polarity, walk);
      }
      if (variance === "in" || variance === "both") {
        yield* this.#walk(argument, flip(polarity), walk);
      }
    }
  }
}

function typeParametersOf(node: Node): readonly TypeParameterDeclaration[] {
  return isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isClassDeclaration(node) ? [...(node.typeParameters ?? [])] : [];
}
