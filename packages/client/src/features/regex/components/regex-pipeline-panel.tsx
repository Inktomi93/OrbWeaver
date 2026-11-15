// THE PIPELINE DEBUGGER (REGX2) — "what will my scripts do to this text, at this time, in what order".
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
// the characters or the room, and it cannot honour depth or the author scope because a loose sample has no position
// in a chat and no author. Both are said in the panel's own words rather than left for the reader to discover.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexPass, RegexSkipReason, RegexTarget } from "@orb/kit/regex";
import { REGEX_PASSES, REGEX_TARGETS, regexPassReadsTarget } from "@orb/kit/regex";
import { Badge } from "@orb/ui/badge";
import { Field } from "@orb/ui/field";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";
import { useSuspenseQuery, useTRPC } from "#data";
import { REGEX_PASS_LABELS, REGEX_TARGET_LABELS, regexScriptTitle } from "#lib";
import { REGEX_PIPELINE_TEXT_NAME, REGEX_PIPELINE_WHEN_NAME, REGEX_TEXT_AFTER_EVERY_SCRIPT_NAME, REGEX_TEXT_GOING_IN_NAME } from "../lib/regex-names.ts";
import type { RegexPipelinePair, RegexPipelineStage } from "../lib/regex-pipeline.ts";
import { regexPipelineCall, regexPipelinePair, runRegexPipeline } from "../lib/regex-pipeline.ts";
import { REGEX_PREVIEW_CHAR, REGEX_PREVIEW_DEFAULT_SAMPLE, REGEX_PREVIEW_MAX_INPUT, REGEX_PREVIEW_USER } from "../lib/regex-preview.ts";
import { regexUnreadReasons } from "../lib/regex-when.ts";

const SAMPLE_ROWS = 3;
const OUTPUT_ROWS = 4;
const ONE_MATCH = 1;

/** The text options. Each is offered: picking one the time does not read moves the time to one that does. */
const TEXT_ITEMS: readonly { readonly value: RegexTarget; readonly label: string }[] = REGEX_TARGETS.map((value) => ({
  value,
  label: REGEX_TARGET_LABELS[value],
}));

/** The time options, each disabled with its reason while it does not read the chosen text. */
function whenItems(
  target: RegexTarget,
): readonly { readonly value: RegexPass; readonly label: string; readonly disabled: boolean; readonly description?: string }[] {
  return REGEX_PASSES.map((value) =>
    regexPassReadsTarget(value, target)
      ? { value, label: REGEX_PASS_LABELS[value], disabled: false }
      : { value, label: REGEX_PASS_LABELS[value], disabled: true, description: regexUnreadReasons([target]) },
  );
}

/** The pair the panel opens on: a time the script runs at and a text that time reads, so the first frame shows
 *  the script working rather than a list of skips. */
function openingPair(script: CreateRegexScriptInput): RegexPipelinePair {
  const pass = script.passes[0] ?? REGEX_PASSES[0];
  return regexPipelinePair(pass, script.targets.find((candidate) => regexPassReadsTarget(pass, candidate)) ?? REGEX_TARGETS[0]);
}

/** WHY a script sat out, in words, keyed by the executor's own gate (`@orb/kit/regex` `regexSkipReason`). A mapped
 *  Record over the kit's union, so a new gate fails tsc HERE instead of rendering a blank reason. The run never
 *  passes an edit, a depth or a room, so the last three are named for completeness only. */
const SKIP_COPY: Record<RegexSkipReason, string> = {
  disabled: "switched off",
  "not-on-this-pass": "doesn’t run at this time",
  "not-on-this-target": "doesn’t change this text",
  "not-on-edit": "doesn’t run when a message is edited",
  "out-of-depth": "outside its depth range",
  "not-this-author": "not for this author",
};

/** What one stage did, in one line. The match count is READ off the production replacer, so "no matches"
 *  means the shipped engine found none. */
function stageStatus(stage: RegexPipelineStage): string {
  if (stage.skipped !== null) {
    return `Skipped: ${SKIP_COPY[stage.skipped]}.`;
  }
  if (stage.error !== null) {
    return `This pattern can’t run: ${stage.error}`;
  }
  if (stage.matchCount === 0) {
    return "No matches: the text passes through unchanged.";
  }
  return stage.matchCount === ONE_MATCH ? "1 match" : `${String(stage.matchCount)} matches`;
}

/** The status line's tone — a failed compile is destructive, a skip is a warning, and a stage that simply ran
 *  keeps the gloss. Colour is load-bearing here: both non-default arms CONTRADICT the run, and a grey
 *  "Skipped" reads as a caption. */
function statusTone(stage: RegexPipelineStage): "destructive" | "warning" | undefined {
  if (stage.error !== null) {
    return "destructive";
  }
  return stage.skipped === null ? undefined : "warning";
}

export interface RegexPipelinePanelProps {
  /** The LIVE authored values, so the run moves with every keystroke — exactly like the tester above. */
  readonly script: CreateRegexScriptInput;
  /** This script's row id (`null` for a draft that has none yet) — decides whether it is found in the
   *  global tier or appended after it. */
  readonly scriptId: string | null;
}

/** The debugger: a sample, a text and a time in, the ordered run out. */
export function RegexPipelinePanel({ script, scriptId }: RegexPipelinePanelProps): ReactElement {
  const trpc = useTRPC();
  // The GLOBAL tier in its authored junction order — the same read the row list and the context pane make,
  // sharing their cache. It is the only slice a library surface can resolve (see the module header).
  const { data: globals } = useSuspenseQuery(trpc.regex.listGlobal.queryOptions());
  const [sample, setSample] = useState<string>(REGEX_PREVIEW_DEFAULT_SAMPLE);
  const [pair, setPair] = useState(() => openingPair(script));
  const run = runRegexPipeline({ globals, subject: script, subjectId: scriptId, sample, call: regexPipelineCall(pair) });
  const ran = run.stages.filter((stage) => stage.skipped === null && stage.matchCount > 0).length;

  return (
    <Section heading="In the pipeline">
      <Stack gap="field">
        <Text voice="gloss">
          Every always-on script that changes one text at one time, in order, with what each one changes. Macros resolve against sample values (
          {REGEX_PREVIEW_CHAR} for the character, {REGEX_PREVIEW_USER} for you), not against a live chat.
        </Text>

        <Row align="end" gap="field" wrap={true}>
          {/* ONE string for each field's visible label and its trigger's accessible name: jsx-a11y cannot see
              the Base UI Field association. */}
          <Field label={REGEX_PIPELINE_TEXT_NAME}>
            <Select<RegexTarget>
              aria-label={REGEX_PIPELINE_TEXT_NAME}
              items={TEXT_ITEMS}
              onValueChange={(next: RegexTarget | null): void => {
                if (next !== null) {
                  setPair(regexPipelinePair(pair.pass, next));
                }
              }}
              value={pair.target}
            />
          </Field>
          <Field label={REGEX_PIPELINE_WHEN_NAME}>
            <Select<RegexPass>
              aria-label={REGEX_PIPELINE_WHEN_NAME}
              items={whenItems(pair.target)}
              onValueChange={(next: RegexPass | null): void => {
                if (next !== null) {
                  setPair(regexPipelinePair(next, pair.target));
                }
              }}
              value={pair.pass}
            />
          </Field>
        </Row>

        {/* "Text going in", never a second "Sample text": the tester one section up already owns that name,
            and two controls with the same accessible name on one pane is the exact defect side-eye X-1 found
            (the two "Display only"s, 320px apart). The pair here also READS as a pipeline — text going in,
            text after every script. */}
        <Field label={REGEX_TEXT_GOING_IN_NAME}>
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
          description={ran === 0 ? "Nothing changed this sample at this time." : `${String(ran)} script${ran === ONE_MATCH ? "" : "s"} changed the text.`}
          label={REGEX_TEXT_AFTER_EVERY_SCRIPT_NAME}
        >
          <Textarea readOnly={true} rows={OUTPUT_ROWS} value={run.output} />
        </Field>

        <PipelineCaveats pass={pair.pass} script={script} subjectIsGlobal={run.subjectIsGlobal} />
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
        <Row align="center" gap="field" wrap={true}>
          <span>{`${String(index + 1)} · ${regexScriptTitle({ name: stage.name })}`}</span>
          {stage.isSubject ? <SubjectMarker appended={stage.isAppended} /> : null}
        </Row>
      }
    >
      <Stack gap="tight">
        <Text tone={statusTone(stage)} voice="gloss">
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
    // SENTENCE CASE, AND IT TAKES A `normal-case` TO GET THERE (side-eye 2026-08-19 P3, all-caps-body).
    // `text-transform` INHERITS, and this badge is rendered inside `<Section kicker>` — whose micro-caps
    // voice therefore reached down into it and printed a nine-word CLAUSE as "THIS SCRIPT, WHEREVER IT'S
    // ATTACHED". The kicker voice is law for a section NAME; a sentence wearing it is the narrow defect, and
    // the source string was already lowercase, so nothing but the inherited transform was ever wrong here.
    //
    // …AND THE CAPS TRACKING GOES WITH THE CAPS (side-eye 2026-08-19 P3, the second pass). `letter-spacing`
    // inherits exactly like `text-transform` does, so standing down only the transform left a SENTENCE
    // wearing the kicker's 0.08em micro tracking — measured 0.84px of air between letters of running prose
    // at 13px. Micro tracking is what makes a caps kicker readable and what makes a sentence look loose;
    // both halves of the kicker voice have to stand down together, which is one token step, not a re-skin.
    //
    // THE CLAUSE WRAPS, so the kicker band never outgrows its stage. A one-line badge is wider than a phone's column at
    // enlarged text, and the band's rule then sits past the stage's edge and the settings column scrolls sideways.
    <Badge tone={appended ? "neutral" : "info"} variant={appended ? "soft" : "solid"} sentenceCase={true} size="sm" whitespace="normal" cap="fit">
      {appended ? "This script, wherever it’s attached" : "This script"}
    </Badge>
  );
}

/** EVERYTHING THIS PANEL CANNOT SHOW, said out loud in the same breath as the result — the tester's own
 *  discipline, applied to a run instead of to a pattern. Each line is a real limit of a LIBRARY surface, not
 *  a missing feature: none of these facts exists outside a room. */
function PipelineCaveats({
  script,
  pass,
  subjectIsGlobal,
}: {
  readonly script: CreateRegexScriptInput;
  readonly pass: RegexPass;
  readonly subjectIsGlobal: boolean;
}): ReactElement {
  // Depth and the author scope exist only beside a display or prompt pass; a save reads neither.
  const ephemeral = pass !== "save";
  const depthScoped = ephemeral && script.depth !== undefined;
  const authorScoped = ephemeral && script.authors !== undefined && (script.authors.include.length > 0 || script.authors.exclude.length > 0);
  return (
    <Stack gap="tight">
      <Text voice="gloss">
        A preset, a character or a room adds its own scripts AFTER these, in that order, and a library page has no room, no characters and no active preset, so
        this run can’t include them.
      </Text>
      {subjectIsGlobal ? null : (
        <Text voice="gloss">This script isn’t in the always-on set, so it is shown last: every scope that can attach it runs after the always-on tier.</Text>
      )}
      {depthScoped || authorScoped ? (
        // Deliberately NOT the tester's wording one section up: two identically-phrased warnings on one pane
        // read as one warning rendered twice. The tester's line is about the SCRIPT; this one is about the RUN —
        // every stage below was applied to one loose string, which has no place in a chat and no author.
        <Text tone="warning" voice="gloss">
          {scopeCaveat(depthScoped, authorScoped)}
        </Text>
      ) : null}
    </Stack>
  );
}

function scopeCaveat(depthScoped: boolean, authorScoped: boolean): string {
  if (depthScoped && authorScoped) {
    return "The sample has no place in a chat and no author, so this script’s depth range and its whose-messages lists are not applied.";
  }
  return depthScoped
    ? "The sample has no place in a chat, so this script’s depth range is not applied. The run treats it as any message."
    : "The sample has no author, so this script’s whose-messages lists are not applied. The run treats it as anyone’s message.";
}
