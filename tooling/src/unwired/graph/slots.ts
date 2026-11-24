// Writes into slots: each property of a written object literal or JSX attribute list fills the slot member it names,
// resolved through the origin walk when the slot is mapped (`VariantProps`, `Partial`); a member that is a variant axis
// takes the written value (./variants.ts).
//
// - A mapped property names its source member's declaration; it carries that member's data only when the source type
//   fits it (`Partial`, `Readonly`, `Pick`). A mapping that changes the type (`{ [F in keyof V]: Schema<V[F]> }`) fills
//   a table keyed by the member: a key use of it, not a write.
// - A zod schema's inferred type maps each shape key's schema to the value it parses, so a mapped member whose source is a
//   shape key is that field itself: a literal typed by `z.infer` or `z.input` writes the key, as a read through it reads.
// - A literal handed to a generic parameter `T` has only itself as its slot; when a sibling argument is a function
//   taking that `T` (`variantProps(recipe, selection)`), the sibling's first parameter is the real slot.
// - A key fills the member of its literal's own slot, never the member a spread beside it copies from: `{ ...row, at: iso }`
//   handed to a wire shape writes the wire's `at`, not the row's. Only a key the slot declares no member for (a generic
//   call infers the slot from the literal itself, `run<R>({ req: { ...req, accounting } })`) fills the spread source's.
// - A literal no slot types writes its own keys, so a flow from the slot it is handed into carries the writes.
// - A literal a zod schema validates (`schema.parse({ … })`) is typed by the schema's input: parse takes the values its
//   keys hold, so each key writes the schema key of its name, and a key the literal lacks stays unwritten. A literal
//   nested as a key's value or a list element fills that key's input the same way, and a value spread into one writes
//   each input key it holds a member of.
// - A key beside a spread writes its member, but the literal copies the spread value: it builds no home
//   (state.ts `copyOnlyWrites`).
// - A value forwarded from a bare parameter (`(lv: 2 | 1) => t({ level: lv })`) names no member to forward from, so its
//   type selects the axis values instead.
import type { Node, ObjectLiteralExpression, PropertyAssignment } from "@typescript/native/ast";
import {
  isArrayBindingPattern,
  isArrayLiteralExpression,
  isAsExpression,
  isBindingElement,
  isCallExpression,
  isGetAccessorDeclaration,
  isIdentifier,
  isMethodDeclaration,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isSetAccessorDeclaration,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { CheckFlags, TypeFlags } from "@typescript/native/sync";
import { hasFlag } from "../native.ts";
import { libraryNames, ZOD_PACKAGE } from "./library-names.ts";
import type { DeclKey } from "./resolve.ts";
import { answer, declKeyParts, keyText, unwrapExpression } from "./resolve.ts";
import { sameNode } from "./roles.ts";
import type { FileSites } from "./sites.ts";
import { declarationNameOf, isZodShapeKey, PAGE_CURSOR } from "./sites.ts";
import type { GraphState } from "./state.ts";
import { literalValues } from "./state.ts";
import type { AxisValue, Variants } from "./variants.ts";
import { variantsDeclarations, writtenLiterals } from "./variants.ts";

/** One write into a slot: the slot type, the member name, the value written and where. */
interface SlotWrite {
  readonly type: Type;
  readonly name: string;
  readonly value: Node | undefined;
  readonly at: number;
  readonly jsx: boolean;
}

const spanKey = (node: Node): string => `${String(node.pos)}:${String(node.end)}`;

// zod's validators, each taking the schema's input, and the member that declares that input's type.
const ZOD_VALIDATORS: ReadonlySet<string> = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);
const ZOD_INPUT = "_input";

/** The value with its parentheses, non-null and type assertions removed. */
export function unwrapValue(node: Node | undefined): Node | undefined {
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
  const validated = validatedSlots(state, literals);
  for (const [key, type] of [...coInferredSlots(state, literals), ...[...validated.values()].map((entry) => [spanKey(entry.literal), entry.type] as const)]) {
    slots.set(key, type);
  }
  // `--ablate=literal-keys` drops every object literal key's write: through its contextual type, through the spreads
  // beside it and into its own key.
  if (!state.session.options.ablate.has("literal-keys")) {
    state.copyKeys(
      sites.file,
      sites.literalProperties.filter(({ literal }) => literal.properties.some(isSpreadAssignment)).map(({ at }) => at),
    );
    const writes = sites.literalProperties.flatMap(({ literal, name, at, value, schema }): SlotWrite[] => {
      const type = schema ? undefined : slots.get(spanKey(literal));
      return type === undefined ? [] : [{ type, name, value, at, jsx: false }];
    });
    slotWrites(state, variants, sites, [
      ...writes,
      ...spreadWrites(state, sites, slots),
      ...validatedSpreadWrites(state, validated),
      ...pagedWrites(state, sites),
    ]);
    ownKeyWrites(state, sites, slots);
  }
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

// The writes a key makes through the spreads beside it: a key its literal's own object slot does not declare (a generic
// call's slot is its parameter's constraint, `{ readonly signal: string }`) fills the member each spread source's type
// declares, since the literal is that source's value with the key overridden. A key the slot declares is the slot's. A
// zod shape key is schema input, never a write, here as through the slot.
function spreadWrites(
  state: GraphState,
  { file, literalProperties: properties }: Pick<FileSites, "file" | "literalProperties">,
  slots: ReadonlyMap<string, Type | undefined>,
): readonly SlotWrite[] {
  const candidates = properties.flatMap(({ literal, name, at, value, schema }) => {
    const type = schema ? undefined : slots.get(spanKey(literal));
    const spreads = literal.properties.filter(isSpreadAssignment);
    return type !== undefined && spreads.length > 0 && hasFlag(type.flags, TypeFlags.Object) ? [{ type, name, at, value, literal, spreads }] : [];
  });
  const own = state.batch(candidates.map(({ type, name }) => state.propsOnSlot(type, name)));
  // A slot the checker inferred from the literal itself names the literal's own key, which declares no member.
  const declared = own.map((symbols) => state.declarations(symbols).flat());
  const sources = candidates.flatMap((candidate, at) =>
    (declared[at] ?? []).every((key) => insideLiteral(key, file, candidate.literal))
      ? candidate.spreads.map((spread) => ({ candidate, source: spread.expression }))
      : [],
  );
  const types = state.slotTypes(state.world.typesAt(sources.map(({ source }) => source)));
  return sources.flatMap(({ candidate: { name, at, value } }, x) => {
    const type = types[x];
    return type === undefined ? [] : [{ type, name, value, at, jsx: false }];
  });
}

// Whether a declaration key names a node inside the literal: one of its own keys.
function insideLiteral(key: DeclKey, file: string, literal: ObjectLiteralExpression): boolean {
  const parts = declKeyParts(key);
  return parts.file === file && parts.pos >= literal.pos && parts.end <= literal.end;
}

// A paged query writes its input slot's cursor, which TanStack Query fills from `getNextPageParam` (sites.ts `pagedQueries`).
function pagedWrites(state: GraphState, sites: FileSites): readonly SlotWrite[] {
  const inputs = state.contextualTypes(sites.pagedQueries.map(({ input }) => input));
  return sites.pagedQueries.flatMap(({ at }, x) => {
    const type = inputs[x];
    return type === undefined ? [] : [{ type, name: PAGE_CURSOR, value: undefined, at, jsx: false }];
  });
}

// A literal no slot types, such as a local `as const` table handed on later, writes its own keys; the flow from the slot
// it lands in (./flows.ts) carries each write to the slot's member, at any depth. A method key is called, not written,
// and so is a getter or setter: an accessor is code, not stored data.
function ownKeyWrites(state: GraphState, sites: FileSites, slots: ReadonlyMap<string, Type | undefined>): void {
  for (const { literal, property, at, schema } of sites.literalProperties) {
    const code = isMethodDeclaration(property) || isGetAccessorDeclaration(property) || isSetAccessorDeclaration(property);
    if (!(schema || code) && slots.get(spanKey(literal)) === undefined) {
      state.role(state.resolver.keyOf(property), "write", sites.file, at);
    }
  }
}

// `recipe(bag)`: a recipe handed a whole value selects, on each axis the value's type names, every literal that member's
// type can be, as a typed value. The slot is the recipe's props, a key-built mapping the origin walk follows to the axes.
function bagSelections(state: GraphState, variants: Variants, sites: FileSites): void {
  const { checker } = state.world;
  const signatures = state.batch(sites.bagCalls.map(({ call }) => checker.getResolvedSignature.gen(call)));
  const confirmed = variantsDeclarations(state, signatures);
  const recipes = sites.bagCalls.filter((_, at) => confirmed[at] === true);
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
  const literals = state.batch(types.map((type) => literalValues(type)));
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
  const literals = state.batch(types.map((type) => literalValues(type)));
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

// For each symbol, whether it is a mapped member whose type its source member's type does not fit, a zod shape key aside.
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
    return node === undefined || isZodShapeKey(node, libraryNames(state.world)) ? [] : [{ ...entry, z, node: declarationNameOf(node) ?? node }];
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

// The literals a zod schema validates, keyed by their spans, each with the schema input it fills.
type Validated = ReadonlyMap<string, { readonly literal: ObjectLiteralExpression; readonly type: Type }>;

// A literal a zod schema validates (`schema.parse({ … })`), keyed by its span, with the schema's input as its slot:
// the literal is what parse takes, so its keys fill the input keys even where a transform reshapes the output. A
// literal nested in it as a key's value or a list element fills that key's input type, or its element type. The call
// must resolve to zod's own declaration; a `parse` of another receiver takes the literal as nothing of ours.
function validatedSlots(state: GraphState, literals: readonly ObjectLiteralExpression[]): Validated {
  const calls = literals.flatMap((literal) => {
    const call = literal.parent;
    return isCallExpression(call) &&
      sameNode(call.arguments[0], literal) &&
      isPropertyAccessExpression(call.expression) &&
      ZOD_VALIDATORS.has(call.expression.name.text)
      ? [{ literal, callee: call.expression }]
      : [];
  });
  const symbols = state.world.symbolsAt(calls.map(({ callee }) => callee.name));
  const zod = state.world.fromPackage(
    symbols.map((symbol) => symbol?.declarations ?? []),
    ZOD_PACKAGE,
  );
  const validated = calls.filter((_, at) => zod[at] === true);
  const schemas = state.world.typesAt(validated.map(({ callee }) => callee.expression));
  const inputs = state.batch(schemas.map((schema) => schemaInput(state, schema)));
  const nested = state.batch(
    validated.map(({ literal }, at) => {
      const input = inputs[at];
      return input === undefined ? answer([]) : nestedInputs(state, literal, input);
    }),
  );
  return new Map(nested.flat().map((entry) => [spanKey(entry.literal), entry]));
}

// A validated literal with the input type it fills, then each literal nested in it as a key's value or a list element,
// with that key's input type or its element type.
function* nestedInputs(
  state: GraphState,
  literal: ObjectLiteralExpression,
  input: Type,
): APIRequestGenerator<readonly { readonly literal: ObjectLiteralExpression; readonly type: Type }[]> {
  const out = [{ literal, type: input }];
  for (const property of literal.properties.filter(isPropertyAssignment)) {
    const held = yield* keyInput(state, property, input);
    for (const child of held?.literals ?? []) {
      out.push(...(yield* nestedInputs(state, child, held?.type ?? input)));
    }
  }
  return out;
}

// The literals a validated key's value holds, with the input type each fills: the value itself under the key's input
// type, or each element of a list under its element type.
function* keyInput(
  state: GraphState,
  property: PropertyAssignment,
  input: Type,
): APIRequestGenerator<{ readonly literals: readonly ObjectLiteralExpression[]; readonly type: Type } | undefined> {
  const { checker } = state.world;
  const name = keyText(property.name);
  const value = unwrapValue(property.initializer);
  const member = name === undefined ? undefined : yield* checker.getPropertyOfType.gen(yield* checker.getNonNullableType.gen(input), name);
  if (member === undefined || value === undefined) {
    return undefined;
  }
  const type = yield* checker.getNonNullableType.gen(yield* checker.getTypeOfSymbol.gen(member));
  if (isObjectLiteralExpression(value)) {
    return { literals: [value], type };
  }
  const element = isArrayLiteralExpression(value) ? yield* type.getNumberIndexType.gen() : undefined;
  if (element === undefined || !isArrayLiteralExpression(value)) {
    return undefined;
  }
  const literals = value.elements.map(unwrapValue).filter((item): item is ObjectLiteralExpression => item !== undefined && isObjectLiteralExpression(item));
  return { literals, type: yield* checker.getNonNullableType.gen(element) };
}

// A value spread into a validated literal (`schema.parse({ ...base, a })`) is part of what parse takes: each member
// it holds writes the input key of its name, at the spread.
function validatedSpreadWrites(state: GraphState, validated: Validated): readonly SlotWrite[] {
  const spreads = [...validated.values()].flatMap(({ literal, type }) => literal.properties.filter(isSpreadAssignment).map((spread) => ({ spread, type })));
  const values = state.world.typesAt(spreads.map(({ spread }) => spread.expression));
  const members = state.batch(values.map((value) => state.membersOf(value)));
  const named = state.batch(spreads.map(({ type }) => state.membersOf(type)));
  return spreads.flatMap(({ spread, type }, x) => {
    const names = new Set((named[x] ?? []).map(({ name }) => name));
    return (members[x] ?? []).filter(({ name }) => names.has(name)).map(({ name }) => ({ type, name, value: undefined, at: spread.pos, jsx: false }));
  });
}

// The input type a zod schema declares, the type of its `_input`.
function* schemaInput(state: GraphState, schema: Type): APIRequestGenerator<Type | undefined> {
  const input = yield* state.world.checker.getPropertyOfType.gen(schema, ZOD_INPUT);
  return input === undefined ? undefined : yield* state.world.checker.getTypeOfSymbol.gen(input);
}

function* firstParameterType(state: GraphState, type: Type): APIRequestGenerator<Type | undefined> {
  const [signature] = yield* type.getCallSignatures.gen();
  const [parameter] = signature === undefined ? [] : yield* signature.getParameters.gen();
  return parameter === undefined ? undefined : yield* state.world.checker.getTypeOfSymbol.gen(parameter);
}
