// Stale-node-safe text replacements — the documented pattern.
// ── §13 ─ Stale-node-safe text replacements ──────────────────────────────────

import type { Node } from "ts-morph";
import type { CodemodContext, OperationOptions, Plan, TextReplacement } from "../contract/types.ts";
import { absolutePath, assert, repoRelative } from "./plans.ts";

/**
 * THE one-true pattern for arbitrary text replacements in a single file.
 *
 * Why: `sourceFile.replaceText([s, e], txt)` invalidates every previously
 * held AST node reference. A naive `for (node of getDescendants()) node
 * .replaceWithText(...)` loop crashes on the second iteration.
 *
 * How: collect ALL plans up front as `{ filePath, start, end, text }`,
 * sort end-DESCENDING (so earlier offsets stay valid as we apply later
 * ones), then apply.
 *
 * Best practice: call this ONCE per file at the end of your transform.
 * Don't intersperse `replaceText` calls with AST navigation.
 */
export function applyTextReplacements(ctx: CodemodContext, replacements: readonly TextReplacement[], opts: OperationOptions = {}): Plan {
  // Validate non-overlap per-file. Overlapping replacements would corrupt
  // text in subtle ways (the sort handles them OK individually but two
  // ranges that share bytes leave undefined output).
  const byFile = new Map<string, TextReplacement[]>();
  for (const r of replacements) {
    const abs = absolutePath(r.filePath, ctx.repoRoot);
    const arr = byFile.get(abs) ?? [];
    arr.push({ ...r, filePath: abs });
    byFile.set(abs, arr);
  }
  for (const [file, plans] of byFile) {
    const sorted = [...plans].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev === undefined || cur === undefined) {
        continue;
      }
      assert(
        cur.start >= prev.end,
        `applyTextReplacements: overlapping ranges in ${repoRelative(file, ctx.repoRoot)}`,
        `[${prev.start},${prev.end}) and [${cur.start},${cur.end}) overlap.`,
      );
    }
  }

  return {
    description: `Apply ${replacements.length} text replacement(s) across ${byFile.size} file(s)${opts.note ? ` (${opts.note})` : ""}`,
    touchedFiles: [...byFile.keys()],
    transform(innerCtx): void {
      for (const [file, plans] of byFile) {
        const sf = innerCtx.project.getSourceFile(file);
        assert(sf !== undefined, `applyTextReplacements: file disappeared between plan and transform: ${file}`);
        // Sort end-DESCENDING. Applying later offsets first keeps earlier
        // offsets valid.
        const sorted = [...plans].sort((a, b) => b.end - a.end);
        for (const r of sorted) {
          sf.replaceText([r.start, r.end], r.text);
        }
      }
    },
  };
}

/** Convert a list of AST nodes + a per-node text producer into a flat
 *  TextReplacement array. Computes start/end at the time you call this
 *  (BEFORE any mutation) — pass that array to `applyTextReplacements`. */
export function replacementsForNodes(nodes: readonly Node[], produce: (node: Node) => { text: string; label?: string }): TextReplacement[] {
  const out: TextReplacement[] = [];
  for (const n of nodes) {
    const { text, label } = produce(n);
    out.push({
      filePath: n.getSourceFile().getFilePath(),
      start: n.getStart(),
      end: n.getEnd(),
      text,
      label: label ?? `replace ${n.getKindName()}`,
    });
  }
  return out;
}
