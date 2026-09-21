// cycles + aliases — the module-graph rot lenses.
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit } from "../contract/types.ts";
import { emit, hitOf } from "../lib/emit.ts";
import { scanCorpus } from "../lib/ledger.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

/** RESOLVED intra-package file graph: edges via getModuleSpecifierSourceFile (relative, #alias,
 *  `@orb` subpath all resolve) — needs the types:true arm. */
function resolvedGraph(project: SourceCorpus, prefix: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const sf of project.getSourceFiles()) {
    const from = sf.getFilePath();
    if (!from.includes(prefix)) {
      continue;
    }
    const edges: string[] = [];
    for (const d of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
      const target = d.getModuleSpecifierSourceFile()?.getFilePath();
      if (target?.includes(prefix) === true) {
        edges.push(target);
      }
    }
    graph.set(from, edges);
  }
  return graph;
}

interface ComponentWalk {
  nextIndex: number;
  readonly indexes: Map<string, number>;
  readonly lowLinks: Map<string, number>;
  readonly stack: string[];
  readonly onStack: Set<string>;
  readonly components: string[][];
}

function closeComponent(graph: Map<string, string[]>, node: string, state: ComponentWalk): void {
  const component: string[] = [];
  let member: string | undefined;
  do {
    member = state.stack.pop();
    if (member !== undefined) {
      state.onStack.delete(member);
      component.push(member);
    }
  } while (member !== node);
  if (component.length > 1 || (graph.get(node) ?? []).includes(node)) {
    state.components.push(component.toSorted((left, right) => left.localeCompare(right)));
  }
}

function walkComponent(graph: Map<string, string[]>, node: string, state: ComponentWalk): void {
  const index = state.nextIndex;
  state.nextIndex += 1;
  state.indexes.set(node, index);
  state.lowLinks.set(node, index);
  state.stack.push(node);
  state.onStack.add(node);
  for (const target of graph.get(node) ?? []) {
    if (!state.indexes.has(target)) {
      walkComponent(graph, target, state);
      state.lowLinks.set(node, Math.min(state.lowLinks.get(node) ?? index, state.lowLinks.get(target) ?? index));
    } else if (state.onStack.has(target)) {
      state.lowLinks.set(node, Math.min(state.lowLinks.get(node) ?? index, state.indexes.get(target) ?? index));
    }
  }
  if (state.lowLinks.get(node) === state.indexes.get(node)) {
    closeComponent(graph, node, state);
  }
}

function cyclicComponents(graph: Map<string, string[]>): string[][] {
  const state: ComponentWalk = {
    nextIndex: 0,
    indexes: new Map(),
    lowLinks: new Map(),
    stack: [],
    onStack: new Set(),
    components: [],
  };
  for (const node of graph.keys()) {
    if (!state.indexes.has(node)) {
      walkComponent(graph, node, state);
    }
  }
  return state.components.toSorted((left, right) => (left[0] ?? "").localeCompare(right[0] ?? ""));
}

/** Intra-package import cycles with FULL specifier resolution — cycles laundered through aliases or
 *  barrels are visible (a relative-only walk reports a false 0). */
export function cmdCycles(project: SourceCorpus, pkg: string, flags: Flags): void {
  const prefix = `/packages/${pkg}/src/`;
  // A package name this corpus holds no file for is a tool error, not "no cycles" — the graph would be
  // empty either way, and an empty graph reads exactly like a clean one.
  scanCorpus(project, { scope: prefix, label: `path:${prefix}` });
  const hits: Hit[] = [];
  for (const component of cyclicComponents(resolvedGraph(project, prefix))) {
    const first = project.getSourceFile(component[0] ?? "");
    if (first !== undefined) {
      const h = hitOf(first, "cyclic-component");
      h.text = component.map((p) => p.split(prefix)[1] ?? p).join(" ↔ ");
      hits.push(h);
    }
  }
  emit(hits, flags, `cycles ${pkg} (alias-resolved cyclic components)`);
}

function renameSpecifierHits(sf: SourceFile): Hit[] {
  const out: Hit[] = [];
  for (const d of sf.getImportDeclarations()) {
    for (const spec of d.getNamedImports()) {
      const alias = spec.getAliasNode();
      if (alias !== undefined) {
        const h = hitOf(spec, "rename-import");
        h.text = `${spec.getName()} as ${alias.getText()}`;
        out.push(h);
      }
    }
  }
  for (const d of sf.getExportDeclarations()) {
    for (const spec of d.getNamedExports()) {
      const alias = spec.getAliasNode();
      if (alias !== undefined) {
        const h = hitOf(spec, "rename-export");
        h.text = `${spec.getName()} as ${alias.getText()}`;
        out.push(h);
      }
    }
  }
  return out;
}

function rebindHits(sf: SourceFile): Hit[] {
  const out: Hit[] = [];
  for (const t of sf.getTypeAliases()) {
    const tn = t.getTypeNode();
    if (tn !== undefined && Node.isTypeReference(tn) && tn.getTypeArguments().length === 0) {
      const h = hitOf(t, "type-rename");
      h.text = `type ${t.getName()} = ${tn.getText()}`;
      out.push(h);
    }
  }
  for (const v of sf.getVariableDeclarations()) {
    const init = v.getInitializer();
    if (init !== undefined && Node.isIdentifier(init)) {
      const h = hitOf(v, "const-rename");
      h.text = `${v.isExported() ? "exported " : "local "}const ${v.getName()} = ${init.getText()}`;
      out.push(h);
    }
  }
  return out;
}

/** Rename-alias laundering: `import/export { X as Y }`, exported `const Y = X`, and bare `type Y = X`
 *  renames — the same declaration living under N public names. Scope with --in <pkg-substr>. */
export function cmdAliases(project: SourceCorpus, scope: string, flags: Flags): void {
  const hits: Hit[] = [];
  for (const sf of scanCorpus(project, { scope, label: `path:${scope === "" ? "(all)" : scope}` })) {
    hits.push(...renameSpecifierHits(sf), ...rebindHits(sf));
  }
  emit(hits, flags, `aliases ${scope}`);
}
