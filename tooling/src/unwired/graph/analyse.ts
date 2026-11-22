// Liveness and member roles over a built graph: what runs from the product's roots, what only a ruling keeps, what only
// operators, consumers or tests reach, what nothing reaches, and what the product does to each live member.
//
// Owner rulings this module holds:
// - Escape is a send, not a read: a field counts as read only where a receiver reads it by name. A member only sent is
//   member-sent-only, apart from member-write-only and member-untouched; a flow carries a send on as a send.
// - Test reads only annotate: what tests, tooling and scripts do to a member never moves it out of a product bucket.
// - A doc link keeps nothing alive; a `{@link}` to a name declared outside the file's scope is legal and listed as
//   information (.claude/rules/comments.md cite grammar), and one declared nowhere is stale.
// - A shape-only member (an exclusion marker, a `satisfies` check's type literal) and a member the plugin SDK publishes
//   are judged by nothing.
import { SyntaxKind } from "@typescript/native/ast";
import { publishedAt } from "../plugin-surface.ts";
import type { Graph } from "./build.ts";
import type { DeclKey } from "./resolve.ts";
import type { Role } from "./roles.ts";
import { READS } from "./roles.ts";
import type { RootKind } from "./roots.ts";
import type { DeclInfo, GraphKey } from "./sites.ts";
import { moduleKey } from "./sites.ts";
import type { Edges, MemberRoles } from "./state.ts";

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

const PLUGIN_CONTRACT = "packages/contracts/src/plugin/";
const PUBLISHED_SDK = "packages/plugin-sdk/";
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
const UNNAMED = "{…}";
// A written `data-*` member reaches the DOM as an attribute: a send whose receiver reads it by attribute name (a CSS
// selector, a test locator). A written `aria-*` member is read by the platform's accessibility tree.
const DATA_ATTRIBUTE = /^data-/u;
const ARIA_ATTRIBUTE = /^aria-/u;
const READ_OUTSIDE = "read outside the product: tests or tooling";

const readsIn = (roles: ReadonlySet<Role>): boolean => [...READS].some((read) => roles.has(read));

const isAmbient = (file: string): boolean => file.endsWith(".d.ts") && !file.startsWith(PUBLISHED_SDK);

function reach(starts: Iterable<GraphKey>, maps: readonly Edges[]): ReadonlySet<GraphKey> {
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
    this.#members(settleRoles(this.#graph));
    this.#stateTuples(settleRoles(this.#graph));
    this.#ambient();
    this.#variants();
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
    };
  }

  #push(bucket: Bucket, finding: Finding): void {
    this.#out.get(bucket)?.push(finding);
  }

  get #state(): Graph["state"] {
    return this.#graph.state;
  }

  // What a ruling keeps, each with its reason: published or trusted exports, a knip keep tag, a production
  // compile-time pin, and a plugin contract type the SDK publishes by name.
  #rulings(): void {
    const state = this.#state;
    for (const { decl, kind, why } of this.#graph.kept) {
      this.#why.set(decl, `${kind}: ${why}`);
    }
    for (const [key, info] of state.decls) {
      const tag = info.docTags.find((name) => state.roots.keepTags.includes(name));
      if (tag !== undefined) {
        this.#why.set(key, `tag @${tag}`);
      }
      if (info.top && TYPE_UNITS.has(info.kind) && info.file.startsWith(PLUGIN_CONTRACT) && this.#graph.sdk.names.has(info.name)) {
        this.#why.set(key, `published SDK type ${info.name}`);
      }
    }
    for (const pin of state.pins) {
      if (state.product(state.decls.get(pin)?.file ?? "")) {
        this.#why.set(pin, "compile-time pin (a binding unread on purpose)");
      }
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
      any: reach(this.#graph.files.filter((file) => !state.product(file)).map(moduleKey), [run, typ]),
    };
  }

  // A named top-level unit the product ships: what liveness judges.
  #judgedUnit(info: DeclInfo): boolean {
    return info.top && this.#state.product(info.file) && info.name !== UNNAMED && (RUNTIME_UNITS.has(info.kind) || TYPE_UNITS.has(info.kind));
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
        const info = state.decls.get(source as DeclKey);
        return info === undefined ? source : `${info.file}:${info.name}`;
      });
    return from.length === 0 ? null : `doc links from ${from.join(", ")}`;
  }

  #docLinks(): void {
    const state = this.#state;
    const declared = new Set([...state.decls.values()].map(({ name }) => name));
    for (const { file, line, text } of state.danglingDocs.filter(({ file: at }) => state.product(at))) {
      this.#push(declared.has(text) ? "doc-link-cross-scope" : "doc-link-stale", { label: `${file}:${String(line)} ${text}`, key: null, note: null });
    }
  }

  #members(roles: ReadonlyMap<DeclKey, MemberRoles>): void {
    const state = this.#state;
    const liveTyped = reach([...this.#modules(["product", "published"]), ...this.#why.keys()], [state.run, state.typ]);
    const dispatched = dispatchedMembers(state.run, state.decls);
    for (const [key, info] of state.decls) {
      if (!(MEMBERS.has(info.kind) && state.product(info.file) && liveTyped.has(key)) || info.shapeOnly !== null || this.#published(info)) {
        continue;
      }
      const role = roles.get(key);
      const bucket = memberBucket(info.name, role, info.kind === SyntaxKind.EnumMember || dispatched.has(key));
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
    for (let at = this.#state.decls.get(holder as DeclKey); at !== undefined; at = at.top ? undefined : this.#state.decls.get(at.holder as DeclKey)) {
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
    for (const { decl, part, file, line } of state.stateParts.filter(({ file: at }) => state.product(at))) {
      const product = roles.get(decl)?.product ?? new Set<Role>();
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
    const state = this.#state;
    for (const axis of this.#graph.variants.filter(({ dynamic, file }) => !dynamic && state.product(file))) {
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

// Where the product first wrote a member, and whether another world reads it.
function memberNote(role: MemberRoles | undefined): string | null {
  if (role === undefined) {
    return null;
  }
  const notes = [role.write === null ? null : `written at ${role.write}`, [...role.other].some((r) => r !== "write") ? READ_OUTSIDE : null];
  return notes.filter((note) => note !== null).join("; ") || null;
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
  const product = role?.product ?? new Set<Role>();
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
function dispatchedMembers(run: Edges, decls: ReadonlyMap<DeclKey, DeclInfo>): ReadonlySet<GraphKey> {
  const out = new Set<GraphKey>();
  for (const [from, targets] of run) {
    for (const target of targets) {
      const info = decls.get(target as DeclKey);
      if (info !== undefined && MEMBERS.has(info.kind) && info.holder !== from) {
        out.add(target);
      }
    }
  }
  return out;
}

/**
 * Member roles carried to a fixpoint: a read of a slot member reads the value member that filled it, a send of it sends
 * that member on, and a write of the value member fills the slot. A zod twin is a flow both ways, so its two halves end
 * with one role set.
 */
export function settleRoles(graph: Graph): ReadonlyMap<DeclKey, MemberRoles> {
  const { state } = graph;
  const roles = new Map([...state.roles].map(([key, value]) => [key, { product: new Set(value.product), other: new Set(value.other), write: value.write }]));
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
function roleLinks(state: Graph["state"]): { readonly readTo: ReadonlyMap<DeclKey, DeclKey[]>; readonly writeTo: ReadonlyMap<DeclKey, DeclKey[]> } {
  const readTo = new Map<DeclKey, DeclKey[]>();
  const writeTo = new Map<DeclKey, DeclKey[]>();
  const link = (map: Map<DeclKey, DeclKey[]>, from: DeclKey, to: DeclKey): void => {
    map.set(from, [...(map.get(from) ?? []), to]);
  };
  for (const [slot, values] of state.flows) {
    for (const value of values) {
      link(readTo, slot as DeclKey, value as DeclKey);
      link(writeTo, value as DeclKey, slot as DeclKey);
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
  const target = roles.get(key) ?? { product: new Set<Role>(), other: new Set<Role>(), write: null };
  const before = target.product.size + target.other.size;
  for (const role of add.product) {
    target.product.add(role);
  }
  for (const role of add.other) {
    target.other.add(role);
  }
  target.write ??= add.product.length > 0 ? add.write : null;
  roles.set(key, target);
  return target.product.size + target.other.size !== before;
}
