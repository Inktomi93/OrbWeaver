// The whole read: sources in, one facts object out. Read-only; nothing here writes.

import type { Hit, Source } from "../eslint/index.ts";
import { componentTables, declaredVariants, factsOf, lengthTokensOf, loadSources, loadValueTokens, referencedClassConstants } from "../eslint/index.ts";
import type { Cohort, Comparison } from "../floor/verdict/cohort-compare.ts";
import { compareCohort } from "../floor/verdict/cohort-compare.ts";
import type { SectionAdoption } from "./adoption.ts";
import { adoptionBySection } from "./adoption.ts";
import { buildContext, classifiable, classifySite, clusterKey } from "./classify.ts";
import { buildCohorts } from "./cohorts.ts";
import type { Composition } from "./composition.ts";
import { analyseComposition } from "./composition.ts";
import { buildCopyCohorts } from "./copy.ts";
import { scanCss } from "./css.ts";
import type { DuplicateGroup } from "./duplicates.ts";
import { findDuplicateMaps } from "./duplicates.ts";
import type { ExceptionEntry } from "./exceptions.ts";
import { isExcepted } from "./exceptions.ts";
import type { NoRowUse } from "./hand-classes.ts";
import { buildHandRolling } from "./hand-rolling.ts";
import { scanMarkup } from "./markup.ts";
import { buildMutationCohort } from "./mutations.ts";
import type { ShapeGroup } from "./shapes.ts";
import { findShapes } from "./shapes.ts";
import type { Classified, Site } from "./sites.ts";

interface ScanCounts {
  readonly ts: number;
  readonly tsx: number;
  readonly css: number;
  readonly total: number;
  readonly client: number;
  readonly ui: number;
  readonly inSelection: number;
}

export interface UiFacts {
  readonly scanned: ScanCounts;
  readonly selection: readonly string[] | null;
  /** Every hand-rolled site, classified where the split applies. */
  readonly sites: readonly (Site | Classified)[];
  readonly excepted: readonly Site[];
  readonly cohorts: readonly Cohort[];
  readonly comparisons: readonly Comparison[];
  readonly duplicates: readonly DuplicateGroup[];
  readonly shapes: readonly ShapeGroup[];
  readonly adoption: readonly SectionAdoption[];
  readonly composition: Composition;
  /** Every hand-written design value, class, style, pattern and constant, with the owner that would retire it. */
  readonly handRolling: readonly Hit[];
  /** Class uses on `@orb/ui` elements in the client that no hit covers, by class and component. */
  readonly noRow: readonly NoRowUse[];
  /** Rows of the token scope table that no token in the theme matches. */
  readonly staleScopes: readonly string[];
  readonly sections: readonly string[];
}

export const isClassified = (site: Site | Classified): site is Classified => "cls" in site;

function countFiles(sources: readonly Source[], selection: readonly string[] | null): ScanCounts {
  const count = (test: (source: Source) => boolean): number => sources.filter(test).length;
  return {
    ts: count((source) => source.kind === "ts"),
    tsx: count((source) => source.kind === "tsx"),
    css: count((source) => source.kind === "css"),
    total: sources.length,
    client: count((source) => source.layer === "client"),
    ui: count((source) => source.layer === "ui"),
    inSelection: selection === null ? sources.length : count((source) => selection.includes(source.section)),
  };
}

function clusterFilesOf(sites: readonly Site[]): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>();
  for (const site of sites) {
    if (site.cluster !== null && site.layer === "client") {
      const key = clusterKey(site.cluster);
      map.set(key, (map.get(key) ?? new Set()).add(site.path));
    }
  }
  return map;
}

export function analyse(root: string, exceptions: readonly ExceptionEntry[], selection: readonly string[] | null): UiFacts {
  const sources = loadSources(root);
  const sections = [...new Set(sources.map((source) => source.section))].sort();
  const unknown = (selection ?? []).filter((name) => !sections.includes(name));
  if (unknown.length > 0) {
    throw new Error(`--only names no section: ${unknown.join(", ")}`);
  }
  const tokens = loadValueTokens(root);
  const files = sources.flatMap((source) => factsOf(source) ?? []);
  const referenced = referencedClassConstants(sources);
  const raw = sources.flatMap((source) => (source.kind === "css" ? scanCss(source) : scanMarkup(source, referenced)));
  const excepted = raw.filter((site) => isExcepted(site, exceptions));
  const live = raw.filter((site) => !isExcepted(site, exceptions));
  const context = buildContext(live, clusterFilesOf(live), lengthTokensOf(tokens));
  const sites = live.map((site) => (classifiable(site) ? classifySite(site, context) : site));
  const declared = declaredVariants(root, sources);
  const { cohorts: compositionCohorts, composition } = analyseComposition(sources, files, declared);
  const census = buildHandRolling({ sources, sites: live, tokens, components: componentTables(root, sources), referenced });
  const cohorts = [...buildCohorts(files), ...buildCopyCohorts(files), buildMutationCohort(sources), ...compositionCohorts];
  return {
    scanned: countFiles(sources, selection),
    selection,
    sites,
    excepted,
    cohorts,
    comparisons: cohorts.flatMap(compareCohort),
    duplicates: findDuplicateMaps(sources),
    shapes: findShapes(files),
    adoption: adoptionBySection(files),
    composition,
    handRolling: census.hits,
    noRow: census.noRow,
    staleScopes: tokens.staleScopes,
    sections,
  };
}
