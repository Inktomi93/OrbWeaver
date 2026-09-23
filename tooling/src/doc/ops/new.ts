// `pnpm doc new adr|plan|law`: mint a file from its kind's template at the next free id (ADR), under its
// own folder (plan) or by its slug (law), with any section text the caller supplied. A target that exists is a refusal, never
// an overwrite; so is a file the docs check would red, which writes nothing and names the findings.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AdrSectionFlag, NewDocInput, PlanSectionFlag } from "../contract/types.ts";
import { DOC_TOOL_TREES } from "../contract/vocab.ts";
import { DESIGN_FILE } from "../lib/indexes.ts";
import { basenameOf, numberedName, parseNumberedName } from "../lib/names.ts";
import { nextFreeRulingId } from "../lib/rules.ts";
import { adrTemplate, lawTemplate, planTemplate } from "../lib/templates.ts";
import { pendingDocProblems } from "./check.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { formattedDoc, governedPaths, root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc new <adr|plan|law> <slug>");

function titleFrom(slug: string, title: string | null): string {
  if (title !== null) {
    return title;
  }
  const words = slug.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The next free ADR id: one past the highest id in the ADR tree, skipping the reserved window. */
export function nextAdrId(repoRoot = root): number {
  const adrIds = governedPaths(repoRoot)
    .filter((path) => path.startsWith(DOC_TOOL_TREES.adr))
    .flatMap((path) => {
      const name = parseNumberedName(basenameOf(path));
      return name === null ? [] : [name.id];
    });
  return nextFreeRulingId(adrIds);
}

/** One minted doc: judged by the docs check as written, then written with the indexes, or refused whole. */
function mint(path: string, source: string, repoRoot: string): WriteOutcome {
  const formatted = formattedDoc(source);
  const refusals = pendingDocProblems([{ path, source: formatted }], repoRoot);
  if (refusals.length > 0) {
    return { written: [], refusals };
  }
  writeDoc(path, formatted, repoRoot);
  return { written: [path, ...regenerateIndexes(repoRoot)], refusals: [] };
}

export function newAdr({ slug, title, content = {} }: NewDocInput<AdrSectionFlag>, repoRoot = root, date = today()): WriteOutcome {
  const twin = governedPaths(repoRoot).find((candidate) => candidate.startsWith(DOC_TOOL_TREES.adr) && parseNumberedName(basenameOf(candidate))?.slug === slug);
  if (twin !== undefined) {
    return { written: [], refusals: [`${twin}: an ADR with slug ${slug} exists — supersede it with pnpm doc status superseded ${twin} --by <new>`] };
  }
  const path = `${DOC_TOOL_TREES.adr}${numberedName(nextAdrId(repoRoot), slug)}`;
  return mint(path, adrTemplate(titleFrom(slug, title), date, content), repoRoot);
}

export function newPlan({ slug, title, content = {} }: NewDocInput<PlanSectionFlag>, repoRoot = root, date = today()): WriteOutcome {
  const path = `${DOC_TOOL_TREES.plans}${slug}/${DESIGN_FILE}`;
  if (existsSync(join(repoRoot, DOC_TOOL_TREES.plans, slug))) {
    return { written: [], refusals: [`${DOC_TOOL_TREES.plans}${slug}/: exists — edit ${path}, or delete a finished one with pnpm doc remove ${path}`] };
  }
  return mint(path, planTemplate(titleFrom(slug, title), date, content), repoRoot);
}

/** A law doc is `docs/law/<slug>.md`. A doc of the same name in any letter case is a twin: the law tree's
 *  names mix cases, and two names a case-insensitive filesystem folds together are one file. */
export function newLaw({ slug, title }: NewDocInput<never>, repoRoot = root, date = today()): WriteOutcome {
  const path = `${DOC_TOOL_TREES.law}${slug}.md`;
  const twin = governedPaths(repoRoot).find((candidate) => candidate.toLowerCase() === path.toLowerCase());
  if (twin !== undefined) {
    return { written: [], refusals: [`${twin}: exists — edit it in place; law changes where it stands`] };
  }
  return mint(path, lawTemplate(titleFrom(slug, title), date), repoRoot);
}
