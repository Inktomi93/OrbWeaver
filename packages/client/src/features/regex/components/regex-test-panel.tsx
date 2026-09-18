// The regex TESTER — ST parity for `Test Mode` (its editor's `#regex_test_mode`), which orbweaver shipped
// without: you could author a pattern and the only way to find out whether it bit was to send a real turn
// into a real chat and read the transcript. This panel answers the question in the editor, live.
//
// It runs the PRODUCTION engine (`../lib/regex-preview` → `@orb/kit/regex`'s `executeRegexScripts`, the
// same call the DISPLAY tier and the server legs make) — see that module's header for why a tester with its
// own regex engine is worse than no tester, and for the client/server watchdog split it does not hide.
//
// FEATURE-LOCAL, like the fields it sits under: the editor moved out of `components/` when the config rail
// took over (regex-editor-fields.tsx's header states the rule — tier 2 is for what TWO features need), and
// the panel has exactly one consumer.
//
// IT ALSO ANSWERS THE SECOND QUESTION — "would this ever run?". The probe deliberately neutralises
// `enabled` and `placement` so a switched-off draft still previews, which would be a lie
// if the panel stopped there: so when the row is off, or bites no stream, the panel says so in the same
// breath as the result. That is the F3 class — a script that can never fire, with nothing on screen saying
// so — caught at authoring time instead of at silence time.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { Field } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";
import type { RegexPreview } from "../lib/regex-preview.ts";
import { previewRegexScript, REGEX_PREVIEW_CHAR, REGEX_PREVIEW_DEFAULT_SAMPLE, REGEX_PREVIEW_MAX_INPUT, REGEX_PREVIEW_USER } from "../lib/regex-preview.ts";

const SAMPLE_ROWS = 3;
const ONE_MATCH = 1;

/** What the run says about itself, in one line — the FAILURE is not spelled here (it rides the field's own
 *  `error` slot, so it is announced as a validity message rather than as prose). The match count is READ
 *  off the production replacer (never re-counted), so "no matches" here means the shipped engine found
 *  none — not that a second engine disagreed. */
function previewStatus(preview: RegexPreview, sample: string): string {
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
  if (script.placement.length === 0) {
    return "Heads up: no streams are selected under “Runs on”, so this script never runs outside the tester.";
  }
  // THE ONE THING THE TESTER HONESTLY CANNOT SHOW. A depth bound selects WHICH MESSAGES of an assembled
  // history a script touches; the sample below is one loose string with no position in any history, so the
  // bound has nothing to bite on and the probe deliberately leaves it off (`../lib/regex-preview`). Showing
  // the transformation while silently ignoring the scope would be the tester lying by omission — so it says
  // so, in the same breath as the result, exactly like the two arms above.
  if (script.historyDepth !== undefined && (script.historyDepth.min > 0 || script.historyDepth.max !== null)) {
    return "Heads up: the depth range only applies to real chat history, so the result below ignores it — this shows what the pattern does, not which messages it reaches.";
  }
  return null;
}

export interface RegexTestPanelProps {
  /** The LIVE authored values — the panel is driven from the form's own state, so the result moves with
   *  every keystroke in the pattern, the replacement, the trim list and the macro-substitution mode. */
  readonly script: CreateRegexScriptInput;
}

/** The tester: a sample in, the real engine's output out. */
export function RegexTestPanel({ script }: RegexTestPanelProps): ReactElement {
  const [sample, setSample] = useState<string>(REGEX_PREVIEW_DEFAULT_SAMPLE);
  const preview = previewRegexScript(script, sample);
  const caveat = runCaveat(script);

  return (
    <Section heading="Try it">
      <Stack gap="field">
        <Text voice="gloss">
          Runs this script through the real engine. Macros resolve against sample values ({REGEX_PREVIEW_CHAR} for the character, {REGEX_PREVIEW_USER} for you),
          not against a live chat.
        </Text>

        <Field label="Sample text">
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
          description={preview.error === null ? previewStatus(preview, sample) : null}
          error={preview.error === null ? null : `This pattern can't run: ${preview.error}`}
          label="Result"
          // The result is a READING, not an input — but it stays a textarea so long output scrolls and can
          // be selected/copied, which is what a user does with it next.
        >
          <Textarea readOnly={true} rows={SAMPLE_ROWS} value={preview.output} />
        </Field>

        {/* `voice` + a token ink class, never the internal size/tone axes (density §2.3 — a feature passing
            those is a gate violation, and this file became feature-tier when the editor left `components/`).
            The colour is the point: this line contradicts the result directly above it. */}
        {caveat === null ? null : (
          <Text className="text-warning" voice="gloss">
            {caveat}
          </Text>
        )}
      </Stack>
    </Section>
  );
}
