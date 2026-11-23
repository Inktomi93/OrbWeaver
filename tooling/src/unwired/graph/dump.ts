// A built graph written to disk and read back, so a run can analyse a graph without building one. The dump names when
// and from which commit it was built; a dump in another format is refused, never read field by field.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deserialize, serialize } from "node:v8";
import { z } from "zod";
import { runGit } from "../../floor/git/git.ts";
import type { Graph } from "./build.ts";
import { NO_ROLES, withRoles } from "./roles.ts";
import type { GraphFacts } from "./state.ts";

/** The dump format this build writes and reads. Raise it with any change to {@link Graph} or {@link GraphFacts}. */
export const GRAPH_DUMP_FORMAT = 15;

/** When and from which commit a dump was built; `head` is null outside a git checkout. */
export interface DumpStamp {
  readonly builtAt: string;
  readonly head: string | null;
}

const DumpEnvelope = z.object({
  format: z.number(),
  builtAt: z.string(),
  head: z.string().nullable(),
  // The format stamp is the graph's shape check: this module is the dump's only writer.
  graph: z.custom<Graph>((value) => typeof value === "object" && value !== null && "facts" in value && "files" in value),
});

// The facts alone, without the build state's world: each field named, so a new fact fails here until it is carried.
const plainFacts = (facts: GraphFacts): GraphFacts => ({
  decls: facts.decls,
  run: facts.run,
  typ: facts.typ,
  doc: facts.doc,
  roles: facts.roles,
  roleSites: facts.roleSites,
  parameterHomes: facts.parameterHomes,
  copyOnlyWrites: facts.copyOnlyWrites,
  flows: facts.flows,
  columnFlows: facts.columnFlows,
  doorReads: facts.doorReads,
  unseenCalls: facts.unseenCalls,
  bindings: facts.bindings,
  unpairedReceivers: facts.unpairedReceivers,
  computedLoads: facts.computedLoads,
  unreadRouteParams: facts.unreadRouteParams,
  twins: facts.twins,
  overrides: facts.overrides,
  checks: facts.checks,
  derivations: facts.derivations,
  stateParts: facts.stateParts,
  cssNames: facts.cssNames,
  pins: facts.pins,
  danglingDocs: facts.danglingDocs,
  lostReads: facts.lostReads,
  counts: facts.counts,
  peaks: facts.peaks,
  roots: { modules: facts.roots.modules, keepTags: facts.roots.keepTags },
  unionHomes: facts.unionHomes,
  inlineUnions: facts.inlineUnions,
  registrySites: facts.registrySites,
  serverNames: facts.serverNames,
  lostCauses: facts.lostCauses,
  libraryLandings: facts.libraryLandings,
});

function headOf(root: string): string | null {
  const git = runGit(root, ["rev-parse", "HEAD"]);
  return git.status === 0 ? git.stdout.trim() : null;
}

/** Write `graph` to `path`, stamped with `builtAt` and the checkout's HEAD. */
export function writeDump(path: string, root: string, graph: Graph, builtAt: Date): DumpStamp {
  const stamp = { builtAt: builtAt.toISOString(), head: headOf(root) };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serialize({ format: GRAPH_DUMP_FORMAT, ...stamp, graph: { ...graph, facts: plainFacts(graph.facts) } }));
  return stamp;
}

/** The graph a dump holds, its role sets interned again as a build interns them.
 *  @throws When the dump was written in another format. */
export function readDump(path: string): { readonly graph: Graph; readonly stamp: DumpStamp } {
  const { format, builtAt, head, graph } = DumpEnvelope.parse(deserialize(readFileSync(path)));
  if (format !== GRAPH_DUMP_FORMAT) {
    throw new Error(`${path}: a graph dump in format ${String(format)}; this build reads format ${String(GRAPH_DUMP_FORMAT)}. Build it again with --dump.`);
  }
  const roles = new Map(
    [...graph.facts.roles].map(
      ([key, { product, other, write }]) => [key, { product: withRoles(NO_ROLES, product), other: withRoles(NO_ROLES, other), write }] as const,
    ),
  );
  return { graph: { ...graph, facts: { ...graph.facts, roles } }, stamp: { builtAt, head } };
}
