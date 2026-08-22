// pnpm codemod — the agent-friendly help CLI for the ts-morph toolkit, plus the migration ops.
// Argv parse + dispatch ONLY (the five-slot cap); the programmatic surface is ./index.ts (the
// authoritative kit spec lives on its header + `pnpm codemod list`).
//
//   pnpm codemod                       # overview        pnpm codemod list [id]   # helpers by category
//   pnpm codemod recipes|recipe <id>   # recipes          pnpm codemod search <t>  # grep helpers+recipes
//   pnpm codemod migrate-macro-blocks [--dry-run] <file...>   # the §12A seed migration (idempotent)
//
// Output overflow: long outputs spill to /tmp with the path banner at head AND tail
// (`--max-output-lines=N` / NEO_CODEMOD_MAX_LINES). Exit: 0 clean · EXIT.misuse on a bad subcommand.
import process from "node:process";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { migrateMacroBlocksOp, printHelp, printList, printRecipe, printRecipes, searchHelpers } from "./index.ts";

function main(): number {
  const args = process.argv.slice(2);
  // Skip the `--max-output-lines=N` flag — the kit reads it from argv itself.
  const positional = args.filter((a) => !a.startsWith("--"));
  const sub: string = positional[0] ?? "help";
  const arg = positional[1];

  if (sub === "help") {
    printHelp();
    return EXIT.clean;
  }
  if (sub === "list") {
    printList(arg);
    return EXIT.clean;
  }
  if (sub === "recipes") {
    printRecipes();
    return EXIT.clean;
  }
  if (sub === "recipe") {
    if (arg === undefined) {
      throw new UsageError("usage: pnpm codemod recipe <name> — run `pnpm codemod recipes` for every recipe name");
    }
    printRecipe(arg);
    return EXIT.clean;
  }
  if (sub === "search") {
    if (arg === undefined) {
      throw new UsageError("usage: pnpm codemod search <term>");
    }
    searchHelpers(arg);
    return EXIT.clean;
  }
  if (sub === "migrate-macro-blocks") {
    migrateMacroBlocksOp(args.slice(1));
    return EXIT.clean;
  }
  throw new UsageError(`unknown subcommand ${JSON.stringify(sub)} — run \`pnpm codemod\` for the overview`);
}

await runTool(main);
