// The docs formatter — the ONE writer of markdown style for the LIVING doc corpus (scope below).
// Law: docs/architecture/core/Core-Docs-Formatting-Law.md. The point: the architecture docs are read by
// AGENTS, not humans — alignment-padded GFM tables (cells padded with dozens-to-hundreds of spaces so
// pipes line up) are pure token waste. This emits COMPACT tables (single space around cell content,
// `| - |` delimiter rows, no pipe alignment), passes YAML frontmatter through verbatim, and preserves
// existing prose line breaks (no reflow — see the law doc).
//
// THE DEFAULT SCOPE IS THE LIVING DOC CORPUS, AND IT IS ONE POPULATION SERVING BOTH DOORS (#2059).
// `--check` (`pnpm check:docs`) and `--write` (`pnpm format:docs`) both resolve through `formatTargets`, so
// a tree missing here is missing from BOTH: it is neither checked nor formattable, and `pnpm format:docs`
// silently declines to touch it. That was the defect — the scope was `docs/architecture/**` alone, so
// `docs/design/**` and `docs/reviews/**` (the program guides and every review/ledger a lane writes) were
// outside both doors while reading exactly like docs the formatter owned.
//
// WHICH TREES, AND WHY THE TWO EXCLUSIONS ARE NOT LAZINESS:
//   · `docs/architecture/**` minus `proposed/` — in-flight drafts are never auto-touched (unchanged);
//   · `docs/design/**` and `docs/reviews/**` — LIVING law and live review output, written by lanes daily;
//   · NOT `docs/vendor/**` — vendored UPSTREAM bytes. Reformatting them would silently fork a copy we
//     re-sync, and the diff would be ours, not theirs;
//   · NOT `docs/history/**` — FROZEN archaeology (Documentation-Law §"Relocation & retirement"). A frozen
//     doc is a record of what was written then; reformatting it edits history to no reader's benefit.
// Measured 2026-09-12: those two exclusions are 211 of the 349 unformatted files outside the old scope.
//
// The corpus is TRACKED files, the same source of truth the catalog uses (`ops/tree.ts#trackedDocs`) — an
// untracked draft is not a document, and a glob would sweep one in.
import { readFileSync, writeFileSync } from "node:fs";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execNicedSync } from "../../_shared/proc.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

/** The LIVING trees this formatter owns. Prefix-matched against repo-relative tracked paths. */
const LIVING_TREES = ["docs/architecture/", "docs/design/", "docs/reviews/"] as const;
/** In-flight drafts inside a living tree — never auto-touched. `vendor/` and `history/` are excluded by
 *  simply not being living trees, which is why they need no row here. */
const EXCLUDED = /^docs\/architecture\/proposed\//u;

const processor = remark()
  .use(remarkFrontmatter, ["yaml"])
  // singleTilde:false matches the render pipeline pin (ui markdown.tsx §11.6): `10~20°C` is prose, not
  // strikethrough. tablePipeAlign:false is the whole reason this formatter exists.
  .use(remarkGfm, { tableCellPadding: true, tablePipeAlign: false, singleTilde: false })
  .use({ settings: { bullet: "-", emphasis: "*", strong: "*", fence: "`", rule: "-" } });

export interface FormatOutcome {
  readonly scanned: number;
  readonly dirty: readonly string[];
}

/** Resolve the file set: explicit args win; otherwise every TRACKED `.md` in a living tree minus the
 *  in-flight drafts. ONE resolution for both doors — see the scope note in the header. */
export function formatTargets(explicit: readonly string[]): readonly string[] {
  if (explicit.length > 0) {
    return [...explicit];
  }
  return execNicedSync("git", ["ls-files", "-z", "--", "docs"], { cwd: REPO_ROOT })
    .split("\0")
    .filter((path) => path.endsWith(".md") && LIVING_TREES.some((tree) => path.startsWith(tree)) && !EXCLUDED.test(path))
    .sort();
}

/** Format the targets; `write` lands the formatted bytes, otherwise nothing is touched and the dirty
 *  list IS the verdict. */
export function formatDocs(files: readonly string[], write: boolean): FormatOutcome {
  const dirty: string[] = [];
  for (const file of files) {
    const input = readFileSync(file, "utf8");
    const output = String(processor.processSync(input));
    if (output === input) {
      continue;
    }
    dirty.push(file);
    if (write) {
      writeFileSync(file, output);
    }
  }
  return { scanned: files.length, dirty };
}
