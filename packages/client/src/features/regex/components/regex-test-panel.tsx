// The regex TESTER — ST parity for `Test Mode` (its editor's `#regex_test_mode`), which orbweaver shipped
// without: you could author a pattern and the only way to find out whether it bit was to send a real turn
// into a real chat and read the transcript. This panel answers the question in the editor, live.
//
// It runs the PRODUCTION engine (`@orb/kit/regex`'s `executeRegexScripts`, the same call the display pass and the
// server's passes make) in the display-pass Worker, so a runaway pattern stops at the Worker's deadline instead of
// freezing the page. See `../lib/regex-preview.ts` for why a tester with its own regex engine is worse than none.
//
// FEATURE-LOCAL, like the fields it sits under: the editor moved out of `components/` when the config rail
// took over (regex-editor-fields.tsx's header states the rule — tier 2 is for what TWO features need), and
// the panel has exactly one consumer.
//
// IT ALSO ANSWERS THE SECOND QUESTION — "would this ever run?". The probe deliberately neutralises
// `enabled`, the targets and the passes so a switched-off draft still previews, which would be a lie
// if the panel stopped there: so when the row is off, or runs nowhere, the panel says so in the same
// breath as the result. That is the F3 class — a script that can never fire, with nothing on screen saying
// so — caught at authoring time instead of at silence time.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import { Field } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";
import type { RegexPreviewOutcome } from "#lib";
import { regexRunsNowhere } from "#lib";
import { useRegexPreview } from "../hooks/use-regex-preview.ts";
import { REGEX_PREVIEW_RUNNING, REGEX_PREVIEW_STOPPED, REGEX_PREVIEW_UNAVAILABLE, REGEX_RESULT_NAME, REGEX_SAMPLE_TEXT_NAME } from "../lib/regex-names.ts";
import { REGEX_PREVIEW_CHAR, REGEX_PREVIEW_DEFAULT_SAMPLE, REGEX_PREVIEW_MAX_INPUT, REGEX_PREVIEW_USER, regexTesterRequest } from "../lib/regex-preview.ts";

const SAMPLE_ROWS = 3;
const ONE_MATCH = 1;

/** What the run says about itself, in one line — the FAILURE is not spelled here (it rides the field's own
 *  `error` slot, so it is announced as a validity message rather than as prose). The match count is READ
 *  off the production replacer (never re-counted), so "no matches" here means the shipped engine found
 *  none — not that a second engine disagreed. */
function previewStatus(preview: Extract<RegexPreviewOutcome, { readonly kind: "ran" }>, sample: string): string {
  if (sample === "") {
    return "Paste or type some text above to test the pattern against it.";
  }
  if (preview.matchCount === 0) {
    return "No matches in this sample.";
  }
  const matches = preview.matchCount === ONE_MATCH ? "1 match" : `${preview.matchCount} matches`;
  // The flags are the COMPILED ones, which is the fact worth showing: a bare pattern is always run `gm`
  // here (`@orb/kit/regex` forces `g` — every match, always — and defaults to multiline), so a user who
  // wrote `^` and expected it to mean "start of message" can see that it means "start of line".
  return preview.flags === null ? matches : `${matches} · flags ${preview.flags}`;
}

/** Why this script would NOT run in a chat as currently authored — `null` when it would. The tester's probe
 *  ignores both facts on purpose (see the header); this is where they are said out loud. */
function runCaveat(script: CreateRegexScriptInput): string | null {
  if (!script.enabled) {
    return "Heads up: this script is switched off, so it only runs here in the tester.";
  }
  if (regexRunsNowhere(script)) {
    return "Heads up: this script has no text or no time to run at, so it never runs outside the tester.";
  }
  // THE ONE THING THE TESTER HONESTLY CANNOT SHOW. Depth and the author scope select WHICH MESSAGES of a chat a
  // script touches; the sample below is one loose string with no place in a chat and no author, so the probe
  // leaves both off (`../lib/regex-preview`). Showing the transformation while silently ignoring the scope would
  // be the tester lying by omission, so it says so in the same breath as the result.
  if (script.depth !== undefined || (script.authors !== undefined && (script.authors.include.length > 0 || script.authors.exclude.length > 0))) {
    return "Heads up: the depth range and the whose-messages lists only apply in a real chat, so the result below ignores them. This shows what the pattern does, not which messages it reaches.";
  }
  return null;
}

// The tester's request carries one entry, so its answer is that entry's outcome.
function firstOutcome(_subject: unknown, outcomes: readonly RegexPreviewOutcome[]): RegexPreviewOutcome | undefined {
  return outcomes[0];
}

/** The result field's description and error for one outcome: a stop or an unavailable runner is the error slot,
 *  because the result above it is the sample untouched. */
function resultLines(
  outcome: RegexPreviewOutcome | undefined,
  pending: boolean,
  sample: string,
): { readonly description: string | null; readonly error: string | null } {
  if (outcome === undefined) {
    return { description: REGEX_PREVIEW_RUNNING, error: null };
  }
  if (outcome.kind === "stopped") {
    return { description: null, error: REGEX_PREVIEW_STOPPED };
  }
  if (outcome.kind === "unavailable") {
    return { description: null, error: REGEX_PREVIEW_UNAVAILABLE };
  }
  if (outcome.error !== null) {
    return { description: null, error: `This pattern can't run: ${outcome.error}` };
  }
  return { description: pending ? REGEX_PREVIEW_RUNNING : previewStatus(outcome, sample), error: null };
}

export interface RegexTestPanelProps {
  /** The LIVE authored values — the panel is driven from the form's own state, so the result moves with
   *  every keystroke in the pattern, the replacement, the trim list and the macro-substitution mode. */
  readonly script: CreateRegexScriptInput;
  /** The row id of the script, or `null` for a draft: a stop is keyed by it, as the transcript keys one. */
  readonly scriptId: RegexScriptId | null;
}

/** The tester: a sample in, the real engine's output out. */
export function RegexTestPanel({ script, scriptId }: RegexTestPanelProps): ReactElement {
  const [sample, setSample] = useState<string>(REGEX_PREVIEW_DEFAULT_SAMPLE);
  const { answer: outcome, pending } = useRegexPreview({ request: regexTesterRequest(script, scriptId, sample) }, firstOutcome);
  const lines = resultLines(outcome, pending, sample);
  const caveat = runCaveat(script);

  return (
    <Section heading="Try it">
      <Stack gap="field">
        <Text voice="gloss">
          Runs this script through the real engine. Macros resolve against sample values ({REGEX_PREVIEW_CHAR} for the character, {REGEX_PREVIEW_USER} for you),
          not against a live chat.
        </Text>

        <Field label={REGEX_SAMPLE_TEXT_NAME}>
          <Textarea
            maxLength={REGEX_PREVIEW_MAX_INPUT}
            rows={SAMPLE_ROWS}
            value={sample}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
              setSample(event.target.value);
            }}
          />
        </Field>

        <Field
          description={lines.description}
          error={lines.error}
          label={REGEX_RESULT_NAME}
          // The result is a READING, not an input — but it stays a textarea so long output scrolls and can
          // be selected/copied, which is what a user does with it next.
        >
          <Textarea readOnly={true} rows={SAMPLE_ROWS} value={outcome?.output ?? sample} />
        </Field>

        {/* `voice` + a token ink class, never the internal size/tone axes (density §2.3 — a feature passing
            those is a gate violation, and this file became feature-tier when the editor left `components/`).
            The colour is the point: this line contradicts the result directly above it. */}
        {caveat === null ? null : (
          <Text tone="warning" voice="gloss">
            {caveat}
          </Text>
        )}
      </Stack>
    </Section>
  );
}
