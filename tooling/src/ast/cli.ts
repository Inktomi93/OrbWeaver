// pnpm ast — no-script structural search over the whole workspace: symbol layer (ts-morph — refs/
// callers/importers/exports/jsx/ident/literal + rot lenses orphans/testonly/chains/cycles/aliases/
// stringy…) and module-graph layer (depcruise pass-throughs flow/reaches, same config the gates run).
// Run bare for full usage with examples (lib/usage.ts is the doc). Prefer this over grep for CODE
// questions. EVERY run ends with an audit epilogue on STDERR naming the scope it actually entered
// (lib/ledger.ts — THE SCAN LEDGER); a zero-scan run is a tool error (EXIT.toolError), never a clean
// "no results". Argv parse + dispatch ONLY (the five-slot cap); the programmatic surface is ./index.ts.
//
// Exit (converged on the fleet contract at the move, stated): 0 clean · 1 a lens verdict (stale
// two-sided markers, depcruise edges failure) · EXIT.toolError a broken run (zero-scan scope, a failed
// subprocess) · EXIT.misuse an UNKNOWN VERB (the typo'd-verb-silently-clean class — it used to print
// usage and exit 0). Bare `pnpm ast` stays the usage door (exit 0).
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { warn } from "../_shared/log.ts";
import { runTool, UsageError } from "../_shared/run-tool.ts";
import { CodemodError } from "../codemod/index.ts";
import {
  ARGLESS_VERBS,
  AstToolError,
  beginRun,
  CORPUS_DEPCRUISE,
  CORPUS_SYNTACTIC,
  CORPUS_TYPED,
  CORPUS_WIDE_SYNTACTIC,
  DEPCRUISE_VERBS,
  finishRun,
  loadProject,
  noteToolError,
  parseFlags,
  runDepcruise,
  TYPED_VERBS,
  USAGE,
  VERBS,
  WIDE_SYNTACTIC_VERBS,
} from "./index.ts";

/** Which corpus label a run's epilogue carries — the three arms `loadProject` can produce. */
function corpusOf(typed: boolean, wide: boolean): string {
  if (typed) {
    return CORPUS_TYPED;
  }
  return wide ? CORPUS_WIDE_SYNTACTIC : CORPUS_SYNTACTIC;
}

interface Invocation {
  readonly verb: string;
  readonly effectiveArg: string;
  readonly flagTokens: readonly string[];
}

/** Resolve verb + scope arg + flag tokens, throwing the misuse door for an unknown verb or a missing
 *  required arg. Argless verbs take an OPTIONAL scope — a leading FLAG is not a scope (`pnpm ast
 *  respell --max 60` used to read "--max" as the domain name and exit 2 on it). */
function resolveInvocation(verb: string, arg: string | undefined, rest: readonly string[]): Invocation {
  if (VERBS[verb] === undefined) {
    print(USAGE);
    throw new UsageError(`unknown verb ${JSON.stringify(verb)} — see the usage above`);
  }
  const argless = ARGLESS_VERBS.has(verb);
  const argIsFlag = argless && arg?.startsWith("--") === true;
  const effectiveArg = argIsFlag ? "" : (arg ?? (argless ? "" : undefined));
  if (effectiveArg === undefined) {
    print(USAGE);
    throw new UsageError(`verb ${verb} requires an argument — see the usage above`);
  }
  const flagTokens = argIsFlag && arg !== undefined ? [arg, ...rest] : rest;
  return { verb, effectiveArg, flagTokens };
}

/** Map the two typed error carriers to their exit-contract codes; rethrow anything else (runTool's
 *  crash arm owns it). */
function mapKnownError(e: unknown): number {
  if (e instanceof AstToolError) {
    // exitToolError already printed the diagnosis + epilogue — the throw only unwinds the verb.
    return EXIT.toolError;
  }
  if (e instanceof CodemodError) {
    warn(`ast: ${e.message}`);
    noteToolError();
    finishRun();
    return typeof process.exitCode === "number" && process.exitCode !== EXIT.clean ? process.exitCode : EXIT.violations;
  }
  throw e;
}

async function main(): Promise<number> {
  const [verb, arg, ...rest] = process.argv.slice(2);
  if (verb === undefined) {
    print(USAGE);
    return EXIT.clean;
  }
  if (arg !== undefined && DEPCRUISE_VERBS[verb] !== undefined) {
    beginRun(verb, CORPUS_DEPCRUISE, parseFlags(rest));
    await runDepcruise(DEPCRUISE_VERBS[verb], arg);
    finishRun();
    return typeof process.exitCode === "number" ? process.exitCode : EXIT.clean;
  }
  const invocation = resolveInvocation(verb, arg, rest);
  const typed = TYPED_VERBS.has(verb);
  const wide = WIDE_SYNTACTIC_VERBS.has(verb);
  const flags = parseFlags([...invocation.flagTokens]);
  beginRun(verb, corpusOf(typed, wide), flags);
  try {
    VERBS[verb]?.(loadProject(typed, wide), invocation.effectiveArg, flags);
  } catch (e) {
    return mapKnownError(e);
  }
  finishRun();
  return typeof process.exitCode === "number" ? process.exitCode : EXIT.clean;
}

await runTool(main);
