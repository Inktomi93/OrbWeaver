// pnpm codemod — the agent-friendly help CLI for the ts-morph toolkit, plus the migration ops.
// Argv parse + dispatch ONLY (the five-slot cap); the programmatic surface is ./index.ts (the
// authoritative kit spec lives on its header + `pnpm codemod list`).
//
//   pnpm codemod                       # overview        pnpm codemod list [id]   # helpers by category
//   pnpm codemod recipes|recipe <id>   # recipes          pnpm codemod search <t>  # grep helpers+recipes
//   pnpm codemod migrate-macro-blocks [--dry-run] <file...>   # the §12A seed migration (idempotent)
//
// Output overflow: long outputs spill to /tmp with the path banner at head AND tail
// (`--max-output-lines=N`, parsed here / NEO_CODEMOD_MAX_LINES). Exit: 0 clean · EXIT.misuse on a bad
// subcommand, an unknown flag, or a malformed --max-output-lines value.
import process from "node:process";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { migrateMacroBlocksOp, printHelp, printList, printRecipe, printRecipes, searchHelpers } from "./index.ts";

/** The ONE flag this tier owns (the kit's output-spill knob). */
const MAX_LINES_FLAG = "--max-output-lines=";

/** Read `--max-output-lines=N`. A malformed value is MISUSE, never a silent fall-back to the default:
 *  the caller asked for a specific spill threshold and would otherwise get the wrong output shape with
 *  no signal. Parsed HERE because the cli is the tool's one argv reader — `lib/diagnostics.ts` takes the
 *  resolved number as a parameter (Core-Tooling-Law §4.9). */
function parseMaxOutputLines(args: readonly string[]): number | undefined {
  const flag = args.find((a) => a.startsWith(MAX_LINES_FLAG));
  if (flag === undefined) {
    return;
  }
  const n = Number.parseInt(flag.slice(MAX_LINES_FLAG.length), 10);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new UsageError(`${MAX_LINES_FLAG}N takes a positive integer — got ${JSON.stringify(flag.slice(MAX_LINES_FLAG.length))}`);
  }
  return n;
}

/** Every verb below `migrate-macro-blocks` takes NO flags. The old parse dropped every `--token` from the
 *  positional list, so `pnpm codemod list --recipies` printed the whole list and exited 0 — a typo
 *  answered with a confident wrong answer, which is the silent-accept class #971 exists to close. */
function refuseUnknownFlags(tail: readonly string[], sub: string): void {
  const unknown = tail.find((a) => a.startsWith("-"));
  if (unknown !== undefined) {
    throw new UsageError(`\`codemod ${sub}\` takes no ${unknown} flag — run \`pnpm codemod\` for the overview (only ${MAX_LINES_FLAG}N is accepted here)`);
  }
}

function main(): number {
  const args = process.argv.slice(2);
  const maxOutputLines = parseMaxOutputLines(args);
  const rest = args.filter((a) => !a.startsWith(MAX_LINES_FLAG));
  const first = rest[0];
  const sub: string = first === undefined || first === "--help" || first === "-h" ? "help" : first;
  const tail = sub === first ? rest.slice(1) : [];
  const arg = tail[0];

  // The one verb with its own flag grammar — it owns its tail verbatim.
  if (sub === "migrate-macro-blocks") {
    migrateMacroBlocksOp(tail);
    return EXIT.clean;
  }
  refuseUnknownFlags(tail, sub);
  if (sub === "help") {
    printHelp(maxOutputLines);
    return EXIT.clean;
  }
  if (sub === "list") {
    printList(arg, maxOutputLines);
    return EXIT.clean;
  }
  if (sub === "recipes") {
    printRecipes(maxOutputLines);
    return EXIT.clean;
  }
  if (sub === "recipe") {
    if (arg === undefined) {
      throw new UsageError("usage: pnpm codemod recipe <name> — run `pnpm codemod recipes` for every recipe name");
    }
    printRecipe(arg, maxOutputLines);
    return EXIT.clean;
  }
  if (sub === "search") {
    if (arg === undefined) {
      throw new UsageError("usage: pnpm codemod search <term>");
    }
    searchHelpers(arg, maxOutputLines);
    return EXIT.clean;
  }
  throw new UsageError(`unknown subcommand ${JSON.stringify(sub)} — run \`pnpm codemod\` for the overview`);
}

await runTool(main);
