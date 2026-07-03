// The docs formatter — the ONE writer of markdown style for docs/architecture/.
// Law: docs/architecture/core/Core-Docs-Formatting-Law.md. The point: the architecture docs are
// read by AGENTS, not humans — alignment-padded GFM tables (cells padded with dozens-to-hundreds
// of spaces so pipes line up) are pure token waste. This emits COMPACT tables (single space
// around cell content, `| - |` delimiter rows, no pipe alignment), passes YAML frontmatter
// through verbatim, and preserves existing prose line breaks (no reflow — see the law doc).
//
// Usage:
//   pnpm format:docs [files…]   write formatted output in place
//   pnpm check:docs  [files…]   list unformatted files, exit 1 if any (advisory — NOT in
//                               `pnpm check` until the corpus-wide sweep lands; to flip the
//                               gate on, append `&& pnpm check:docs` to the root `check` script)
//
// Default scope (no file args): docs/architecture/**/*.md EXCLUDING docs/architecture/proposed/
// (in-flight drafts — never auto-touched).

import { globSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";

const DOCS_GLOB = "docs/architecture/**/*.md";
const EXCLUDED = /docs\/architecture\/proposed\//;

const processor = remark()
  .use(remarkFrontmatter, ["yaml"])
  // singleTilde:false matches the render pipeline pin (ui markdown.tsx §11.6): `10~20°C` is prose,
  // not strikethrough. tablePipeAlign:false is the whole reason this script exists.
  .use(remarkGfm, { tableCellPadding: true, tablePipeAlign: false, singleTilde: false })
  .use({ settings: { bullet: "-", emphasis: "*", strong: "*", fence: "`", rule: "-" } });

const args = process.argv.slice(2);
const write = args.includes("--write");
const check = args.includes("--check");
if (write === check) {
  console.error("usage: format-md.ts (--write | --check) [files…]");
  process.exit(2);
}

const explicit = args.filter((a) => !a.startsWith("--"));
const files =
  explicit.length > 0
    ? explicit
    : globSync(DOCS_GLOB)
        .filter((f) => !EXCLUDED.test(f))
        .sort();

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

if (write) {
  console.log(`format:docs — formatted ${dirty.length}/${files.length} file(s)`);
} else if (dirty.length > 0) {
  console.error(`check:docs — ${dirty.length} file(s) not formatted (run \`pnpm format:docs\`):`);
  for (const f of dirty) {
    console.error(`  ${f}`);
  }
  process.exit(1);
} else {
  console.log(`check:docs — ${files.length} file(s) formatted`);
}
