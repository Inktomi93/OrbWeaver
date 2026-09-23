// doc-catalog — the legacy docs inventory + the markdown formatter. Argv parse + dispatch ONLY (the
// five-slot cap); the programmatic surface is ./index.ts.
//
//   pnpm doc-catalog:write      catalog --write     regenerate docs/catalog/catalog.json
//   pnpm doc-catalog:sync       catalog --sync      adopt new documents as unclassified rows
//   pnpm doc-catalog:ratchet    catalog --ratchet   re-baseline the allowed frontmatter debt
//   pnpm check:doc-catalog      catalog --check     validate rows + frontmatter + prove the inventory is current
//   pnpm format:docs            format --write      write compact markdown across the living docs trees
//   pnpm check:docs             format --check      list unformatted files (accepts explicit paths)
//
// Exit: 0 clean · 1 violations (stale inventory / row errors / unformatted docs) · 2 broke · 3 misuse.
import process from "node:process";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import type { CatalogMode, FormatMode } from "./index.ts";
import { CATALOG_MODES, FORMAT_MODES, runCatalog, runFormat } from "./index.ts";

const USAGE = `usage: doc-catalog catalog (${CATALOG_MODES.join(" | ")})\n       doc-catalog format (${FORMAT_MODES.join(" | ")}) [files…]`;

function isCatalogMode(value: string | undefined): value is CatalogMode {
  return CATALOG_MODES.some((mode) => mode === value);
}

function isFormatMode(value: string | undefined): value is FormatMode {
  return FORMAT_MODES.some((mode) => mode === value);
}

function main(): number {
  const [command, mode, ...rest] = process.argv.slice(2);
  if (command === "catalog") {
    if (!isCatalogMode(mode) || rest.length > 0) {
      throw new UsageError(USAGE);
    }
    return runCatalog(mode);
  }
  if (command === "format") {
    if (!isFormatMode(mode) || rest.some((arg) => arg.startsWith("--"))) {
      throw new UsageError(USAGE);
    }
    return runFormat(mode, rest);
  }
  throw new UsageError(USAGE);
}

await runTool(main);
