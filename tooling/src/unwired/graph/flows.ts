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
// - A spread into an object literal copies; it never escapes.
// - A value handed into a slot type that names fewer members still holds the rest at run time: each slot that type then
//   fills pairs with the value too, at any number of such hops, so a member reaches the first slot that names it. Each
//   hop is a pair the walk made; a member of the same name on a value never handed through the narrower type gains
//   nothing.
// - A slot with a string index signature pairs the members it names; the value's other members escape with it. A
//   literal key read through such a slot's type in the same file (`line["done"]`) reads the handed values' members of
//   that name, at any depth: it cannot tell two values handed into one type apart.
// - Two instances of one generic pair their type arguments by each type parameter's variance (variance.ts): a parameter
//   used only where a value comes out (`Box<T>`'s `value: T`) pairs forward, one used only where a value goes in
//   (`Options<V>`'s `mutationFn: (vars: V) => …`) pairs backward, one used both ways pairs both ways, and one never used
//   (a phantom `Token<A>`) pairs forward.
// - A write into a global our own `declare global` declares publishes the value outside the program, so it escapes
//   whole, its function members' returns walked too.
// - An escape names where the value goes, chased from the value at the site that handed it on, at any depth of the walk
//   (open-sends.ts sendDestinations). Inside the provider backends a value no destination takes is a provider send only
//   when it reaches a request the backends make (open-sends.ts providerReach); elsewhere it is unclassified.
//
// A call zod declares takes schema input, not a send: a builder's arguments are shapes (the schema itself, whose keys
// are the members of the type it satisfies, build.ts zodTwins), and a validator hands its input to no receiver but the
// schema's own keys. The exceptions are the calls whose argument is data parse returns as its output
// (ZOD_OUTPUT_VALUES): that value fills the output slot like any hand-off.
import type { CallExpression, Expression, NewExpression, Node } from "@typescript/native/ast";
import {
  isCallExpression,
  isConditionalExpression,
  isModuleDeclaration,
  isNewExpression,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isSpreadElement,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Signature, Type } from "@typescript/native/sync";
import { IndexKind, TypeFlags } from "@typescript/native/sync";
import { rowColumns, signatureOf } from "../drizzle-rows.ts";
import { declarationKeys, hasFlag } from "../native.ts";
import type { Chase, Destination, ProviderReach } from "../open-sends.ts";
import { assertedDestination, identitySlot, providerReach, sendChase } from "../open-sends.ts";
import { isProduction } from "../worlds.ts";
import { tracing } from "./options.ts";
import type { DeclKey } from "./resolve.ts";
import { allOf, answer, constituentsOf, keyText, ZOD_PACKAGE } from "./resolve.ts";
import type { FileSites, HandedWhole } from "./sites.ts";
import type { GraphState } from "./state.ts";
import { isPrimitive, UNCLASSIFIED } from "./state.ts";
import { Variances } from "./variance.ts";

// A slot type and the value type that fills it.
interface TypePair {
  readonly slot: Type;
  readonly value: Type;
}

/** A slot and value pair, with the position of the code that made it: the roles the pair gives are recorded there.
 *  `whole` marks a pair whose value is the site's own value, not a part the walk reached below it. */
export interface FlowPair extends TypePair {
  readonly site: number;
  readonly whole?: boolean;
}

// A slot a value type filled, at the pair's site in its file.
interface Filled extends FlowPair {
  readonly file: string;
}

// The step that put a pair on the flow walk's worklist: into a type argument, a list element or a union arm (each a part
// of the type it came from), or through a member, a parameter or a return (each able to reach a new instantiation).
const STEP_KINDS = ["root", "argument", "element", "arm", "member", "parameter", "return"] as const;
type StepKind = (typeof STEP_KINDS)[number];
const SUBTERM_STEPS: ReadonlySet<StepKind> = new Set<StepKind>(["root", "argument", "element", "arm"]);

// A pair on the flow walk's worklist and the step that reached it, named by its index or member name.
interface Step extends TypePair {
  readonly at: { readonly kind: StepKind; readonly name: string };
}

const ROOT_STEP: Step["at"] = { kind: "root", name: "" };
// How many of a traced walk's declarations its log line names.
const TRACE_TOP = 10;

// A type's identity across its instantiations: the declarations of its alias, else of its symbol. A type with neither
// (a union, an intersection, a primitive) is keyed by itself; its arms and members carry declarations of their own.
function* declarationOf(type: Type): APIRequestGenerator<string> {
  const symbol = (yield* type.getAliasSymbol.gen()) ?? (yield* type.getSymbol.gen());
  const keys = symbol === undefined ? [] : declarationKeys(symbol);
  return keys.length === 0 ? `type ${String(type.id)}` : keys.join(",");
}

const GLOBAL_SCOPE = "global";
const OPAQUE_FLAGS = [TypeFlags.Any, TypeFlags.Unknown, TypeFlags.NonPrimitive] as const;
// zod's methods whose argument is a value parse returns in place of the input: a default, a fallback on failure.
const ZOD_OUTPUT_VALUES: ReadonlySet<string> = new Set(["default", "prefault", "catch"]);

const opaqueFlag = (type: Type): boolean => OPAQUE_FLAGS.some((flag) => hasFlag(type.flags, flag)) || type.isTypeParameter();

const deepKey = (type: Type, throughCalls: boolean): string => `${String(type.id)}${throughCalls ? "c" : ""}`;

/** A slot that names none of a value's members: whatever holds it reads them all. A function slot names its
 *  parameters and its return instead, which the flow walk pairs with the value's. */
export function* opaqueSlot(state: GraphState, type: Type): APIRequestGenerator<boolean> {
  if (opaqueFlag(type)) {
    return true;
  }
  for (const arm of yield* constituentsOf(type)) {
    if (opaqueFlag(arm)) {
      return true;
    }
    // a table typed by its index signature's value, as `Record<string, Copy>` is, names its entries' members
    if (
      !isPrimitive(arm) &&
      (yield* state.world.checker.getPropertiesOfType.gen(arm)).length === 0 &&
      (yield* arm.getCallSignatures.gen()).length === 0 &&
      (yield* indexValueTypes(state, arm)).length === 0
    ) {
      return true;
    }
  }
  return false;
}

/** The sends a message door pairs later (message-doors.ts): value nodes handed straight to a door, and the types of
 *  values a door's option literal carries. */
export interface HeldSends {
  readonly node: (node: Node) => boolean;
  readonly types: ReadonlySet<number>;
}

const NO_HELD_TYPES: ReadonlySet<number> = new Set();
const NO_CHECK_SITES: ReadonlySet<number> = new Set();
const NO_SITE_NODES: ReadonlyMap<number, Node> = new Map();
const PROVIDER_SEND: Destination = { destination: "provider", receiver: null };
const UNFOLLOWED: Chase = { to: [], dropped: false, read: false };

// What a chase decides for an escaping value: `read` where some path reads it whole, and where it is sent, or null
// where nothing receives it.
interface Outcome {
  readonly read: boolean;
  readonly send: Destination | null;
}

const UNCLASSIFIED_OUTCOME: Outcome = { read: false, send: UNCLASSIFIED };

// The ids of a slot's arms that carry a string index signature.
function* stringIndexedArms(checker: Checker, slot: Type): APIRequestGenerator<readonly number[]> {
  const out: number[] = [];
  for (const arm of yield* constituentsOf(slot)) {
    if (!isPrimitive(arm) && (yield* checker.getIndexInfoOfType.gen(arm, IndexKind.String)) !== undefined) {
      out.push(arm.id);
    }
  }
  return out;
}

// The value types of a slot's string index signatures that hold members: an entry filling one is a value of that type.
function* indexValueTypes(state: GraphState, slot: Type): APIRequestGenerator<readonly Type[]> {
  const out: Type[] = [];
  for (const arm of yield* constituentsOf(slot)) {
    const info = isPrimitive(arm) ? undefined : yield* state.world.checker.getIndexInfoOfType.gen(arm, IndexKind.String);
    if (info !== undefined && !isPrimitive(info.valueType) && (yield* state.membersOf(info.valueType)).length > 0) {
      out.push(info.valueType);
    }
  }
  return out;
}

// The value node behind each site position a file's pairs carry: a hand-off, a flow site, a type pair, a checked value.
function siteNodesOf(sites: FileSites): ReadonlyMap<number, Node> {
  const out = new Map<number, Node>();
  const add = (at: number, node: Node): void => {
    if (!out.has(at)) {
      out.set(at, node);
    }
  };
  for (const { node } of sites.handedWhole) {
    const value = isSpreadElement(node) ? node.expression : node;
    add(value.pos, value);
  }
  for (const { value } of sites.flowSites) {
    for (const branch of branchesOf(value)) {
      add(branch.pos, branch);
    }
  }
  for (const { value } of sites.typePairs) {
    add(value.pos, value);
  }
  for (const { value, type } of sites.checkedValues) {
    add(type.pos, value);
  }
  return out;
}
const CHECKED_MARK = "!checked";

export class Flows {
  readonly #state: GraphState;
  readonly #variances: Variances;
  readonly #opaque = new Map<number, boolean>();
  readonly #deep = new Map<string, readonly DeclKey[]>();
  readonly #done = new Set<string>();
  // The member pairs a walk went below, by their declarations: another instantiation of one pair adds no new member.
  readonly #doneMembers = new Set<string>();
  readonly #walkTrace: { record: number } | null;
  // The value types a file's door sends hold inside an option literal (`{ workerData: v }`), kept from escaping there.
  #heldTypes: ReadonlySet<number> = NO_HELD_TYPES;
  // The sites of the file's `satisfies` checks, each at its type node: a pair made there also carries reads to the slot.
  #checkSites: ReadonlySet<number> = NO_CHECK_SITES;
  // The value each of the file's flow sites hands on, by the site's position: an escape found deeper in the walk is
  // chased from there.
  #siteNodes: ReadonlyMap<number, Node> = NO_SITE_NODES;
  #reach: ProviderReach | undefined;
  // The value types handed into each string-indexed slot type, by `file|type id`: a literal key read through that type in
  // the same file reads the values' members of the key's name (keys.ts).
  readonly #sinks = new Map<string, Type[]>();
  // The values widened into each slot type, by its id: each holds members of ours the slot type does not name, which ride
  // along under the narrower type until a slot it fills names them (`costRow` returned as a row type without
  // `extraTokens`, then handed to a parameter that reads `extraTokens`).
  readonly #carried = new Map<number, Map<number, Type>>();
  // The slots each value type filled, by its id: a value carried into that type later fills them too.
  readonly #filled = new Map<number, Map<number, Filled>>();
  // The carried pairs already made, by `slot>value` id.
  readonly #carriedPairs = new Set<string>();
  // Carried pairs found while another file was walked, linked under their own file by settle.
  #late: Filled[] = [];

  constructor(state: GraphState) {
    this.#state = state;
    this.#variances = new Variances(state);
    this.#walkTrace = tracing(state.session.options, "flow-walk") === undefined ? null : { record: 0 };
  }

  /** A file's hand-offs and flow sites, linked to a fixpoint of member pairs; a value `held` answers true for is a
   *  message door's send, paired later (message-doors.ts). */
  file(sites: FileSites, held: HeldSends): void {
    this.#heldTypes = held.types;
    this.#siteNodes = siteNodesOf(sites);
    const handed = this.#handedWhole(sites, held.node);
    // a literal a library takes by identity holds values nothing reads, so its elements fill no slot either
    const taken = (node: Node): boolean => held.node(node) || handed.taken.some((whole) => node.pos >= whole.pos && node.end <= whole.end);
    const checked = this.#checkedPairs(sites);
    this.#checkSites = new Set(checked.map(({ site }) => site));
    this.link([...handed.pairs, ...this.#flowSites(sites, taken), ...this.#typePairs(sites), ...checked], sites.file);
    this.#assertions(sites);
    this.#heldTypes = NO_HELD_TYPES;
    this.#checkSites = NO_CHECK_SITES;
    this.#siteNodes = NO_SITE_NODES;
  }

  // An assertion hands its operand to the asserted type. Of a parameter a library typed (or a returned closure's
  // `unknown` parameter), the asserted type's members go to that library (or the closure's unseen caller), which hands
  // the object in and reads it back (open-sends.ts assertedDestination). Into an opaque type the operand is handed on
  // and escapes only where the chase names a receiver or a provider request: an unfollowed cast is no send.
  #assertions(sites: FileSites): void {
    const { state } = this;
    const { assertions } = sites;
    if (assertions.length === 0) {
      return;
    }
    const asserted = state.world.typesAt(assertions);
    const operands = state.world.typesAt(assertions.map(({ expression }) => expression));
    const libraries = state.batch(assertions.map((assertion) => assertedDestination(state.world, assertion)));
    this.#opaqueOf(asserted);
    const handedOn = assertions.flatMap((assertion, at) => {
      const [type, operand] = [asserted[at], operands[at]];
      return libraries[at] === null &&
        type !== undefined &&
        operand !== undefined &&
        this.#opaque.get(type.id) === true &&
        !isPrimitive(operand) &&
        !opaqueFlag(operand)
        ? [{ assertion, operand }]
        : [];
    });
    const chases = state.batch(handedOn.map(({ assertion }) => sendChase(state.world, assertion)));
    for (const [at, assertion] of assertions.entries()) {
      const [library, type] = [libraries[at], asserted[at]];
      if (library !== null && library !== undefined && type !== undefined) {
        this.escape(type, false, { file: sites.file, at: assertion.pos }, library);
      }
    }
    for (const [y, { assertion, operand }] of handedOn.entries()) {
      const send = chases[y]?.to[0] ?? (this.#providerReach().has(assertion) ? PROVIDER_SEND : undefined);
      if (send !== undefined) {
        this.escape(operand, false, { file: sites.file, at: assertion.pos }, send);
      }
    }
  }

  // `defs satisfies Record<Task, TaskFields>`: the checked type is the value's slot, made at the type node.
  #checkedPairs(sites: FileSites): readonly FlowPair[] {
    const { world } = this.state;
    const values = world.typesAt(sites.checkedValues.map(({ value }) => value));
    const slots = world.typesAt(sites.checkedValues.map(({ type }) => type));
    return sites.checkedValues.flatMap((pair, at) => {
      const value = values[at];
      const slot = slots[at];
      return value === undefined || slot === undefined ? [] : [{ slot, value, site: pair.type.pos }];
    });
  }

  // A pair's identity on the walk: a checked pair is apart from an unchecked one of the same types, since it also
  // carries reads.
  #pairKey({ slot, value, site }: FlowPair): string {
    return `${String(slot.id)}>${String(value.id)}${this.#checkSites.has(site) ? CHECKED_MARK : ""}`;
  }

  #typePairs(sites: FileSites): readonly FlowPair[] {
    const { world } = this.state;
    const values = world.typesAt(sites.typePairs.map(({ value }) => value));
    const slots = world.typesAt(sites.typePairs.map(({ slot }) => slot));
    return sites.typePairs.flatMap((pair, at) => {
      const value = values[at];
      const slot = slots[at];
      return value === undefined || slot === undefined ? [] : [{ slot, value, site: pair.value.pos }];
    });
  }

  /** Link slot and value pairs to their fixpoint, the roles they give landing in `file`. */
  link(pairs: readonly FlowPair[], file: string): void {
    for (let level: readonly FlowPair[] = pairs.map((pair) => ({ ...pair, whole: true })); level.length > 0; ) {
      level = this.#linkLevel(level, file);
    }
  }

  #opaqueOf(types: readonly Type[]): void {
    const fresh = [...new Map(types.filter((type) => !this.#opaque.has(type.id)).map((type) => [type.id, type])).values()];
    const answers = this.#state.batch(fresh.map((type) => opaqueSlot(this.#state, type)));
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

  // One level of a deep walk: the members of ours it adds to `found`, and the types they and the level hold. A Drizzle
  // row's members declare nothing and stand for its table's columns, so a row sent whole sends each column.
  #deepLevel(level: readonly Type[], throughCalls: boolean, found: Set<DeclKey>): readonly Type[] {
    const { state } = this;
    const held = state.batch(level.map((type) => state.membersOf(type))).flatMap((members, at) => {
      const holder = level[at];
      return holder === undefined ? [] : members.map((value) => ({ holder, value }));
    });
    const symbols = held.map(({ value }) => value);
    const decls = this.#withRowColumns(held, state.declarations(symbols));
    for (const decl of decls.flat()) {
      found.add(decl);
    }
    const ours = symbols.filter((_, at) => (decls[at]?.length ?? 0) > 0);
    return [
      ...state.batch(ours.map((symbol) => state.world.checker.getTypeOfSymbol.gen(symbol))),
      ...state.batch(level.map((type) => this.#contained(type, throughCalls))).flat(),
    ];
  }

  // The types a value holds besides its members: a list's or tuple's element types, an index signature's value type,
  // and a mapped type's template (`Record<Key, { root: string }>`), whose members a library's own key type declares.
  *#contained(type: Type, throughCalls: boolean): APIRequestGenerator<readonly Type[]> {
    const { checker } = this.#state.world;
    const out: Type[] = [];
    for (const arm of (yield* constituentsOf(type)).filter((candidate) => !isPrimitive(candidate))) {
      if (arm.isTypeReference() && (yield* checker.isArrayLikeType.gen(arm))) {
        out.push(...(yield* checker.getTypeArguments.gen(arm)));
      }
      out.push(...(yield* checker.getIndexInfosOfType.gen(arm)).map((info) => info.valueType));
      if (arm.isMappedType()) {
        out.push(yield* arm.getTemplateType.gen());
      }
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

  /** Record every member a value holds as escaping at `site`, each sent where `send` names; a value published through
   *  our own global door escapes through its calls' returns too, as the door's reader calls what it finds. */
  escape(value: Type, door: boolean, site: { readonly file: string; readonly at: number }, send: Destination): void {
    if (this.#state.session.options.ablate.has("escape")) {
      return;
    }
    this.#state.escapeAll(this.deepMembers(value, door), site, send);
    this.#state.count("values escaped whole");
  }

  // A value handed on whole: into an opaque slot it escapes; into a slot naming its members it pairs member by member.
  #handedWhole(sites: FileSites, held: (node: Node) => boolean): { readonly pairs: readonly FlowPair[]; readonly taken: readonly Node[] } {
    const { state } = this;
    const handed = [...this.#zodCallsDropped(sites.handedWhole.filter(({ node }) => !held(node))), ...this.#published(sites)];
    if (handed.length === 0) {
      return { pairs: [], taken: [] };
    }
    const calls = this.#libraryCalls(handed);
    const nodes = handed.map(({ node }) => (isSpreadElement(node) ? node.expression : node));
    const values = state.world.typesAt(nodes);
    const slotAt = handed.flatMap((entry, at) => (entry.spread ? [] : [at]));
    const contextual = state.batch(slotAt.flatMap((at) => (nodes[at] === undefined ? [] : [state.world.checker.getContextualType.gen(nodes[at])])));
    const slots = new Map(slotAt.map((at, y) => [at, contextual[y]]));
    this.#opaqueOf([...slots.values()].flatMap((type) => (type === undefined ? [] : [type])));
    // a library slot typed `unknown` takes the value by identity (open-sends.ts identitySlot): the value is neither read nor sent
    const identityAsks = [...slots.entries()].flatMap(([at, slot]) => (slot !== undefined && calls.library.has(at) ? [{ at, slot }] : []));
    const identity = state.batch(identityAsks.map(({ slot }) => identitySlot(state.world, slot)));
    const taken = new Set(identityAsks.flatMap(({ at }, y) => (identity[y] === true ? [at] : [])));
    const spreads = this.#spreadPairs(handed, values);
    const pairs: FlowPair[] = [];
    const escaping: { readonly at: number; readonly value: Type; readonly door: boolean }[] = [];
    for (const [at, entry] of handed.entries()) {
      const value = values[at];
      const slot = slots.get(at);
      if (spreads.paired.has(at) || taken.has(at) || value === undefined || isPrimitive(value)) {
        continue;
      }
      if (entry.spread || entry.door || calls.generic.has(at) || (slot !== undefined && this.#opaque.get(slot.id) === true)) {
        escaping.push({ at, value, door: entry.door });
      } else if (slot !== undefined) {
        pairs.push({ slot, value, site: nodes[at]?.pos ?? entry.node.pos });
      }
    }
    this.#escapeHanded(
      escaping.map(({ at, value, door }) => ({ node: nodes[at], value, door })),
      sites.file,
    );
    this.#recordSinks(
      sites.file,
      escaping.flatMap(({ at, value }) => {
        const slot = slots.get(at);
        return slot === undefined ? [] : [{ slot, value }];
      }),
    );
    return { pairs: [...spreads.pairs, ...pairs], taken: [...taken].flatMap((at) => (nodes[at] === undefined ? [] : [nodes[at]])) };
  }

  // Values handed whole into opaque slots: each goes where its chase leads, with the type a `satisfies` holds it to.
  #escapeHanded(escaping: readonly { readonly node: Node | undefined; readonly value: Type; readonly door: boolean }[], file: string): void {
    const outcomes = this.#destinations(escaping.map(({ node }) => node));
    const checked = this.#checkedTypes(escaping.map(({ node }) => node));
    for (const [y, { node, value, door }] of escaping.entries()) {
      const site = { file, at: node?.pos ?? 0 };
      for (const type of [value, ...(checked[y] === undefined ? [] : [checked[y]])]) {
        this.#settle(type, door, site, outcomes[y]);
      }
    }
  }

  // What a chase decides for the members a value holds: a read where some path reads the whole value, a send where some
  // path sends it on, nothing where an in-tree body drops it. Without an outcome the value is sent unclassified.
  #settle(value: Type, door: boolean, site: { readonly file: string; readonly at: number }, outcome: Outcome | undefined): void {
    const { read, send } = outcome ?? UNCLASSIFIED_OUTCOME;
    if (read) {
      this.#state.roleAll(this.deepMembers(value, door), "read", site.file, site.at);
    }
    if (send !== null) {
      this.escape(value, door, site, send);
    }
  }

  // What each escaping value's chase decides (Outcome). The chase runs whether or not the build keeps role sites, since a
  // drop or a read decides a bucket. The call a site's value is handed to takes everything inside it, but the request
  // reach marks expressions one by one, so only a value that is the site's own (`whole`) can be a provider send.
  #destinations(nodes: readonly (Node | undefined)[], whole: (at: number) => boolean = () => true): readonly Outcome[] {
    const { state } = this;
    const found = state.batch(nodes.map((node) => (node === undefined ? answer<Chase>(UNFOLLOWED) : sendChase(state.world, node))));
    return found.map(({ to, dropped, read }, at) => {
      const node = nodes[at];
      if (dropped || (read && to.length === 0)) {
        return { read, send: null };
      }
      return { read, send: to[0] ?? (node !== undefined && whole(at) && this.#providerReach().has(node) ? PROVIDER_SEND : UNCLASSIFIED) };
    });
  }

  // The type a `satisfies` holds each escaping value to, through parentheses: whoever takes the value takes that shape,
  // so its members are sent too.
  #checkedTypes(nodes: readonly (Node | undefined)[]): readonly (Type | undefined)[] {
    const checks = nodes.map((node) => {
      let at = node;
      while (at !== undefined && isParenthesizedExpression(at)) {
        at = at.expression;
      }
      return at !== undefined && isSatisfiesExpression(at) ? at.type : undefined;
    });
    const present = checks.flatMap((type) => (type === undefined ? [] : [type]));
    const types = new Map(this.#state.world.typesAt(present).map((type, at) => [present[at], type] as const));
    return checks.map((type) => (type === undefined ? undefined : types.get(type)));
  }

  // Where a value a pair hands on goes, chased from the value at the pair's site.
  #pairDestinations(pairs: readonly FlowPair[]): readonly Outcome[] {
    return this.#destinations(
      pairs.map(({ site }) => this.#siteNodes.get(site)),
      (at) => pairs[at]?.whole === true,
    );
  }

  // The type a `satisfies` holds each pair's value to, where the value is its site's own (`{ … } satisfies View` returned
  // as `unknown`); a value the walk reached below the site's is a part of it, which the check does not hold.
  #pairCheckedTypes(pairs: readonly FlowPair[]): readonly (Type | undefined)[] {
    const checked = this.#checkedTypes(pairs.map(({ site, whole }) => (whole === true ? this.#siteNodes.get(site) : undefined)));
    return pairs.map((_, at) => checked[at]);
  }

  // Note each value handed into a slot type that carries a string index signature, by the file it was handed in.
  #recordSinks(file: string, handed: readonly TypePair[]): void {
    const { state } = this;
    const arms = state.batch(handed.map(({ slot }) => stringIndexedArms(state.world.checker, slot)));
    for (const [at, { value }] of handed.entries()) {
      for (const id of arms[at] ?? []) {
        const key = `${file}|${String(id)}`;
        this.#sinks.set(key, [...(this.#sinks.get(key) ?? []), value]);
      }
    }
  }

  /** The value types handed in `file` into any of the string-indexed slot types `ids`. */
  sunkInto(file: string, ids: readonly number[]): readonly Type[] {
    return ids.flatMap((id) => this.#sinks.get(`${file}|${String(id)}`) ?? []);
  }

  // The backends' request reach over the program's production files, made once.
  #providerReach(): ProviderReach {
    const { world } = this.#state;
    this.#reach ??= providerReach(world, new Set(world.files.map((source) => world.fileOfSource(source)).filter(isProduction)));
    return this.#reach;
  }

  // A tuple spread into a call's arguments (`(...args) => f(...args)`) fills the parameters it lands on, element by
  // element; an array of unknown length stays a whole hand-off.
  #spreadPairs(
    handed: readonly HandedWhole[],
    values: readonly (Type | undefined)[],
  ): { readonly pairs: readonly FlowPair[]; readonly paired: ReadonlySet<number> } {
    const state = this.#state;
    const { checker } = state.world;
    const asks = handed.flatMap((entry, x) => {
      const value = values[x];
      return entry.spread && entry.call !== undefined && value?.isTupleType() === true ? [{ x, call: entry.call, value, site: entry.node.pos }] : [];
    });
    const signatures = state.batch(asks.map(({ call }) => checker.getResolvedSignature.gen(call.node)));
    const elements = state.batch(asks.map(({ value }) => checker.getTypeArguments.gen(value)));
    const slots = state.batch(
      asks.map(({ call }, y) => {
        const signature = signatures[y];
        const count = elements[y]?.length ?? 0;
        return allOf(
          Array.from({ length: count }, (_, k) => (signature === undefined ? answer(undefined) : declaredParameterType(state, signature, call.index + k))),
        );
      }),
    );
    const pairs: FlowPair[] = [];
    for (const [y, { site }] of asks.entries()) {
      for (const [k, value] of (elements[y] ?? []).entries()) {
        const slot = slots[y]?.[k];
        if (slot !== undefined) {
          pairs.push({ slot, value, site });
        }
      }
    }
    return { pairs, paired: new Set(asks.filter((_, y) => (slots[y] ?? []).some((slot) => slot !== undefined)).map(({ x }) => x)) };
  }

  // A call zod declares takes its argument as schema input, not as a send (the module header holds the reason); a value
  // the schema returns as its output still fills its slot.
  #zodCallsDropped(handed: readonly HandedWhole[]): readonly HandedWhole[] {
    const names = handed.map(({ call }) => {
      const name = calleeName(call?.node);
      return name !== undefined && "text" in name && typeof name.text === "string" && ZOD_OUTPUT_VALUES.has(name.text) ? undefined : name;
    });
    const asked = names.flatMap((name) => (name === undefined ? [] : [name]));
    const symbols = this.#state.world.symbolsAt(asked);
    const zod = this.#state.world.fromPackage(
      symbols.map((symbol) => symbol?.declarations ?? []),
      ZOD_PACKAGE,
    );
    const validators = new Set(asked.filter((_, at) => zod[at] === true));
    return handed.filter((_, at) => {
      const name = names[at];
      return name === undefined || !validators.has(name);
    });
  }

  // The arguments of a library call: `library` holds each, `generic` those the signature takes as a type parameter it
  // declares itself (`c.json<T>(object: T)`, `Response.json`). There the contextual type is the inferred
  // instantiation, the value's own type, so only the declaration shows the slot is opaque. A type parameter an outer
  // declaration binds (a state setter's `Dispatch<A>`, `Map<K, V>.set`) was fixed where its holder was typed, so the
  // contextual type is that instantiation and the value pairs with it. Our own generic functions keep flowing, as their
  // bodies are walked.
  #libraryCalls(handed: readonly HandedWhole[]): { readonly library: ReadonlySet<number>; readonly generic: ReadonlySet<number> } {
    const state = this.#state;
    const { checker } = state.world;
    const asks = handed.flatMap(({ call }, x) => (call === undefined ? [] : [{ x, call }]));
    const signatures = state.batch(asks.map(({ call }) => checker.getResolvedSignature.gen(call.node)));
    const library = asks.filter((_, y) => {
      const declaration = signatures[y]?.declaration;
      return declaration !== undefined && !state.resolver.ours(declaration);
    });
    const own = state.batch(
      library.map(({ x, call }) => {
        const signature = signatures[asks.findIndex((ask) => ask.x === x)];
        return signature === undefined ? answer(false) : ownTypeParameter(state, signature, call.index);
      }),
    );
    return { library: new Set(library.map(({ x }) => x)), generic: new Set(library.flatMap(({ x }, y) => (own[y] === true ? [x] : []))) };
  }

  // The held values whose property a library signature declares as a bare type parameter of its own, before
  // instantiation (`ownTypeParameter` holds why an outer one pairs instead).
  #libraryInferred(held: readonly (HeldInArgument | undefined)[]): ReadonlySet<number> {
    const state = this.#state;
    const asks = held.flatMap((entry, x) => (entry === undefined ? [] : [{ x, entry }]));
    const signatures = state.batch(asks.map(({ entry }) => state.world.checker.getResolvedSignature.gen(entry.call)));
    const declared = state.batch(
      asks.map(({ entry }, y) => {
        const signature = signatures[y];
        return signature?.declaration === undefined || state.resolver.ours(signature.declaration)
          ? answer(undefined)
          : ownedTypeParameter(signature, declaredPropertyType(state, signature, entry));
      }),
    );
    return new Set(asks.flatMap(({ x }, y) => (declared[y] === true ? [x] : [])));
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

  // Values flowing into typed slots: a variable's annotation, or the contextual type of the value or of its holder. A
  // conditional's branches each fill the slot: their union can collapse (`checked ? view : value` into `unknown` is
  // `unknown`), which would hide a branch's members from the walk.
  #flowSites(all: FileSites, held: (node: Node) => boolean): readonly FlowPair[] {
    const { state } = this;
    const sites = {
      flowSites: all.flowSites.flatMap((site) => (held(site.value) ? [] : branchesOf(site.value).map((value) => ({ ...site, value, whole: site.value })))),
    };
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
    // a value inside a literal handed to a library signature's bare type parameter (`tv({ variants: { ink: table } })`)
    // takes its contextual type from its own inference, so its slot is itself: the library takes it whole, as a value
    // handed straight to that parameter does
    const inferred = this.#libraryInferred(sites.flowSites.map((site) => (site.slot === "contextual" ? argumentHolding(site.whole) : undefined)));
    return sites.flowSites.flatMap((site, at) => {
      const slot = slots.get(at);
      const value = values[at];
      if (value !== undefined && inferred.has(at) && !isPrimitive(value)) {
        this.escape(value, false, { file: all.file, at: site.value.pos }, UNCLASSIFIED);
        return [];
      }
      return slot === undefined || value === undefined ? [] : [{ slot, value, site: site.value.pos }];
    });
  }

  // A flow carries the value itself: through a promise to what it resolves to, through a list to its elements, and a
  // function value filling a function-typed slot pairs each parameter backwards (what a caller writes into the slot's
  // parameter is what the implementation's parameter reads) and the return forwards.
  // The walk is a worklist that ends on its seen-set, keyed by the declarations of the slot and the value and the step
  // that reached them, never by type: a recursive generic instantiates a new type at every level (`Deep<Box<T>>`), so a
  // type key never repeats, while its declarations do.
  *#operands({ slot, value, site, whole }: FlowPair, file: string): APIRequestGenerator<readonly FlowPair[]> {
    const { checker } = this.#state.world;
    // a step that keeps the value (a slot's arm) leaves it the site's own; any other step reaches a part of it
    const own = whole === true ? ((yield* checker.getAwaitedType.gen(value)) ?? value).id : undefined;
    const seen = new Set<string>();
    const visits = new Map<string, number>();
    const out: FlowPair[] = [];
    const work: Step[] = [{ slot, value, at: ROOT_STEP }];
    let widest = 0;
    for (let next = work.pop(); next !== undefined; next = work.pop()) {
      const a = (yield* checker.getAwaitedType.gen(next.slot)) ?? next.slot;
      const b = (yield* checker.getAwaitedType.gen(next.value)) ?? next.value;
      if (a.id === b.id) {
        continue;
      }
      const [slotDeclaration, valueDeclaration] = [yield* declarationOf(a), yield* declarationOf(b)];
      // a step into an argument, an element or an arm reaches a part of the type it came from, so that descent ends with
      // the type and is keyed by it; a step through a member or a signature can reach a new instantiation every time,
      // so it is keyed by the declarations it lands on
      const pair = SUBTERM_STEPS.has(next.at.kind)
        ? `${String(a.id)}>${String(b.id)}`
        : `${slotDeclaration}>${valueDeclaration}@${next.at.kind} ${next.at.name}`;
      if (seen.has(pair)) {
        continue;
      }
      seen.add(pair);
      visits.set(slotDeclaration, (visits.get(slotDeclaration) ?? 0) + 1);
      const inner = yield* this.#innerOperands(a, b);
      if (inner === null) {
        out.push({ slot: a, value: b, site, whole: b.id === own });
      } else {
        work.push(...inner);
      }
      widest = Math.max(widest, work.length);
    }
    this.#traceWalk(file, seen.size, widest, visits);
    return out;
  }

  // The flow-walk trace logs each walk that visits more pairs than any before it, with the declarations it met most.
  #traceWalk(file: string, pairs: number, widest: number, visits: ReadonlyMap<string, number>): void {
    if (this.#walkTrace === null || pairs <= this.#walkTrace.record) {
      return;
    }
    this.#walkTrace.record = pairs;
    const top = [...visits].sort(([, a], [, b]) => b - a).slice(0, TRACE_TOP);
    this.#state.session.log(
      `trace flow-walk ${file} ${String(pairs)} pairs, widest worklist ${String(widest)}: ${top.map(([key, count]) => `${key} x${String(count)}`).join(", ")}`,
    );
  }

  // The steps one slot and value pair flows through, or null when the pair is itself a leaf.
  *#innerOperands(a: Type, b: Type): APIRequestGenerator<readonly Step[] | null> {
    const { checker } = this.#state.world;
    const slotArms = yield* this.#objectArms(a, b);
    if (slotArms !== null) {
      return slotArms.map((arm) => ({ slot: arm, value: b, at: { kind: "arm", name: "" } }));
    }
    if (a.isTypeReference() && b.isTypeReference() && (yield* checker.isArrayLikeType.gen(a)) && (yield* checker.isArrayLikeType.gen(b))) {
      const [elementA] = yield* checker.getTypeArguments.gen(a);
      const [elementB] = yield* checker.getTypeArguments.gen(b);
      return elementA !== undefined && elementB !== undefined ? [{ slot: elementA, value: elementB, at: { kind: "element", name: "" } }] : [];
    }
    const instances = yield* this.#sameGeneric(a, b);
    if (instances !== null) {
      const variances = instances.generic === undefined ? [] : yield* this.#variances.of(instances.generic);
      return instances.value.flatMap((argument, at): Step[] => {
        const slotArgument = instances.slot[at];
        if (slotArgument === undefined) {
          return [];
        }
        const step = { kind: "argument", name: String(at) } as const;
        const forward = { slot: slotArgument, value: argument, at: step };
        const backward = { slot: argument, value: slotArgument, at: step };
        const variance = variances[at - instances.outer] ?? "none";
        if (variance === "in") {
          return [backward];
        }
        return variance === "both" ? [forward, backward] : [forward];
      });
    }
    const counterparts = yield* this.#libraryCounterparts(a, b);
    if (counterparts !== null) {
      return counterparts;
    }
    const [slotSignature] = yield* a.getCallSignatures.gen();
    const [valueSignature] = yield* b.getCallSignatures.gen();
    return slotSignature !== undefined && valueSignature !== undefined ? yield* this.#signatureOperands(slotSignature, valueSignature) : null;
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

  // Two instantiations of one generic, an interface's or an alias's (`Token<A>` into `Token<B>`): their type arguments,
  // with the generic whose variance decides which way each pair flows. An interface or class declared inside a generic
  // function leads its type arguments with the enclosing type parameters it references (`outer` of them), which its
  // declaration does not list; an alias's arguments are its own.
  *#sameGeneric(
    slot: Type,
    value: Type,
  ): APIRequestGenerator<{
    readonly slot: readonly Type[];
    readonly value: readonly Type[];
    readonly generic: NativeSymbol | undefined;
    readonly outer: number;
  } | null> {
    const { checker } = this.#state.world;
    if (slot.isTypeReference() && value.isTypeReference()) {
      const [slotTarget, valueTarget] = [yield* slot.getTarget.gen(), yield* value.getTarget.gen()];
      if (slotTarget.id === valueTarget.id) {
        return {
          slot: yield* checker.getTypeArguments.gen(slot),
          value: yield* checker.getTypeArguments.gen(value),
          generic: yield* slotTarget.getSymbol.gen(),
          outer: (yield* slotTarget.getOuterTypeParameters.gen()).length,
        };
      }
    }
    const [slotAlias, valueAlias] = [yield* slot.getAliasSymbol.gen(), yield* value.getAliasSymbol.gen()];
    if (slotAlias === undefined || valueAlias === undefined || slotAlias.id !== valueAlias.id) {
      return null;
    }
    return { slot: yield* slot.getAliasTypeArguments.gen(), value: yield* value.getAliasTypeArguments.gen(), generic: slotAlias, outer: 0 };
  }

  // Two library generics of different targets (a `Map` into a `ReadonlyMap` slot): no member of either is ours to pair,
  // so each slot member's type flows from the value's same-named member, which carries the type arguments through.
  *#libraryCounterparts(slot: Type, value: Type): APIRequestGenerator<readonly Step[] | null> {
    const { checker } = this.#state.world;
    if (!(slot.isTypeReference() && value.isTypeReference())) {
      return null;
    }
    const targets = [yield* (yield* slot.getTarget.gen()).getSymbol.gen(), yield* (yield* value.getTarget.gen()).getSymbol.gen()];
    if (targets.some((symbol) => symbol === undefined || symbol.declarations.some((handle) => this.#state.resolver.ours(handle)))) {
      return null;
    }
    // members pair by their escaped name, which a well-known symbol key (`[Symbol.iterator]`) has and a display name lacks
    const valueMembers = new Map((yield* checker.getPropertiesOfType.gen(value)).map((member) => [member.escapedName, member] as const));
    const out: Step[] = [];
    for (const member of yield* checker.getPropertiesOfType.gen(slot)) {
      const counterpart = valueMembers.get(member.escapedName);
      if (counterpart !== undefined) {
        out.push({
          slot: yield* checker.getTypeOfSymbol.gen(member),
          value: yield* checker.getTypeOfSymbol.gen(counterpart),
          at: { kind: "member", name: member.name },
        });
      }
    }
    return out;
  }

  *#signatureOperands(slot: Signature, value: Signature): APIRequestGenerator<readonly Step[]> {
    const { checker } = this.#state.world;
    const slotParameters = yield* slot.getParameters.gen();
    const valueParameters = yield* value.getParameters.gen();
    const out: Step[] = [];
    for (let at = 0; at < Math.min(slotParameters.length, valueParameters.length); at++) {
      const slotParameter = slotParameters[at];
      const valueParameter = valueParameters[at];
      if (slotParameter !== undefined && valueParameter !== undefined) {
        out.push({
          slot: yield* checker.getTypeOfSymbol.gen(valueParameter),
          value: yield* checker.getTypeOfSymbol.gen(slotParameter),
          at: { kind: "parameter", name: String(at) },
        });
      }
    }
    out.push({ slot: yield* slot.getReturnType.gen(), value: yield* value.getReturnType.gen(), at: { kind: "return", name: "" } });
    return out;
  }

  // One level of member pairs: each slot member and the value's same-named member. A pair's own member types flow as a
  // pair too (a port's op filled by another service's op), so the next level is returned until no pair is new.
  #linkLevel(raw: readonly FlowPair[], file: string): readonly FlowPair[] {
    const { state } = this;
    const unwrapped = state.batch(raw.map((pair) => this.#operands(pair, file))).flat();
    // a value landing, after unwrapping, in a slot that names none of its members escapes whole, as an opaque argument does
    this.#opaqueOf(unwrapped.map(({ slot }) => slot));
    const pairs: FlowPair[] = [];
    const escaping: FlowPair[] = [];
    for (const pair of unwrapped) {
      if (this.#opaque.get(pair.slot.id) !== true) {
        pairs.push(pair);
      } else if (!(isPrimitive(pair.value) || this.#heldTypes.has(pair.value.id))) {
        escaping.push(pair);
      }
    }
    const outcomes = this.#pairDestinations(escaping);
    const checked = this.#pairCheckedTypes(escaping);
    this.#recordSinks(file, escaping);
    for (const [y, pair] of escaping.entries()) {
      for (const type of [pair.value, ...(checked[y] === undefined ? [] : [checked[y]])]) {
        this.#settle(type, false, { file, at: pair.site }, outcomes[y]);
      }
    }
    // a union value fills the slot arm by arm: each object arm pairs its own members with the slot's
    const unions = pairs.filter(({ value }) => value.isUnionType());
    const arms = state.batch(unions.map(({ value }) => constituentsOf(value)));
    const expanded = [
      ...pairs.filter(({ value }) => !value.isUnionType()),
      ...unions.flatMap(({ slot, site }, y) => (arms[y] ?? []).filter((arm) => !isPrimitive(arm)).map((value) => ({ slot, value, site }))),
    ];
    const fresh = [...new Map(expanded.filter((pair) => this.#isFresh(pair)).map((pair) => [this.#pairKey(pair), pair])).values()];
    for (const pair of fresh) {
      this.#done.add(this.#pairKey(pair));
    }
    return this.#memberPairs(fresh, file);
  }

  // One matched member pair: the slot's declarations flow from the value's; a slot with none leaves the value member read.
  #memberFlow(slots: readonly DeclKey[], values: readonly DeclKey[], file: string, site: number): void {
    const checked = this.#checkSites.has(site);
    for (const slot of slots) {
      for (const value of values) {
        if (slot !== value) {
          this.#state.flow(slot, value);
        }
        if (slot !== value && checked) {
          this.#state.checks.push([value, slot]);
        }
      }
    }
    if (slots.length === 0) {
      this.#state.roleAll(values, "read", file, site);
    }
  }

  // A Drizzle row's members have no declaration: each such member stands for its table's column, so the slot member it
  // fills flows from the column, and a read of the slot reads the column.
  #withRowColumns(
    matched: readonly { readonly holder: Type; readonly value: NativeSymbol }[],
    valueDecls: readonly (readonly DeclKey[])[],
  ): readonly (readonly DeclKey[])[] {
    const { state } = this;
    const rowMembers = matched.flatMap(({ holder, value }, y) =>
      (valueDecls[y]?.length ?? 0) === 0 && value.declarations.length === 0 ? [{ y, holder, value }] : [],
    );
    const columns = state.batch(rowMembers.map(({ holder, value }) => rowColumns(state.world, holder, value.name)));
    const out = [...valueDecls];
    for (const [x, { y }] of rowMembers.entries()) {
      out[y] = state.declarations(columns[x] ?? []).flat();
    }
    return out;
  }

  #isFresh(pair: FlowPair): boolean {
    const { slot, value } = pair;
    return slot.id !== value.id && !isPrimitive(slot) && !isPrimitive(value) && !this.#done.has(this.#pairKey(pair));
  }

  // A slot with a string index signature takes the value's members it does not name as entries. An index signature whose
  // value type holds members, as `Record<string, Copy>` does, types each entry: the entry's value pairs with that type,
  // returned for the next level. Any other entry is open: whoever reads the slot reads it by no name, so it escapes with
  // everything it holds, chased from the value at the pair's site.
  #indexedEscapes(fresh: readonly FlowPair[], slotMembers: readonly (readonly NativeSymbol[])[], file: string): readonly FlowPair[] {
    const { state } = this;
    const { checker } = state.world;
    const indexed = state.batch(fresh.map(({ slot }) => stringIndexedArms(checker, slot)));
    const open = fresh.flatMap((pair, x) => ((indexed[x]?.length ?? 0) > 0 ? [{ pair, named: new Set((slotMembers[x] ?? []).map(({ name }) => name)) }] : []));
    const values = state.batch(open.map(({ pair }) => state.membersOf(pair.value)));
    const unnamed = open.map(({ named }, y) => (values[y] ?? []).filter(({ name }) => !named.has(name)));
    const types = state.batch(unnamed.map((members) => allOf(members.map((member) => checker.getTypeOfSymbol.gen(member)))));
    const entryTypes = state.batch(open.map(({ pair }) => indexValueTypes(state, pair.slot)));
    const typed = open.flatMap(({ pair }, y) =>
      (entryTypes[y] ?? []).flatMap((slot) => (types[y] ?? []).filter((value) => !isPrimitive(value)).map((value) => ({ slot, value, site: pair.site }))),
    );
    const decls = unnamed.map((members) => state.declarations(members).flat());
    const escaping = open.flatMap(({ pair }, y) => ((decls[y]?.length ?? 0) === 0 || (entryTypes[y]?.length ?? 0) > 0 ? [] : [{ pair, y }]));
    const outcomes = this.#pairDestinations(escaping.map(({ pair }) => pair));
    this.#recordSinks(
      file,
      open.map(({ pair }) => pair),
    );
    for (const [z, { pair, y }] of escaping.entries()) {
      const held = (types[y] ?? []).filter((type) => !isPrimitive(type)).flatMap((type) => this.deepMembers(type, false));
      const { read, send } = outcomes[z] ?? UNCLASSIFIED_OUTCOME;
      const members = [...(decls[y] ?? []), ...held];
      if (read) {
        state.roleAll(members, "read", file, pair.site);
      }
      if (send !== null) {
        state.escapeAll(members, { file, at: pair.site }, send);
      }
    }
    return typed;
  }

  /** Link the carried pairs found while other files were walked, under their own files, until none is new. */
  settle(): void {
    for (let late = this.#late; late.length > 0; late = this.#late) {
      this.#late = [];
      this.#state.count("carried settle passes");
      const byFile = Map.groupBy(late, ({ file }) => file);
      for (const [file, pairs] of byFile) {
        this.link(
          pairs.map(({ slot, value, site }) => ({ slot, value, site })),
          file,
        );
      }
    }
  }

  // A value keeps every member it holds when a slot type that names fewer takes it, so each pair records the slot the
  // value filled and, when the value holds members of ours the slot does not name, the value as carried by the slot
  // type. A value carried by a type fills every slot that type fills: those carried pairs are returned when they land in
  // `file` and kept for settle otherwise. A carried pair walks like any pair, so a slot naming a carried member pairs it
  // and carries it no further, and one naming fewer carries the value on.
  #carry(fresh: readonly FlowPair[], slotMembers: readonly (readonly NativeSymbol[])[], file: string): readonly FlowPair[] {
    const carries = this.#carriesMembers(fresh, slotMembers);
    const out: FlowPair[] = [];
    const offer = (pair: Filled): void => {
      const key = `${String(pair.slot.id)}>${String(pair.value.id)}`;
      if (this.#carriedPairs.has(key) || pair.slot.id === pair.value.id) {
        return;
      }
      this.#carriedPairs.add(key);
      this.#state.count("carried pairs");
      if (pair.file === file) {
        out.push({ slot: pair.slot, value: pair.value, site: pair.site });
      } else {
        this.#late.push(pair);
      }
    };
    for (const [x, { slot, value, site }] of fresh.entries()) {
      const filled = this.#filled.get(value.id) ?? new Map<number, Filled>();
      this.#filled.set(value.id, filled);
      if (!filled.has(slot.id)) {
        filled.set(slot.id, { slot, value, site, file });
        for (const carried of this.#carried.get(value.id)?.values() ?? []) {
          offer({ slot, value: carried, site, file });
        }
      }
      const carriedBy = this.#carried.get(slot.id) ?? new Map<number, Type>();
      if (carries[x] !== true || carriedBy.has(value.id)) {
        continue;
      }
      this.#carried.set(slot.id, carriedBy.set(value.id, value));
      for (const target of this.#filled.get(slot.id)?.values() ?? []) {
        offer({ ...target, value });
      }
    }
    return out;
  }

  // Whether each pair's value holds a member declared in the tree that its slot does not name.
  #carriesMembers(fresh: readonly FlowPair[], slotMembers: readonly (readonly NativeSymbol[])[]): readonly boolean[] {
    const { state } = this;
    const valueMembers = state.batch(fresh.map(({ value }) => state.membersOf(value)));
    const excess = fresh.map((_, x) => {
      const named = new Set((slotMembers[x] ?? []).map(({ name }) => name));
      return (valueMembers[x] ?? []).filter(({ name }) => !named.has(name));
    });
    const ours = state.declarations(excess.flat());
    let at = 0;
    return excess.map((members) => {
      const found = ours.slice(at, at + members.length).some((decls) => decls.length > 0);
      at += members.length;
      return found;
    });
  }

  #memberPairs(fresh: readonly FlowPair[], file: string): readonly FlowPair[] {
    const { state } = this;
    const { checker } = state.world;
    const slotMembers = state.batch(fresh.map(({ slot }) => state.membersOf(slot)));
    const entries = this.#indexedEscapes(fresh, slotMembers, file);
    const asks = fresh.flatMap((pair, x) => (slotMembers[x] ?? []).map((member) => ({ pair, member, x })));
    const valueMembers = state.batch(asks.map(({ pair, member }) => checker.getPropertyOfType.gen(pair.value, member.name)));
    const matched = asks.flatMap(({ pair, member, x }, y) => {
      const valueMember = valueMembers[y];
      return valueMember === undefined || valueMember.id === member.id ? [] : [{ holder: pair.value, slot: member, value: valueMember, site: pair.site, x }];
    });
    // a Drizzle row slot's members declare nothing, as the row type remaps its table's columns: each stands for its
    // column, so a row handed to a row slot hands each column on and reads none (resolve.ts `rows`)
    const tables = state.resolver.rows();
    const rowSlots = slotMembers.map((members) => (tables.size === 0 ? undefined : tables.get(signatureOf(members.map(({ name }) => name)))));
    const slotDecls = state.declarations(matched.map(({ slot }) => slot)).map((decls, y) => {
      const entry = matched[y];
      return decls.length > 0 || entry === undefined ? decls : [...(rowSlots[entry.x]?.get(entry.slot.name) ?? [])];
    });
    const valueDecls = this.#withRowColumns(matched, state.declarations(matched.map(({ value }) => value)));
    for (const y of matched.keys()) {
      this.#memberFlow(slotDecls[y] ?? [], valueDecls[y] ?? [], file, matched[y]?.site ?? 0);
    }
    // a pair goes deeper when either member is declared in the tree: the walk follows the value's own members, a library
    // slot names its nested fields as it names its top ones (an SDK block's `source.data`), and a library value filling
    // our slot runs the library's code behind each of our function members, so their parameters pair with the library's
    const deeper = matched.filter(({ slot, value, site }, y) => {
      const key = `${declarationKeys(slot).join(",")}>${declarationKeys(value).join(",")}${this.#checkSites.has(site) ? CHECKED_MARK : ""}`;
      if ((valueDecls[y]?.length ?? 0) + (slotDecls[y]?.length ?? 0) === 0 || this.#doneMembers.has(key)) {
        return false;
      }
      this.#doneMembers.add(key);
      return true;
    });
    const types = state.batch(deeper.flatMap(({ slot, value }) => [checker.getTypeOfSymbol.gen(slot), checker.getTypeOfSymbol.gen(value)]));
    return [
      ...entries,
      ...this.#carry(fresh, slotMembers, file),
      ...deeper.flatMap(({ site }, y) => {
        const slot = types[2 * y];
        const value = types[2 * y + 1];
        return slot !== undefined && value !== undefined && slot.id !== value.id && !isPrimitive(slot) ? [{ slot, value, site }] : [];
      }),
    ];
  }
}

// Whether a signature's parameter at `index` is typed by a type parameter the signature declares itself, so the call infers it.
function* ownTypeParameter(state: GraphState, signature: Signature, index: number): APIRequestGenerator<boolean> {
  return yield* ownedTypeParameter(signature, declaredParameterType(state, signature, index));
}

// Whether a declared type is a type parameter the signature declares itself.
function* ownedTypeParameter(signature: Signature, declaredType: APIRequestGenerator<Type | undefined>): APIRequestGenerator<boolean> {
  const target = (yield* signature.getTarget.gen()) ?? signature;
  const declared = yield* declaredType;
  return declared?.isTypeParameter() === true && (target.typeParameters ?? []).includes(declared.id);
}

/** A value a literal argument holds: the call, the argument's index and the property names down to the value. */
interface HeldInArgument {
  readonly call: CallExpression | NewExpression;
  readonly index: number;
  readonly path: readonly string[];
}

// The call argument a value sits in, through the object literals that hold it as a property's value.
function argumentHolding(value: Expression): HeldInArgument | undefined {
  const path: string[] = [];
  let at: Node = value;
  while (isPropertyAssignment(at.parent) && isObjectLiteralExpression(at.parent.parent)) {
    const name = keyText(at.parent.name);
    if (name === undefined) {
      return undefined;
    }
    path.unshift(name);
    at = at.parent.parent;
  }
  const call = at.parent;
  if (path.length === 0 || !(isCallExpression(call) || isNewExpression(call))) {
    return undefined;
  }
  const index = (call.arguments ?? []).findIndex((argument) => argument.pos === at.pos);
  return index < 0 ? undefined : { call, index, path };
}

// The type a signature's declaration gives a property inside its parameter, before instantiation: the first type
// parameter on the way down, since everything below it is the argument's own inferred type.
function* declaredPropertyType(state: GraphState, signature: Signature, { index, path }: HeldInArgument): APIRequestGenerator<Type | undefined> {
  const { checker } = state.world;
  let at = yield* declaredParameterType(state, signature, index);
  for (const name of path) {
    if (at === undefined || at.isTypeParameter()) {
      return at;
    }
    const property = yield* checker.getPropertyOfType.gen(yield* checker.getNonNullableType.gen(at), name);
    at = property === undefined ? undefined : yield* withoutNullish(checker, yield* checker.getTypeOfSymbol.gen(property));
  }
  return at;
}

// A declared type without its `null` and `undefined` arms. An unconstrained type parameter is kept as itself, where the
// checker's non-nullable form (`V & {}`) would no longer read as a type parameter.
function* withoutNullish(checker: Checker, type: Type): APIRequestGenerator<Type> {
  const arms = (yield* constituentsOf(type)).filter((arm) => !(hasFlag(arm.flags, TypeFlags.Undefined) || hasFlag(arm.flags, TypeFlags.Null)));
  const [only] = arms;
  return arms.length === 1 && only?.isTypeParameter() === true ? only : yield* checker.getNonNullableType.gen(type);
}

// The type a signature's declaration gives its parameter at `index`, before instantiation.
function* declaredParameterType(state: GraphState, signature: Signature, index: number): APIRequestGenerator<Type | undefined> {
  const target = (yield* signature.getTarget.gen()) ?? signature;
  const parameter = (yield* target.getParameters.gen())[index];
  return parameter === undefined ? undefined : yield* state.world.checker.getTypeOfSymbol.gen(parameter);
}

// The values an expression can be: each branch of a conditional, through parentheses, else the expression itself.
function branchesOf(value: Expression): readonly Expression[] {
  let at = value;
  while (isParenthesizedExpression(at)) {
    at = at.expression;
  }
  return isConditionalExpression(at) ? [...branchesOf(at.whenTrue), ...branchesOf(at.whenFalse)] : [value];
}

const calleeName = (call: Node | undefined): Node | undefined => {
  if (call === undefined || !isCallExpression(call)) {
    return undefined;
  }
  return isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
};

/** Whether a declaration sits inside our own `declare global` block. */
export function insideGlobalScope(node: Node | undefined): boolean {
  for (let up = node?.parent; up !== undefined; up = up.parent) {
    if (isModuleDeclaration(up) && "text" in up.name && up.name.text === GLOBAL_SCOPE) {
      return true;
    }
  }
  return false;
}
