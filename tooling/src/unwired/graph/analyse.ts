// Liveness and member roles over a built graph: what runs from the product's roots, what only a ruling keeps, what only
// operators, consumers or tests reach, what nothing reaches, and what the product does to each live member.
//
// Owner rulings this module holds (roles.ts states the escape and bump rulings; a flow here carries a send on as a send):
// - The dev bridge: a member of a value published through our own `declare global` global (`window.__orb`) that only
//   tooling or tests read is used, since that read reaches it through the global door; it counts as a product read.
// - Snap's reads count as product reads (state.ts holds the ruling).
// - Test reads only annotate otherwise: what tests, tooling and scripts do to a member never moves it out of a product bucket.
// - A doc link keeps nothing alive; a `{@link}` to a name declared outside the file's scope is legal and listed as
//   information (.claude/rules/comments.md cite grammar), and one declared nowhere is stale.
// - A class member is judged once its class is live; a member code we do not see calls (a platform-dispatched override,
//   a runtime protocol member) is reached, as is one an `extends` or `implements` clause dispatches.
// - A binding (a local, a parameter, an import binding) is unread when no name but its own reads it, judged in every
//   file as tsc's noUnusedLocals and noUnusedParameters judge it; one whose every reader is code nothing reaches, while
//   its own holder is reached, is read only by dead code and names that code.
// - A shape-only member (an exclusion marker, a `satisfies` check's type literal) and a member the plugin SDK publishes
//   are judged by nothing.
import { SyntaxKind } from "@typescript/native/ast";
import { PLUGIN_CONTRACT, PUBLISHED_SDK, publishedAt } from "../plugin-surface.ts";
import { isProduction } from "../worlds.ts";
import type { Graph } from "./build.ts";
import type { DeclKey } from "./resolve.ts";
import type { Role } from "./roles.ts";
import { NO_ROLES, READS, withRoles } from "./roles.ts";
import type { RootKind } from "./roots.ts";
import type { DeclInfo, GraphKey } from "./sites.ts";
import { isDeclKey, moduleKey, UNNAMED } from "./sites.ts";
import { SERVER_SOURCE } from "./spellings.ts";
import type { GraphFacts, MemberRoles, ReadonlyEdges, RegistrySite } from "./state.ts";

/** The buckets an analysis reports, in report order. */
export const BUCKETS = [
  "dead",
  "kept-by-ruling",
  "operator-only",
  "consumer-only",
  "test-only",
  "type-only",
  "variant-value-unused",
  "ambient-unused",
  "ambient-files-walked",
  "doc-link-cross-scope",
  "doc-link-stale",
  "member-write-only",
  "member-sent-only",
  "member-untouched",
  "state-never-read",
  "state-never-set",
  "binding-unread",
  "binding-read-only-by-dead",
  "registry-stale",
  "union-re-spells-a-home",
  "union-slice-of-a-home",
  "union-repeated-no-home",
] as const;
export type Bucket = (typeof BUCKETS)[number];

/** The member buckets verify.ts asks the language service about. */
export const MEMBER_BUCKETS = ["member-write-only", "member-sent-only", "member-untouched"] as const satisfies readonly Bucket[];
export type MemberBucket = (typeof MEMBER_BUCKETS)[number];

/** One reported entry: its label, the graph node it names (null for a file or a doc site) and a reason. */
export interface Finding {
  readonly label: string;
  readonly key: GraphKey | null;
  readonly note: string | null;
}

export type Analysis = { readonly [B in Bucket]: readonly Finding[] };

const RUNTIME_UNITS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.VariableDeclaration,
  SyntaxKind.EnumDeclaration,
]);
const TYPE_UNITS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeAliasDeclaration]);
const MEMBERS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.PropertySignature,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
  SyntaxKind.EnumMember,
]);
const AMBIENT_KINDS: ReadonlySet<SyntaxKind> = new Set([...TYPE_UNITS, ...RUNTIME_UNITS, SyntaxKind.PropertySignature, SyntaxKind.MethodSignature]);
// A written `data-*` member reaches the DOM as an attribute: a send whose receiver reads it by attribute name (a CSS
// selector, a test locator). A written `aria-*` member is read by the platform's accessibility tree.
const DATA_ATTRIBUTE = /^data-/u;
const ARIA_ATTRIBUTE = /^aria-/u;
// What another world's role does to a member, as its note says it; a write there adds nothing to a product bucket.
export const OUTSIDE_NOTES: Readonly<Record<Exclude<Role, "write">, string>> = {
  read: "read outside the product: tests or tooling",
  call: "read outside the product: tests or tooling",
  delete: "read outside the product: tests or tooling",
  escape: "sent outside the product: tests or tooling",
  key: "named as a key outside the product: tests or tooling",
};

const SERVER_DOMAIN = /^packages\/server\/src\/domain\/([^/]+)\//u;
const MEMBER_JOIN = "|";

// Why a registry site exempts nothing, or null while it names a live declaration.
function staleNote(
  { kind, target, name }: RegistrySite,
  known: { readonly declared: ReadonlySet<string>; readonly serverNames: ReadonlySet<string>; readonly domains: ReadonlySet<string> },
): string | null {
  if (kind === "site") {
    return known.declared.has(`${target}#${name}`) ? null : `${target} declares no ${name}`;
  }
  if (!known.domains.has(target)) {
    return `no server domain ${target}`;
  }
  return known.serverNames.has(name) ? null : `no server declaration ${name}`;
}

// Which union bucket an inline member set lands in, and why; null for a single site with no home to match.
function unionPlacement(
  home: readonly string[],
  slices: readonly string[],
  sites: number,
): { readonly bucket: "union-re-spells-a-home" | "union-slice-of-a-home" | "union-repeated-no-home"; readonly note: string } | null {
  if (home.length > 0) {
    return { bucket: "union-re-spells-a-home", note: `home ${home.join("; ")}` };
  }
  if (slices.length > 0) {
    return { bucket: "union-slice-of-a-home", note: `a slice of ${slices.join("; ")}` };
  }
  return sites > 1 ? { bucket: "union-repeated-no-home", note: "" } : null;
}

const readsIn = (roles: ReadonlySet<Role>): boolean => [...READS].some((read) => roles.has(read));

const isAmbient = (file: string): boolean => file.endsWith(".d.ts") && !file.startsWith(PUBLISHED_SDK);

function reach(starts: Iterable<GraphKey>, maps: readonly ReadonlyEdges[]): ReadonlySet<GraphKey> {
  const seen = new Set<GraphKey>();
  const queue: GraphKey[] = [];
  for (const start of starts) {
    if (!seen.has(start)) {
      seen.add(start);
      queue.push(start);
    }
  }
  for (let at = queue.pop(); at !== undefined; at = queue.pop()) {
    for (const map of maps) {
      for (const next of map.get(at) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }
  return seen;
}

/** What a ruling keeps, each with its reason: published or trusted exports, a knip keep tag, a production compile-time
 *  pin, and a plugin contract type the SDK publishes by name. */
export function keptByRuling(graph: Graph): ReadonlyMap<GraphKey, string> {
  const { facts } = graph;
  const why = new Map<GraphKey, string>();
  for (const { decl, kind, why: reason } of graph.kept) {
    why.set(decl, `${kind}: ${reason}`);
  }
  for (const [key, info] of facts.decls) {
    const tag = info.docTags.find((name) => facts.roots.keepTags.includes(name));
    if (tag !== undefined) {
      why.set(key, `tag @${tag}`);
    }
    if (info.top && TYPE_UNITS.has(info.kind) && info.file.startsWith(PLUGIN_CONTRACT) && graph.sdk.names.has(info.name)) {
      why.set(key, `published SDK type ${info.name}`);
    }
  }
  for (const pin of facts.pins) {
    if (isProduction(facts.decls.get(pin)?.file ?? "")) {
      why.set(pin, "compile-time pin (a binding unread on purpose)");
    }
  }
  return why;
}

/** Analyse a built graph into its buckets. */
export function analyse(graph: Graph): Analysis {
  return new Analyser(graph).run();
}

class Analyser {
  readonly #graph: Graph;
  readonly #why = new Map<GraphKey, string>();
  readonly #out = new Map<Bucket, Finding[]>(BUCKETS.map((bucket) => [bucket, []]));

  constructor(graph: Graph) {
    this.#graph = graph;
  }

  run(): Analysis {
    this.#rulings();
    this.#liveness();
    this.#docLinks();
    const roles = settleRoles(this.#graph);
    const liveTyped = this.#liveTyped();
    this.#members(roles, liveTyped);
    this.#bindings(liveTyped);
    this.#stateTuples(roles);
    this.#ambient();
    this.#variants();
    this.#registries();
    this.#unions();
    const result = (bucket: Bucket): readonly Finding[] => this.#out.get(bucket) ?? [];
    return {
      dead: result("dead"),
      "kept-by-ruling": result("kept-by-ruling"),
      "operator-only": result("operator-only"),
      "consumer-only": result("consumer-only"),
      "test-only": result("test-only"),
      "type-only": result("type-only"),
      "variant-value-unused": result("variant-value-unused"),
      "ambient-unused": result("ambient-unused"),
      "ambient-files-walked": result("ambient-files-walked"),
      "doc-link-cross-scope": result("doc-link-cross-scope"),
      "doc-link-stale": result("doc-link-stale"),
      "member-write-only": result("member-write-only"),
      "member-sent-only": result("member-sent-only"),
      "member-untouched": result("member-untouched"),
      "state-never-read": result("state-never-read"),
      "state-never-set": result("state-never-set"),
      "binding-unread": result("binding-unread"),
      "binding-read-only-by-dead": result("binding-read-only-by-dead"),
      "registry-stale": result("registry-stale"),
      "union-re-spells-a-home": result("union-re-spells-a-home"),
      "union-slice-of-a-home": result("union-slice-of-a-home"),
      "union-repeated-no-home": result("union-repeated-no-home"),
    };
  }

  // An ESLint registry site exempts nothing when its file declares no such name, or when its op's owner is no server
  // domain or no server declaration carries the op (tooling/src/eslint/port-ownership/ruled-ops.ts jointBatchRulingOf).
  #registries(): void {
    const state = this.#state;
    const declared = new Set([...state.decls.values()].map(({ file, name }) => `${file}#${name}`));
    const server = [...state.decls.values()].filter(({ file }) => file.startsWith(SERVER_SOURCE));
    const serverNames = new Set([...server.map(({ name }) => name), ...state.serverNames]);
    const domains = new Set(server.flatMap(({ file }) => SERVER_DOMAIN.exec(file)?.[1] ?? []));
    for (const site of state.registrySites) {
      const { file, line, target, name } = site;
      const note = staleNote(site, { declared, serverNames, domains });
      if (note !== null) {
        this.#push("registry-stale", { label: `${file}:${String(line)} ${target} ${name}`, key: null, note });
      }
    }
  }

  // An inline axis (spellings.ts): re-spelling a home's member set, a strict slice of a home, or repeated with no home.
  #unions(): void {
    const state = this.#state;
    const setOf = (members: readonly string[]): string => members.join(MEMBER_JOIN);
    const homes = Map.groupBy(state.unionHomes, ({ members }) => setOf(members));
    const homeSets = [...homes.values()].flatMap((list) =>
      list[0] === undefined ? [] : [{ members: new Set(list[0].members), where: list.map(({ where }) => where) }],
    );
    for (const [set, sites] of Map.groupBy(state.inlineUnions, ({ members }) => setOf(members))) {
      const members = sites[0]?.members ?? [];
      const home = homes.get(set)?.map(({ where }) => where) ?? [];
      const slices =
        home.length > 0
          ? []
          : homeSets.filter((candidate) => members.length < candidate.members.size && members.every((member) => candidate.members.has(member)));
      const placed = unionPlacement(
        home,
        slices.flatMap(({ where }) => where),
        sites.length,
      );
      if (placed === null) {
        continue;
      }
      for (const site of sites) {
        const others = sites.filter((other) => other !== site).map((other) => `${other.file}:${String(other.line)}`);
        const note = placed.bucket === "union-repeated-no-home" ? `also at ${others.join("; ")}` : placed.note;
        this.#push(placed.bucket, { label: `${site.file}:${String(site.line)} ${site.context} [${members.join(", ")}]`, key: null, note });
      }
    }
  }

  #push(bucket: Bucket, finding: Finding): void {
    this.#out.get(bucket)?.push(finding);
  }

  get #state(): GraphFacts {
    return this.#graph.facts;
  }

  #rulings(): void {
    for (const [key, why] of keptByRuling(this.#graph)) {
      this.#why.set(key, why);
    }
  }

  #modules(kinds: readonly RootKind[]): readonly GraphKey[] {
    return [...this.#state.roots.modules].filter(([, reason]) => kinds.includes(reason.kind)).map(([file]) => moduleKey(file));
  }

  #reached(): Reached & { readonly live: ReadonlySet<GraphKey> } {
    const state = this.#state;
    const { run, typ } = state;
    const product = this.#modules(["product", "published"]);
    const kept = [...product, ...this.#why.keys()];
    return {
      live: reach(product, [run]),
      liveKept: reach(kept, [run]),
      liveTyped: reach(kept, [run, typ]),
      productTyped: reach(product, [run, typ]),
      operator: reach(this.#modules(["operator"]), [run, typ]),
      consumer: reach(this.#modules(["consumer"]), [run, typ]),
      any: reach(this.#graph.files.filter((file) => !isProduction(file)).map(moduleKey), [run, typ]),
    };
  }

  // A named top-level unit the product ships: what liveness judges.
  #judgedUnit(info: DeclInfo): boolean {
    return info.top && isProduction(info.file) && info.name !== UNNAMED && (RUNTIME_UNITS.has(info.kind) || TYPE_UNITS.has(info.kind));
  }

  #liveness(): void {
    const reached = this.#reached();
    for (const [key, info] of this.#state.decls) {
      if (!this.#judgedUnit(info)) {
        continue;
      }
      const isType = TYPE_UNITS.has(info.kind);
      if (isType ? reached.productTyped.has(key) : reached.live.has(key)) {
        continue;
      }
      const bucket = livenessBucket(key, isType, reached, this.#why.has(key));
      const label = `${info.file}:${info.name}${isType ? " (type)" : ""}`;
      const note = bucket === "kept-by-ruling" ? (this.#why.get(key) ?? "reached from a ruled keep") : this.#docLinksTo(key);
      this.#push(bucket, { label, key, note });
    }
  }

  // A delete must fix every doc that points at what it removes.
  #docLinksTo(key: GraphKey): string | null {
    const state = this.#state;
    const from = [...state.doc]
      .filter(([, targets]) => targets.has(key))
      .map(([source]) => {
        const info = isDeclKey(source) ? state.decls.get(source) : undefined;
        return info === undefined ? source : `${info.file}:${info.name}`;
      });
    return from.length === 0 ? null : `doc links from ${from.join(", ")}`;
  }

  #docLinks(): void {
    const state = this.#state;
    const declared = new Set([...state.decls.values()].map(({ name }) => name));
    for (const { file, line, text } of state.danglingDocs.filter(({ file: at }) => isProduction(at))) {
      this.#push(declared.has(text) ? "doc-link-cross-scope" : "doc-link-stale", { label: `${file}:${String(line)} ${text}`, key: null, note: null });
    }
  }

  // What the product's roots and the ruled keeps reach through run and type edges: the code a member or a binding's
  // reader must sit in to count.
  #liveTyped(): ReadonlySet<GraphKey> {
    return reach([...this.#modules(["product", "published"]), ...this.#why.keys()], [this.#state.run, this.#state.typ]);
  }

  // A binding nothing reads, and one whose every reader is code nothing reaches while the binding's own holder is
  // reached: an import or a local the dead code alone keeps.
  #bindings(liveTyped: ReadonlySet<GraphKey>): void {
    for (const binding of this.#state.bindings) {
      const label = `${binding.file}:${String(binding.line)} ${binding.name}`;
      if (binding.readers.length === 0) {
        this.#push("binding-unread", { label, key: binding.key, note: binding.written ? `${binding.kind}, only written` : binding.kind });
      } else if (isProduction(binding.file) && liveTyped.has(binding.holder) && binding.readers.every((reader) => !liveTyped.has(reader))) {
        const note = `${binding.kind} read only by ${binding.readers.map((reader) => this.#readerLabel(reader)).join(", ")}`;
        this.#push("binding-read-only-by-dead", { label, key: binding.key, note });
      }
    }
  }

  #readerLabel(reader: GraphKey): string {
    const info = isDeclKey(reader) ? this.#state.decls.get(reader) : undefined;
    return info === undefined ? reader : `${info.file}:${String(info.line)} ${info.name}`;
  }

  #members(roles: ReadonlyMap<DeclKey, MemberRoles>, liveTyped: ReadonlySet<GraphKey>): void {
    const state = this.#state;
    const dispatched = dispatchedMembers(state.run, state.decls);
    for (const [key, info] of state.decls) {
      // a class member is judged once its class is live: nothing but a call or a read reaches a method
      const judged = liveTyped.has(key) || (isClassMember(info, state.decls) && liveTyped.has(info.holder));
      if (!(MEMBERS.has(info.kind) && isProduction(info.file) && judged) || info.shapeOnly !== null || this.#published(info)) {
        continue;
      }
      const role = roles.get(key);
      // the dev bridge ruling: another world's read through our own global door is a product read
      const doorRead = state.door.has(key) && readsIn(role?.other ?? NO_ROLES);
      const bucket = doorRead ? null : memberBucket(info.name, role, info.kind === SyntaxKind.EnumMember || dispatched.has(key) || state.unseenCalls.has(key));
      if (bucket !== null) {
        this.#push(bucket, { label: this.#memberLabel(info), key, note: memberNote(role) });
      }
    }
  }

  // A plugin contract member the SDK publishes is read by plugin authors outside the tree.
  #published(info: DeclInfo): boolean {
    return publishedAt(this.#graph.sdk, { file: info.file, home: info.surfacePath, member: info.name }) !== null;
  }

  // The dotted names of a member's holders, outermost first: `Home.outer` for a member of a nested literal.
  #home(holder: GraphKey): string {
    const names: string[] = [];
    const declOf = (key: GraphKey): DeclInfo | undefined => (isDeclKey(key) ? this.#state.decls.get(key) : undefined);
    for (let at = declOf(holder); at !== undefined; at = at.top ? undefined : declOf(at.holder)) {
      names.unshift(at.name);
    }
    return names.join(".");
  }

  #memberLabel(info: DeclInfo): string {
    const home = this.#home(info.holder);
    return `${info.file}:${home === "" ? "" : `${home}.`}${info.name}`;
  }

  // React state: a value nothing reads, or a setter nothing calls or hands on, never changes the screen.
  #stateTuples(roles: ReadonlyMap<DeclKey, MemberRoles>): void {
    const state = this.#state;
    for (const { decl, part, file, line } of state.stateParts.filter(({ file: at }) => isProduction(at))) {
      const product = roles.get(decl)?.product ?? NO_ROLES;
      const label = `${file}:${String(line)} ${part}`;
      if (part === "value" && !product.has("read")) {
        this.#push("state-never-read", { label, key: decl, note: null });
      }
      if (part === "setter" && !(product.has("read") || product.has("call"))) {
        this.#push("state-never-set", { label, key: decl, note: null });
      }
    }
  }

  // Our ambient declarations reached by nothing outside them: a global or module shape no code uses.
  #ambient(): void {
    const state = this.#state;
    const outside = [
      ...[...state.decls].filter(([, info]) => !isAmbient(info.file)).map(([key]) => key),
      ...this.#graph.files.filter((file) => !isAmbient(file)).map(moduleKey),
    ];
    const used = reach(outside, [state.run, state.typ]);
    for (const [key, info] of state.decls) {
      if (isAmbient(info.file) && AMBIENT_KINDS.has(info.kind) && !used.has(key)) {
        this.#push("ambient-unused", { label: this.#memberLabel(info), key, note: null });
      }
    }
    for (const file of new Set([...state.decls.values()].filter((info) => isAmbient(info.file)).map((info) => info.file))) {
      this.#push("ambient-files-walked", { label: file, key: null, note: null });
    }
  }

  // A variant value no consumer selects, on an axis no write fed a wide value; an axis wholly unused is reported whole.
  #variants(): void {
    for (const axis of this.#graph.variants.filter(({ dynamic, file }) => !dynamic && isProduction(file))) {
      const unused = axis.values.filter(({ used }) => !used).map(({ name }) => name);
      if (unused.length > 0) {
        const whole = unused.length === axis.values.length;
        this.#push("variant-value-unused", {
          label: `${axis.file}:${axis.name}${whole ? ` (whole axis: ${unused.join(", ")})` : ` = ${unused.join(", ")}`}`,
          key: axis.key,
          note: null,
        });
      }
    }
  }
}

type Reached = Readonly<Record<"liveKept" | "liveTyped" | "productTyped" | "operator" | "consumer" | "any", ReadonlySet<GraphKey>>>;

// Where the product first wrote a member, and what another world does to it.
function memberNote(role: MemberRoles | undefined): string | null {
  if (role === undefined) {
    return null;
  }
  const outside = new Set([...role.other].flatMap((other) => (other === "write" ? [] : [OUTSIDE_NOTES[other]])));
  const notes = [...(role.write === null ? [] : [`written at ${role.write}`]), ...outside];
  return notes.length === 0 ? null : notes.join("; ");
}

function livenessBucket(key: GraphKey, isType: boolean, reached: Reached, ruled: boolean): Bucket {
  if ((!isType && reached.liveKept.has(key)) || ruled || (isType && reached.liveTyped.has(key))) {
    return "kept-by-ruling";
  }
  if (!isType && reached.liveTyped.has(key)) {
    return "type-only";
  }
  if (reached.operator.has(key)) {
    return "operator-only";
  }
  if (reached.consumer.has(key)) {
    return "consumer-only";
  }
  return reached.any.has(key) ? "test-only" : "dead";
}

// The member bucket a member's product roles put it in, or null when the product reads it. A key use (an arm
// selector's pattern, a member `Pick` names) touches a member without reading its data.
function memberBucket(name: string, role: MemberRoles | undefined, reachedOtherwise: boolean): MemberBucket | null {
  const product = role?.product ?? NO_ROLES;
  if (readsIn(product) || (ARIA_ATTRIBUTE.test(name) && product.has("write"))) {
    return null;
  }
  if (product.has("escape") || (DATA_ATTRIBUTE.test(name) && product.has("write"))) {
    return "member-sent-only";
  }
  if (product.has("write")) {
    return "member-write-only";
  }
  return product.has("key") || reachedOtherwise ? null : "member-untouched";
}

// A member another declaration fills or calls through (heritage, a typed slot, a platform call) has a run edge in from
// something other than its own holder.
function dispatchedMembers(run: ReadonlyEdges, decls: ReadonlyMap<DeclKey, DeclInfo>): ReadonlySet<GraphKey> {
  const out = new Set<GraphKey>();
  for (const [from, targets] of run) {
    for (const target of targets) {
      const info = isDeclKey(target) ? decls.get(target) : undefined;
      if (info !== undefined && MEMBERS.has(info.kind) && info.holder !== from) {
        out.add(target);
      }
    }
  }
  return out;
}

const isClassMember = (info: DeclInfo, decls: ReadonlyMap<DeclKey, DeclInfo>): boolean =>
  isDeclKey(info.holder) && decls.get(info.holder)?.kind === SyntaxKind.ClassDeclaration;

/**
 * Member roles carried to a fixpoint: a read of a slot member reads the value member that filled it, a send of it sends
 * that member on, and a write of the value member fills the slot. A zod twin is a flow both ways, so its two halves end
 * with one role set.
 */
export function settleRoles(graph: Graph): ReadonlyMap<DeclKey, MemberRoles> {
  const { facts: state } = graph;
  const roles = new Map([...state.roles].map(([key, value]) => [key, { ...value }]));
  const { readTo, writeTo } = roleLinks(state);
  const queue = [...roles.keys()];
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    const current = roles.get(key);
    if (current === undefined) {
      continue;
    }
    const read = { product: carriedReads(current.product), other: carriedReads(current.other), write: current.write };
    const written = { product: carriedWrites(current.product), other: carriedWrites(current.other), write: current.write };
    queue.push(...(readTo.get(key) ?? []).filter((value) => carry(roles, value, read)));
    queue.push(...(writeTo.get(key) ?? []).filter((slot) => carry(roles, slot, written)));
  }
  return roles;
}

// Which members a role carries to: a read or send of a slot member goes to the value member that filled it, a write of
// the value member to the slot, and a zod twin's halves both ways.
function roleLinks(state: GraphFacts): { readonly readTo: ReadonlyMap<DeclKey, DeclKey[]>; readonly writeTo: ReadonlyMap<DeclKey, DeclKey[]> } {
  const readTo = new Map<DeclKey, DeclKey[]>();
  const writeTo = new Map<DeclKey, DeclKey[]>();
  const link = (map: Map<DeclKey, DeclKey[]>, from: DeclKey, to: DeclKey): void => {
    const list = map.get(from);
    if (list === undefined) {
      map.set(from, [to]);
    } else {
      list.push(to);
    }
  };
  for (const [slot, values] of state.flows) {
    for (const value of values) {
      link(readTo, slot, value);
      link(writeTo, value, slot);
    }
  }
  for (const [a, b] of state.twins) {
    link(readTo, a, b);
    link(readTo, b, a);
    link(writeTo, a, b);
    link(writeTo, b, a);
  }
  return { readTo, writeTo };
}

// A read carries as a read and a send as a send: an escape never becomes a read on the member it reaches.
const carriedReads = (side: ReadonlySet<Role>): readonly Role[] => [
  ...(readsIn(side) ? (["read"] as const) : []),
  ...(side.has("escape") ? (["escape"] as const) : []),
];
const carriedWrites = (side: ReadonlySet<Role>): readonly Role[] => (side.has("write") ? ["write"] : []);

// Add roles to a member; whether anything was new.
function carry(
  roles: Map<DeclKey, MemberRoles>,
  key: DeclKey,
  add: { readonly product: readonly Role[]; readonly other: readonly Role[]; readonly write: string | null },
): boolean {
  const target = roles.get(key) ?? { product: NO_ROLES, other: NO_ROLES, write: null };
  const { product, other } = target;
  target.product = withRoles(product, add.product);
  target.other = withRoles(other, add.other);
  target.write ??= add.product.length > 0 ? add.write : null;
  roles.set(key, target);
  return target.product !== product || target.other !== other;
}
