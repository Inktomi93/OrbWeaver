// Section structure: which parts each feature has (list, detail, context tabs, empty, loading, error) and which boundary wraps its reads.

import type { FileFacts } from "../eslint/index.ts";
import type { Cohort, Member } from "../floor/verdict/cohort-compare.ts";
import { NOT_APPLICABLE } from "../floor/verdict/cohort-compare.ts";
import { skeletonCohortOf } from "./skeleton.ts";

const yesNo = (flag: boolean): string => (flag ? "yes" : "no");

function boundaryOf(files: readonly FileFacts[]): string {
  if (files.length === 0) {
    return NOT_APPLICABLE;
  }
  const shell = files.some((facts) => facts.tags.has("LibrarySurfaceShell"));
  const boundary = files.some((facts) => facts.tags.has("QueryBoundary"));
  if (shell && boundary) {
    return "both";
  }
  if (shell) {
    return "LibrarySurfaceShell";
  }
  return boundary ? "QueryBoundary" : "none";
}

const hasBoundaryAttr = (facts: FileFacts, attr: string): boolean => facts.elems.some((elem) => elem.tag === "QueryBoundary" && elem.attrs.has(attr));

function memberOf(section: string, files: readonly FileFacts[]): Member {
  const roleOf = (facts: FileFacts): string | null => skeletonCohortOf(facts.source.path);
  const lists = files.filter((facts) => roleOf(facts) === "surface:list");
  const details = files.filter((facts) => roleOf(facts) === "surface:other");
  const contexts = files.filter((facts) => roleOf(facts) === "context-tab");
  const any = (test: (facts: FileFacts) => boolean): boolean => files.some(test);
  const shell = (facts: FileFacts): boolean => facts.tags.has("LibrarySurfaceShell");
  const at = (files.find((facts) => roleOf(facts) !== null) ?? files[0])?.source.path ?? section;
  const cell = (value: string): { readonly value: string; readonly line: number } => ({ value, line: 1 });
  return {
    path: at,
    section,
    label: section,
    cells: {
      list: cell(yesNo(lists.length > 0)),
      detail: cell(yesNo(details.length > 0)),
      contextTabs: cell(yesNo(contexts.length > 0)),
      empty: cell(yesNo(any((facts) => facts.tags.has("EmptyState")))),
      loading: cell(yesNo(any((facts) => shell(facts) || facts.tags.has("SkeletonRows") || hasBoundaryAttr(facts, "fallback")))),
      error: cell(yesNo(any((facts) => shell(facts) || facts.tags.has("QueryErrorState") || hasBoundaryAttr(facts, "renderError")))),
      listBoundary: cell(boundaryOf(lists)),
      detailBoundary: cell(boundaryOf([...details, ...contexts])),
    },
  };
}

export function buildStructureCohort(all: readonly FileFacts[]): Cohort {
  const bySection = new Map<string, FileFacts[]>();
  for (const facts of all) {
    if (/^packages\/client\/src\/features\//u.test(facts.source.path)) {
      bySection.set(facts.source.section, [...(bySection.get(facts.source.section) ?? []), facts]);
    }
  }
  return {
    name: "section-structure",
    what: "feature sections: list, detail, context tabs, empty, loading and error states, and the boundary over list and detail reads",
    columns: ["list", "detail", "contextTabs", "empty", "loading", "error", "listBoundary", "detailBoundary"],
    basis: {
      list: "measured",
      detail: "measured",
      contextTabs: "measured",
      empty: "measured",
      loading: "heuristic",
      error: "heuristic",
      listBoundary: "heuristic",
      detailBoundary: "heuristic",
    },
    members: [...bySection.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([section, files]) => memberOf(section, files)),
  };
}
