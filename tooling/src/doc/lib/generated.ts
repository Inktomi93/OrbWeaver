// What the generated files SHOULD contain, derived from the governed docs: the four tree indexes and
// every plan's `tasks.md`. `pnpm doc index` writes this map; the checker compares the tree against it. Each
// rendered file goes through the repo's markdown formatter so the bytes match what `check:docs` wants.
import { DOC_TOOL_TREES, formatMarkdown } from "#doc-catalog";
import type { DocSummary, GovernedDoc, WorkItem } from "../contract/types.ts";
import { splitDocument, titleOf } from "./frontmatter-write.ts";
import {
  ADR_INDEX_PATH,
  DESIGN_FILE,
  isGeneratedPath,
  LAW_INDEX_PATH,
  PLAN_INDEX_PATH,
  planDirOf,
  planSlugOf,
  renderAdrIndex,
  renderLawIndex,
  renderPlanIndex,
  renderTasks,
  renderWorkIndex,
  TASKS_FILE,
  WORK_INDEX_PATH,
} from "./indexes.ts";
import { parseItem } from "./items.ts";
import { basenameOf, parseNumberedName } from "./names.ts";

function summary(doc: GovernedDoc): DocSummary | null {
  const { fields, body } = splitDocument(doc.source);
  if (fields === null) {
    return null;
  }
  return {
    path: doc.path,
    title: titleOf(body) ?? basenameOf(doc.path),
    kind: fields["kind"] ?? "",
    status: fields["status"] ?? "",
    supersededBy: fields["superseded-by"] ?? null,
  };
}

function canonical(source: string): string {
  const { output, refusal } = formatMarkdown(source);
  return refusal === null ? output : source;
}

/** Every item on the tree: under `docs/work/` or moved into an archived plan folder. */
export function allItems(docs: readonly GovernedDoc[]): readonly WorkItem[] {
  return docs.flatMap((doc) => {
    const inWork = doc.path.startsWith(DOC_TOOL_TREES.work);
    const inArchive = planSlugOf(doc.path) !== null && doc.path.includes("/archive/");
    if (!(inWork || inArchive) || parseNumberedName(basenameOf(doc.path)) === null) {
      return [];
    }
    const item = parseItem(doc.path, doc.source);
    return item === null ? [] : [item];
  });
}

/** Path → expected bytes for every generated file the tree owes. */
export function expectedGeneratedFiles(docs: readonly GovernedDoc[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const summaries = docs
    .filter((doc) => !isGeneratedPath(doc.path))
    .flatMap((doc) => {
      const row = summary(doc);
      return row === null ? [] : [row];
    });
  const items = allItems(docs);
  out.set(ADR_INDEX_PATH, canonical(renderAdrIndex(summaries.filter((row) => row.path.startsWith(DOC_TOOL_TREES.adr)))));
  const plans = summaries.filter((row) => row.path.startsWith(DOC_TOOL_TREES.plans) && basenameOf(row.path) === DESIGN_FILE);
  out.set(PLAN_INDEX_PATH, canonical(renderPlanIndex(plans)));
  out.set(WORK_INDEX_PATH, canonical(renderWorkIndex(items.filter((item) => item.path.startsWith(DOC_TOOL_TREES.work)))));
  out.set(LAW_INDEX_PATH, canonical(renderLawIndex(summaries.filter((row) => row.path.startsWith(DOC_TOOL_TREES.law)))));
  for (const plan of plans) {
    const slug = planSlugOf(plan.path);
    const dir = planDirOf(plan.path);
    const own = items.filter((item) => item.plan === slug);
    if (own.length > 0) {
      out.set(`${dir}${TASKS_FILE}`, canonical(renderTasks(plan.title, dir, own)));
    }
  }
  return out;
}
