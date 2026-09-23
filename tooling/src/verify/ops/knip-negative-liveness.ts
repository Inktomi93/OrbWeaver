// The `config:knip-negative-liveness` stage: every LITERAL negative pattern in knip.ts must name a
// git-tracked file.
//
// WHAT NOTHING ELSE ASKS. A negative `entry`/`project`/`ignore` pattern subtracts a path from knip's view.
// Knip's config hints report an entry or project pattern that matches nothing, but not a NEGATION that
// matches nothing, so a negation whose file was deleted stays in the config and describes a file that no
// longer exists. It is also armed: a file later created or moved to that path is silently excluded from
// the production view. This stage makes that state red.
//
// SCOPE: literal paths only. A pattern with a glob character (`*`, `?`, `[`, `{`, `(`) is a wildcard
// subtraction whose subject may legitimately be absent, for example the gitignored ST-parity runtime under
// `scripts/probes/`, which does not exist in a worktree or a clean clone. Those stay out of scope.
//
// It reads the RESOLVED config (the module knip itself evaluates), not the file's text, so a pattern built
// by an expression is judged as knip sees it. The import is a repo-root config read licensed by the
// `tooling-root-config-import` reviewed grant. Tracked membership comes from the git index, the same
// source the policy resources use (`ops/resource-tracked.ts`); an unreadable index is exit 2.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import knipConfig from "../../../../knip.ts";
import type { DeadKnipNegation, KnipNegation, KnipNegativeOutcome, KnipPatternConfig } from "../contract/knip-negative-liveness.ts";
import { KNIP_PATTERN_KEYS } from "../contract/knip-negative-liveness.ts";
import { loadTrackedFiles } from "./resource-tracked.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:knip-negative-liveness");

/** The workspace key knip uses for the repository root. */
const ROOT_WORKSPACE = ".";
const NEGATION = "!";
/** knip's trailing production-mode marker (`src/x.ts!`), which is not part of the path. */
const PRODUCTION_MARKER = "!";
const GLOB_CHARACTER = /[*?[\]{}()]/u;

function patternsOf(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) {
    return [];
  }
  return typeof value === "string" ? [value] : value;
}

/** A negative pattern's path with the negation and the production marker removed, or undefined for a
 *  positive pattern. */
function negatedPath(pattern: string): string | undefined {
  if (!pattern.startsWith(NEGATION)) {
    return;
  }
  const body = pattern.slice(NEGATION.length);
  return body.endsWith(PRODUCTION_MARKER) ? body.slice(0, -PRODUCTION_MARKER.length) : body;
}

/** Every negative pattern in `config`, at the top level (the root workspace) and per workspace, with its
 *  negated path. */
function negations(config: KnipPatternConfig): readonly KnipNegation[] {
  const scopes: [string, KnipPatternConfig][] = [[ROOT_WORKSPACE, config], ...Object.entries(config.workspaces ?? {})];
  return scopes.flatMap(([workspace, scope]) =>
    KNIP_PATTERN_KEYS.flatMap((key) =>
      patternsOf(scope[key]).flatMap((pattern) => {
        const relative = negatedPath(pattern);
        return relative === undefined ? [] : [{ workspace, key, pattern, relative }];
      }),
    ),
  );
}

/** Judge every negative pattern in `config` against the tracked-file set. Pure. */
export function judgeKnipNegatives(config: KnipPatternConfig, tracked: ReadonlySet<string>): KnipNegativeOutcome {
  const all = negations(config);
  const literals = all.filter(({ relative }) => !GLOB_CHARACTER.test(relative));
  const dead: DeadKnipNegation[] = literals.flatMap(({ workspace, key, pattern, relative }) => {
    const bare = relative.replace(/^\.\//u, "");
    const path = workspace === ROOT_WORKSPACE ? bare : `${workspace}/${bare}`;
    return tracked.has(path) ? [] : [{ workspace, key, pattern, path }];
  });
  return { literal: literals.length, wildcard: all.length - literals.length, dead };
}

/** The report lines: the denominators first, then one line per dead negation. */
export function knipNegativeReport(outcome: KnipNegativeOutcome): readonly string[] {
  const lines = [
    `knip-negative-liveness — ${String(outcome.literal)} literal negative pattern(s) judged, ${String(outcome.dead.length)} dead; ${String(outcome.wildcard)} wildcard negative(s) out of scope`,
  ];
  for (const negation of outcome.dead) {
    lines.push(
      `  knip.ts workspace "${negation.workspace}" ${negation.key}: \`${negation.pattern}\` names ${negation.path}, which is not a tracked file. ` +
        "Delete the pattern; a file later created at that path would be excluded from knip's view with no signal.",
    );
  }
  return lines;
}

/** The `knip-negative-liveness` verb. Exit 0 = every literal negation names a tracked file; 1 = a dead
 *  negation is named; 2 = the git index could not be read. */
export function runKnipNegativeLiveness(root: string): number {
  const tracked = loadTrackedFiles(root);
  if (tracked.status !== "ready") {
    throw new Error(`knip-negative-liveness: the git index could not be read (${tracked.status}): ${tracked.reason}`);
  }
  const outcome = judgeKnipNegatives(knipConfig, new Set(tracked.value.repoPaths));
  for (const line of knipNegativeReport(outcome)) {
    process.stdout.write(`${line}\n`);
  }
  return outcome.dead.length > 0 ? EXIT.violations : EXIT.clean;
}
