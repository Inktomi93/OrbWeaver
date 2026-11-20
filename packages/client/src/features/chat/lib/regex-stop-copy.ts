// The words for a regex script that did not run: one this browser's display pass stopped, or a host script a server
// pass did not apply, with why and on which text. The room's notice and the On screen roster both read them, so the
// two never describe one stop differently. Exhaustive over the contract's two tuples, so a new cause or pass fails
// `tsc` here until it has words.

import type { RegexNotAppliedCause, RegexServerPass } from "@orb/contracts/chat";

/** Why, as a clause after the script's name. */
function regexNotAppliedCauseWords(cause: RegexNotAppliedCause): string {
  switch (cause) {
    case "row_deadline":
      return "ran too long";
    case "pass_budget":
      return "was skipped because the scripts before it used up the time allowed";
    case "substitution_too_long":
      return "has macros that made its find pattern too long";
    case "output_too_long":
      return "would have made the text too long";
    case "did_not_compile":
      return "has a find pattern that would not run";
    default:
      return assertNeverCause(cause);
  }
}

/** Where, as a clause after the cause. */
function regexServerPassWords(pass: RegexServerPass): string {
  switch (pass) {
    case "user_input":
      return "on a message as it was saved";
    case "ai_output":
      return "on a reply as it was saved";
    case "reasoning":
      return "on a reply's reasoning as it was saved";
    case "world_info":
      return "on world info in the prompt";
    case "prompt_history":
      return "on the chat history in the prompt";
    case "edit_reapply":
      return "when an edited message was saved";
    default:
      return assertNeverPass(pass);
  }
}

/** The name a notice gives a script the host's library no longer holds. */
const REGEX_UNKNOWN_SCRIPT_NAME = "A script no longer in your library";

/** What to do about a stopped or skipped script, the same words wherever one is reported. */
const REGEX_STOP_NEXT_STEP = "Fix its find pattern in your regex library, or switch it off in This chat under Regex.";

/** The roster's mark on a script this browser stopped, and its reason under the row. The browser tries it again
 *  after a reload, so the reason says that a reload alone does not fix it. */
export const REGEX_BROWSER_STOPPED_MARK = "Stopped";
export const REGEX_BROWSER_STOPPED_REASON = `It ran too long on this device, so it is off here until you reload, and then it is tried again. ${REGEX_STOP_NEXT_STEP}`;

/** The roster's mark on a script a server pass did not apply, and its reason under the row. */
export const REGEX_NOT_APPLIED_MARK = "Not applied";

export function regexNotAppliedReason(cause: RegexNotAppliedCause, pass: RegexServerPass): string {
  return `The server did not apply it: it ${regexNotAppliedCauseWords(cause)} ${regexServerPassWords(pass)}. ${REGEX_STOP_NEXT_STEP}`;
}

/** The step a skipped-script notice offers when it names one script: that script's row in the room's This chat tab. */
export const REGEX_STOP_OPEN_SCRIPT_NAME = "Show this script";

/** The step the notice offers when it holds only a count of scripts with no ids: the room's This chat tab, where the Regex section lists them. */
export const REGEX_STOP_OPEN_ROOM_NAME = "Open This chat";

/** The room's one notice for every script a server pass did not apply this session. `latest` names the newest. */
export function regexNotAppliedTitle(count: number): string {
  return count === 1 ? "A regex script was not applied" : `${String(count)} regex scripts were not applied`;
}

/** The notice's description. `latest` is `undefined` when every script was reported past a turn's naming cap, as a
 *  count alone. */
export function regexNotAppliedDescription(
  latest: { readonly name: string | null; readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass } | undefined,
  count: number,
  more: number,
): string {
  if (latest === undefined) {
    return `${more === 1 ? "A script was" : `${String(more)} scripts were`} not applied on the server, so that text went on without ${more === 1 ? "it" : "them"}. ${REGEX_STOP_NEXT_STEP}`;
  }
  const name = latest.name === null ? REGEX_UNKNOWN_SCRIPT_NAME : `"${latest.name}"`;
  const who = count === 1 ? name : `The latest, ${name},`;
  const rest = more === 0 ? "" : ` ${String(more)} more ${more === 1 ? "script was" : "scripts were"} not applied in the same turns.`;
  return `${who} ${regexNotAppliedCauseWords(latest.cause)} ${regexServerPassWords(latest.pass)}, so that text went on without it.${rest} ${REGEX_STOP_NEXT_STEP}`;
}

function assertNeverCause(cause: never): never {
  throw new Error(`regexNotAppliedCauseWords: unhandled cause ${JSON.stringify(cause)}`);
}

function assertNeverPass(pass: never): never {
  throw new Error(`regexServerPassWords: unhandled pass ${JSON.stringify(pass)}`);
}
