// The graph's queries, over a fresh build or a dump: who uses a name, which files an edit to it impacts, what it
// reaches, and why it is live. Every walk ends on its seen-set, never at a depth.
//
// A name is `file:line` (the declaration on that line), a walked file (its module), `Owner.member` or a bare name
// (every declaration of it). Use edges are the run and type edges; `why` asks the product's roots and ruled keeps
// first, then the operator, consumer and trusted roots, then the files outside the product, and answers with the
// shortest chain from the first tier that reaches the name.
import { isProduction } from "../worlds.ts";
import { keptByRuling } from "./analyse.ts";
import type { Graph } from "./build.ts";
import { whyTarget } from "./options.ts";
import type { RootKind } from "./roots.ts";
import type { GraphKey } from "./sites.ts";
import { isDeclKey, moduleKey } from "./sites.ts";
import type { ReadonlyEdges } from "./state.ts";

export const QUERIES = ["why", "users", "impact", "reach"] as const;
export type Query = (typeof QUERIES)[number];

const EDGE_KINDS = ["run", "typ"] as const;
type EdgeKind = (typeof EDGE_KINDS)[number];

/** A node a walk met: its label, how many edges from a start, and the kind of the edge that first reached it. */
export interface QueryNode {
  readonly label: string;
  readonly depth: number;
  readonly via: EdgeKind;
}

/** A file an edit to the asked names can break: a user sits in it. */
export interface ImpactFile {
  readonly file: string;
  readonly product: boolean;
}

/** The chain that keeps a name live: the root it starts at, why that is a root, and each hop down to the name. */
export interface LiveChain {
  readonly start: string;
  readonly path: readonly { readonly label: string; readonly via: EdgeKind }[];
}

interface Asked {
  readonly asked: string;
  /** The declarations or modules the name matched; empty when it matched none. */
  readonly starts: readonly string[];
}

export type QueryAnswer =
  | (Asked & { readonly query: "users" | "reach"; readonly nodes: readonly QueryNode[] })
  | (Asked & { readonly query: "impact"; readonly files: readonly ImpactFile[]; readonly roots: readonly string[] })
  | (Asked & { readonly query: "why"; readonly chains: readonly LiveChain[] });

type Adjacency = ReadonlyMap<GraphKey, readonly { readonly to: GraphKey; readonly via: EdgeKind }[]>;

function adjacency(edges: Readonly<Record<EdgeKind, ReadonlyEdges>>, reverse: boolean): Adjacency {
  const out = new Map<GraphKey, { readonly to: GraphKey; readonly via: EdgeKind }[]>();
  for (const via of EDGE_KINDS) {
    for (const [from, targets] of edges[via]) {
      for (const to of targets) {
        const [at, next] = reverse ? [to, from] : [from, to];
        out.set(at, [...(out.get(at) ?? []), { to: next, via }]);
      }
    }
  }
  return out;
}

// A breadth-first walk from the starts, each node with the hop that first reached it.
function walk(
  starts: readonly GraphKey[],
  next: Adjacency,
): ReadonlyMap<GraphKey, { readonly from: GraphKey | null; readonly via: EdgeKind; readonly depth: number }> {
  const seen = new Map<GraphKey, { readonly from: GraphKey | null; readonly via: EdgeKind; readonly depth: number }>(
    starts.map((start) => [start, { from: null, via: "run", depth: 0 }]),
  );
  let level = [...new Set(starts)];
  for (let depth = 1; level.length > 0; depth += 1) {
    const reached: GraphKey[] = [];
    for (const at of level) {
      for (const { to, via } of next.get(at) ?? []) {
        if (!seen.has(to)) {
          seen.set(to, { from: at, via, depth });
          reached.push(to);
        }
      }
    }
    level = reached;
  }
  return seen;
}

// The tiers `why` asks in turn: the product's own roots and ruled keeps, the other roots, then the outside files.
const ROOT_TIERS = [0, 1] as const;
// Each root kind's tier, by type, so a new kind cannot fall out of `why`.
const ROOT_TIER: Readonly<Record<RootKind, (typeof ROOT_TIERS)[number]>> = { product: 0, published: 0, operator: 1, consumer: 1, trusted: 1 };

export class GraphQueries {
  readonly #graph: Graph;
  readonly #forward: Adjacency;
  readonly #backward: Adjacency;
  readonly #files: ReadonlySet<string>;

  constructor(graph: Graph) {
    this.#graph = graph;
    const { run, typ } = graph.facts;
    this.#forward = adjacency({ run, typ }, false);
    this.#backward = adjacency({ run, typ }, true);
    this.#files = new Set(graph.files);
  }

  answer(query: Query, names: readonly string[]): readonly QueryAnswer[] {
    return names.map((asked) => {
      const starts = this.#starts(asked);
      const base = { asked, starts: starts.map((key) => this.label(key)) };
      const answers: Readonly<Record<Query, () => QueryAnswer>> = {
        users: () => ({ ...base, query: "users", nodes: this.#closure(starts, this.#backward) }),
        reach: () => ({ ...base, query: "reach", nodes: this.#closure(starts, this.#forward) }),
        impact: () => ({ ...base, query: "impact", ...this.#impact(starts) }),
        why: () => ({ ...base, query: "why", chains: this.#why(starts) }),
      };
      return answers[query]();
    });
  }

  /** A node as a reader finds it: `file:line Owner.member` for a declaration, the file for a module. */
  label(key: GraphKey): string {
    if (!isDeclKey(key)) {
      return this.#moduleFile(key);
    }
    const info = this.#graph.facts.decls.get(key);
    if (info === undefined) {
      return key;
    }
    const owner = this.#owner(info.holder);
    return `${info.file}:${String(info.line)} ${owner === null ? "" : `${owner}.`}${info.name}`;
  }

  #moduleFile(key: GraphKey): string {
    return key.slice(moduleKey("").length);
  }

  #owner(holder: GraphKey): string | null {
    return isDeclKey(holder) ? (this.#graph.facts.decls.get(holder)?.name ?? null) : null;
  }

  #starts(asked: string): readonly GraphKey[] {
    if (this.#files.has(asked)) {
      return [moduleKey(asked)];
    }
    const target = whyTarget(asked);
    if (target === null) {
      return [];
    }
    return [...this.#graph.facts.decls]
      .filter(([, info]) =>
        target.kind === "site"
          ? info.file === target.file && info.line === target.line
          : info.name === target.name && (target.owner === null || this.#owner(info.holder) === target.owner),
      )
      .map(([key]) => key);
  }

  #closure(starts: readonly GraphKey[], next: Adjacency): readonly QueryNode[] {
    const own = new Set(starts);
    return [...walk(starts, next)]
      .filter(([key]) => !own.has(key))
      .map(([key, { depth, via }]) => ({ label: this.label(key), depth, via }))
      .sort((a, b) => a.depth - b.depth || a.label.localeCompare(b.label));
  }

  #impact(starts: readonly GraphKey[]): { readonly files: readonly ImpactFile[]; readonly roots: readonly string[] } {
    const users = [...walk(starts, this.#backward).keys()];
    const fileOf = (key: GraphKey): string => (isDeclKey(key) ? (this.#graph.facts.decls.get(key)?.file ?? "") : this.#moduleFile(key));
    const files = [...new Set(users.map(fileOf).filter((file) => file !== ""))].sort();
    const { modules } = this.#graph.facts.roots;
    return {
      files: files.map((file) => ({ file, product: isProduction(file) })),
      roots: files.filter((file) => modules.has(file)).map((file) => `${file} (${modules.get(file)?.kind ?? ""})`),
    };
  }

  #why(starts: readonly GraphKey[]): readonly LiveChain[] {
    const { modules } = this.#graph.facts.roots;
    const kept = keptByRuling(this.#graph);
    const tiers: readonly ReadonlyMap<GraphKey, string>[] = [
      ...ROOT_TIERS.map(
        (at) =>
          new Map<GraphKey, string>([
            ...[...modules]
              .filter(([, reason]) => ROOT_TIER[reason.kind] === at)
              .map(([file, reason]) => [moduleKey(file), `${reason.kind} root: ${reason.why}`] as const),
            ...(at === 0 ? [...kept] : []),
          ]),
      ),
      new Map(this.#graph.files.filter((file) => !isProduction(file)).map((file) => [moduleKey(file), "outside the product"] as const)),
    ];
    let left = [...starts];
    const chains: LiveChain[] = [];
    for (const roots of tiers) {
      if (left.length === 0) {
        break;
      }
      const reached = walk([...roots.keys()], this.#forward);
      for (const target of left.filter((key) => reached.has(key))) {
        const path: { readonly label: string; readonly via: EdgeKind }[] = [];
        let at = target;
        for (let hop = reached.get(at); hop?.from !== undefined && hop.from !== null; hop = reached.get(at)) {
          path.unshift({ label: this.label(at), via: hop.via });
          at = hop.from;
        }
        chains.push({ start: `${this.label(at)} (${roots.get(at) ?? ""})`, path });
      }
      left = left.filter((key) => !reached.has(key));
    }
    return chains;
  }
}
