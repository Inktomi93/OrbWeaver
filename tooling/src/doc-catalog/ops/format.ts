// The docs formatter — the ONE writer of markdown style for docs/architecture/.
// Law: docs/architecture/core/Core-Docs-Formatting-Law.md. The point: the architecture docs are read by
// AGENTS, not humans — alignment-padded GFM tables (cells padded with dozens-to-hundreds of spaces so
// pipes line up) are pure token waste. This emits COMPACT tables (single space around cell content,
// `| - |` delimiter rows, no pipe alignment), passes YAML frontmatter through verbatim, and preserves
// existing prose line breaks (no reflow — see the law doc).
//
// Default scope (no file args): docs/architecture/**/*.md EXCLUDING docs/architecture/proposed/
// (in-flight drafts — never auto-touched).
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

const DOCS_GLOB = "docs/architecture/**/*.md";
const EXCLUDED = /docs\/architecture\/proposed\//u;

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

/** Resolve the file set: explicit args win; otherwise the whole architecture corpus minus proposed/. */
export function formatTargets(explicit: readonly string[]): readonly string[] {
  return explicit.length > 0
    ? [...explicit]
    : globSync(DOCS_GLOB)
        .filter((file) => !EXCLUDED.test(file))
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
