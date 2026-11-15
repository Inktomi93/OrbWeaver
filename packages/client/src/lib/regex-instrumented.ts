// The regex editor's instrumented run: the production executor over one script, with the compiled flags and the
// match count read off its `applyReplace` seam and its failure off `onScriptFailure`. The tester and the pipeline
// both use it, and only the display-pass Worker calls it, because a find pattern can backtrack for minutes on a
// short sample and the Worker is the thread the page can terminate (depcruise `display-scripts-off-main-thread`).

import type { ProcessMacroOptions } from "@orb/kit/macro";
import type { RegexPassCall, RegexReplacer, RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";

/** What one script did to one text. */
export interface RegexPreview {
  /** What the text becomes. On a failed compile this is the text unchanged, as in production: the executor reports
   *  the failure and moves on with the text as it is. */
  readonly output: string;
  /** How many times the replacer fired. `0` with no error means the pattern is valid and did not match. */
  readonly matchCount: number;
  /** The flags the executor compiled with, or `null` when the pattern never compiled. */
  readonly flags: string | null;
  /** The executor's own failure message (invalid syntax, the length cap, or an output bound), else `null`. */
  readonly error: string | null;
}

function failureMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Run one script over `text` through the production executor and read what it did off the executor's seams. */
export function runInstrumentedRegex(script: RegexScriptInput, text: string, call: RegexPassCall, ctx: ProcessMacroOptions): RegexPreview {
  let matchCount = 0;
  let flags: string | null = null;
  let error: string | null = null;

  const output = executeRegexScripts({
    text,
    scripts: [script],
    call,
    ctx,
    applyReplace: (subject: string, regex: RegExp, replacer: RegexReplacer): string => {
      flags = regex.flags;
      return subject.replace(regex, (substring: string, ...rest: unknown[]): string => {
        matchCount += 1;
        return replacer(substring, ...rest);
      });
    },
    onScriptFailure: (err: unknown): void => {
      error = failureMessage(err);
    },
  });

  return { output, matchCount, flags, error };
}
