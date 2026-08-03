// The regex TESTER's engine seam — ST's `Test Mode` (public/scripts/extensions/regex/editor.html
// `#regex_test_mode`, wired at index.js `updateTestResult`), which orbweaver had no answer to: the editor
// let you author a pattern and gave you no way to see it bite until you sent a real turn into a real chat.
//
// THE ENGINE IS THE PRODUCTION ENGINE, and that is the whole point of a tester. This module calls
// `executeRegexScripts` from `@orb/kit/regex` — the same function the DISPLAY tier calls in
// `message-render.ts` and the same one the server's SEND/RECEIVE/WI legs call — so the pattern parsing
// (`/…/flags` vs bare, the forced `g`), the complexity cap, the macro pass on the replacement template, the
// `{{match}}`/`$N`/`$<name>` splice and the `trimStrings` filter are all the shipped behaviour, never a
// lookalike re-implementation. A tester that agrees with a second engine is a tester that lies.
//
// WHAT THE SEAMS BUY US, without leaving that path: `applyReplace` (the seam the SERVER uses to inject its
// node:vm watchdog) hands us the REAL compiled `RegExp` and wraps the real replacer, so the effective flags
// and the match count are READ off the production compile rather than re-derived; `onScriptFailure` (the
// seam the server wires to its logger) is where an invalid or over-complex pattern surfaces, with the
// executor's own message.
//
// THE CLIENT/SERVER SPLIT IS REAL AND IS NOT HIDDEN (D75): the server wraps `applyReplace` in a
// node:vm-sandboxed replace with a 50 ms watchdog; a browser has no such lever, so — exactly like the
// DISPLAY tier it shares a process with — this preview runs UNWATCHED. That is why the sample is capped:
// the pattern is unbounded and user-authored, so the haystack it is handed is not.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { ProcessMacroOptions } from "@orb/kit/macro";
import type { RegexPlacement, RegexReplacer, RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";

/** How much sample text the tester will run a pattern over. The browser has no watchdog (see the header),
 *  so the bound on catastrophic backtracking is the haystack. Roughly one long chat message — the unit a
 *  regex script is actually written against. */
export const REGEX_PREVIEW_MAX_INPUT = 4000;

/** The sample a freshly-opened tester starts from: prose carrying the three things scripts are written to
 *  strip or reshape — an emote, an OOC aside, and a stray artifact — so the empty tester is already
 *  demonstrating something rather than asking the user to invent a fixture. */
export const REGEX_PREVIEW_DEFAULT_SAMPLE = "*The goblin snarls and raises its cleaver.*\n\nOOC: keep it short, please.";

/** The macro subjects the preview resolves against. The editor is a LIBRARY surface — it is not opened
 *  inside any chat — so `{{char}}`/`{{user}}` have no real value to take here. Naming them out loud (and
 *  showing the names in the panel's own copy) beats resolving them to empty strings, which reads as a
 *  broken macro rather than as an absent room. */
export const REGEX_PREVIEW_CHAR = "Aria";
export const REGEX_PREVIEW_USER = "You";

const PREVIEW_MACRO_CTX: ProcessMacroOptions = {
  char: REGEX_PREVIEW_CHAR,
  user: REGEX_PREVIEW_USER,
  persona: "",
  scenario: "",
  env: {},
};

/** The leg the probe runs on. Which one is IMMATERIAL to the output — the executor branches on placement
 *  only for membership and for the two tier masks, and the probe below neutralises all three — so the
 *  tester shows the transformation itself, the way ST's test mode does (its probe carries
 *  `placement: null`). The panel states separately whether the script's OWN placement set would ever get
 *  it run. */
const PREVIEW_PLACEMENT: RegexPlacement = "USER_INPUT";

export interface RegexPreview {
  /** What the sample becomes. On a failed compile this is the sample UNCHANGED — which is what production
   *  does too: `executeRegexScripts` reports the failure and moves on with the text as-is. */
  readonly output: string;
  /** How many times the replacer actually fired. `0` with no error = the pattern is valid and did not bite. */
  readonly matchCount: number;
  /** The flags the executor really compiled with (`gm` for a bare pattern; the slash form's own flags plus a
   *  forced `g`). `null` when the pattern never compiled. */
  readonly flags: string | null;
  /** The executor's own failure message (invalid syntax, or the complexity cap), else `null`. */
  readonly error: string | null;
}

function failureMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The probe script. Three fields are forced, for the same reason ST forces them: the tester answers "what
 *  does this find/replace DO", which must not be silenced by the row being switched off, by its placement
 *  set, or by the derived display/prompt masks. Everything that shapes the TRANSFORMATION —
 *  `findRegex`, `replaceString`, `trimStrings`, `substituteRegex` — is taken from the live form.
 *
 *  `historyDepth` is the one authored field deliberately NOT carried, and it is not a fourth silencing: the
 *  gate needs a message's POSITION in an assembled history, and a loose sample has none (the call below
 *  passes no `depth`, so the executor's gate is inert either way). The panel says so out loud rather than
 *  letting the result imply the scope was honoured. */
function probeOf(script: CreateRegexScriptInput): RegexScriptInput {
  return {
    findRegex: script.findRegex,
    replaceString: script.replaceString,
    trimStrings: script.trimStrings,
    substituteRegex: script.substituteRegex,
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    placement: [PREVIEW_PLACEMENT],
  };
}

/** Run one authored script over a sample through the production executor. Pure — safe to call in render. */
export function previewRegexScript(script: CreateRegexScriptInput, sample: string): RegexPreview {
  let matchCount = 0;
  let flags: string | null = null;
  let error: string | null = null;

  const output = executeRegexScripts({
    text: sample,
    scripts: [probeOf(script)],
    placement: PREVIEW_PLACEMENT,
    ctx: PREVIEW_MACRO_CTX,
    // The server's watchdog seam, used here as an instrument: same call, same regex, same replacer — we
    // only read what passes through it.
    applyReplace: (text: string, regex: RegExp, replacer: RegexReplacer): string => {
      flags = regex.flags;
      return text.replace(regex, (substring: string, ...rest: unknown[]): string => {
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
