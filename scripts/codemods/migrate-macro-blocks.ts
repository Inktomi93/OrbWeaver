// migrate-macro-blocks — the ONE-TIME `{{#name}}…{{/name}}` → `{{name}}…{{/name}}` seed migration
// (parity-plus §12A.stored-content, owner-ratified #18). Under the MG grammar the old block-open `#` is
// the PRESERVE_WHITESPACE flag, so old-form content still PARSES — this rewrite only normalizes it to
// the universal form. It is deliberately conservative (byte-honesty over completeness):
//   • rewrites ONLY paired blocks whose name is in the children-mode set (`if`/`trim`/`trimstart`/
//     `trimend`/`uppercase`/`lowercase`) — those handlers ignore the `#` flag, so dropping it renders
//     byte-identically (the golden in tests/tooling/migrate-macro-blocks.test.ts proves it);
//   • SKIPS unknown-name blocks (their wrapper bytes ARE the render — dropping `#` would change output),
//     content-as-arg blocks (dropping `#` would newly apply the trim/dedent), close-less `{{#x}}` tags,
//     and multi-flag runs (`{{#~x}}`) — each reported so the owner can judge by hand.
// Idempotent (a migrated file yields 0 rewrites) with a `--dry-run` mode. Usage:
//   pnpm tsx scripts/codemods/migrate-macro-blocks.ts [--dry-run] <file...>

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { MacroAST, MacroBlockNode, MacroRegistry } from "@orb/kit/macro";
import { createDefaultRegistry, parseMacros } from "@orb/kit/macro";

// The children-mode registrations (registry.ts `blockChildren: true`) — the ONLY names whose rendering
// is provably identical with or without the `#` flag (the handler owns its body verbatim either way).
const SAFE_BLOCK_NAMES: ReadonlySet<string> = new Set(["if", "trim", "trimstart", "trimend", "uppercase", "lowercase"]);

// Exactly `{{#` + an identifier start — a longer flag run (`{{#~name}}`) is NOT the legacy block-open
// idiom and is left alone (deleting one char of a deliberate run would change its meaning).
const LEGACY_OPEN = /^\{\{#[a-zA-Z]/;
// Classifies a skipped name as unknown vs known-but-content-arg for the report (built once).
const REGISTRY: MacroRegistry = createDefaultRegistry();
// Byte length of the `{{` opener before the `#` being deleted.
const OPENER_LEN = 2;
// node argv prefix (`node`/`tsx` + the script path).
const ARGV_PREFIX_LEN = 2;

export interface SkippedBlock {
  readonly name: string;
  readonly offset: number;
  readonly reason: "unknown-name" | "content-arg-semantics";
}

export interface MigrationResult {
  readonly text: string;
  readonly rewrites: number;
  readonly skipped: readonly SkippedBlock[];
}

function collectBlocks(ast: MacroAST, out: MacroBlockNode[]): void {
  for (const node of ast) {
    if (node.type === "block") {
      out.push(node);
      collectBlocks(node.children, out);
    }
  }
}

/** Rewrite every SAFE paired `{{#name}}…{{/name}}` to the universal `{{name}}…{{/name}}` form. Pure —
 *  the CLI below owns the file I/O. Parses with the REAL grammar (never a regex over the whole text) so
 *  comments, escapes, args, and nesting are honored exactly as the engine sees them. */
export function migrateMacroBlocks(text: string): MigrationResult {
  const blocks: MacroBlockNode[] = [];
  collectBlocks(parseMacros(text), blocks);

  const hashOffsets: number[] = [];
  const skipped: SkippedBlock[] = [];
  for (const block of blocks) {
    if (block.flags?.preserveWhitespace !== true || block.raw === undefined || block.span === undefined) {
      continue;
    }
    if (!LEGACY_OPEN.test(block.raw)) {
      continue;
    }
    if (SAFE_BLOCK_NAMES.has(block.name.toLowerCase())) {
      hashOffsets.push(block.span.offset + OPENER_LEN);
    } else {
      // Unknown name: the wrapper re-emits its bytes — dropping `#` changes the RENDER. Known
      // content-arg macro: dropping `#` newly applies the trim/dedent to the delivered body.
      const reason: SkippedBlock["reason"] = REGISTRY.get(block.name) === undefined ? "unknown-name" : "content-arg-semantics";
      skipped.push({ name: block.name, offset: block.span.offset, reason });
    }
  }

  // Delete each `#` back-to-front so earlier offsets stay valid.
  hashOffsets.sort((a, b) => b - a);
  let out = text;
  for (const offset of hashOffsets) {
    out = out.slice(0, offset) + out.slice(offset + 1);
  }
  return { text: out, rewrites: hashOffsets.length, skipped };
}

function main(): void {
  const argv = process.argv.slice(ARGV_PREFIX_LEN);
  const dryRun = argv.includes("--dry-run");
  const files = argv.filter((a) => a !== "--dry-run");
  if (files.length === 0) {
    console.error("usage: pnpm tsx scripts/codemods/migrate-macro-blocks.ts [--dry-run] <file...>");
    process.exitCode = 1;
    return;
  }
  for (const file of files) {
    const original = readFileSync(file, "utf8");
    const { text, rewrites, skipped } = migrateMacroBlocks(original);
    const skippedNote = skipped.length > 0 ? ` — SKIPPED ${skipped.map((s) => `{{#${s.name}}}@${s.offset} (${s.reason})`).join(", ")}` : "";
    console.log(`${file}: ${rewrites} rewrite(s)${dryRun ? " [dry-run]" : ""}${skippedNote}`);
    if (!dryRun && rewrites > 0) {
      writeFileSync(file, text);
    }
  }
}

// Run only when executed directly (the CLI) — importing the module (the tooling test) must not touch disk.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
