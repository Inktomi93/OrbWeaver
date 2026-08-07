// THE PIPELINE DEBUGGER (REGX2) — "what will my scripts do to this text, on this leg, in what order".
//
// IT IS THE TESTER'S SIBLING, NOT ITS REPLACEMENT, and the difference is deliberate: "Try it" above
// neutralises the run gates so a switched-off draft still previews (ST's test mode does the same), and this
// panel HONOURS every gate and names the one that skipped each script. One asks what the pattern does; the
// other asks what will actually happen. Unifying them would destroy whichever question lost. Both go through
// ONE engine call (`../lib/regex-preview.ts`'s `runInstrumentedRegex`); the ordering model is
// `../lib/regex-pipeline.ts`, whose header carries the union-order law.
//
// NO NEW PANE, BY THE ANATOMY: the Configuration workspace has three slots (rows · the mounted member editor
// · the 320px context column) and no library-level tool slot, and minting one would be the second chrome
// grammar C-4 forbids. So the debugger lives where the question is asked — under the editor of the script
// you are looking at — and the subject is marked in place in the run.
//
// WHAT IT REFUSES TO IMPLY. It shows the always-on (global) tier plus this script; it cannot know the preset,
// the cast or the room, and it cannot honour `historyDepth` because a loose sample has no position in an
// assembled history. Both are said in the panel's own words rather than left for the reader to discover.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexPlacement } from "@orb/kit/regex";
import { HISTORY_DEPTH_PLACEMENT, REGEX_PLACEMENTS } from "@orb/kit/regex";
import { Badge } from "@orb/ui/badge";
import { Field } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";
import { useTRPC } from "#data";
import { REGEX_PLACEMENT_LABELS, regexScriptTitle } from "#lib";
// `REGEX_SKIP_REASONS` is imported as a TYPE: the tuple is only ever read in a `typeof` position here (the
// mapped `SKIP_COPY` Record), so a value import would pull it into the bundle for nothing.
import type { REGEX_SKIP_REASONS, RegexPipelineStage } from "../lib/regex-pipeline.ts";
import { runRegexPipeline } from "../lib/regex-pipeline.ts";
import { REGEX_PREVIEW_CHAR, REGEX_PREVIEW_DEFAULT_SAMPLE, REGEX_PREVIEW_MAX_INPUT, REGEX_PREVIEW_USER } from "../lib/regex-preview.ts";

const SAMPLE_ROWS = 3;
const OUTPUT_ROWS = 4;
const ONE_MATCH = 1;

/** The leg selector's visible label AND its trigger's accessible name — see the control. */
const STREAM_LABEL = "Stream";

/** The leg options, in the pipeline's own order and the SHARED vocabulary (side-eye F-23 — one pipeline, one
 *  set of names, so the chips in `Runs on` above and this selector can be read against each other). */
const LEG_ITEMS: readonly { readonly value: string; readonly label: string }[] = REGEX_PLACEMENTS.map((value) => ({
  value,
  label: REGEX_PLACEMENT_LABELS[value],
}));

/** WHY a script sat out, in words, keyed by the executor's own gate. A mapped Record over the TUPLE (never
 *  a switch in JSX, and never a re-declared union): a new gate in `@orb/kit/regex` that reaches the model's
 *  ladder fails tsc HERE instead of rendering a blank reason. */
const SKIP_COPY: Record<(typeof REGEX_SKIP_REASONS)[number], string> = {
  disabled: "switched off",
  "not-on-this-leg": "doesn’t run on this stream",
  "display-only": "display-only — it never touches the prompt",
  "prompt-only": "prompt-only — it never touches the rendered transcript",
};

/** What one stage did, in one line. The match count is READ off the production replacer, so "no matches"
 *  means the shipped engine found none. */
function stageStatus(stage: RegexPipelineStage): string {
  if (stage.skipped !== null) {
    return `Skipped — ${SKIP_COPY[stage.skipped]}.`;
  }
  if (stage.error !== null) {
    return `This pattern can’t run: ${stage.error}`;
  }
  if (stage.matchCount === 0) {
    return "No matches — the text passes through unchanged.";
  }
  return stage.matchCount === ONE_MATCH ? "1 match" : `${String(stage.matchCount)} matches`;
}

/** The status line's ink — a failed compile is destructive, a skip is a warning, and a stage that simply ran
 *  keeps the gloss. Colour is load-bearing here: both non-default arms CONTRADICT the run, and a grey
 *  "Skipped" reads as a caption. */
function statusInk(stage: RegexPipelineStage): string | undefined {
  if (stage.error !== null) {
    return "text-destructive";
  }
  return stage.skipped === null ? undefined : "text-warning";
}

export interface RegexPipelinePanelProps {
  /** The LIVE authored values, so the run moves with every keystroke — exactly like the tester above. */
  readonly script: CreateRegexScriptInput;
  /** This script's row id (`null` for a draft that has none yet) — decides whether it is found in the
   *  global tier or appended after it. */
  readonly scriptId: string | null;
}

/** The debugger: a sample and a leg in, the ordered run out. */
export function RegexPipelinePanel({ script, scriptId }: RegexPipelinePanelProps): ReactElement {
  const trpc = useTRPC();
  // The GLOBAL tier in its authored junction order — the same read the row list and the context pane make,
  // sharing their cache. It is the only slice a library surface can resolve (see the module header).
  const { data: globals } = useSuspenseQuery(trpc.regex.listGlobal.queryOptions());
  const [sample, setSample] = useState<string>(REGEX_PREVIEW_DEFAULT_SAMPLE);
  // Opens on a leg the subject actually runs on, so the first frame shows something rather than a full list
  // of "doesn't run on this stream". Falls back to the first leg for a script with no placement at all.
  const [leg, setLeg] = useState<RegexPlacement>(script.placement[0] ?? REGEX_PLACEMENTS[0]);

  const run = runRegexPipeline({ globals, subject: script, subjectId: scriptId, sample, placement: leg });
  const ran = run.stages.filter((stage) => stage.skipped === null && stage.matchCount > 0).length;

  return (
    <Section heading="In the pipeline">
      <Stack gap="field">
        <Text voice="gloss">
          Every always-on script that runs on one stream, in order, with what each one changes. Macros resolve against sample values ({REGEX_PREVIEW_CHAR} for
          the character, {REGEX_PREVIEW_USER} for you), not against a live chat.
        </Text>

        <Row align="end" gap="field">
          <Field label={STREAM_LABEL}>
            {/* ONE string for the field's visible label and the trigger's accessible name (the editor's own
                `Macros in the find pattern` pattern): jsx-a11y cannot see the Base UI Field association, and
                two hand-written copies are two chances for a screen reader to hear something else. */}
            <Select
              aria-label={STREAM_LABEL}
              items={LEG_ITEMS}
              onValueChange={(next): void => {
                setLeg(next as RegexPlacement);
              }}
              value={leg}
            />
          </Field>
        </Row>

        {/* "Text going in", never a second "Sample text": the tester one section up already owns that name,
            and two controls with the same accessible name on one pane is the exact defect side-eye X-1 found
            (the two "Display only"s, 320px apart). The pair here also READS as a pipeline — text going in,
            text after the whole stream. */}
        <Field label="Text going in">
          <Textarea
            maxLength={REGEX_PREVIEW_MAX_INPUT}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => {
              setSample(event.target.value);
            }}
            rows={SAMPLE_ROWS}
            value={sample}
          />
        </Field>

        {run.stages.map((stage, index) => (
          <PipelineStageRow index={index} key={stage.key} stage={stage} />
        ))}

        <Field
          description={ran === 0 ? "Nothing bit this sample on this stream." : `${String(ran)} script${ran === ONE_MATCH ? "" : "s"} changed the text.`}
          label="Text after the whole stream"
        >
          <Textarea readOnly={true} rows={OUTPUT_ROWS} value={run.output} />
        </Field>

        <PipelineCaveats leg={leg} script={script} subjectIsGlobal={run.subjectIsGlobal} />
      </Stack>
    </Section>
  );
}

/** ONE stage: its position, its name, what it did, and — only when it changed something — what it produced.
 *  A stage that changed nothing prints no textarea: the run's input is one scroll up and the output is one
 *  scroll down, and a column of identical boxes is how a reader stops reading a diagnostic. */
function PipelineStageRow({ stage, index }: { readonly stage: RegexPipelineStage; readonly index: number }): ReactElement {
  const changed = stage.after !== stage.before;
  return (
    // The marker rides INSIDE the kicker (`Section` has no trailing header slot), which is also where it
    // belongs for a screen reader: the stage's name is announced as "3 · strip ooc this script" rather than
    // leaving the mark stranded as an unrelated sibling. A Badge is a span, so it is legal inside the h3.
    <Section
      data-slot="regex-pipeline-stage"
      kicker={
        <Row align="center" gap="field">
          <span>{`${String(index + 1)} · ${regexScriptTitle({ name: stage.name })}`}</span>
          {stage.isSubject ? <SubjectMarker appended={stage.isAppended} /> : null}
        </Row>
      }
    >
      <Stack gap="tight">
        <Text className={statusInk(stage)} voice="gloss">
          {stageStatus(stage)}
        </Text>
        {changed ? (
          <Textarea aria-label={`Text after ${regexScriptTitle({ name: stage.name })}`} readOnly={true} rows={SAMPLE_ROWS} value={stage.after} />
        ) : null}
      </Stack>
    </Section>
  );
}

/** The "you are here" mark. The APPENDED arm says something different and load-bearing: this script is not
 *  in the always-on set, so its true position is after every script above it — wherever it is attached. */
function SubjectMarker({ appended }: { readonly appended: boolean }): ReactElement {
  return (
    <Badge intent={appended ? "neutral" : "info"} size="sm">
      {appended ? "this script, wherever it’s attached" : "this script"}
    </Badge>
  );
}

/** EVERYTHING THIS PANEL CANNOT SHOW, said out loud in the same breath as the result — the tester's own
 *  discipline, applied to a run instead of to a pattern. Each line is a real limit of a LIBRARY surface, not
 *  a missing feature: none of these facts exists outside a room. */
function PipelineCaveats({
  script,
  leg,
  subjectIsGlobal,
}: {
  readonly script: CreateRegexScriptInput;
  readonly leg: RegexPlacement;
  readonly subjectIsGlobal: boolean;
}): ReactElement {
  const scoped = leg === HISTORY_DEPTH_PLACEMENT && script.historyDepth !== undefined && (script.historyDepth.min > 0 || script.historyDepth.max !== null);
  return (
    <Stack gap="tight">
      <Text voice="gloss">
        A preset, a character or a room adds its own scripts AFTER these — in that order — and a library page has no room, no cast and no active preset, so this
        run can’t include them.
      </Text>
      {subjectIsGlobal ? null : (
        <Text voice="gloss">This script isn’t in the always-on set, so it is shown last: every scope that can attach it runs after the always-on tier.</Text>
      )}
      {scoped ? (
        // Deliberately NOT the tester's wording one section up: two identically-phrased warnings on one pane
        // read as one warning rendered twice. The tester's line is about the SCRIPT ("the result ignores your
        // depth range"); this one is about the RUN — every stage below was applied to one loose string, which
        // has no position for a depth bound to bite on.
        <Text className="text-warning" voice="gloss">
          Nothing here has a position in a chat history, so this script’s depth range is not applied — the run treats the sample as any message.
        </Text>
      ) : null}
    </Stack>
  );
}
