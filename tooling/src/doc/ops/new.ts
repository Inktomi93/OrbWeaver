// `pnpm doc new adr|plan`: mint a file from its kind's template at the next free id (ADR) or under its
// own folder (plan). A target that exists is a refusal, never an overwrite.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DOC_TOOL_TREES } from "#doc-catalog";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { DESIGN_FILE } from "../lib/indexes.ts";
import { basenameOf, numberedName, parseNumberedName } from "../lib/names.ts";
import { nextFreeRulingId } from "../lib/rules.ts";
import { adrTemplate, planTemplate } from "../lib/templates.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { governedPaths, root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc new <adr|plan> <slug>");

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

export function newAdr(slug: string, title: string | null, repoRoot = root, date = today()): WriteOutcome {
  const twin = governedPaths(repoRoot).find((candidate) => candidate.startsWith(DOC_TOOL_TREES.adr) && parseNumberedName(basenameOf(candidate))?.slug === slug);
  if (twin !== undefined) {
    return { written: [], refusals: [`${twin}: an ADR with slug ${slug} exists — supersede it with pnpm doc status superseded ${twin} --by <new>`] };
  }
  const path = `${DOC_TOOL_TREES.adr}${numberedName(nextAdrId(repoRoot), slug)}`;
  writeDoc(path, adrTemplate(titleFrom(slug, title), date), repoRoot);
  return { written: [path, ...regenerateIndexes(repoRoot)], refusals: [] };
}

export function newPlan(slug: string, title: string | null, repoRoot = root, date = today()): WriteOutcome {
  const path = `${DOC_TOOL_TREES.plans}${slug}/${DESIGN_FILE}`;
  if (existsSync(join(repoRoot, DOC_TOOL_TREES.plans, slug))) {
    return { written: [], refusals: [`${DOC_TOOL_TREES.plans}${slug}/: exists — edit ${path}, or archive it with pnpm doc archive ${slug}`] };
  }
  writeDoc(path, planTemplate(titleFrom(slug, title), date), repoRoot);
  return { written: [path, ...regenerateIndexes(repoRoot)], refusals: [] };
}
