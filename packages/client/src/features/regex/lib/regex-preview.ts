// The regex TESTER's engine seam — ST's `Test Mode` (public/scripts/extensions/regex/editor.html
// `#regex_test_mode`, wired at index.js `updateTestResult`), which orbweaver had no answer to: the editor
// let you author a pattern and gave you no way to see it bite until you sent a real turn into a real chat.
//
// THE ENGINE IS THE PRODUCTION ENGINE, and that is the whole point of a tester. The run is `runInstrumentedRegex`
// (`#lib/regex-instrumented.ts`), which calls the kit's `executeRegexScripts`, the same function the display pass
// and the server's save and prompt passes call, and reads the compiled flags and the match count off its seams. A
// tester that agrees with a second engine is a tester that lies.
//
// THE TESTER NEUTRALISES THE RUN GATES; THE PIPELINE DEBUGGER HONOURS THEM. That difference is the point of
// having both, not an inconsistency to unify: `previewRegexScript` answers "what does this find/replace DO"
// and must not be silenced by the row being switched off or by its targets and passes (ST's test mode forces
// the same fields), while `regex-pipeline.ts` answers "what WILL actually happen at this time" and would be
// worthless if it ignored them. Both go through ONE engine call, `runInstrumentedRegex`.
//
// THE RUN IS IN THE DISPLAY-PASS WORKER (D75). A catastrophic pattern backtracks for minutes on a short near-miss,
// and the browser has no regex timeout, so both panels hand their scripts to the Worker the page can terminate
// (`packages/client/src/lib/display-pass-runner.ts` `runRegexPreview`). A script past its deadline is stopped for the session under
// the same key the transcript stops it by, and the panel says so.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { ProcessMacroOptions } from "@orb/kit/macro";
import type { RegexPassCall, RegexScriptInput } from "@orb/kit/regex";
import type { RegexPreviewRequest } from "#lib";

/** How much sample text the tester will run a pattern over: roughly one long chat message, the unit a regex script
 *  is written against. */
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

/** The macro context BOTH library-side previews resolve against — the single-script tester here and the
 *  multi-script PIPELINE debugger (`regex-pipeline.ts`), which reaches it through `runInstrumentedRegex`
 *  rather than importing it. One context, so two panels looking at the same script can never disagree about
 *  what `{{char}}` was. */
export const PREVIEW_MACRO_CTX: ProcessMacroOptions = {
  char: REGEX_PREVIEW_CHAR,
  user: REGEX_PREVIEW_USER,
  persona: "",
  scenario: "",
  env: {},
};

/** The call the probe runs on. Which one is IMMATERIAL to the output: the probe below holds exactly this pass and
 *  target, and a save call reads neither depth nor an author, so the tester shows the transformation itself, the
 *  way ST's test mode does. The panel states separately whether the script's own axes would ever get it run. */
const PREVIEW_CALL: RegexPassCall = { pass: "save", target: "USER_INPUT", edit: false };

/** The probe script. The run gates are forced open, for the same reason ST forces them: the tester answers "what
 *  does this find/replace DO", which must not be silenced by the row being switched off or by its targets and
 *  passes. Everything that shapes the TRANSFORMATION (`findRegex`, `replaceString`, `trimStrings`,
 *  `substituteRegex`) is taken from the live form.
 *
 *  Depth and the author scope are not carried, and that is not a further silencing: both read a message's place
 *  in a chat and who wrote it, and a loose sample has neither. The panel says so rather than letting the result
 *  imply the scope was honoured. */
function probeOf(script: CreateRegexScriptInput): RegexScriptInput {
  return {
    findRegex: script.findRegex,
    replaceString: script.replaceString,
    trimStrings: script.trimStrings,
    substituteRegex: script.substituteRegex,
    enabled: true,
    targets: [PREVIEW_CALL.target],
    passes: [PREVIEW_CALL.pass],
  };
}

/** The tester's preview request: one authored script over a sample, with the run gates neutralised (see
 *  {@link probeOf}). A stop names the script by its row id, or by none for a draft. */
export function regexTesterRequest(script: CreateRegexScriptInput, scriptId: RegexScriptId | null, sample: string): RegexPreviewRequest {
  return {
    entries: [{ script: probeOf(script), id: scriptId, findRegex: script.findRegex, name: script.name }],
    text: sample,
    call: PREVIEW_CALL,
    macroCtx: PREVIEW_MACRO_CTX,
  };
}
