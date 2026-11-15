// Whether the display regex pass drew markup on a row: true when a display script whose own template carries
// an HTML tag replaced at least one match. A styled row on the sandboxed tier renders its whole reply in one
// card frame (D354); markup the MODEL wrote never sets this, because only a script's template is read.
//
// The pass runs one script per executor call so every replacement is attributed to the script that made it.
// That is the executor's own loop (each script is skipped, applied or failed in order, on the previous
// script's output), so the text is identical to one call over the whole list.

import type { ExecuteRegexScriptsArgs, RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";

/** The display pass's text and whether a script's own template drew markup into it. */
export interface StyledDisplayText {
  readonly text: string;
  readonly styled: boolean;
}

// The executor's replacement grammar: `{{match}}` (any case), `$$`, `$N` and `$<name>`. Every token but `$$`
// splices captured text, which is model output and must not count as the script's own markup. `$$` is matched so
// `$$<b>` reads as a literal dollar before a tag, not as the named group `$<b>`; the dollar it leaves is no tag.
const REPLACEMENT_TOKEN_RE = /\{\{match\}\}|\$\$|\$\d+|\$<[^>]+>/gi;
const HTML_TAG_RE = /<\/?[A-Za-z]/;

function templateDrawsMarkup(script: RegexScriptInput): boolean {
  return HTML_TAG_RE.test(script.replaceString.replace(REPLACEMENT_TOKEN_RE, ""));
}

/** Whether any of these display scripts can style a row: its own template draws markup. A streaming reply under such
 *  scripts may settle styled, so it holds its own HTML blocks until then. */
export function scriptsDrawMarkup(scripts: readonly RegexScriptInput[]): boolean {
  return scripts.some(templateDrawsMarkup);
}

/** Run the display scripts in order, reporting whether a markup-drawing template replaced anything. */
export function executeDisplayScripts(args: ExecuteRegexScriptsArgs): StyledDisplayText {
  const applyReplace = args.applyReplace ?? ((subject, regex, replacer): string => subject.replace(regex, replacer));
  let text = args.text;
  let styled = false;
  for (const script of args.scripts) {
    // A script whose replacer throws on a later match leaves the text as it was yet still counts here. That can
    // only frame a row that is already on the sandboxed tier, which the tier allows; it never reveals anything.
    let replacements = 0;
    text = executeRegexScripts({
      ...args,
      text,
      scripts: [script],
      applyReplace: (subject, regex, replacer) =>
        applyReplace(subject, regex, (...match) => {
          replacements += 1;
          return replacer(...match);
        }),
    });
    styled ||= replacements > 0 && templateDrawsMarkup(script);
  }
  return { text, styled };
}
