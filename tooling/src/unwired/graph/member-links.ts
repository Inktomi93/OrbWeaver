// Uses no name joins to the member they use, found by declaration syntax: a holder typed `Owner["m"]` and an overload's
// parameter beside its implementation's.
//
// - A member typed `Owner["m"]` derives its value from the owner's member, as a port derived from its owner does: a read
//   of it reads `Owner.m`.
// - A parameter or variable typed `Owner["m"]` reads `Owner.m` only when the value it holds is the member's value: its
//   initializer, or an argument some call passes it, is an identifier a literal also writes into `Owner.m`, as a
//   composition root builds a verb once, puts it in the service and hands it to a sibling. The annotation alone credits
//   nothing, since any value of the member's type fits the binding. A call in a program apart from the binding's own
//   (worlds.ts WORLDS_APART) is not joined.
// - An overload's parameter types are what callers write; the implementation reads its own. Each implementation
//   parameter type is the slot of the overload's at the same position, through a returned function type too.
import type {
  CallExpression,
  FunctionDeclaration,
  Identifier,
  Node,
  NodeArray,
  ObjectLiteralExpression,
  ParameterDeclaration,
  SourceFile,
  TypeNode,
} from "@typescript/native/ast";
import {
  isArrowFunction,
  isAsExpression,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionTypeNode,
  isIdentifier,
  isIndexedAccessTypeNode,
  isLiteralTypeNode,
  isMethodDeclaration,
  isNonNullExpression,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { Type } from "@typescript/native/sync";
import type { FlowPair, Flows } from "./flows.ts";
import type { DeclKey } from "./resolve.ts";
import { addAll } from "./resolve.ts";
import type { GraphState } from "./state.ts";

// `Owner["m"]` through parentheses: the owner's type node and the member name.
interface Indexed {
  readonly owner: TypeNode;
  readonly name: string;
}

function indexedOwner(type: TypeNode | undefined): Indexed | null {
  let at = type;
  while (at !== undefined && isParenthesizedTypeNode(at)) {
    at = at.type;
  }
  if (at === undefined || !isIndexedAccessTypeNode(at)) {
    return null;
  }
  const literal = isLiteralTypeNode(at.indexType) ? at.indexType.literal : undefined;
  return literal !== undefined && isStringLiteral(literal) ? { owner: at.objectType, name: literal.text } : null;
}

// The identifier a value is, through parentheses, assertions and `!`; null for any other expression.
function identifierOf(node: Node | undefined): Identifier | null {
  let value = node;
  while (value !== undefined && (isParenthesizedExpression(value) || isAsExpression(value) || isSatisfiesExpression(value) || isNonNullExpression(value))) {
    value = value.expression;
  }
  return value !== undefined && isIdentifier(value) ? value : null;
}

// The declaration a call of a function resolves to, and its name: a declared function or method itself, or the
// variable an arrow is bound to.
function calleeOf(fn: Node): { readonly declaration: Node; readonly name: string } | null {
  if ((isFunctionDeclaration(fn) || isMethodDeclaration(fn)) && fn.name !== undefined && isIdentifier(fn.name)) {
    return { declaration: fn, name: fn.name.text };
  }
  return (isArrowFunction(fn) || isFunctionExpression(fn)) && isVariableDeclaration(fn.parent) && isIdentifier(fn.parent.name)
    ? { declaration: fn.parent, name: fn.parent.name.text }
    : null;
}

// A parameter or variable typed `Owner["m"]`, with where its value comes from: a variable's initializer, or the function
// a call supplies a parameter of and the parameter's position.
interface DerivedBinding extends Indexed {
  readonly node: Node;
  readonly initializer: Identifier | null;
  readonly callee: { readonly declaration: Node; readonly name: string } | null;
  readonly index: number;
}

function derivedBinding(node: Node): DerivedBinding | null {
  if (!((isParameterDeclaration(node) || isVariableDeclaration(node)) && isIdentifier(node.name))) {
    return null;
  }
  const owned = indexedOwner(node.type);
  if (owned === null) {
    return null;
  }
  if (isVariableDeclaration(node)) {
    return { node, ...owned, initializer: identifierOf(node.initializer), callee: null, index: -1 };
  }
  const fn = node.parent as Node & { readonly parameters: NodeArray<ParameterDeclaration> };
  return { node, ...owned, initializer: null, callee: calleeOf(fn), index: fn.parameters.indexOf(node) };
}

// A call and the name its callee spells: `f(...)` or `x.f(...)`.
function calledName(node: Node): { readonly call: CallExpression; readonly name: Identifier } | null {
  if (!isCallExpression(node)) {
    return null;
  }
  const callee = isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
  return isIdentifier(callee) ? { call: node, name: callee } : null;
}

function walk(source: SourceFile, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  source.forEachChild(step);
}

type Signature = FunctionDeclaration & { readonly name: Identifier };

interface TypeNodePair {
  readonly overload: TypeNode;
  readonly implementation: TypeNode;
}

// Each overload's type node beside the implementation's, by parameter position and through a returned function type.
function overloadPairs(implementation: Signature): readonly TypeNodePair[] {
  const overloads: Signature[] = [];
  implementation.parent.forEachChild((node) => {
    if (isFunctionDeclaration(node) && node.body === undefined && node.name?.text === implementation.name.text) {
      overloads.push(node as Signature);
    }
  });
  return overloads.flatMap((overload) => typePairs(overload, implementation));
}

interface Signed {
  readonly parameters: NodeArray<ParameterDeclaration>;
  readonly type?: TypeNode | undefined;
}

function typePairs(overload: Signed, implementation: Signed): readonly TypeNodePair[] {
  const pairs = overload.parameters.flatMap((parameter, at) => {
    const own = implementation.parameters[at]?.type;
    return parameter.type === undefined || own === undefined ? [] : [{ overload: parameter.type, implementation: own }];
  });
  const { type: returned } = overload;
  const { type: implemented } = implementation;
  return returned !== undefined && implemented !== undefined && isFunctionTypeNode(returned) && isFunctionTypeNode(implemented)
    ? [...pairs, ...typePairs(returned, implemented)]
    : pairs;
}

// The names the program's derived bindings take their values from, read once from syntax over every file: the functions
// whose parameters they are, and the identifiers handed to those functions or initializing the variables.
interface Spellings {
  readonly callees: ReadonlySet<string>;
  readonly values: ReadonlySet<string>;
}

function spellingsOf(sources: readonly SourceFile[]): Spellings {
  const callees = new Set<string>();
  const values = new Set<string>();
  for (const source of sources) {
    walk(source, (node) => {
      const binding = derivedBinding(node);
      if (binding?.callee !== null && binding?.callee !== undefined) {
        callees.add(binding.callee.name);
      }
      if (binding?.initializer !== null && binding?.initializer !== undefined) {
        values.add(binding.initializer.text);
      }
    });
  }
  for (const source of sources) {
    walk(source, (node) => {
      const called = calledName(node);
      for (const argument of called !== null && callees.has(called.name.text) ? called.call.arguments : []) {
        const value = identifierOf(argument);
        if (value !== null) {
          values.add(value.text);
        }
      }
    });
  }
  return { callees, values };
}

// What one file's syntax holds for the links.
interface FileFinds {
  readonly members: (Indexed & { readonly member: Node })[];
  readonly bindings: DerivedBinding[];
  readonly implementations: Signature[];
  readonly supplies: { readonly callee: Identifier; readonly index: number; readonly value: Identifier }[];
  /** `value` is the key itself for a shorthand, whose value the checker answers apart from its property. */
  readonly writes: { readonly literal: ObjectLiteralExpression; readonly name: string; readonly value: Node; readonly shorthand: boolean }[];
}

// A literal key whose value is an identifier a derived binding may take: `{ bundle }` or `{ bundle: verb }`.
function keyWrite(node: Node, values: ReadonlySet<string>): FileFinds["writes"][number] | null {
  if (!((isShorthandPropertyAssignment(node) || isPropertyAssignment(node)) && isObjectLiteralExpression(node.parent) && isIdentifier(node.name))) {
    return null;
  }
  const shorthand = isShorthandPropertyAssignment(node);
  const value = shorthand ? node.name : identifierOf(node.initializer);
  return value !== null && values.has(value.text) ? { literal: node.parent, name: node.name.text, value: shorthand ? node : value, shorthand } : null;
}

// Each identifier argument a call hands to a function a derived parameter belongs to, by the argument's position.
function suppliesAt(node: Node, callees: ReadonlySet<string>): FileFinds["supplies"] {
  const called = calledName(node);
  if (called === null || !callees.has(called.name.text)) {
    return [];
  }
  return called.call.arguments.flatMap((argument, index) => {
    const value = identifierOf(argument);
    return value === null ? [] : [{ callee: called.name, index, value }];
  });
}

function findsOf(source: SourceFile, { callees, values }: Spellings): FileFinds {
  const finds: FileFinds = { members: [], bindings: [], implementations: [], supplies: [], writes: [] };
  walk(source, (node) => {
    const owned = isPropertySignatureDeclaration(node) ? indexedOwner(node.type) : null;
    if (owned !== null) {
      finds.members.push({ member: node, ...owned });
    }
    const binding = derivedBinding(node);
    if (binding !== null) {
      finds.bindings.push(binding);
    }
    if (isFunctionDeclaration(node) && node.body !== undefined && node.name !== undefined) {
      finds.implementations.push(node as Signature);
    }
    finds.supplies.push(...suppliesAt(node, callees));
    const write = keyWrite(node, values);
    if (write !== null) {
      finds.writes.push(write);
    }
  });
  return finds;
}

// A derived binding's resolved facts, kept past the file's answers.
interface HeldBinding {
  readonly key: DeclKey;
  readonly members: readonly DeclKey[];
  readonly initializer: readonly DeclKey[];
  readonly callee: DeclKey | null;
  readonly index: number;
}

/** The links one program's walk adds by declaration syntax, file by file, with the bindings settled after the walk. */
export class MemberLinks {
  readonly #state: GraphState;
  readonly #flows: Flows;
  #spellings: Spellings | null = null;
  readonly #bindings: HeldBinding[] = [];
  // The identifiers each call hands a derived parameter, by `callee#index`, and the members each identifier is written into.
  readonly #supplied = new Map<string, Set<DeclKey>>();
  readonly #holds = new Map<DeclKey, Set<DeclKey>>();

  constructor(state: GraphState, flows: Flows) {
    this.#state = state;
    this.#flows = flows;
  }

  /** The file's indexed members, overloads, derived bindings, their supplies and the identifiers literals write. */
  file(file: string): void {
    const source = this.#state.world.source(file);
    if (source === undefined) {
      return;
    }
    this.#spellings ??= spellingsOf(this.#state.world.files);
    const finds = findsOf(source, this.#spellings);
    this.#members(finds.members);
    this.#bindingsOf(finds.bindings);
    this.#supplies(finds.supplies);
    this.#writes(finds.writes);
    this.#overloads(finds.implementations, file);
  }

  // Each entry beside the type its `owner` names.
  #owned<T extends Indexed>(found: readonly T[]): readonly (T & { readonly type: Type })[] {
    const owners = this.#state.world.typesAt(found.map(({ owner }) => owner));
    return found.flatMap((entry, at) => {
      const type = owners[at];
      return type === undefined ? [] : [{ ...entry, type }];
    });
  }

  #members(found: FileFinds["members"]): void {
    const state = this.#state;
    const owned = this.#owned(found);
    const targets = state.slotMembers(owned);
    for (const [at, { member }] of owned.entries()) {
      const key = state.resolver.keyOf(member);
      for (const target of (targets[at] ?? []).filter((decl) => decl !== key)) {
        state.derivations.push([key, target]);
      }
    }
  }

  #bindingsOf(found: FileFinds["bindings"]): void {
    const state = this.#state;
    const owned = this.#owned(found);
    const members = state.slotMembers(owned);
    const initializers = this.#keysAt(owned.map(({ initializer }) => initializer));
    for (const [at, binding] of owned.entries()) {
      this.#bindings.push({
        key: state.resolver.keyOf(binding.node),
        members: members[at] ?? [],
        initializer: initializers[at] ?? [],
        callee: binding.callee === null ? null : state.resolver.keyOf(binding.callee.declaration),
        index: binding.index,
      });
    }
  }

  #supplies(found: FileFinds["supplies"]): void {
    const callees = this.#keysAt(found.map(({ callee }) => callee));
    const values = this.#keysAt(found.map(({ value }) => value));
    for (const [at, { index }] of found.entries()) {
      for (const callee of callees[at] ?? []) {
        addAll(this.#supplied, `${callee}#${String(index)}`, values[at] ?? []);
      }
    }
  }

  #writes(found: FileFinds["writes"]): void {
    const state = this.#state;
    const slots = state.contextualTypes(found.map(({ literal }) => literal));
    const asks = found.flatMap(({ name }, at) => {
      const type = slots[at];
      return type === undefined ? [] : [{ type, name, at }];
    });
    const members = state.slotMembers(asks);
    const shorthands = found.filter(({ shorthand }) => shorthand);
    const plain = found.filter(({ shorthand }) => !shorthand);
    const shorthandValues = state.declarations(state.world.shorthandValues(shorthands.map(({ value }) => value)));
    const plainValues = state.declarations(state.world.symbolsAt(plain.map(({ value }) => value)));
    const keysOf = new Map([
      ...shorthands.map((write, at) => [write, shorthandValues[at]] as const),
      ...plain.map((write, at) => [write, plainValues[at]] as const),
    ]);
    const values = found.map((write) => keysOf.get(write) ?? []);
    for (const [y, { at }] of asks.entries()) {
      for (const value of values[at] ?? []) {
        addAll(this.#holds, value, members[y] ?? []);
      }
    }
  }

  // Each node's declarations, an import followed; empty where the node is absent.
  #keysAt(nodes: readonly (Node | null)[]): readonly (readonly DeclKey[])[] {
    const state = this.#state;
    const present = nodes.flatMap((node) => (node === null ? [] : [node]));
    const resolved = state.declarations(state.world.symbolsAt(present));
    let next = 0;
    return nodes.map((node) => (node === null ? [] : (resolved[next++] ?? [])));
  }

  #overloads(implementations: readonly Signature[], file: string): void {
    const pairs = implementations.flatMap(overloadPairs);
    if (pairs.length === 0) {
      return;
    }
    const types = this.#state.world.typesAt(pairs.flatMap(({ overload, implementation }) => [implementation, overload]));
    const flowPairs = pairs.flatMap(({ implementation }, at): FlowPair[] => {
      const slot = types[2 * at];
      const value = types[2 * at + 1];
      return slot === undefined || value === undefined ? [] : [{ slot, value, site: implementation.pos }];
    });
    this.#flows.link(flowPairs, file);
  }

  /** Each derived binding whose value some initializer or call takes from its member reads that member. */
  settle(): void {
    for (const { key, members, initializer, callee, index } of this.#bindings) {
      const values = [...initializer, ...(callee === null ? [] : (this.#supplied.get(`${callee}#${String(index)}`) ?? []))];
      for (const member of members.filter((candidate) => values.some((value) => this.#holds.get(value)?.has(candidate) === true))) {
        this.#state.derivations.push([key, member]);
      }
    }
  }
}
