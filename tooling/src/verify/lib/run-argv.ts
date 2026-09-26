// `verify`'s ARGV parse (UNIFIED-VERIFICATION-DESIGN.md §3) — a strict node:util `parseArgs` schema where
// an unknown flag, a value option with no value, >1 scope selector, or >1 tier are all MISUSE (exit 3),
// never a silent-ignore. Split out of ops/run.ts at the @orb/tooling P6 move (size cap §4.3); the grammar
// is unchanged.
import { parseArgs } from "node:util";
import { resolveOperand, unresolvedOperands, unresolvedRefusal } from "@orb/tooling/_shared/scoped-run-paths";
import type { Selection, SelectionRequest } from "../contract/selection.ts";
import type { Tier } from "../contract/stage.ts";
import { RUNNABLE_VERIFY_TIERS } from "../contract/stage.ts";
import { ROOT } from "./repo-paths.ts";
import { resolveSelection } from "./selection.ts";

export interface Parsed {
  readonly tier: Tier;
  readonly selection: Selection | undefined; // undefined = whole scope
  readonly strictScope: boolean;
  readonly list: boolean;
  readonly json: boolean;
  readonly verbose: boolean;
}

// The strict option schema (node:util parseArgs, stdlib — no new dep). Every accepted flag is declared;
// `strict:true` + `allowPositionals:true` makes an UNKNOWN flag (`--bogus`) throw → we map that to exit 3
// (misuse), never a silent-ignore. The tier markers (--static/--push/--full; --changed when alone) and the value
// selectors (--package/--scope/--tier) live here; --file/--changed's PATHS arrive as positionals (only one
// scope selector is legal at a time, so a trailing `a b` unambiguously belongs to whichever is present).
const OPTIONS = {
  // scope selectors that take a value:
  package: { type: "string" },
  scope: { type: "string" },
  tier: { type: "string" },
  // scope-selector markers whose paths come from positionals:
  file: { type: "boolean" },
  changed: { type: "boolean" },
  // tier markers (bare, no value):
  static: { type: "boolean" },
  push: { type: "boolean" },
  full: { type: "boolean" },
  // run-shaping booleans:
  "strict-scope": { type: "boolean" },
  json: { type: "boolean" },
  list: { type: "boolean" },
  verbose: { type: "boolean" }, // stream each stage's full output live (default: compact — logs+json only)
} as const;

// The value-taking string options — a flag that must NOT swallow the NEXT flag as its value. parseArgs
// happily reads `--package --json` as package="--json"; we reject a value that is itself a flag (exit 3).
const VALUE_OPTIONS = new Set(["package", "scope", "tier"]);

/** A --tier <name> value must name a real, non-manual tier. */
const RUNNABLE_TIERS: ReadonlySet<Tier> = new Set<Tier>(RUNNABLE_VERIFY_TIERS);

interface ParsedValues {
  readonly package?: string;
  readonly scope?: string;
  readonly tier?: string;
  readonly file?: boolean;
  readonly changed?: boolean;
  readonly static?: boolean;
  readonly push?: boolean;
  readonly full?: boolean;
  readonly "strict-scope"?: boolean;
  readonly json?: boolean;
  readonly list?: boolean;
  readonly verbose?: boolean;
}

/** parseArgs, but any throw (unknown flag, missing value, dangling `=`) is turned into our misuse error —
 *  parseArgs already covers UNKNOWN flags and `--opt=` shapes; we ONLY add the flag-as-value guard below. */
function parseStrict(argv: readonly string[]): { readonly values: ParsedValues; readonly positionals: readonly string[] } | { readonly error: string } {
  // Guard the `--valueOption --nextFlag` footgun BEFORE parseArgs consumes the flag as a value. A value
  // given inline (`--package=db`) is fine; the hazard is only the space-separated `--package --json` form.
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (tok === undefined || !tok.startsWith("--") || tok.includes("=")) {
      continue;
    }
    const name = tok.slice(2);
    if (VALUE_OPTIONS.has(name)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { error: `--${name} needs a value` };
      }
    }
  }
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      options: OPTIONS,
      strict: true,
      allowPositionals: true,
    });
    return { values: values as ParsedValues, positionals };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Which single scope selector is present (0 ⇒ whole scope; \>1 ⇒ misuse). */
function scopeSelectorCount(v: ParsedValues): number {
  return [v.file, v.changed, v.package !== undefined, v.scope !== undefined].filter(Boolean).length;
}

// The two `--changed` sentinels: the working change vs HEAD, and the index vs HEAD.
const CHANGED_GIT = "git";
const CHANGED_STAGED = "staged";

/** No scope flag → whole scope. A distinct sentinel (not `undefined`) so the resolver stays total. */
const WHOLE_SCOPE = { none: true } as const;
type ScopeResult = SelectionRequest | typeof WHOLE_SCOPE | { readonly error: string };

/** The --file branch: ≥1 positional path, all under the repo + existing (the check:file muscle memory).
 *  The existence rule is the SHARED one (`_shared/scoped-run-paths.ts`, #1192) — `"claim"` because every
 *  `--file` positional is documented as a literal path, so a metacharacter does not excuse it. */
function fileRequest(positionals: readonly string[]): SelectionRequest | { readonly error: string } {
  if (positionals.length === 0) {
    return { error: "--file needs at least one path" };
  }
  const bad = unresolvedOperands(
    positionals.map((p) => resolveOperand(ROOT, p)),
    "claim",
  );
  if (bad.length > 0) {
    return { error: unresolvedRefusal(bad) };
  }
  return { kind: "file", paths: positionals };
}

/** The --changed branch: `--changed staged` = the index vs HEAD (the commit gate); `--changed git` (or bare) = the
 *  working change vs HEAD; other positionals = explicit paths. */
function changedRequest(positionals: readonly string[]): SelectionRequest {
  const [only] = positionals;
  if (positionals.length === 1 && only === CHANGED_STAGED) {
    return { kind: "staged" };
  }
  const paths = positionals.length === 1 && only === CHANGED_GIT ? [] : positionals;
  return { kind: "changed", paths };
}

/** Resolve the ONE scope request from the parsed flags + positionals, WHOLE_SCOPE for none, or an error. */
function scopeRequest(v: ParsedValues, positionals: readonly string[]): ScopeResult {
  const count = scopeSelectorCount(v);
  if (count === 0) {
    // Bare positionals with no scope selector are meaningless — reject rather than silently drop them.
    return positionals.length > 0
      ? {
          error: `unexpected argument(s): ${positionals.join(" ")} (did you mean --file / --changed?)`,
        }
      : WHOLE_SCOPE;
  }
  if (count > 1) {
    return { error: "at most one of --changed / --file / --package / --scope" };
  }
  if (v.file === true) {
    return fileRequest(positionals);
  }
  if (v.changed === true) {
    return changedRequest(positionals);
  }
  if (v.package !== undefined) {
    return v.package.length === 0 ? { error: "--package needs a name" } : { kind: "package", name: v.package };
  }
  const glob = v.scope ?? "";
  return glob.length === 0 ? { error: "--scope needs a folder glob" } : { kind: "scope", glob };
}

// The bare tier markers, in registry order. `--changed` alone also names its own (inner-loop) tier; next to
// `--static` it is only the selector, which is how pre-commit spells `--static --changed`.
const TIER_MARKERS: readonly (readonly [keyof ParsedValues, Tier])[] = [
  ["static", "static"],
  ["push", "push"],
  ["full", "full"],
];

/** The tier for a run: an explicit --tier <name> or a bare tier marker wins; else a scope flag (including
 *  `--changed`) implies `changed`; else `static`. A run may name AT MOST ONE distinct tier. */
function tierFor(v: ParsedValues, scoped: boolean): Tier | { readonly error: string } {
  const named = new Set<Tier>();
  for (const [key, tier] of TIER_MARKERS) {
    if (v[key] === true) {
      named.add(tier);
    }
  }
  if (v.tier !== undefined) {
    if (!RUNNABLE_TIERS.has(v.tier as Tier)) {
      return { error: `--tier must be one of ${RUNNABLE_VERIFY_TIERS.join(" / ")} (got "${v.tier}")` };
    }
    named.add(v.tier as Tier);
  }
  if (named.size > 1) {
    return { error: `at most one tier: got ${[...named].join(" ")}` };
  }
  // Push and full are whole-tree bars, and a scoped run skips the whole-run queue, so a scoped test battery
  // would run beside another checkout's. Only the commit gate's `--static --changed` pairs a tier with it.
  if (v.changed === true && (named.has("push") || named.has("full"))) {
    return { error: "--changed pairs only with --static (the commit gate); --push and --full run the whole tree" };
  }
  for (const sole of named) {
    return sole;
  }
  return scoped ? "changed" : "static";
}

/** An argv's meaning before its selection is resolved: the tier, the run flags and the scope REQUEST. */
export interface ParsedRequest extends Omit<Parsed, "selection"> {
  readonly request: SelectionRequest | undefined; // undefined = whole scope
}

/** The grammar alone. Resolving a selection reads the repository inventory and the compiler programs, which
 *  takes seconds, so a question about what an argv MEANS asks this and resolves nothing. */
export function parseRequest(argv: readonly string[]): ParsedRequest | { readonly error: string } {
  const parsedArgs = parseStrict(argv);
  if ("error" in parsedArgs) {
    return { error: parsedArgs.error };
  }
  const { values, positionals } = parsedArgs;
  const req = scopeRequest(values, positionals);
  if ("error" in req) {
    return { error: req.error };
  }
  const scoped = !("none" in req);
  const tier = tierFor(values, scoped);
  if (typeof tier === "object") {
    return { error: tier.error };
  }
  const strictScope = values["strict-scope"] === true;
  const list = values.list === true;
  const json = values.json === true;
  // Compact console is the DEFAULT everywhere (truncation-robust: the whole console fits, no live stage
  // stream to scroll the verdict away). Verbose is EXPLICIT-ONLY — the old `isTTY` auto-enable blasted
  // every `git push` (a hook's stdout IS a TTY), streaming ~full vitest/playwright/vite output through
  // lefthook (2026-07-17). A human who wants the live stream passes --verbose.
  const verbose = values.verbose === true;
  return { tier, request: "none" in req ? undefined : req, strictScope, list, json, verbose };
}

/** Parse argv into a run plan or a misuse error. Exported for the exit-code matrix unit test — a returned
 *  `{ error }` is what the cli maps to exit 3 (misuse); a `Parsed` is what runs. */
export function parse(argv: readonly string[]): Parsed | { readonly error: string } {
  const parsed = parseRequest(argv);
  if ("error" in parsed) {
    return parsed;
  }
  const { request, ...flags } = parsed;
  return { ...flags, selection: request === undefined ? undefined : resolveSelection(request) };
}
