// dead: the composite evidence-ladder verdict for ONE symbol.
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { semanticReferenceNodes } from "../../_shared/ts-workspace.ts";
import type { DeadEvidence, DeadVerdict, Flags, Hit, Liveness, PublicMarker } from "../contract/types.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { scanCorpus, WHOLE_CORPUS } from "../lib/ledger.ts";
import { buildLiveness } from "../lib/liveness.ts";
import { publicMarkerOf } from "../lib/public-markers.ts";
import { isTestPath } from "../lib/root.ts";
import { declSite } from "./stringy.ts";
import { byProdFirst, collectSwallowedCandidates, relPath } from "./swallowed.ts";
import { declarationsNamed } from "./symbols.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

/** How many sites a `dead` row names before it collapses to a count. */
const DEAD_SITES_SHOWN = 3;

/** A file path plausibly VENDORED — third-party code kept in-tree. There is no structural marker for
 *  this in the repo (informational only, unlike `@public`/`@swallowed-ok`): a `/vendor/` directory, or
 *  the file's own header comment saying so (the `build-argv.ts` chat-template convention). Vendored code
 *  can still be genuinely dead — this arm is context for the reader, never a verdict input. */
const VENDORED_PATH_RE = /\/vendor\//u;

const VENDORED_HEADER_RE = /\bvendored\b/iu;

/** Application/package source is product evidence. Scripts, tooling, and package-root configs are useful
 *  consumers too, but get their own bucket so they cannot make an app-dead export read ALIVE. */
const PRODUCT_SOURCE_RE = /\/packages\/[^/]+\/src\//u;

/** `<repo-rel file>:<line>`, deduped and sorted prod-first, for a set of reference nodes. */
function siteListOf(nodes: readonly Node[]): string[] {
  return [...new Set(nodes.map((n) => `${relPath(n.getSourceFile().getFilePath())}:${n.getStartLineNumber()}`))].sort(byProdFirst);
}

/** `decl`'s own file lives under a `/vendor/` directory, or its FILE-level leading comment (the header,
 *  never the declaration's own leading comment) says "vendored". */
function isVendoredHome(decl: Node): boolean {
  if (VENDORED_PATH_RE.test(decl.getSourceFile().getFilePath())) {
    return true;
  }
  const header = decl.getSourceFile().getStatements()[0];
  return header?.getLeadingCommentRanges().some((range) => VENDORED_HEADER_RE.test(range.getText())) ?? false;
}

/** Raw COMMENT-TEXT mentions of `name` anywhere in `sf` — the one arm in this file that deliberately
 *  reads comments (every other lens excludes them by construction). Informational only: a TODO or design
 *  note naming a symbol is not liveness, but it is context a deletion call should read before acting.
 *  Comment ranges are deduped by start position — a range can attach as both one node's trailing trivia
 *  and the next node's leading trivia. */
function commentMentionsOf(sf: SourceFile, name: string): number {
  const seen = new Set<number>();
  let mentions = 0;
  sf.forEachDescendant((node) => {
    for (const range of [...node.getLeadingCommentRanges(), ...node.getTrailingCommentRanges()]) {
      if (seen.has(range.getPos())) {
        continue;
      }
      seen.add(range.getPos());
      if (range.getText().includes(name)) {
        mentions += 1;
      }
    }
  });
  return mentions;
}

/** The evidence-priority verdict (see the section header): ALIVE beats SWALLOWED-ONLY beats TAGGED-KEEP,
 *  then TOOL-ANCHORED / TEST-ANCHORED beat CANDIDATE. TAGGED-KEEP is this lens's marker bucket; the
 *  push-tier ratchet, not marker presence, decides whether that claim is legal. */
function deadVerdictOf(evidence: {
  readonly prodCount: number;
  readonly swallowed: boolean;
  readonly tagged: boolean;
  readonly toolCount: number;
  readonly testCount: number;
}): DeadVerdict {
  if (evidence.prodCount > 0) {
    return "ALIVE";
  }
  if (evidence.swallowed) {
    return "SWALLOWED-ONLY";
  }
  if (evidence.tagged) {
    return "TAGGED-KEEP";
  }
  if (evidence.toolCount > 0) {
    return "TOOL-ANCHORED";
  }
  return evidence.testCount > 0 ? "TEST-ANCHORED" : "CANDIDATE";
}

/** A reference that is only a re-export PASS-THROUGH (`export { X } from "./y"`, no `from`-less local
 *  re-export) — `findReferencesAsNodes` counts the specifier as a "reference", but `buildLiveness`
 *  deliberately does NOT (the MemoryLogEntry class: a file re-exporting its own symbol must not read as
 *  using it). Excluding this class is what keeps `dead`'s ALIVE verdict agreeing with `testonly`'s: a
 *  barrel that only re-exports a test-only export must not read as a production consumer of it. */
function isReexportPassthroughRef(ref: Node): boolean {
  const exportDecl = ref.getFirstAncestorByKind(SyntaxKind.ExportDeclaration);
  return exportDecl?.getModuleSpecifier() !== undefined;
}

/** The whole evidence ladder for ONE declaration. Reuses the SAME collector `swallowed` calls
 *  (`collectSwallowedCandidates`), scoped to just this declaration's own file, so the two lenses can
 *  never disagree about what "namespace-swallowed" means. */
export function deadEvidenceFor(project: SourceCorpus, decl: Node, name: string, live: Liveness): DeadEvidence {
  const sf = decl.getSourceFile();
  const refs = Node.isReferenceFindable(decl)
    ? semanticReferenceNodes(decl)
        .filter((r) => !(r.getSourceFile() === sf && r.getParent()?.getStart() === decl.getStart()))
        .filter((r) => !isReexportPassthroughRef(r))
    : [];
  const prodNodes = refs.filter((r) => PRODUCT_SOURCE_RE.test(r.getSourceFile().getFilePath()));
  const toolNodes = refs.filter((r) => {
    const fp = r.getSourceFile().getFilePath();
    return !(isTestPath(fp) || PRODUCT_SOURCE_RE.test(fp));
  });
  const externalToolRefs = live.externalConsumptions.filter((fact) => fact.targetKey === declKey(decl)).map((fact) => fact.consumerSite);
  const testNodes = refs.filter((r) => isTestPath(r.getSourceFile().getFilePath()));
  const swallowed = collectSwallowedCandidates(project, live, (fp) => fp === sf.getFilePath()).find((c) => declKey(c.decl) === declKey(decl));
  const publicMarker = publicMarkerOf(decl);
  return {
    verdict: deadVerdictOf({
      prodCount: prodNodes.length,
      swallowed: swallowed !== undefined,
      tagged: publicMarker !== undefined,
      toolCount: toolNodes.length + externalToolRefs.length,
      testCount: testNodes.length,
    }),
    prodRefs: siteListOf(prodNodes).slice(0, DEAD_SITES_SHOWN),
    prodCount: prodNodes.length,
    toolRefs: [...siteListOf(toolNodes), ...externalToolRefs].slice(0, DEAD_SITES_SHOWN),
    toolCount: toolNodes.length + externalToolRefs.length,
    testRefs: siteListOf(testNodes).slice(0, DEAD_SITES_SHOWN),
    testCount: testNodes.length,
    swallowedSites: swallowed?.sites ?? [],
    publicMarker,
    vendored: isVendoredHome(decl),
    commentMentions: commentMentionsOf(sf, name),
  };
}

/** `<name>` for a `twin`/`future`/`bare` marker — the one field each kind carries. */
function publicMarkerText(marker: PublicMarker | undefined): string {
  if (marker === undefined) {
    return "none";
  }
  return marker.kind === "twin" ? `twin — ${marker.value}` : `${marker.kind} — ${marker.reason}`;
}

/** `N (site, site, … +M more)` — the `dead` table's reference-count cell. */
function deadRefsCell(count: number, sites: readonly string[]): string {
  if (count === 0) {
    return "0";
  }
  const more = count > sites.length ? ` +${count - sites.length} more` : "";
  return `${count} (${sites.join(", ")}${more})`;
}

/** `  <label> <value>` — the `dead` table's fixed left-column width. */
const DEAD_LABEL_PAD = 20;

function deadRow(label: string, value: string): string {
  return `  ${label.padEnd(DEAD_LABEL_PAD)} ${value}`;
}

function printDeadEvidence(name: string, decl: Node, evidence: DeadEvidence, flags: Flags): void {
  narrate(flags, `dead ${name} @ ${declSite(decl)}`);
  narrate(flags, deadRow("production refs:", deadRefsCell(evidence.prodCount, evidence.prodRefs)));
  narrate(flags, deadRow("tool/script refs:", deadRefsCell(evidence.toolCount, evidence.toolRefs)));
  narrate(flags, deadRow("test-only refs:", deadRefsCell(evidence.testCount, evidence.testRefs)));
  const swallowedCell =
    evidence.swallowedSites.length === 0 ? "no" : `YES — namespace-swallowed by ${evidence.swallowedSites.slice(0, DEAD_SITES_SHOWN).join(", ")}`;
  narrate(flags, deadRow("swallowed:", swallowedCell));
  narrate(flags, deadRow("@public marker:", publicMarkerText(evidence.publicMarker)));
  narrate(flags, deadRow("vendored home:", evidence.vendored ? "yes (informational)" : "no"));
  narrate(flags, deadRow("comment mentions:", `${evidence.commentMentions} (informational — raw comment text, never liveness)`));
  narrate(flags, deadRow("VERDICT:", evidence.verdict));
}

/** A composite evidence-ladder verdict for ONE symbol: production refs / test-only refs / namespace-
 *  swallowed consumption / the `@public` marker / a vendored-file home / raw comment mentions, then a
 *  verdict — ALIVE / TOOL-ANCHORED / TEST-ANCHORED / SWALLOWED-ONLY / TAGGED-KEEP / CANDIDATE. CANDIDATE lens — see the
 *  section header above. Multiple declarations of the same name (a collision) are each classified. */
export function cmdDead(project: SourceCorpus, name: string, flags: Flags): void {
  const decls = declarationsNamed(scanCorpus(project, WHOLE_CORPUS), name);
  if (decls.length === 0) {
    narrate(flags, `dead ${name}: no declaration found — try \`pnpm ast ident ${name}\``);
    emit([], flags, `dead ${name}`);
    return;
  }
  const live = buildLiveness(project);
  const hits: Hit[] = [];
  for (const decl of decls) {
    const evidence = deadEvidenceFor(project, decl, name, live);
    printDeadEvidence(name, decl, evidence, flags);
    const h = hitOf(decl, `dead-${evidence.verdict.toLowerCase()}`);
    h.text = `${name}  —  ${evidence.verdict}  —  ${h.text}`;
    hits.push(h);
  }
  narrate(
    flags,
    'dead is a CANDIDATE lens — an evidence-ladder verdict for ONE symbol (product refs / tool-script refs / test-only refs / namespace-swallowed consumption / the @public marker / a vendored-file home / raw comment mentions). TAGGED-KEEP records an unadjudicated marker claim; the push-tier ratchet decides whether it is legal. "Unwired ≠ worthless" (CLAUDE.md "Build the full shape"): the verdict is a human\'s, never a delete signal.',
  );
  emit(hits, flags, `dead ${name} (${decls.length} declaration(s))`);
}
