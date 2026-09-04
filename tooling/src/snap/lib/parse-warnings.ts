// Legal-but-surprising argv combinations that run with an explicit warning instead of refusing.
import type { Args } from "../contract/types.ts";

export function parsedArgWarnings(args: Args): string[] {
  const producesShot = args.shotOf !== null || args.shot || args.baseline || args.diff;
  if (args.out === null || producesShot) {
    return [];
  }
  const stillNamed = args.json ? " (it still names the --json manifest and any trace/har)" : "";
  return [
    `--out "${args.out}" names an artifact base, but --text/--no-shot suppresses the PNG — NO IMAGE WILL BE WRITTEN${stillNamed}. ` +
      "Drop --text/--no-shot, or add --shot-of <selector>, to capture one.",
  ];
}
