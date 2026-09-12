// doc-catalog — the documentation control plane. Argv parse + dispatch ONLY (the five-slot cap); the
// programmatic surface is ./index.ts.
//
//   pnpm doc-catalog:write      catalog --write     regenerate docs/catalog/catalog.json
//   pnpm doc-catalog:sync       catalog --sync      adopt new documents as pending receipt rows
//   pnpm doc-catalog:ratchet    catalog --ratchet   re-baseline the allowed migration debt
//   pnpm check:doc-catalog      catalog --check     validate receipts + prove the catalog is current
//   pnpm doc-catalog:attest     attest <doc-path…>  re-attest NAMED, already-reviewed rows (#1996)
//   pnpm format:docs            format --write      write compact markdown across docs/architecture/**
//   pnpm check:docs             format --check      list unformatted files (accepts explicit paths)
//
// Exit: 0 clean · 1 violations (stale catalog / receipt errors / unformatted docs) · 2 broke · 3 misuse.
import process from "node:process";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import type { CatalogMode, FormatMode } from "./index.ts";
import { CATALOG_MODES, FORMAT_MODES, runAttest, runCatalog, runFormat } from "./index.ts";

const USAGE = `usage: doc-catalog catalog (${CATALOG_MODES.join(" | ")})\n       doc-catalog format (${FORMAT_MODES.join(" | ")}) [files…]\n       doc-catalog attest <doc-path…>`;

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
  // `attest`'s selection rules live in the op, not here: an empty or pattern-shaped selection is the
  // REFUSAL this verb exists for, and it reports each one by name rather than printing a usage banner.
  if (command === "attest") {
    const paths = mode === undefined ? [] : [mode, ...rest];
    if (paths.some((argument) => argument.startsWith("--"))) {
      throw new UsageError(USAGE);
    }
    return runAttest(paths);
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
