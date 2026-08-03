#!/usr/bin/env tsx
/**
 * `pnpm codemod` — the agent-friendly help CLI for the ts-morph toolkit.
 *
 * Usage:
 *   pnpm codemod                # overview
 *   pnpm codemod help           # same as above
 *   pnpm codemod list           # every helper, grouped by category
 *   pnpm codemod list <id>      # one category (e.g. `imports`, `files`)
 *   pnpm codemod recipes        # all common recipes (code blocks)
 *   pnpm codemod recipe <id>    # one recipe (e.g. `move-files`)
 *   pnpm codemod search <term>  # grep helpers + recipes by keyword
 *
 * The kit's full source is at `scripts/codemods/codemod-kit.ts`. The
 * doc-comment at the top of that file is the authoritative spec.
 *
 * Output overflow:
 *   Long outputs (recipes list, large search hits) automatically spill to
 *   `/tmp/codemod-<tag>-<timestamp>.txt` with the path banner printed at
 *   BOTH the head and the tail of the truncated stdout output. Override
 *   the threshold with `--max-output-lines=N` or `NEO_CODEMOD_MAX_LINES=N`.
 */
import process from "node:process";
import { printHelp, printList, printRecipe, printRecipes, searchHelpers } from "./codemod-kit.ts";

const args = process.argv.slice(2);
// Skip the `--max-output-lines=N` flag — the kit reads it from argv itself.
const positional = args.filter((a) => !a.startsWith("--"));
const sub: string = positional[0] ?? "help";
const arg = positional[1];

switch (sub) {
  case "help":
  case undefined:
    printHelp();
    break;
  case "list":
    printList(arg);
    break;
  case "recipes":
    printRecipes();
    break;
  case "recipe":
    if (!arg) {
      console.log("Usage: pnpm codemod recipe <name>\n  Run `pnpm codemod recipes` to see every recipe name.");
      process.exit(1);
    }
    printRecipe(arg);
    break;
  case "search":
    if (!arg) {
      console.log("Usage: pnpm codemod search <term>");
      process.exit(1);
    }
    searchHelpers(arg);
    break;
  default:
    console.log(`Unknown subcommand "${sub}". Run \`pnpm codemod\` for the overview.`);
    process.exit(1);
}
