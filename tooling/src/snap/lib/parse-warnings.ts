// Legal-but-surprising argv combinations that run with an explicit warning instead of refusing.
import type { Args } from "../contract/types.ts";

/** The CHEAP LADDER, MINUS `--text`/`--aria` — and that exclusion is the whole judgement here.
 *
 *  TWO RECORDED COSTS, both real (#1347 fork, 2026-09-04):
 *   • the ORIGINAL: `--goto corpus --out corpus-cartographer-merged --text` printed `out=(none)`, wrote
 *     no PNG, exited 0, and the caller lost the capture. That incident's argv is `--text`, and its pins
 *     (`tests/tooling/snap/index.test.ts`) still hold — a reviewer who names an artifact base while
 *     asking for the TEXT of a surface is the exact reader who expected an image too.
 *   • the NEW: the same warning fired five times in one review on `--eval`/`--contrast`/`--map`/
 *     `--expect-*` runs, where `--out` names the run's artifacts (index, diagnostics, manifest) and no
 *     image was ever the point. A warning that is wrong that often trains a reader to skip the ARG block
 *     that also carries the real refusals.
 *
 *  So the ruling survives — its INPUT changed: the warning is now scoped to the rungs the original
 *  incident actually names, and silent for the rungs it never contemplated. */
function asksForNonPixelEvidence(args: Args): boolean {
  return args.map || args.contrast.length > 0 || args.assertions.length > 0 || args.cascade.length > 0 || args.actions.some((entry) => entry.type === "eval");
}

export function parsedArgWarnings(args: Args): string[] {
  const producesShot = args.shotOf !== null || args.shot || args.baseline || args.diff;
  if (args.out === null || producesShot || asksForNonPixelEvidence(args)) {
    return [];
  }
  const stillNamed = args.json ? " (it still names the --json manifest and any trace/har)" : "";
  return [
    `--out "${args.out}" names an artifact base, but --text/--no-shot suppresses the PNG — NO IMAGE WILL BE WRITTEN${stillNamed}. ` +
      "Drop --text/--no-shot, or add --shot-of <selector>, to capture one.",
  ];
}
