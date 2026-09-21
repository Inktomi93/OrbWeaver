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

/** #452 — the flag-shaped-positional refusal. A REQUIRED-arg verb given `--something` first used to
 *  SEARCH FOR THE FLAG: `pnpm ast jsx --name Button` looked for a component literally named "--name",
 *  printed `matches=0 status=complete` over a 5433-file scan, and dropped `Button` in `parseFlags`'
 *  (now-closed) silent unknown-token hole — a false clean from the constitution's mandated structural
 *  instrument. ast has NO `--name`/`--component` flag: every verb's subject is positional and first. */
function flagAsArgMessage(verb: string, arg: string, rest: readonly string[]): string {
  const next = rest[0];
  const repair = next === undefined || next.startsWith("--") ? `\`pnpm ast ${verb} <subject>\`` : `\`pnpm ast ${verb} ${next}\``;
  return `verb ${verb} takes its subject POSITIONALLY, and ${JSON.stringify(arg)} is not a flag this tool knows — searching for it would print a silent false clean. Did you mean ${repair}? — see the usage above`;
}

/** Resolve verb + scope arg + flag tokens, throwing the misuse door for an unknown verb, a missing
 *  required arg, or a flag where a required subject belongs. Argless verbs take an OPTIONAL scope — a
 *  leading FLAG is not a scope there (`pnpm ast respell --max 60` used to read "--max" as the domain
 *  name and exit 2 on it), which is exactly why the required-arg verbs need the refusal above. */
function resolveInvocation(verb: string, arg: string | undefined, rest: readonly string[]): Invocation {
  if (VERBS[verb] === undefined) {
    print(USAGE);
    throw new UsageError(`unknown verb ${JSON.stringify(verb)} — see the usage above`);
  }
  const argless = ARGLESS_VERBS.has(verb);
  if (!argless && arg?.startsWith("--") === true) {
    print(USAGE);
    throw new UsageError(flagAsArgMessage(verb, arg, rest));
  }
  const argIsFlag = argless && arg?.startsWith("--") === true;
  const effectiveArg = argIsFlag ? "" : (arg ?? (argless ? "" : undefined));
  if (effectiveArg === undefined) {
    print(USAGE);
    throw new UsageError(`verb ${verb} requires an argument — see the usage above`);
  }
  const flagTokens = argIsFlag ? [arg, ...rest] : rest;
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
  // The usage door, both spellings: bare, and the `--help` every other CLI on this box answers to (#452 —
  // an instrument whose doc is undiscoverable is how a caller invents `--name` in the first place).
  if (verb === undefined || verb === "--help" || verb === "-h") {
    print(USAGE);
    return EXIT.clean;
  }
  const depcruiseMode = DEPCRUISE_VERBS[verb];
  if (depcruiseMode !== undefined) {
    const tokens = arg === undefined ? rest : [arg, ...rest];
    if (tokens.includes("--json")) {
      throw new UsageError(`verb ${verb} does not support --json: dependency-cruiser returns its native text edge report. Remove --json.`);
    }
    if (arg === undefined || arg.startsWith("--")) {
      throw new UsageError(`verb ${verb} requires a module pattern as its first positional argument.`);
    }
    const flags = parseFlags(rest);
    beginRun(verb, CORPUS_DEPCRUISE, flags);
    await runDepcruise(depcruiseMode, arg);
    finishRun();
    return typeof process.exitCode === "number" ? process.exitCode : EXIT.clean;
  }
  const invocation = resolveInvocation(verb, arg, rest);
  const typed = TYPED_VERBS.has(verb);
  const wide = WIDE_SYNTACTIC_VERBS.has(verb);
  const flags = parseFlags([...invocation.flagTokens]);
  beginRun(verb, corpusOf(typed, wide), flags);
  // @orb-waive caught-failure-ownership(e): the verb's thrown error is mapped to a typed exit code via mapKnownError, not dropped — the return value is main()'s own contract, propagated to the process exit code. Ends if mapKnownError stops covering a real error class and silently returns clean.
  try {
    VERBS[verb]?.(loadProject(typed, wide), invocation.effectiveArg, flags);
  } catch (e) {
    return mapKnownError(e);
  }
  finishRun();
  return typeof process.exitCode === "number" ? process.exitCode : EXIT.clean;
}

await runTool(main);
