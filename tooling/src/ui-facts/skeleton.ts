// Surface skeletons: the ordered tree of templates, composites and primitives per surface file, props and text ignored.
// Raw elements are transparent (their children hoist), so two surfaces that differ only in wrapper divs match.
import ts from "typescript";
import type { Elem, FileFacts } from "../eslint/index.ts";
import { listSlotSurfaces } from "../eslint/index.ts";

/** Levels of included elements kept below a root; deeper elements are dropped from the fingerprint. */
const SKELETON_DEPTH = 4;
const TOP_DIFF = 6;

const TEMPLATE_TAGS = new Set([
  "ListPage",
  "EditorPage",
  "ContextTabBody",
  "DetailHeader",
  "MemberDrillHeader",
  "LibrarySurfaceShell",
  "LibraryListRows",
  "LibraryListFrame",
  "LibraryListLayout",
  "QueryBoundary",
]);

interface Skel {
  readonly token: string;
  readonly kids: readonly Skel[];
}

interface SkeletonMember {
  readonly path: string;
  readonly section: string;
  /** The frame: the template tree alone, or the root tokens when the file renders no template. Families group on it. */
  readonly fingerprint: string;
  /** The whole skeleton down to the depth cap. */
  readonly full: string;
  readonly tokens: readonly string[];
}

interface SkeletonOutlier {
  readonly member: SkeletonMember;
  /** The nearest common fingerprint, or null when the cohort has none. */
  readonly nearest: string | null;
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

export interface SkeletonCohort {
  readonly name: string;
  readonly members: readonly SkeletonMember[];
  /** Fingerprints held by two or more members, biggest first. */
  readonly common: readonly { readonly fingerprint: string; readonly count: number; readonly paths: readonly string[] }[];
  readonly outliers: readonly SkeletonOutlier[];
}

function tokenOf(elem: Elem): string | null {
  switch (elem.kind) {
    case "ui":
      return `P:${elem.tag}`;
    case "composite":
      return `${TEMPLATE_TAGS.has(elem.tag) ? "T" : "C"}:${elem.tag}`;
    case "local":
      return TEMPLATE_TAGS.has(elem.tag) ? `T:${elem.tag}` : "L";
    case "raw":
      return null;
  }
}

function collect(node: ts.Node, byNode: ReadonlyMap<ts.Node, Elem>, depth: number): readonly Skel[] {
  const out: Skel[] = [];
  ts.forEachChild(node, (child) => {
    const elem = ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) ? byNode.get(child) : undefined;
    const token = elem === undefined ? null : tokenOf(elem);
    if (token === null) {
      out.push(...collect(child, byNode, depth));
    } else {
      out.push({ token, kids: depth + 1 >= SKELETON_DEPTH ? [] : collect(child, byNode, depth + 1) });
    }
  });
  return out;
}

function render(skel: Skel): string {
  return skel.kids.length === 0 ? skel.token : `${skel.token}(${renderForest(skel.kids)})`;
}

/** Consecutive identical siblings collapse to `x*`: a row repeated three times is one shape. */
function renderForest(forest: readonly Skel[]): string {
  const parts: string[] = [];
  let run = 0;
  const rendered = forest.map(render);
  rendered.forEach((text, index) => {
    run += 1;
    if (rendered[index + 1] !== text) {
      parts.push(run > 1 ? `${text}*` : text);
      run = 0;
    }
  });
  return parts.join(",");
}

const isTemplate = (skel: Skel): boolean => skel.token.startsWith("T:");

/** Templates keep their nesting; every other element hoists its templates up a level. */
function templatesOf(forest: readonly Skel[]): readonly Skel[] {
  return forest.flatMap((skel) => (isTemplate(skel) ? [{ token: skel.token, kids: templatesOf(skel.kids) }] : templatesOf(skel.kids)));
}

function frameOf(forest: readonly Skel[]): string {
  const templates = templatesOf(forest);
  return templates.length > 0 ? renderForest(templates) : `roots: ${renderForest(forest.map((skel) => ({ token: skel.token, kids: [] })))}`;
}

/** The skeleton of one file, or null when it renders no template, composite or primitive. */
function skeletonOf(facts: FileFacts): SkeletonMember | null {
  const sf = facts.source.sf;
  if (sf === null) {
    return null;
  }
  const forest = collect(sf, new Map(facts.elems.map((elem) => [elem.element, elem])), 0);
  if (forest.length === 0) {
    return null;
  }
  const fingerprint = frameOf(forest);
  const full = forest.map((tree) => renderForest([tree])).join(" ; ");
  return { path: facts.source.path, section: facts.source.section, fingerprint, full, tokens: fingerprint.match(/[TCPL](?::[A-Za-z]+)?/gu) ?? [] };
}

function multisetDiff(from: readonly string[], minus: readonly string[]): string[] {
  const left = [...minus];
  const out: string[] = [];
  for (const token of from) {
    const at = left.indexOf(token);
    if (at === -1) {
      out.push(token);
    } else {
      left.splice(at, 1);
    }
  }
  return out;
}

function similarity(a: readonly string[], b: readonly string[]): number {
  const shared = a.length - multisetDiff(a, b).length;
  const union = a.length + b.length - shared;
  return union === 0 ? 1 : shared / union;
}

const clip = (tokens: readonly string[]): readonly string[] =>
  tokens.length <= TOP_DIFF ? tokens : [...tokens.slice(0, TOP_DIFF), `(+${tokens.length - TOP_DIFF} more)`];

function cohortOfSkeletons(name: string, members: readonly SkeletonMember[]): SkeletonCohort {
  const byFingerprint = new Map<string, SkeletonMember[]>();
  for (const member of members) {
    byFingerprint.set(member.fingerprint, [...(byFingerprint.get(member.fingerprint) ?? []), member]);
  }
  const common = [...byFingerprint.entries()]
    .filter(([, held]) => held.length >= 2)
    .map(([fingerprint, held]) => ({ fingerprint, count: held.length, paths: held.map((member) => member.path) }))
    .sort((a, b) => b.count - a.count || a.fingerprint.localeCompare(b.fingerprint));
  const outliers = members
    .filter((member) => (byFingerprint.get(member.fingerprint)?.length ?? 0) < 2)
    .map((member): SkeletonOutlier => {
      const scored = common
        .map((entry) => ({ entry, score: similarity(member.tokens, byFingerprint.get(entry.fingerprint)?.[0]?.tokens ?? []) }))
        .sort((a, b) => b.score - a.score || b.entry.count - a.entry.count);
      const best = scored[0]?.entry;
      const bestTokens = best === undefined ? [] : (byFingerprint.get(best.fingerprint)?.[0]?.tokens ?? []);
      return {
        member,
        nearest: best?.fingerprint ?? null,
        added: best === undefined ? [] : clip(multisetDiff(member.tokens, bestTokens)),
        removed: best === undefined ? [] : clip(multisetDiff(bestTokens, member.tokens)),
      };
    });
  return { name, members, common, outliers };
}

/** Which skeleton cohort a client file belongs to, or null. The LIST panes are `listSlots`, the surfaces a definition
 *  mounts in its `list` slot ({@link listSlotSurfaces}). Context cohort members render a body; `context-tabs-panel` and
 *  `refinery-context-tabs` host or wire bodies and render no layout of their own. */
export function skeletonCohortOf(path: string, listSlots: ReadonlySet<string>): string | null {
  if (listSlots.has(path)) {
    return "surface:list";
  }
  if (/^packages\/client\/src\/features\/[^/]+\/surfaces\/[^/]+\.tsx$/u.test(path)) {
    return "surface:other";
  }
  return /^packages\/client\/src\/features\/[^/]+\/components\/(?:context-tabs|[a-z-]*-context-body)\.tsx$/u.test(path) ? "context-tab" : null;
}

export function buildSkeletons(all: readonly FileFacts[]): readonly SkeletonCohort[] {
  const byCohort = new Map<string, SkeletonMember[]>();
  const listSlots = listSlotSurfaces(all);
  for (const facts of all) {
    const cohort = skeletonCohortOf(facts.source.path, listSlots);
    const skeleton = cohort === null ? null : skeletonOf(facts);
    if (cohort !== null && skeleton !== null) {
      byCohort.set(cohort, [...(byCohort.get(cohort) ?? []), skeleton]);
    }
  }
  return [...byCohort.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, members]) => cohortOfSkeletons(name, members));
}
