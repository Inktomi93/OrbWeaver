// Flows: whole values handed into slots, and the member pairs they make. A read of a slot member reads the value member
// that filled it; a write of the value member fills the slot (analyse.ts carries both to a fixpoint). The flow-site
// model is the restated-port matcher's (tooling/src/eslint/port-ownership/restated-port.ts flowsAt), on this program.
//
// Owner rulings this module holds:
// - A value handed to an opaque slot (`unknown`, `any`, `object`, a type parameter, a slot naming none of its members)
//   escapes: every member it holds, all the way down, is sent (roles.ts states the escape ruling).
// - A slot member a library declares (an option a framework reads, a fetch init's `headers`) is a receiver naming the
//   field in its published declaration, so the value's same-named member is read, at any depth of the slot.
// - A union value fills its slot arm by arm, and a union slot is filled by whichever object arms the value lands in.
// - A value a library signature takes as a bare type parameter (`c.json<T>(object: T)`) is sent whole too.
// - A call zod declares is no hand-off: a validator passes the value on to its result, and a builder's shape literal is
//   the schema, whose keys are the members of the type it satisfies (build.ts zodTwins), not values sent.
// - A spread into an object literal copies; it never escapes.
// - A write into a global our own `declare global` declares publishes the value outside the program, so it escapes
//   whole, its function members' returns walked too.
import type { Node } from "@typescript/native/ast";
import { isCallExpression, isModuleDeclaration, isPropertyAccessExpression, isSpreadElement } from "@typescript/native/ast";
import type { APIRequestGenerator, Signature, Type } from "@typescript/native/sync";
import { TypeFlags } from "@typescript/native/sync";
import { hasFlag } from "../native.ts";
import type { DeclKey } from "./resolve.ts";
import { answer, constituentsOf } from "./resolve.ts";
import type { FileSites, HandedWhole } from "./sites.ts";
import type { GraphState } from "./state.ts";
import { isPrimitive } from "./state.ts";

/** A slot type and the value type that fills it. */
interface FlowPair {
  readonly slot: Type;
  readonly value: Type;
}

// A promise of a list of a callback's return nests this deep before it is the value; a deeper type is read at the depth
// it reaches.
const FLOW_UNWRAP_DEPTH = 6;
const GLOBAL_SCOPE = "global";
const OPAQUE_FLAGS = [TypeFlags.Any, TypeFlags.Unknown, TypeFlags.NonPrimitive] as const;
const ZOD_TYPES = /\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?zod\//u;

const opaqueFlag = (type: Type): boolean => OPAQUE_FLAGS.some((flag) => hasFlag(type.flags, flag)) || type.isTypeParameter();

const deepKey = (type: Type, throughCalls: boolean): string => `${String(type.id)}${throughCalls ? "c" : ""}`;

export class Flows {
  readonly #state: GraphState;
  readonly #opaque = new Map<number, boolean>();
  readonly #deep = new Map<string, readonly DeclKey[]>();
  readonly #done = new Set<string>();

  constructor(state: GraphState) {
    this.#state = state;
  }

  /** A file's hand-offs and flow sites, linked to a fixpoint of member pairs. */
  file(sites: FileSites): void {
    const pairs = [...this.#handedWhole(sites), ...this.#flowSites(sites)];
    for (let level: readonly FlowPair[] = pairs; level.length > 0; ) {
      level = this.#linkLevel(level, sites.file);
    }
  }

  // A slot that names none of a value's members: whatever holds it reads them all.
  *#opaqueSlot(type: Type): APIRequestGenerator<boolean> {
    if (opaqueFlag(type)) {
      return true;
    }
    for (const arm of yield* constituentsOf(type)) {
      if (opaqueFlag(arm)) {
        return true;
      }
      if (!isPrimitive(arm) && (yield* this.#state.world.checker.getPropertiesOfType.gen(arm)).length === 0) {
        return true;
      }
    }
    return false;
  }

  #opaqueOf(types: readonly Type[]): void {
    const fresh = [...new Map(types.filter((type) => !this.#opaque.has(type.id)).map((type) => [type.id, type])).values()];
    const answers = this.#state.batch(fresh.map((type) => this.#opaqueSlot(type)));
    for (const [at, type] of fresh.entries()) {
      this.#opaque.set(type.id, answers[at] === true);
    }
  }

  /**
   * Every member a value holds, all the way down: a serializer or a log sink walks the whole tree, a list's elements
   * and an index signature's values included. The walk goes into a member's type only when the member is declared in
   * the tree, so a library or platform type is read at its surface. `throughCalls` also walks each function member's
   * awaited return, as a published door's reader calls what it finds.
   */
  deepMembers(start: Type, throughCalls: boolean): readonly DeclKey[] {
    const key = deepKey(start, throughCalls);
    const known = this.#deep.get(key);
    if (known !== undefined) {
      return known;
    }
    const found = new Set<DeclKey>();
    const seen = new Set<number>([start.id]);
    let level: readonly Type[] = [start];
    while (level.length > 0) {
      const next: Type[] = [];
      for (const type of this.#deepLevel(level, throughCalls, found).filter((candidate) => !(isPrimitive(candidate) || seen.has(candidate.id)))) {
        seen.add(type.id);
        const cached = this.#deep.get(deepKey(type, throughCalls));
        if (cached === undefined) {
          next.push(type);
        }
        for (const decl of cached ?? []) {
          found.add(decl);
        }
      }
      level = next;
    }
    const out = [...found];
    this.#deep.set(key, out);
    return out;
  }

  get state(): GraphState {
    return this.#state;
  }

  // One level of a deep walk: the members of ours it adds to `found`, and the types they and the level hold.
  #deepLevel(level: readonly Type[], throughCalls: boolean, found: Set<DeclKey>): readonly Type[] {
    const { state } = this;
    const symbols = state.batch(level.map((type) => state.membersOf(type))).flat();
    const decls = state.declarations(symbols);
    for (const decl of decls.flat()) {
      found.add(decl);
    }
    const ours = symbols.filter((_, at) => (decls[at]?.length ?? 0) > 0);
    return [
      ...state.batch(ours.map((symbol) => state.world.checker.getTypeOfSymbol.gen(symbol))),
      ...state.batch(level.map((type) => this.#contained(type, throughCalls))).flat(),
    ];
  }

  // The types a value holds besides its members: a list's or tuple's element types, an index signature's value type.
  *#contained(type: Type, throughCalls: boolean): APIRequestGenerator<readonly Type[]> {
    const { checker } = this.#state.world;
    const out: Type[] = [];
    for (const arm of (yield* constituentsOf(type)).filter((candidate) => !isPrimitive(candidate))) {
      if (arm.isTypeReference() && (yield* checker.isArrayLikeType.gen(arm))) {
        out.push(...(yield* checker.getTypeArguments.gen(arm)));
      }
      out.push(...(yield* checker.getIndexInfosOfType.gen(arm)).map((info) => info.valueType));
      if (throughCalls) {
        out.push(...(yield* this.#awaitedReturns(yield* arm.getCallSignatures.gen())));
      }
    }
    return out;
  }

  *#awaitedReturns(signatures: readonly Signature[]): APIRequestGenerator<readonly Type[]> {
    const out: Type[] = [];
    for (const signature of signatures) {
      const returned = yield* signature.getReturnType.gen();
      out.push((yield* this.#state.world.checker.getAwaitedType.gen(returned)) ?? returned);
    }
    return out;
  }

  /** Record every member a value holds as escaping, from a product file; a value published through our own global
   *  door also marks its members as the door's. */
  escape(value: Type, door: boolean, file: string, at: number): void {
    const members = this.deepMembers(value, door);
    this.#state.roleAll(members, "escape", file, at);
    if (door) {
      for (const member of members) {
        this.#state.door.add(member);
      }
    }
    this.#state.count("values escaped whole");
  }

  // A value handed on whole: into an opaque slot it escapes; into a slot naming its members it pairs member by member.
  #handedWhole(sites: FileSites): readonly FlowPair[] {
    const { state } = this;
    const handed = [...this.#zodCallsDropped(sites.handedWhole), ...this.#published(sites)];
    if (handed.length === 0) {
      return [];
    }
    const libraryGeneric = this.#libraryGeneric(handed);
    const nodes = handed.map(({ node }) => (isSpreadElement(node) ? node.expression : node));
    const values = state.world.typesAt(nodes);
    const slotAt = handed.flatMap((entry, at) => (entry.spread ? [] : [at]));
    const contextual = state.batch(slotAt.flatMap((at) => (nodes[at] === undefined ? [] : [state.world.checker.getContextualType.gen(nodes[at])])));
    const slots = new Map(slotAt.map((at, y) => [at, contextual[y]]));
    this.#opaqueOf([...slots.values()].flatMap((type) => (type === undefined ? [] : [type])));
    const pairs: FlowPair[] = [];
    for (const [at, entry] of handed.entries()) {
      const value = values[at];
      const slot = slots.get(at);
      const opaque = entry.spread || entry.door || libraryGeneric.has(at) || (slot !== undefined && this.#opaque.get(slot.id) === true);
      if (value === undefined || isPrimitive(value)) {
        continue;
      }
      if (opaque) {
        this.escape(value, entry.door, sites.file, nodes[at]?.pos ?? 0);
      } else if (slot !== undefined) {
        pairs.push({ slot, value });
      }
    }
    return pairs;
  }

  // A call zod declares takes its argument as schema input, not as a send: a validator hands the value on to its result,
  // and a builder's shape literal is the schema itself, whose keys mean the members of the type it satisfies.
  #zodCallsDropped(handed: readonly HandedWhole[]): readonly HandedWhole[] {
    const names = handed.map(({ call }) => calleeName(call?.node));
    const asked = names.flatMap((name) => (name === undefined ? [] : [name]));
    const symbols = this.#state.world.symbolsAt(asked);
    const validators = new Set(asked.flatMap((name, at) => ((symbols[at]?.declarations ?? []).some((handle) => ZOD_TYPES.test(handle.path)) ? [name] : [])));
    return handed.filter((_, at) => {
      const name = names[at];
      return name === undefined || !validators.has(name);
    });
  }

  // The arguments a library signature takes as a bare type parameter (`c.json<T>(object: T)`, `Response.json`): the
  // contextual type is the inferred instantiation, the value's own type, so only the declaration shows the slot is
  // opaque. Our own generic functions keep flowing, as their bodies are walked.
  #libraryGeneric(handed: readonly HandedWhole[]): ReadonlySet<number> {
    const state = this.#state;
    const { checker } = state.world;
    const asks = handed.flatMap(({ call }, x) => (call === undefined ? [] : [{ x, call }]));
    const signatures = state.batch(asks.map(({ call }) => checker.getResolvedSignature.gen(call.node)));
    const declared = state.batch(
      asks.map(({ call }, y) => {
        const signature = signatures[y];
        return signature?.declaration === undefined || state.resolver.ours(signature.declaration)
          ? answer(undefined)
          : declaredParameterType(state, signature, call.index);
      }),
    );
    return new Set(asks.flatMap(({ x }, y) => (declared[y]?.isTypeParameter() === true ? [x] : [])));
  }

  // `globalThis.x = v` on a global our own `declare global` declares: published to readers outside the program (a
  // browser console, a test driver's evaluate).
  #published(sites: FileSites): readonly HandedWhole[] {
    const { state } = this;
    const targets = sites.globalAssigns.map(({ target }) => (isPropertyAccessExpression(target) ? target.name : target));
    const symbols = state.world.symbolsAt(targets);
    const asks = symbols.flatMap((symbol, x) => (symbol?.declarations ?? []).map((handle) => ({ x, handle })));
    const nodes = state.batch(asks.map(({ handle }) => handle.resolve.gen()));
    const published = new Set(asks.flatMap(({ x }, y) => (insideGlobalScope(nodes[y]) ? [x] : [])));
    return sites.globalAssigns.flatMap(({ value }, x) => (published.has(x) ? [{ node: value, spread: false, door: true }] : []));
  }

  // Values flowing into typed slots: a variable's annotation, or the contextual type of the value or of its holder.
  #flowSites(sites: FileSites): readonly FlowPair[] {
    const { state } = this;
    const values = state.world.typesAt(sites.flowSites.map(({ value }) => value));
    const declared = sites.flowSites.flatMap((site, at) => (site.slot === "declared" ? [{ at, node: site.holder }] : []));
    const declaredTypes = state.world.typesAt(declared.map(({ node }) => node));
    const contextual = sites.flowSites.flatMap((site, at) => {
      if (site.slot === "declared") {
        return [];
      }
      return [{ at, node: site.slot === "holder" ? site.holder : site.value }];
    });
    const contextualTypes = state.slotTypes(state.batch(contextual.map(({ node }) => state.world.checker.getContextualType.gen(node))));
    const slots = new Map<number, Type | undefined>([
      ...declared.map(({ at }, y) => [at, declaredTypes[y]] as const),
      ...contextual.map(({ at }, y) => [at, contextualTypes[y]] as const),
    ]);
    return sites.flowSites.flatMap((_, at) => {
      const slot = slots.get(at);
      const value = values[at];
      return slot === undefined || value === undefined ? [] : [{ slot, value }];
    });
  }

  // A flow carries the value itself: through a promise to what it resolves to, through a list to its elements, and a
  // function value filling a function-typed slot pairs each parameter backwards (what a caller writes into the slot's
  // parameter is what the implementation's parameter reads) and the return forwards.
  *#operands(slot: Type, value: Type, depth: number): APIRequestGenerator<readonly FlowPair[]> {
    if (depth > FLOW_UNWRAP_DEPTH) {
      return [];
    }
    const { checker } = this.#state.world;
    const a = (yield* checker.getAwaitedType.gen(slot)) ?? slot;
    const b = (yield* checker.getAwaitedType.gen(value)) ?? value;
    if (a.id === b.id) {
      return [];
    }
    const slotArms = yield* this.#objectArms(a, b);
    if (slotArms !== null) {
      const out: FlowPair[] = [];
      for (const arm of slotArms) {
        out.push(...(yield* this.#operands(arm, b, depth + 1)));
      }
      return out;
    }
    if (a.isTypeReference() && b.isTypeReference() && (yield* checker.isArrayLikeType.gen(a)) && (yield* checker.isArrayLikeType.gen(b))) {
      const [elementA] = yield* checker.getTypeArguments.gen(a);
      const [elementB] = yield* checker.getTypeArguments.gen(b);
      return elementA !== undefined && elementB !== undefined ? yield* this.#operands(elementA, elementB, depth + 1) : [];
    }
    const [slotSignature] = yield* a.getCallSignatures.gen();
    const [valueSignature] = yield* b.getCallSignatures.gen();
    if (slotSignature !== undefined && valueSignature !== undefined) {
      return yield* this.#signatureOperands(slotSignature, valueSignature, depth);
    }
    return [{ slot: a, value: b }];
  }

  // A union slot (`string | Block[]`) is filled by whichever of its object arms the value lands in; null when the slot
  // is no union of object arms or the value is a union itself.
  *#objectArms(slot: Type, value: Type): APIRequestGenerator<readonly Type[] | null> {
    if (!slot.isUnionType() || value.isUnionType()) {
      return null;
    }
    const arms = (yield* slot.getTypes.gen()).filter((arm) => !isPrimitive(arm));
    return arms.length > 1 || (arms.length === 1 && arms[0]?.id !== slot.id) ? arms : null;
  }

  *#signatureOperands(slot: Signature, value: Signature, depth: number): APIRequestGenerator<readonly FlowPair[]> {
    const { checker } = this.#state.world;
    const slotParameters = yield* slot.getParameters.gen();
    const valueParameters = yield* value.getParameters.gen();
    const out: FlowPair[] = [];
    for (let at = 0; at < Math.min(slotParameters.length, valueParameters.length); at++) {
      const slotParameter = slotParameters[at];
      const valueParameter = valueParameters[at];
      if (slotParameter !== undefined && valueParameter !== undefined) {
        out.push(...(yield* this.#operands(yield* checker.getTypeOfSymbol.gen(valueParameter), yield* checker.getTypeOfSymbol.gen(slotParameter), depth + 1)));
      }
    }
    out.push(...(yield* this.#operands(yield* slot.getReturnType.gen(), yield* value.getReturnType.gen(), depth + 1)));
    return out;
  }

  // One level of member pairs: each slot member and the value's same-named member. A pair's own member types flow as a
  // pair too (a port's op filled by another service's op), so the next level is returned until no pair is new.
  #linkLevel(raw: readonly FlowPair[], file: string): readonly FlowPair[] {
    const { state } = this;
    const unwrapped = state.batch(raw.map(({ slot, value }) => this.#operands(slot, value, 0))).flat();
    // a value landing, after unwrapping, in a slot that names none of its members escapes whole, as an opaque argument does
    this.#opaqueOf(unwrapped.map(({ slot }) => slot));
    const pairs: FlowPair[] = [];
    for (const pair of unwrapped) {
      if (this.#opaque.get(pair.slot.id) !== true) {
        pairs.push(pair);
      } else if (!isPrimitive(pair.value)) {
        this.escape(pair.value, false, file, 0);
      }
    }
    // a union value fills the slot arm by arm: each object arm pairs its own members with the slot's
    const unions = pairs.filter(({ value }) => value.isUnionType());
    const arms = state.batch(unions.map(({ value }) => constituentsOf(value)));
    const expanded = [
      ...pairs.filter(({ value }) => !value.isUnionType()),
      ...unions.flatMap(({ slot }, y) => (arms[y] ?? []).filter((arm) => !isPrimitive(arm)).map((value) => ({ slot, value }))),
    ];
    const fresh = [
      ...new Map(expanded.filter((pair) => this.#isFresh(pair)).map((pair) => [`${String(pair.slot.id)}>${String(pair.value.id)}`, pair])).values(),
    ];
    for (const pair of fresh) {
      this.#done.add(`${String(pair.slot.id)}>${String(pair.value.id)}`);
    }
    return this.#memberPairs(fresh, file);
  }

  // One matched member pair: the slot's declarations flow from the value's; a slot with none leaves the value member read.
  #memberFlow(slots: readonly DeclKey[], values: readonly DeclKey[], file: string): void {
    for (const slot of slots) {
      for (const value of values) {
        if (slot !== value) {
          this.#state.flow(slot, value);
        }
      }
    }
    if (slots.length === 0) {
      this.#state.roleAll(values, "read", file, 0);
    }
  }

  #isFresh({ slot, value }: FlowPair): boolean {
    return slot.id !== value.id && !isPrimitive(slot) && !isPrimitive(value) && !this.#done.has(`${String(slot.id)}>${String(value.id)}`);
  }

  #memberPairs(fresh: readonly FlowPair[], file: string): readonly FlowPair[] {
    const { state } = this;
    const { checker } = state.world;
    const slotMembers = state.batch(fresh.map(({ slot }) => state.membersOf(slot)));
    const asks = fresh.flatMap((pair, x) => (slotMembers[x] ?? []).map((member) => ({ pair, member })));
    const valueMembers = state.batch(asks.map(({ pair, member }) => checker.getPropertyOfType.gen(pair.value, member.name)));
    const matched = asks.flatMap(({ member }, y) => {
      const valueMember = valueMembers[y];
      return valueMember === undefined || valueMember.id === member.id ? [] : [{ slot: member, value: valueMember }];
    });
    const slotDecls = state.declarations(matched.map(({ slot }) => slot));
    const valueDecls = state.declarations(matched.map(({ value }) => value));
    for (const y of matched.keys()) {
      this.#memberFlow(slotDecls[y] ?? [], valueDecls[y] ?? [], file);
    }
    // a pair goes deeper when the value member is declared in the tree: the walk follows the value's own members, and a
    // library slot names its nested fields as it names its top ones (an SDK block's `source.data`)
    const deeper = matched.filter((_, y) => (valueDecls[y]?.length ?? 0) > 0);
    const types = state.batch(deeper.flatMap(({ slot, value }) => [checker.getTypeOfSymbol.gen(slot), checker.getTypeOfSymbol.gen(value)]));
    return deeper.flatMap((_, y) => {
      const slot = types[2 * y];
      const value = types[2 * y + 1];
      return slot !== undefined && value !== undefined && slot.id !== value.id && !isPrimitive(slot) ? [{ slot, value }] : [];
    });
  }
}

// The type a signature's declaration gives its parameter at `index`, before instantiation.
function* declaredParameterType(state: GraphState, signature: Signature, index: number): APIRequestGenerator<Type | undefined> {
  const target = (yield* signature.getTarget.gen()) ?? signature;
  const parameter = (yield* target.getParameters.gen())[index];
  return parameter === undefined ? undefined : yield* state.world.checker.getTypeOfSymbol.gen(parameter);
}

const calleeName = (call: Node | undefined): Node | undefined => {
  if (call === undefined || !isCallExpression(call)) {
    return undefined;
  }
  return isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
};

function insideGlobalScope(node: Node | undefined): boolean {
  for (let up = node?.parent; up !== undefined; up = up.parent) {
    if (isModuleDeclaration(up) && "text" in up.name && up.name.text === GLOBAL_SCOPE) {
      return true;
    }
  }
  return false;
}
