// `pnpm doc remove <id|path…>`: delete governed docs — an item filed by mistake (by id or path), an ADR,
// a law doc, or a finished plan (its `design.md` path; the folder goes with its generated `tasks.md`).
// Nothing is deleted while something still cites it: a doc that links to it or names its path, a `D<n>`
// citation of an ADR, an item filed under a plan, or an item or parked plan whose `on <id>` blocker names
// an item. All-or-nothing, then the indexes regenerate. Git keeps what was deleted.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { ADR_KIND, DOC_TOOL_TREES, PLAN_KIND } from "../contract/vocab.ts";
import { splitDocument } from "../lib/frontmatter-write.ts";
import { DESIGN_FILE, isGeneratedPath, planSlugOf } from "../lib/indexes.ts";
import { isItemPath, parseBlocker } from "../lib/items.ts";
import { basenameOf, folderOf, parseNumberedName, referencePatterns } from "../lib/names.ts";
import { PARKED } from "../lib/rules.ts";
import { loadPlans } from "./board.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { loadItems } from "./items.ts";
import { governedPaths, readDoc, root, textFiles } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc remove <id|path…>");

const ID_RE = /^\d+$/u;

/** True when `source` (the text of the file at `path`) refers to the doc at `target`. */
function refersTo(path: string, source: string, target: string): boolean {
  const { anywhere, sameFolder } = referencePatterns(target);
  const folder = folderOf(target);
  const inFolder = path.startsWith(folder) && !path.slice(folder.length).includes("/");
  return anywhere.test(source) || (inFolder && sameFolder.test(source));
}

/** How an ADR is cited by number (`D12`), or null for any other doc. */
function citationOf(target: string, repoRoot: string): { readonly label: string; readonly pattern: RegExp } | null {
  const id = parseNumberedName(basenameOf(target))?.id;
  const kind = splitDocument(readDoc(target, repoRoot).source).fields?.["kind"];
  if (id === undefined || kind !== ADR_KIND) {
    return null;
  }
  const label = `D${String(id)}`;
  return { label, pattern: new RegExp(`(?<![\\w-])${label}(?!\\d)`, "u") };
}

/** Every text file that still refers to one of `targets` by path, or cites an ADR among them by `D<n>`.
 *  The targets themselves and the generated indexes (rewritten by the same write) do not count. */
export function textCiters(targets: readonly string[], repoRoot = root): readonly string[] {
  const removing = new Set(targets);
  const citations = targets.map((target) => ({ target, cite: citationOf(target, repoRoot) }));
  const lines: string[] = [];
  for (const path of textFiles(repoRoot)) {
    if (removing.has(path) || isGeneratedPath(path)) {
      continue;
    }
    const source = readFileSync(join(repoRoot, path), "utf8");
    for (const { target, cite } of citations) {
      if (refersTo(path, source, target)) {
        lines.push(`${path}: refers to ${target} — remove the reference first`);
      } else if (cite?.pattern.test(source) === true) {
        lines.push(`${path}: cites ${cite.label} (${target}) — remove the citation first`);
      }
    }
  }
  return lines;
}

/** Items and parked plans that name a removed item as their blocker, and items filed under a removed plan. */
function structuralCiters(targets: readonly string[], repoRoot: string): readonly string[] {
  const removing = new Set(targets);
  const items = loadItems(repoRoot);
  const ids = new Set(items.filter((item) => removing.has(item.path)).map((item) => item.id));
  const slugs = new Set(targets.flatMap((path) => (basenameOf(path) === DESIGN_FILE ? [planSlugOf(path) ?? ""] : [])));
  const waitsOn = (blocked: string | null): number | null => {
    const blocker = blocked === null ? null : parseBlocker(blocked);
    return blocker?.kind === "on" && ids.has(blocker.id) ? blocker.id : null;
  };
  const lines: string[] = [];
  for (const item of items.filter((candidate) => !removing.has(candidate.path))) {
    const on = item.state === "blocked" ? waitsOn(item.blocked) : null;
    if (on !== null) {
      lines.push(`${item.path}: blocked on ${String(on)} — change its blocker first: pnpm doc set ${String(item.id)} open`);
    }
    if (item.plan !== null && slugs.has(item.plan)) {
      lines.push(`${item.path}: filed under plan ${item.plan} — land it, or pnpm doc set ${String(item.id)} --plan none`);
    }
  }
  for (const plan of loadPlans(repoRoot).filter((candidate) => !removing.has(candidate.path) && candidate.status === PARKED)) {
    const on = waitsOn(plan.blocked);
    if (on !== null) {
      lines.push(`${plan.path}: parked on ${String(on)} — pnpm doc status active ${plan.path} first`);
    }
  }
  return lines;
}

/** A target as the path of the doc it names, or the refusal saying why it names none. */
function resolve(target: string, repoRoot: string): { readonly path: string } | { readonly refusal: string } {
  if (ID_RE.test(target)) {
    const item = loadItems(repoRoot).find((candidate) => candidate.id === Number(target));
    return item === undefined ? { refusal: `${target}: no such item under ${DOC_TOOL_TREES.work} — pnpm doc overview lists them` } : { path: item.path };
  }
  const governed = governedPaths(repoRoot).includes(target) && !isGeneratedPath(target);
  if (!governed) {
    return { refusal: `${target}: not a governed doc — remove takes an item id or a doc path under ${Object.values(DOC_TOOL_TREES).join(", ")}` };
  }
  const kind = splitDocument(readDoc(target, repoRoot).source).fields?.["kind"];
  if (target.startsWith(DOC_TOOL_TREES.plans) && (kind !== PLAN_KIND || basenameOf(target) !== DESIGN_FILE)) {
    return { refusal: `${target}: a plan is removed by its ${DESIGN_FILE}` };
  }
  return { path: target };
}

export function removeDocs(targets: readonly string[], repoRoot = root): WriteOutcome {
  const resolved = targets.map((target) => resolve(target, repoRoot));
  const refusals = resolved.flatMap((entry) => ("refusal" in entry ? [entry.refusal] : []));
  if (refusals.length > 0) {
    return { written: [], refusals };
  }
  const paths = [...new Set(resolved.flatMap((entry) => ("path" in entry ? [entry.path] : [])))];
  const citers = [...structuralCiters(paths, repoRoot), ...textCiters(paths, repoRoot)];
  if (citers.length > 0) {
    return { written: [], refusals: citers };
  }
  for (const path of paths) {
    const plan = !isItemPath(path) && basenameOf(path) === DESIGN_FILE;
    rmSync(join(repoRoot, plan ? folderOf(path) : path), { recursive: plan });
  }
  return { written: [...paths, ...regenerateIndexes(repoRoot)], refusals: [] };
}
