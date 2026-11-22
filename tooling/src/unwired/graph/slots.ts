// Writes into slots: each property of a written object literal or JSX attribute list fills the slot member it names,
// resolved through the origin walk when the slot is mapped (`VariantProps`, `Partial`); a member that is a variant axis
// takes the written value (./variants.ts).
//
// - A mapped property names its source member's declaration; it carries that member's data only when the source type
//   fits it (`Partial`, `Readonly`, `Pick`). A mapping that changes the type (`{ [F in keyof V]: Schema<V[F]> }`) fills
//   a table keyed by the member: a key use of it, not a write.
// - A literal handed to a generic parameter `T` has only itself as its slot; when a sibling argument is a function
//   taking that `T` (`variantProps(recipe, selection)`), the sibling's first parameter is the real slot.
import type { Node, ObjectLiteralExpression } from "@typescript/native/ast";
import {
  isArrayBindingPattern,
  isAsExpression,
  isBindingElement,
  isCallExpression,
  isIdentifier,
  isObjectBindingPattern,
  isParameterDeclaration,
  isPropertyAccessExpression,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { CheckFlags, TypeFlags } from "@typescript/native/sync";
import { hasFlag } from "../native.ts";
import type { DeclKey } from "./resolve.ts";
import { answer, unwrapExpression } from "./resolve.ts";
import { sameNode } from "./roles.ts";
import type { FileSites } from "./sites.ts";
import { declarationNameOf } from "./sites.ts";
import type { GraphState } from "./state.ts";
import type { AxisValue, Variants } from "./variants.ts";
import { isVariantsDeclaration, writtenLiterals } from "./variants.ts";

/** One write into a slot: the slot type, the member name, the value written and where. */
interface SlotWrite {
  readonly type: Type;
  readonly name: string;
  readonly value: Node | undefined;
  readonly at: number;
  readonly jsx: boolean;
}

const spanKey = (node: Node): string => `${String(node.pos)}:${String(node.end)}`;

// The value with its parentheses, non-null and type assertions removed.
function unwrapValue(node: Node | undefined): Node | undefined {
  let at = unwrapExpression(node);
  while (at !== undefined && (isAsExpression(at) || isSatisfiesExpression(at))) {
    at = unwrapExpression(at.expression);
  }
  return at;
}

const isLiteralWrite = (value: Node | undefined): boolean => writtenLiterals(value) !== null;

/** The slot writes of one file: its object literals' keys and its JSX attributes, each through its contextual type. */
export function fileSlotWrites(state: GraphState, variants: Variants, sites: FileSites): void {
  const literals = [...new Map(sites.literalProperties.map(({ literal }) => [spanKey(literal), literal])).values()];
  const contextual = state.contextualTypes(literals);
  const slots = new Map(literals.map((literal, at) => [spanKey(literal), contextual[at]]));
  for (const [key, type] of coInferredSlots(state, literals)) {
    slots.set(key, type);
  }
  const writes = sites.literalProperties.flatMap(({ literal, name, value }): SlotWrite[] => {
    const type = slots.get(spanKey(literal));
    return type === undefined ? [] : [{ type, name, value, at: literal.pos, jsx: false }];
  });
  slotWrites(state, variants, sites, writes);
  bagSelections(state, variants, sites);
  const lists = [...new Map(sites.jsxAttributes.map(({ attributes }) => [spanKey(attributes), attributes])).values()];
  const listSlots = state.contextualTypes(lists);
  const listType = new Map(lists.map((list, at) => [spanKey(list), listSlots[at]]));
  slotWrites(
    state,
    variants,
    sites,
    sites.jsxAttributes.flatMap(({ attributes, name, value }): SlotWrite[] => {
      const type = listType.get(spanKey(attributes));
      return type === undefined ? [] : [{ type, name, value, at: attributes.pos, jsx: true }];
    }),
  );
}

// `recipe(bag)`: a recipe handed a whole value selects, on each axis the value's type names, every literal that member's
// type can be, as a typed value. The slot is the recipe's props, a key-built mapping the origin walk follows to the axes.
function bagSelections(state: GraphState, variants: Variants, sites: FileSites): void {
  const { checker } = state.world;
  const signatures = state.batch(sites.bagCalls.map(({ call }) => checker.getResolvedSignature.gen(call)));
  const recipes = sites.bagCalls.filter((_, at) => {
    const declaration = signatures[at]?.declaration;
    return declaration !== undefined && isVariantsDeclaration(declaration.path);
  });
  const slots = state.contextualTypes(recipes.map(({ bag }) => bag));
  const bags = state.world.typedAt(recipes, ({ bag }) => bag);
  const members = state.batch(bags.map(({ type }) => checker.getPropertiesOfType.gen(type)));
  const asks = bags.flatMap((_, x) => {
    const slot = slots[x];
    return slot === undefined ? [] : (members[x] ?? []).map((member) => ({ type: slot, name: member.name, member }));
  });
  const walks = state.origins(asks);
  const fills = asks.flatMap(({ member }, y) => (walks[y]?.decls ?? []).filter((decl) => variants.mayBeAxis(decl)).map((decl) => ({ decl, member })));
  const types = state.batch(fills.map(({ member }) => checker.getTypeOfSymbol.gen(member)));
  const literals = state.batch(types.map((type) => state.literalValues(type)));
  for (const [y, { decl }] of fills.entries()) {
    variants.defer(decl, { typed: literals[y] ?? null });
  }
}

function slotWrites(state: GraphState, variants: Variants, sites: FileSites, writes: readonly SlotWrite[]): void {
  if (writes.length === 0) {
    return;
  }
  const hits = state.batch(writes.map(({ type, name }) => state.propsOnSlot(type, name)));
  const { resolved, keyed } = slotHits(state, sites, writes, hits);
  // the origin walk recovers a member a mapping left with no declaration; only a product write can decide a bucket
  const bare = sites.product
    ? writes.flatMap((_, x) => (resolved[x]?.size === 0 && !keyed.has(x) && (hits[x] ?? []).some((symbol) => symbol.declarations.length === 0) ? [x] : []))
    : [];
  const walks = state.origins(bare.flatMap((x) => (writes[x] === undefined ? [] : [{ type: writes[x].type, name: writes[x].name }])));
  for (const [y, x] of bare.entries()) {
    for (const key of walks[y]?.decls ?? []) {
      resolved[x]?.add(key);
    }
  }
  recordWrites(state, variants, sites, { writes, resolved });
}

// Each write's slot members: a member a transforming mapped type keys is a key use, recorded here; any other is the
// write's target.
function slotHits(
  state: GraphState,
  sites: FileSites,
  writes: readonly SlotWrite[],
  hits: readonly (readonly NativeSymbol[])[],
): { readonly resolved: readonly Set<DeclKey>[]; readonly keyed: ReadonlySet<number> } {
  const flat = hits.flatMap((symbols, x) => symbols.map((symbol) => ({ symbol, x })));
  const decls = state.declarations(flat.map(({ symbol }) => symbol));
  const keyOnly = transformingMapped(
    state,
    flat.map(({ symbol }) => symbol),
  );
  const resolved = writes.map(() => new Set<DeclKey>());
  const keyed = new Set<number>();
  for (const [y, { x }] of flat.entries()) {
    if (keyOnly[y] === true) {
      state.roleAll(decls[y] ?? [], "key", sites.file, writes[x]?.at ?? 0);
      keyed.add(x);
      continue;
    }
    for (const key of decls[y] ?? []) {
      resolved[x]?.add(key);
    }
  }
  return { resolved, keyed };
}

function recordWrites(
  state: GraphState,
  variants: Variants,
  sites: FileSites,
  found: { readonly writes: readonly SlotWrite[]; readonly resolved: readonly Set<DeclKey>[] },
): void {
  const { writes, resolved } = found;
  const axisAt = new Set(writes.flatMap((write, x) => (write.jsx || [...(resolved[x] ?? [])].some((key) => variants.mayBeAxis(key)) ? [x] : [])));
  const forwards = forwardedWrites(state, variants, { writes, resolved, axisAt });
  // a write inside a table's own options (its variants, defaults and compound conditions) is the table, not a consumer
  const inTable = (at: number): boolean => sites.tvSpans.some(([start, end]) => at >= start && at < end);
  const typed = [...axisAt].filter((x) => {
    const value = writes[x]?.value;
    return !(forwards.has(x) || inTable(writes[x]?.at ?? 0)) && value !== undefined && !isLiteralWrite(value);
  });
  const types = state.world.typesAt(typed.flatMap((x) => (writes[x]?.value === undefined ? [] : [writes[x].value])));
  const literals = state.batch(types.map((type) => state.literalValues(type)));
  const typedAt = new Map(typed.map((x, y) => [x, literals[y] ?? null]));
  for (const [x, write] of writes.entries()) {
    for (const key of resolved[x] ?? []) {
      state.role(key, "write", sites.file, write.at);
      if (!(forwards.has(x) || inTable(write.at)) && (axisAt.has(x) || isLiteralWrite(write.value))) {
        const value: AxisValue = typedAt.has(x) ? { typed: typedAt.get(x) ?? null } : write.value;
        variants.defer(key, value);
      }
    }
  }
}

// The writes whose value is the writer's own parameter or a binding inside a parameter's pattern: a prop handed on.
// A forward's values are those written into the prop it came from (`{ variant }` destructured from the props parameter
// carries ButtonProps.variant's values onward, through every wrapper that forwards it again).
function forwardedWrites(
  state: GraphState,
  variants: Variants,
  found: { readonly writes: readonly SlotWrite[]; readonly resolved: readonly Set<DeclKey>[]; readonly axisAt: ReadonlySet<number> },
): ReadonlySet<number> {
  const named = [...found.axisAt].flatMap((x): { readonly x: number; readonly value: Node; readonly head: Node }[] => {
    const value = unwrapValue(found.writes[x]?.value);
    if (value !== undefined && isIdentifier(value)) {
      return [{ x, value, head: value }];
    }
    return value !== undefined && isPropertyAccessExpression(value) && isIdentifier(value.expression) ? [{ x, value, head: value.expression }] : [];
  });
  const symbols = valueSymbols(
    state,
    named.map(({ head }) => head),
  );
  const asks = named.flatMap(({ x }, y) =>
    (symbols[y]?.declarations ?? [])
      .filter((handle) => handle.kind === SyntaxKind.BindingElement || handle.kind === SyntaxKind.Parameter)
      .map((handle) => ({ x, handle })),
  );
  const nodes = state.batch(asks.map(({ handle }) => handle.resolve.gen()));
  const bound = new Set(asks.flatMap(({ x }, z) => (boundByParameter(nodes[z]) ? [x] : [])));
  const forwarded = named.filter(({ x }) => bound.has(x));
  const sources = forwardSources(
    state,
    forwarded.map(({ value }) => value),
  );
  // a bare parameter (`(lv: 2 | 1) => t({ level: lv })`) names no member to forward from, so its type selects instead
  const forwards = new Set<number>();
  for (const [y, { x }] of forwarded.entries()) {
    const from = sources[y] ?? [];
    if (from.length > 0) {
      forwards.add(x);
    }
    for (const target of found.resolved[x] ?? []) {
      for (const source of from) {
        variants.feed(target, source);
      }
    }
  }
  return forwards;
}

// The value symbol each name reads: a shorthand's name is the property, so its value is the binding of the same name.
function valueSymbols(state: GraphState, heads: readonly Node[]): (NativeSymbol | undefined)[] {
  const symbols = state.world.symbolsAt(heads);
  const shorthand = heads.flatMap((head, at) =>
    isShorthandPropertyAssignment(head.parent) && sameNode(head.parent.name, head) ? [{ at, node: head.parent }] : [],
  );
  const values = state.world.shorthandValues(shorthand.map(({ node }) => node));
  for (const [y, { at }] of shorthand.entries()) {
    if (values[y] !== undefined) {
      symbols[at] = values[y];
    }
  }
  return symbols;
}

// A parameter, or a binding nested in a parameter's pattern; a binding destructured from a call or a local is computed.
function boundByParameter(node: Node | undefined): boolean {
  let at = node;
  while (at !== undefined && (isBindingElement(at) || isObjectBindingPattern(at) || isArrayBindingPattern(at))) {
    at = at.parent;
  }
  return at !== undefined && isParameterDeclaration(at);
}

// The member each forwarded value came from: a destructured props binding names its pattern's property; `props.x`
// names x of the parameter's type; `scale.square` (a carried bag's member) names member `square` of the bag's type,
// recovered by the origin walk when the bag is mapped (`Pick<VariantProps<…>, "square">`).
function forwardSources(state: GraphState, values: readonly Node[]): DeclKey[][] {
  const out = values.map((): DeclKey[] => []);
  const carried = values.flatMap((value, x) => (isPropertyAccessExpression(value) ? [{ x, value }] : []));
  const bags = state.slotTypes(state.world.typesAt(carried.map(({ value }) => value.expression)));
  const carriedAsks = carried.flatMap(({ x, value }, y) => (bags[y] === undefined ? [] : [{ x, type: bags[y], name: value.name.text }]));
  const members = state.slotMembers(carriedAsks);
  const lost = carriedAsks.filter((_, y) => (members[y] ?? []).length === 0);
  const walks = state.origins(lost);
  for (const [y, ask] of carriedAsks.entries()) {
    out[ask.x]?.push(...(members[y] ?? []));
  }
  for (const [y, ask] of lost.entries()) {
    out[ask.x]?.push(...(walks[y]?.decls ?? []));
  }
  const heads = values.map((value) => (isPropertyAccessExpression(value) ? value.expression : value));
  const symbols = valueSymbols(state, heads);
  const asks = values.flatMap((value, x) =>
    (out[x]?.length ?? 0) > 0
      ? []
      : (symbols[x]?.declarations ?? []).map((handle) => ({ x, handle, name: isPropertyAccessExpression(value) ? value.name.text : "" })),
  );
  const nodes = state.batch(asks.map(({ handle }) => handle.resolve.gen()));
  const binds = asks.flatMap(({ x, name }, y) => {
    const node = nodes[y];
    if (node !== undefined && isBindingElement(node) && isObjectBindingPattern(node.parent)) {
      const prop = node.propertyName ?? node.name;
      return prop !== undefined && isIdentifier(prop) ? [{ x, pattern: node.parent, prop: prop.text }] : [];
    }
    return node !== undefined && isParameterDeclaration(node) && name !== "" ? [{ x, pattern: node.name, prop: name }] : [];
  });
  const typed = state.world.typedAt(binds, ({ pattern }) => pattern);
  const found = state.slotMembers(typed.map(({ item: { prop }, type }) => ({ type, name: prop })));
  for (const [
    y,
    {
      item: { x },
    },
  ] of typed.entries()) {
    out[x]?.push(...(found[y] ?? []));
  }
  return out;
}

// For each symbol, whether it is a mapped member whose type its source member's type does not fit.
function transformingMapped(state: GraphState, symbols: readonly NativeSymbol[]): boolean[] {
  const { checker } = state.world;
  const out = symbols.map(() => false);
  const mapped = symbols.flatMap((symbol, y) => {
    const [source] = symbol.declarations;
    return hasFlag(symbol.checkFlags, CheckFlags.Mapped) && source !== undefined ? [{ y, symbol, source }] : [];
  });
  const mappedTypes = state.batch(mapped.map(({ symbol }) => checker.getTypeOfSymbol.gen(symbol)));
  const sources = state.batch(mapped.map(({ source }) => source.resolve.gen()));
  const located = mapped.flatMap((entry, z) => {
    const node = sources[z];
    return node === undefined ? [] : [{ ...entry, z, node: declarationNameOf(node) ?? node }];
  });
  const sourceTypes = state.world.typesAt(located.map(({ node }) => node));
  const fits = state.batch(
    located.map(({ z }, w) => {
      const target = mappedTypes[z];
      const source = sourceTypes[w];
      return target === undefined || source === undefined ? answer(true) : checker.isTypeAssignableTo.gen(source, target);
    }),
  );
  for (const [w, { y }] of located.entries()) {
    out[y] = fits[w] === false;
  }
  return out;
}

// A literal handed to a generic parameter, keyed by its span, with the first parameter type of a sibling function
// argument that takes the same parameter as its real slot.
function coInferredSlots(state: GraphState, literals: readonly ObjectLiteralExpression[]): ReadonlyMap<string, Type> {
  const { checker } = state.world;
  const out = new Map<string, Type>();
  const calls = literals.flatMap((literal) => {
    const call = literal.parent;
    return isCallExpression(call) && call.arguments.length > 1
      ? [{ literal, call, index: call.arguments.findIndex((argument) => sameNode(argument, literal)) }]
      : [];
  });
  const signatures = state.batch(calls.map(({ call }) => checker.getResolvedSignature.gen(call)));
  const targets = state.batch(signatures.map((signature) => signature.getTarget.gen()));
  const parameters = state.batch(targets.map((target) => (target === undefined ? answer<readonly NativeSymbol[]>([]) : target.getParameters.gen())));
  const declared = state.batch(
    calls.map(({ index }, x) => {
      const parameter = parameters[x]?.[index];
      return parameter === undefined ? answer<Type | undefined>(undefined) : checker.getTypeOfSymbol.gen(parameter);
    }),
  );
  const siblings = calls.flatMap(({ literal, call }, x) =>
    declared[x] !== undefined && hasFlag(declared[x].flags, TypeFlags.TypeParameter)
      ? call.arguments.filter((argument) => !sameNode(argument, literal)).map((sibling) => ({ key: spanKey(literal), sibling }))
      : [],
  );
  const siblingTypes = state.world.typesAt(siblings.map(({ sibling }) => sibling));
  const firsts = state.batch(siblingTypes.map((type) => firstParameterType(state, type)));
  const slots = state.slotTypes(firsts);
  for (const [y, { key }] of siblings.entries()) {
    const slot = slots[y];
    if (slot !== undefined && !out.has(key)) {
      out.set(key, slot);
    }
  }
  return out;
}

function* firstParameterType(state: GraphState, type: Type): APIRequestGenerator<Type | undefined> {
  const [signature] = yield* type.getCallSignatures.gen();
  const [parameter] = signature === undefined ? [] : yield* signature.getParameters.gen();
  return parameter === undefined ? undefined : yield* state.world.checker.getTypeOfSymbol.gen(parameter);
}
