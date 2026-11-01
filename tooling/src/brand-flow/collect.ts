// The checker half of the brand-flow scan: one world, its home files, every question batched. A record is `measured`
// when a type settled it and `heuristic` when a name or a text shape did.
import type { Expression, Node } from "@typescript/native/ast";
import { isBinaryExpression, isCallExpression, isPropertyAccessExpression, isTemplateExpression, SyntaxKind } from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { all } from "@typescript/native/sync";
import type { NativeWorld } from "../unwired/index.ts";
import type { DeclInfo } from "./decl.ts";
import { shortText, symbolInfo, variableOf, whereOf } from "./decl.ts";
import type { TypeFacts } from "./facts.ts";
import { brandConstraint, sharesBrand, TypeReader, takesAnyString } from "./facts.ts";
import { layerOf, slotOf, stateIndex } from "./slots.ts";
import type { Gathered } from "./syntax.ts";
import { calleeName, enclosingFunction, gather, insideCallTo, ownerOf, PARSE_MINTS, peel, rootNames } from "./syntax.ts";
import type { MintClass, MintSite, MintVia, Provenance, RawShape, Slot, Where, WidenSite } from "./types.ts";

/** A comparison with a brand on one side, kept until the widen edges of every world are known. */
export interface CompareCandidate extends Where {
  readonly brand: string;
  readonly plainName: string | null;
  readonly source: string;
  readonly roots: readonly string[];
  /** Both sides are brands, and not the same one. */
  readonly crossed: boolean;
}

/** An id-named declaration whose type is a plain string, kept until the name table is known. */
export interface DeclarationCandidate extends Where {
  readonly name: string;
  readonly declKind: string;
  readonly owner: string | null;
  readonly shape: "string" | "collection";
}

export interface WorldRecords {
  readonly config: string;
  readonly files: number;
  readonly brandless: boolean;
  readonly mints: readonly MintSite[];
  readonly widens: readonly WidenSite[];
  readonly compares: readonly CompareCandidate[];
  readonly declarations: readonly DeclarationCandidate[];
  readonly seen: readonly string[];
}

// A hook of a zod schema parses the value it is handed; a cast inside one sits behind the parse.
const ZOD_HOOKS: ReadonlySet<string> = new Set(["transform", "pipe", "refine", "superRefine", "preprocess", "custom", "overwrite"]);
const PARSE_TEXT = /\.(?:safeParse|parseAsync|parse)\(|typeIdSchema|brandedId|fromString\(/u;
const HTTP_TEXT = /\.(?:param|query|queries|header)\(/u;
const COLLECTIONS: ReadonlySet<string> = new Set(["Array", "ReadonlyArray", "Set", "ReadonlySet", "Map", "ReadonlyMap", "Iterable"]);

const rootSites = (infos: readonly DeclInfo[]): string[] => infos.flatMap((info) => (info.site === null ? [] : [info.site]));

const initializerParses = (node: Node | undefined): boolean => {
  const variable = variableOf(node) as (Node & { readonly initializer?: Node }) | undefined;
  return variable?.initializer !== undefined && PARSE_TEXT.test(variable.initializer.getText());
};

function rawShape(read: Node, roots: readonly DeclInfo[]): RawShape {
  const [root] = roots;
  if (HTTP_TEXT.test(read.getText())) {
    return "http-param";
  }
  if (isTemplateExpression(read)) {
    return "template";
  }
  if (root?.kind === SyntaxKind.Parameter) {
    return "parameter";
  }
  if (root?.kind === SyntaxKind.VariableDeclaration || root?.kind === SyntaxKind.BindingElement) {
    return "variable";
  }
  if (isCallExpression(read)) {
    return "call";
  }
  if (root?.file?.startsWith("packages/db/") === true) {
    return "db-row";
  }
  if (root?.file?.startsWith("packages/contracts/") === true) {
    return "contract-property";
  }
  return isPropertyAccessExpression(read) ? "property" : "other";
}

interface Judged {
  readonly mintClass: MintClass;
  readonly shape: RawShape | null;
  readonly provenance: Provenance;
}

// What a value was before it became a brand. A literal and a brand are the checker's word; a parse is a text shape.
function judge(operand: Node, facts: TypeFacts, roots: readonly DeclInfo[]): Judged {
  const typed = facts.brands.length > 0;
  if (typed && !facts.plain && !facts.literal && !facts.other) {
    return { mintClass: "rebrand", shape: null, provenance: "measured" };
  }
  if (facts.literal && !facts.plain && !facts.other && !typed) {
    return { mintClass: "literal", shape: null, provenance: "measured" };
  }
  const parsed = insideCallTo(operand, ZOD_HOOKS) || PARSE_TEXT.test(operand.getText()) || roots.some((root) => initializerParses(root.node));
  return parsed
    ? { mintClass: "parsed", shape: null, provenance: "heuristic" }
    : { mintClass: "raw", shape: rawShape(peel(operand), roots), provenance: "measured" };
}

interface MintInput {
  readonly node: Node;
  readonly operand: Node;
  readonly via: MintVia;
  readonly target: TypeFacts;
}

function mintInputs(world: NativeWorld, reader: TypeReader, found: Gathered): MintInput[] {
  const casts = reader.read(world.typesAt(found.casts));
  const asTargets = reader.read(world.typesAt(found.asExpressions));
  const inputs: MintInput[] = [];
  for (const [at, node] of found.casts.entries()) {
    const operand = isCallExpression(node) ? node.arguments[0] : undefined;
    if (operand !== undefined) {
      inputs.push({ node, operand, via: "castId", target: casts[at] as TypeFacts });
    }
  }
  for (const [at, node] of found.asExpressions.entries()) {
    inputs.push({ node, operand: (node as Node & { readonly expression: Node }).expression, via: "as", target: asTargets[at] as TypeFacts });
  }
  return inputs;
}

/** Every place a value becomes a brand: `castId`, `as Brand`, a parse schema, an id source. */
function collectMints(world: NativeWorld, reader: TypeReader, found: Gathered): MintSite[] {
  const inputs = mintInputs(world, reader, found);
  const operandFacts = reader.read(world.typesAt(inputs.map(({ operand }) => operand)));
  // A `castId` whose target names no brand is kept as `?`; an `as` to a non-brand is no mint.
  const judged = inputs.flatMap((input, at) =>
    input.via === "as" && input.target.brands.length === 0 ? [] : [{ input, facts: operandFacts[at] as TypeFacts }],
  );
  const rootInfos = world.batch(judged.map(({ input }) => all(...rootNames(input.operand).map((name) => symbolInfo(world, name)))));
  const casts = judged.map(({ input, facts }, at): MintSite => {
    const roots = rootInfos[at] ?? [];
    return {
      ...whereOf(world, input.node),
      via: input.via,
      brand: input.target.brands.join(" | ") || "?",
      ...judge(input.operand, facts, roots),
      source: shortText(input.operand),
      from: facts.brands,
      roots: rootSites(roots),
      operandName: rootNames(input.operand)[0]?.getText() ?? null,
    };
  });
  return [...casts, ...collectSourceMints(world, reader, found.mintCalls)];
}

const sourceVia = (name: string): MintVia => {
  if (name === "typeIdSchema") {
    return "typeIdSchema";
  }
  return PARSE_MINTS.has(name) ? "brandedId" : "id-source";
};

// A call into the ids module returns a brand, or a schema whose output is one.
function collectSourceMints(world: NativeWorld, reader: TypeReader, calls: readonly Node[]): MintSite[] {
  const returned = world.typesAt(calls);
  const direct = reader.read(returned);
  const wrapped = world.batch(
    returned.map(function* (type): APIRequestGenerator<Type> {
      return type.isTypeReference() ? ((yield* world.checker.getTypeArguments.gen(type))[0] ?? type) : type;
    }),
  );
  const inner = reader.read(wrapped);
  return calls.flatMap((call, at): MintSite[] => {
    const own = (direct[at] as TypeFacts).brands;
    const brands = own.length > 0 ? own : (inner[at] as TypeFacts).brands;
    if (brands.length === 0) {
      return [];
    }
    const via = sourceVia(calleeName(call) ?? "");
    return [
      {
        ...whereOf(world, call),
        via,
        brand: brands.join(" | "),
        mintClass: via === "id-source" ? "literal" : "parsed",
        shape: null,
        source: shortText(call),
        from: [],
        provenance: "measured",
        roots: [],
        operandName: null,
      },
    ];
  });
}

// A collection's first type argument: the element a `ChatId[]` or `Set<string>` holds.
function* elementsOf(world: NativeWorld, type: Type): APIRequestGenerator<readonly Type[]> {
  const members = type.isUnionType() ? yield* type.getTypes.gen() : [type];
  const elements: Type[] = [];
  for (const member of members) {
    if (!member.isTypeReference()) {
      continue;
    }
    const symbol = yield* (yield* member.getTarget.gen()).getSymbol.gen();
    const [first] = symbol !== undefined && COLLECTIONS.has(symbol.name) ? yield* world.checker.getTypeArguments.gen(member) : [];
    if (first !== undefined) {
      elements.push(first);
    }
  }
  return elements;
}

/** The facts of the elements of each wanted collection type; an unwanted or non-collection type has none. */
function elementFacts(world: NativeWorld, reader: TypeReader, types: readonly Type[], wanted: (at: number) => boolean): TypeFacts[][] {
  const asked = types.flatMap((type, at) => (wanted(at) && type.isTypeReference() ? [at] : []));
  const held = world.batch(asked.map((at) => elementsOf(world, types[at] as Type)));
  const flat = reader.read(held.flat());
  const facts: TypeFacts[][] = types.map(() => []);
  let cursor = 0;
  for (const [position, at] of asked.entries()) {
    const size = held[position]?.length ?? 0;
    facts[at] = flat.slice(cursor, cursor + size);
    cursor += size;
  }
  return facts;
}

interface WidenProbe {
  readonly handed: Gathered["handed"][number];
  readonly brands: readonly string[];
  /** The value is a collection of brands, not a brand. */
  readonly element: boolean;
}

// The handed values that hold a brand: the value itself, or the elements of a collection.
function brandedProbes(world: NativeWorld, reader: TypeReader, handed: Gathered["handed"]): WidenProbe[] {
  const types = world.typesAt(handed.map(({ value }) => value));
  const own = reader.read(types);
  const held = elementFacts(world, reader, types, (at) => (own[at] as TypeFacts).brands.length === 0);
  return handed.flatMap((one, at): WidenProbe[] => {
    const brands = (own[at] as TypeFacts).brands;
    const inner = (held[at] ?? []).flatMap((facts) => facts.brands);
    if (brands.length > 0) {
      return [{ handed: one, brands, element: false }];
    }
    return inner.length > 0 ? [{ handed: one, brands: inner, element: true }] : [];
  });
}

// `brand as string` strips the brand where it stands; the string it yields is the widened value.
function collectCastWidens(world: NativeWorld, reader: TypeReader, found: Gathered): WidenSite[] {
  const targets = reader.read(world.typesAt(found.asExpressions));
  const operands = reader.read(world.typesAt(found.asExpressions.map((node) => (node as Node & { readonly expression: Node }).expression)));
  const slot: Slot = { kind: "cast", name: "as string", owner: null, declSite: null, declFile: null, lib: false };
  return found.asExpressions.flatMap((node, at): WidenSite[] => {
    const brands = (operands[at] as TypeFacts).brands;
    return brands.length > 0 && takesAnyString(targets[at] as TypeFacts)
      ? [{ ...whereOf(world, node), brands, slot, layer: "local", provenance: "measured" }]
      : [];
  });
}

function collectWidens(world: NativeWorld, reader: TypeReader, found: Gathered): WidenSite[] {
  const probes = brandedProbes(world, reader, found.handed);
  const contexts = world.contextualTypes(probes.map(({ handed }) => handed.value as Expression));
  const slotted = probes.flatMap((probe, at) => (contexts[at] === undefined ? [] : [{ probe, context: contexts[at] as Type }]));
  const slotTypes = slotted.map(({ context }) => context);
  const direct = reader.read(slotTypes);
  const held = elementFacts(world, reader, slotTypes, (at) => slotted[at]?.probe.element === true);
  const widening = slotted.filter(({ probe }, at) => (probe.element ? (held[at] ?? []).some(takesAnyString) : takesAnyString(direct[at] as TypeFacts)));
  const states = stateIndex(world, found.states);
  const slots = world.batch(widening.map(({ probe }) => slotOf(world, probe.handed, states)));
  const edges = widening.map(({ probe }, at): WidenSite => {
    const slot = slots[at] as Slot;
    const where = whereOf(world, probe.handed.value);
    return { ...where, brands: probe.brands, slot, layer: layerOf(slot, where.file), provenance: probe.element ? "heuristic" : "measured" };
  });
  return [...edges, ...collectCastWidens(world, reader, found)];
}

function collectComparisons(world: NativeWorld, reader: TypeReader, comparisons: readonly Node[]): CompareCandidate[] {
  const binaries = comparisons.filter(isBinaryExpression);
  const left = reader.read(world.typesAt(binaries.map((node) => node.left)));
  const right = reader.read(world.typesAt(binaries.map((node) => node.right)));
  const picked = binaries.flatMap((node, at) => {
    const [a, b] = [left[at] as TypeFacts, right[at] as TypeFacts];
    const crossed = a.brands.length > 0 && b.brands.length > 0 && !sharesBrand(a.brands, b.brands);
    if (crossed || (a.brands.length > 0 && takesAnyString(b))) {
      return [{ node, brand: a.brands.join(" | "), plain: node.right, crossed }];
    }
    return b.brands.length > 0 && takesAnyString(a) ? [{ node, brand: b.brands.join(" | "), plain: node.left, crossed }] : [];
  });
  const roots = world.batch(picked.map(({ plain }) => all(...rootNames(plain).map((name) => symbolInfo(world, name)))));
  return picked.map(({ node, brand, plain, crossed }, at) => ({
    ...whereOf(world, node),
    brand,
    plainName: rootNames(plain)[0]?.getText() ?? null,
    source: shortText(node),
    roots: rootSites(roots[at] ?? []),
    crossed,
  }));
}

function collectDeclarations(world: NativeWorld, reader: TypeReader, declarations: readonly Node[]): DeclarationCandidate[] {
  const named = declarations.filter((node): node is Node & { readonly name: Node } => (node as Node & { readonly name?: Node }).name !== undefined);
  const types = world.typesAt(named.map((node) => node.name));
  const facts = reader.read(types);
  const held = elementFacts(world, reader, types, (at) => (facts[at] as TypeFacts).other);
  return named.flatMap((node, at): DeclarationCandidate[] => {
    const own = facts[at] as TypeFacts;
    const string = takesAnyString(own) && !own.other;
    if (!(string || (held[at] ?? []).some(takesAnyString))) {
      return [];
    }
    return [
      {
        ...whereOf(world, node),
        name: node.name.getText(),
        declKind: SyntaxKind[node.kind],
        owner: ownerOf(node) ?? enclosingFunction(node)?.name?.getText() ?? null,
        shape: string ? "string" : "collection",
      },
    ];
  });
}

/** One world's records, over the files it is home to. */
export function collectWorld(world: NativeWorld, home: ReadonlySet<string>): WorldRecords {
  const files = world.files.filter((file) => home.has(world.siteOf(file).file));
  const constraint = brandConstraint(world);
  const base = { config: world.config, files: files.length };
  if (constraint === null) {
    return { ...base, brandless: true, mints: [], widens: [], compares: [], declarations: [], seen: [] };
  }
  const reader = new TypeReader(world, constraint);
  const found = gather(files);
  return {
    ...base,
    brandless: false,
    mints: collectMints(world, reader, found),
    widens: collectWidens(world, reader, found),
    compares: collectComparisons(world, reader, found.comparisons),
    declarations: collectDeclarations(world, reader, found.declarations),
    seen: [...reader.seen],
  };
}
