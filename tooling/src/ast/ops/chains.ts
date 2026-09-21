// chains: declarations whose ONLY life originates inside other DEAD declarations.
import type { Node } from "ts-morph";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { ChainAudit, ChainCandidate, ChainLink, Flags, Hit, Liveness } from "../contract/types.ts";
import { fileOfKey, isModuleScopeKey, topLevelDeclarations } from "../lib/edges.ts";
import { emit, hitOf } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { corpusPredicate, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { buildLiveness } from "../lib/liveness.ts";
import { isPublicTagged } from "../lib/public-markers.ts";
import { isTestPath, TEST_FILE_RE } from "../lib/root.ts";
import { ownExports, resolveScope } from "../lib/scope.ts";
import { relPath } from "./swallowed.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── chains: declarations whose ONLY life originates inside OTHER DEAD declarations ─────────────────────
// The owner-named ALIAS-RABBIT-HOLE class, and the one rot shape every lens above is structurally blind to.
// `orphans` asks "does ANYTHING reach this export?" and stops. So a chain — `export const Head = Mid` that
// nobody consumes, `export const Mid = Deep`, `export function Deep()` — reports as exactly ONE hit: the
// head. Delete the head, re-run, get one more hit; delete that, re-run, get one more. Three passes of a
// human's attention for one dead subtree, and only if they think to re-run at all. Worse, the shape hides in
// LIVE files: `Mid`'s file can be full of load-bearing code, so no FILE lens (`prodonly`, knip's unused-files,
// an iterated version of either) can see the dead declaration inside it. Measured on the planted 3-link probe
// before this verb existed: `orphans server` named `chainProbeHead` and neither of the two links below it.
//
// THE FIXPOINT. A declaration is ALIVE iff some ALIVE thing consumes it — which is circular on purpose and
// resolved by iterating from the roots outward until nothing new is marked:
//   ROOT 1 — a MODULE-SCOPE consumer. A side-effect position (`createRoot(el).render(<App/>)`, a top-level
//     registration call) belongs to no declaration and nothing can make it dead.
//   ROOT 2 — a consumer OUTSIDE the audited surface: a test path, or any file not under `packages/`
//     (scripts, tooling, config). `orphans` already counts test consumption as life; this lens must agree
//     with it or the two would nominate different code for deletion.
//   ROOT 3 — a reasoned `@public`-family declaration. This lens conservatively treats the author's claim as
//     alive; the push-tier orphan ratchet separately adjudicates whether the marker form and target are legal.
//     It is read HERE through the ratchet's own predicate ({@link isPublicTagged}) so the grammar cannot drift.
//   ROOT 4 — every export of `packages/ui/src`. R2 of docs/architecture/core/ui-package-design.md: a sealed
//     surface exists to be available, so "no consumer yet" is its designed state. The orphan ratchet exempts
//     the whole package for exactly this reason; a chain lens that did not would report the entire UI tree.
// Everything the roots transitively consume is alive. What is left is DEAD, in two shapes:
//   • NO consumer edge at all — an `orphans` hit (or an unused file-local). NOT this lens's business, and
//     deliberately not reported: two lenses reporting the same row is how a reader learns to skim both.
//   • ≥1 consumer edge, EVERY one of them dead — the finding. `X ← only via Y (dead) ← only via Z
//     (unconsumed)`, whole chain in one line, one run.
//
// THE FIX IS AT THE HEAD, and that is why this lens has NO marker of its own (owner-ratified 2026-08-03).
// Every chain terminates at an unconsumed head that `orphans` already reports and the ratchet already
// governs. Wire the head, delete the head and the chain with it, or give the head any reasoned `@public`-family
// claim — this lens keeps the last arm alive conservatively while the ratchet judges it separately. A
// per-link `@chain-ok:` would let somebody exempt a middle link while its head stays dead, which states
// nothing true.
//
// CANDIDATE lens, MANUAL tier — never a gate, for the same reason `swallowed`/`typeonly-alive`/`columns`
// aren't, plus one specific to the fixpoint: a consumer this substrate cannot SEE (a registry dispatched by a
// DB-sourced key, a `Trpc[…]` proxy consumption, a template-literal module id) makes a live declaration look
// chain-dead, and a fixpoint AMPLIFIES that — one missed edge can kill a whole subtree in the report. Read the
// call sites. The attribution errs alive wherever it can (see the substrate section's over-attribution note),
// which is the only safe direction for a lens that nominates code for deletion.
/** ONE declaration in the chain graph. `exported` separates the two remedies a reader has: an exported
 *  chain-dead symbol may have an unseen dynamic consumer, a file-local one essentially cannot. */
interface ChainNode {
  readonly name: string;
  readonly decl: Node;
  readonly exported: boolean;
}

/** The graph the fixpoint walks: every audited declaration, plus the edge map in BOTH directions (the
 *  forward index answers "who consumes me", the reverse one "what do I consume" — the fixpoint needs both). */
interface ChainGraph {
  readonly nodes: ReadonlyMap<string, ChainNode>;
  readonly consumers: ReadonlyMap<string, ReadonlySet<string>>;
  readonly consumes: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The workspace surface this lens audits: `packages/<pkg>/src/`. A file OUTSIDE it — a package's own
 *  `vite.config.ts`, a build script — is loaded BY TOOLING, never through an import edge any lens can see,
 *  so it is an unconditional alive root (same class as ROOT 2). Measured on the first audit: without this,
 *  `devCspMirror` and six siblings inside `packages/client/vite.config.ts` read as a dead chain hanging off
 *  the config's own (tooling-consumed, therefore "unconsumed") default export. */
export const PACKAGE_SRC_RE = /\/packages\/[^/]+\/src\//u;

/** The bare-scope prefix (every package) — the nodes are already `src`-only by {@link PACKAGE_SRC_RE}. */
export const PACKAGES_PREFIX = "/packages/";

/** The R2 sealed package: every export is an alive root (ROOT 4). */
const UI_SRC_PREFIX = "/packages/ui/src/";

/** How many links a rendered chain names before it stops — past this the reader has the shape already. */
const CHAIN_MAX_LINKS = 8;

/** How many chain-dead declarations the summary names per terminal head before collapsing to a count. */
const CHAIN_HEADS_SHOWN = 12;

/** Right-aligned width of the summary's per-head link count (the `columns` summary's COLUMN_COUNT_PAD). */
const CHAIN_COUNT_PAD = 4;

/** Is this consumer key outside the audited surface (a test, a script, a package's own build config)? ROOT 2. */
function isChainRootFile(filePath: string): boolean {
  return isTestPath(filePath) || !PACKAGE_SRC_RE.test(filePath);
}

/** Every audited declaration, keyed — plus the reverse edge index. Test files are not nodes (their
 *  declarations are roots, per ROOT 2), matching `orphans`' own rule. */
function buildChainGraph(project: SourceCorpus, live: Liveness): ChainGraph {
  const nodes = new Map<string, ChainNode>();
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!PACKAGE_SRC_RE.test(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    const exportedKeys = new Set<string>();
    for (const { decl } of ownExports(sf)) {
      exportedKeys.add(declKey(decl));
    }
    for (const { name, decl } of topLevelDeclarations(sf)) {
      const key = declKey(decl);
      nodes.set(key, { name, decl, exported: exportedKeys.has(key) });
    }
  }
  const consumes = new Map<string, Set<string>>();
  for (const [originKey, consumerKeys] of live.consumers) {
    for (const consumerKey of consumerKeys) {
      const set = consumes.get(consumerKey) ?? new Set<string>();
      set.add(originKey);
      consumes.set(consumerKey, set);
    }
  }
  return { nodes, consumers: live.consumers, consumes };
}

/** ROOT 1 + ROOT 2 — a consumer that is a module-scope side effect, or lives outside the audited surface
 *  (a test, a script, a package's own build config). Nothing the fixpoint does can make either dead. */
function isRootConsumerKey(consumerKey: string): boolean {
  return isModuleScopeKey(consumerKey) || isChainRootFile(fileOfKey(consumerKey));
}

/** ROOT 3 + ROOT 4 — a declaration carrying a reasoned `@public`-family claim (kept alive conservatively;
 *  legality belongs to the orphan ratchet) or an export of the R2-sealed `ui` package. */
function isRootDeclaration(node: ChainNode): boolean {
  return (node.exported && node.decl.getSourceFile().getFilePath().includes(UI_SRC_PREFIX)) || isPublicTagged(node.decl);
}

/** The seed set: every ROOT, before any propagation. */
function chainRootKeys(graph: ChainGraph): string[] {
  const roots: string[] = [];
  for (const consumerKeys of graph.consumers.values()) {
    roots.push(...[...consumerKeys].filter(isRootConsumerKey));
  }
  for (const [key, node] of graph.nodes) {
    if (isRootDeclaration(node)) {
      roots.push(key);
    }
  }
  return roots;
}

/** The fixpoint: seed the four roots, then mark everything an alive key consumes, until nothing new. */
function chainAliveKeys(graph: ChainGraph): Set<string> {
  const alive = new Set<string>();
  const stack: string[] = [];
  const seed = (key: string): void => {
    if (!alive.has(key)) {
      alive.add(key);
      stack.push(key);
    }
  };
  for (const root of chainRootKeys(graph)) {
    seed(root);
  }
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const originKey of (cur === undefined ? undefined : graph.consumes.get(cur)) ?? []) {
      seed(originKey);
    }
  }
  return alive;
}

/** `<repo-rel file>:<line>` for a graph key (the declaration's own position, or the file for a sentinel). */
function chainSiteOf(key: string, graph: ChainGraph): string {
  const node = graph.nodes.get(key);
  if (node === undefined) {
    return relPath(fileOfKey(key));
  }
  return `${relPath(node.decl.getSourceFile().getFilePath())}:${node.decl.getSourceFile().getLineAndColumnAtPos(node.decl.getStart()).line}`;
}

/** Walk UP from a chain-dead declaration through its dead consumers to the unconsumed head. At each step the
 *  dead consumers are sorted and the first UNSEEN one is followed — the `seen` guard is what makes a dead
 *  CYCLE (a mutually-referencing pair nothing else reaches) terminate instead of looping forever. */
function chainOf(startKey: string, graph: ChainGraph, alive: ReadonlySet<string>): ChainLink[] {
  const links: ChainLink[] = [];
  const seen = new Set<string>([startKey]);
  let cur = startKey;
  while (links.length < CHAIN_MAX_LINKS) {
    const dead = [...(graph.consumers.get(cur) ?? [])].filter((k) => !alive.has(k)).sort();
    const next = dead.find((k) => !seen.has(k));
    if (next === undefined) {
      break;
    }
    seen.add(next);
    links.push({
      name: graph.nodes.get(next)?.name ?? relPath(fileOfKey(next)),
      site: chainSiteOf(next, graph),
      terminal: (graph.consumers.get(next)?.size ?? 0) === 0,
      alternates: dead.length - 1,
    });
    cur = next;
  }
  return links;
}

/** Declarations of `inScope` that are DEAD but DO have consumer edges — every one of them dead too. Pure
 *  enumeration: no printing, no scope policy (the verb owns both), so the self-test drives the same function
 *  the CLI does. A dead declaration with NO consumer at all is an `orphans` hit and is deliberately absent
 *  from `candidates` — it is counted in `unconsumedHeads` instead, because it is where a reader FIXES. */
export function collectChainAudit(project: SourceCorpus, live: Liveness, inScope: (filePath: string) => boolean): ChainAudit {
  const graph = buildChainGraph(project, live);
  const alive = chainAliveKeys(graph);
  const candidates: ChainCandidate[] = [];
  let edges = 0;
  let unconsumedHeads = 0;
  for (const [key, node] of graph.nodes) {
    const consumers = graph.consumers.get(key);
    edges += consumers?.size ?? 0;
    const dead = !alive.has(key);
    if (dead && (consumers === undefined || consumers.size === 0)) {
      unconsumedHeads += 1;
      continue;
    }
    if (dead && inScope(node.decl.getSourceFile().getFilePath())) {
      candidates.push({ name: node.name, decl: node.decl, exported: node.exported, chain: chainOf(key, graph, alive) });
    }
  }
  return { candidates, declarations: graph.nodes.size, edges, unconsumedHeads };
}

/** The findings alone — the shape every caller but the CLI summary wants. */
export function collectChainCandidates(project: SourceCorpus, live: Liveness, inScope: (filePath: string) => boolean): readonly ChainCandidate[] {
  return collectChainAudit(project, live, inScope).candidates;
}

/** One rendered link: `only via <name> (dead|unconsumed[, +N more dead consumer(s)]) @ file:line`. */
function chainLinkText(link: ChainLink): string {
  const more = link.alternates > 0 ? `, +${link.alternates} more dead consumer(s)` : "";
  return `only via ${link.name} (${link.terminal ? "unconsumed" : "dead"}${more}) @ ${link.site}`;
}

export function chainHit(candidate: ChainCandidate): Hit {
  const rendered = candidate.chain.map(chainLinkText).join("  ←  ");
  // A chain whose last link is NOT terminal ran into the `seen` guard: the remaining consumers are already
  // named above it, i.e. the dead region is a CYCLE with no unconsumed head to fix at.
  const cycle = candidate.chain.at(-1)?.terminal === false ? "  ←  ↺ dead CYCLE (no unconsumed head — delete the region)" : "";
  const h = hitOf(candidate.decl, candidate.exported ? "chain-dead-export" : "chain-dead-local");
  h.text = `${candidate.name}  ←  ${rendered}${cycle}`;
  return h;
}

/** The deliverable above the hit list: how many chain-dead declarations hang off each UNCONSUMED HEAD —
 *  the rows a reader actually acts on, since fixing one head resolves every link under it. */
function printChainSummary(audit: ChainAudit): void {
  const { candidates } = audit;
  print(
    `chains: graph = ${audit.declarations} declaration(s) with ${audit.edges} consumption edge(s); ${audit.unconsumedHeads} of them are UNCONSUMED heads (the \`orphans\`/\`@public\` class — reported by that lens, not this one). A zero below means those heads have nothing dead hanging off them, NOT that the lens is blind.`,
  );
  const byHead = new Map<string, number>();
  let headless = 0;
  for (const candidate of candidates) {
    const head = candidate.chain.findLast((l) => l.terminal);
    if (head === undefined) {
      headless += 1;
      continue;
    }
    const label = `${head.name}  @ ${head.site}`;
    byHead.set(label, (byHead.get(label) ?? 0) + 1);
  }
  const exported = candidates.filter((c) => c.exported).length;
  print(
    `chains: ${candidates.length} chain-dead declaration(s) (${exported} exported, ${candidates.length - exported} file-local) hanging off ${byHead.size} unconsumed head(s)${headless === 0 ? "" : `, plus ${headless} in dead cycles with no head`}`,
  );
  const ranked = [...byHead.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [label, count] of ranked.slice(0, CHAIN_HEADS_SHOWN)) {
    print(`  ${String(count).padStart(CHAIN_COUNT_PAD)} link(s) ← head ${label}`);
  }
  if (ranked.length > CHAIN_HEADS_SHOWN) {
    print(`  … and ${ranked.length - CHAIN_HEADS_SHOWN} more head(s)`);
  }
}

/** Declarations whose ONLY life originates inside declarations that are themselves dead — the alias
 *  rabbit hole, reported as WHOLE chains in one run. Optional scope (a package name / path); bare = every
 *  package. No marker of its own: the fix (and any ratchet-adjudicated `@public` claim) lives at the head. */
export function cmdChains(project: SourceCorpus, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: PACKAGES_PREFIX, label: "(all packages)" } : resolveScope(project, arg, "chains");
  // The audited surface is `packages/*/src` non-test only (ROOT 2 makes everything else an alive root),
  // so the corpus fences match `buildChainGraph`'s own — the count and the graph agree by construction.
  const inScope = corpusPredicate(
    scanCorpus(project, {
      scope: scope.prefix,
      label: `path:${scope.prefix}`,
      skip: [SKIP_TEST_FILES, { reason: "out-of-scope", test: (fp) => !PACKAGE_SRC_RE.test(fp) }],
    }),
  );
  const live = buildLiveness(project, { edges: true });
  const audit = collectChainAudit(project, live, inScope);
  const { candidates } = audit;
  printChainSummary(audit);
  print(
    "chains is a CANDIDATE lens — it reports declarations whose ONLY consumers are THEMSELVES dead, as whole chains (`X ← only via Y (dead) ← only via Z (unconsumed)`). FIX AT THE HEAD: wire it, delete it, or add any reasoned `@public`-family claim — any makes every link below read alive here, which is why this lens has no per-link marker. This lens treats reasoned markers as provisional alive roots; the push-tier ratchet separately adjudicates their legality. VERIFY before acting: consumption attribution is syntactic and name-based inside a file, and a consumer this substrate cannot see (a registry keyed from the DB, a `Trpc[…]` proxy read, a template-literal module id) makes a LIVE declaration look chain-dead — a fixpoint amplifies one missed edge into a whole dead-looking subtree. Other alive roots are module-scope side effects, test/script consumers, and every `packages/ui/src` export (the R2 sealed surface).",
  );
  emit(candidates.map(chainHit), flags, `chains ${scope.label}`);
}
