// The TRANSFORMS view's CONTEXT readout: the PIPELINE, two lanes, in
// EXECUTION ORDER — prompt-side then reply-side.
//
// The ORDER is the datum. Today it lives only in engine file headers, which is why "why did the reply
// change / which stage do I edit?" is unanswerable from the editor: the Transforms view lists regex
// scripts, post-process switches and the inline-reasoning fallback as three unrelated groups, and nothing
// says the display-only scripts run LAST and never touch the wire.
//
// THIS FILE OWNS NO ORDER (2026-08-07). It used to: nine `<StepRow index={n}>` rows, hand-numbered against
// an engine the author read once. That list drifted into FOUR untruths at the same time — `REASONING`
// printed before the post-process block (the engine runs it AFTER: `applyReceiveTransforms` is AI_OUTPUT →
// post-process → per-speaker clean → REASONING), the three receive switches printed in exactly reverse
// execution order, and `collapseNewlines` printed on the REPLY lane at all when it is an ASSEMBLE transform
// the reply path never calls. An instrument whose whole claim is "this is the order" must not be a hand
// copy of the order. Both lanes now render off `PROMPT_LANE_STEPS`/`REPLY_LANE_STEPS` in
// `@orb/contracts/preset` — the same declaration the executors consume — and the numbers are positions in
// THAT array, never authored here.
//
// What this file still owns is the COPY: `STEP_LABEL` is a total map over the step kinds, so a step added
// to a lane fails `tsc` here rather than rendering a blank row, and every string is the label the control
// that EDITS it carries (side-eye F-23 — the readout and the center were two namings of one pipeline).
//
// Counts come from the preset's ATTACHED scripts (D121-E: a preset's regex set is a reference list in
// `preset_regex_scripts`, so this is a RESOLVE — `regex.listForPreset` — not a projection of the config
// blob, which no longer carries scripts at all).

import type { PostProcessFlag, PromptConfig, PromptPipelineStep } from "@orb/contracts/preset";
import { PROMPT_LANE_STEPS, pipelineStepKey, REPLY_LANE_STEPS } from "@orb/contracts/preset";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { PresetId } from "@orb/kit/ids";
import type { RegexPlacement } from "@orb/kit/regex";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { regexPlacementStep } from "#lib";

// ONE VOCABULARY WITH THE CENTER (side-eye F-23): every step's name below is the string the control that
// EDITS it carries — the regex placements come from the shared `regexPlacementStep` map the editor dialog's
// own chips read, and the post-process / reasoning-parse steps are their `SwitchField` labels verbatim.
// The readout and the center were two namings of one pipeline, so a reader could not carry a step from the
// diagnosis ("which stage do I edit?") to the control that changes it.

/** Each post-process switch's name, VERBATIM from the `SwitchField` that edits it (side-eye F-23) — a total
 *  map over the schema's own flag set, so a new switch fails `tsc` here instead of rendering nameless. */
const POST_PROCESS_LABEL: Readonly<Record<PostProcessFlag, string>> = {
  collapseNewlines: "Collapse blank lines",
  trimTrailingWhitespace: "Trim trailing whitespace",
  dropIncompleteSentence: "Drop a dangling sentence",
  singleLine: "Single line",
};

/** The two non-regex, non-switch reply steps. `Native reasoning channel` is the GATE on the parse below it
 *  (native is always preferred), which is why it leads the lane and why its state is a posture, not a knob. */
const REASONING_LABEL = { "native-reasoning": "Native reasoning channel", "reasoning-parse": "Parse inline reasoning tags" } as const;

/** What ONE step is called — dispatched on the step's own kind, never on its position. */
function stepLabel(step: PromptPipelineStep): string {
  if (step.kind === "regex") {
    return regexPlacementStep(step.placement);
  }
  if (step.kind === "post-process") {
    return POST_PROCESS_LABEL[step.flag];
  }
  return REASONING_LABEL[step.kind];
}

export function TransformsReadout({
  config,
  presetId,
  attachable,
}: {
  readonly config: PromptConfig;
  readonly presetId: PresetId;
  /** Can this preset hold regex attachments at all? `false` for the SYSTEM DEFAULT, whose `ownerId` is null
   *  by construction — `ensurePresetOwned` refuses it deliberately ("read-only by construction", that file's
   *  own header), so `regex.listForPreset` answers NOT_FOUND for it and always will. Passed as a fact rather
   *  than sniffed from the id: the client identifies the system default by the wire's `isSystemDefault`
   *  flag, never by the sentinel literal (`domain/preset/constants.ts`: "Not cross-boundary"). */
  readonly attachable: boolean;
}): ReactElement {
  const trpc = useTRPC();
  // The ATTACHED set, not a config projection (see the header). NOT FIRED for a preset that cannot carry
  // attachments: that query is a guaranteed NOT_FOUND, and the built-in default is the preset every new user
  // has selected — a 404 per readout render, forever, to learn something already known.
  const attached = useQuery({ ...trpc.regex.listForPreset.queryOptions({ presetId }), enabled: attachable });
  const scripts: readonly RegexScriptRow[] = attached.data ?? [];
  // ONE count for one pipeline stage: the ENABLED scripts that bite there. The tab's picker shows the same
  // rows' enabled state per script, so `2 on` here and two enabled rows there are the same fact.
  //
  // A COUNT IS A CLAIM, AND AN UNREAD COUNT IS NOT ONE. This used to answer "off" whenever `attached.data`
  // was absent — which folded three different situations into one confident word: a real empty set, a read
  // still in flight, and a read that FAILED. The first is a fact; the other two are the readout asserting
  // something it does not know, on the one surface whose entire job is to be trustworthy (side-eye
  // 2026-08-07 P2 — the same class this file's own leg killed in the ORDER). `off` is now said only when a
  // count was actually obtained, or when the preset provably cannot carry one.
  const scriptState = (placement: RegexPlacement): string => {
    if (!attachable) {
      return "off";
    }
    if (attached.isError) {
      return "couldn’t read";
    }
    if (attached.data === undefined) {
      return "…";
    }
    const count = scripts.filter((script) => script.enabled && script.placement.includes(placement)).length;
    return count === 0 ? "off" : `${String(count)} on`;
  };
  const post = config.postProcess;
  const parse = config.reasoningParse;
  /** What a step SAYS about itself right now. `native-reasoning` is the one posture arm — it is not a knob
   *  the preset owns, it is the rule the parse below it defers to. */
  const stepState = (step: PromptPipelineStep): string => {
    if (step.kind === "regex") {
      return scriptState(step.placement);
    }
    if (step.kind === "post-process") {
      return post?.[step.flag] === true ? "on" : "off";
    }
    if (step.kind === "reasoning-parse") {
      return parse?.autoParse === true ? "on" : "off";
    }
    return "preferred";
  };
  return (
    <Stack gap="section">
      <Section kicker="Prompt-side">
        <Stack gap="tight">
          <Lane state={stepState} steps={PROMPT_LANE_STEPS} />
        </Stack>
      </Section>

      <Section kicker="Reply-side">
        <Stack gap="tight">
          <Lane state={stepState} steps={REPLY_LANE_STEPS} />
        </Stack>
        <Text prose={true} voice="gloss">
          Execution order — display-only scripts change what you read and never touch the wire.
        </Text>
      </Section>
    </Stack>
  );
}

/** ONE lane, numbered by POSITION IN THE DECLARATION. The number is derived, never authored: a hand-written
 *  index is the thing that drifted (see the header), and it can only ever be right by coincidence. */
function Lane({ steps, state }: { readonly steps: readonly PromptPipelineStep[]; readonly state: (step: PromptPipelineStep) => string }): ReactElement {
  return (
    <>
      {steps.map((step, at) => (
        // The step's declared KEY rides the row: it is what a rendered-order pin reads back (the CT compares
        // the DOM's sequence to the tuple's), so the claim "this is the order" is checkable from outside.
        <StepRow index={at + 1} key={pipelineStepKey(step)} label={stepLabel(step)} state={state(step)} stepKey={pipelineStepKey(step)} />
      ))}
    </>
  );
}

function StepRow({
  index,
  label,
  state,
  stepKey,
}: {
  readonly index: number;
  readonly label: string;
  readonly state: string;
  readonly stepKey: string;
}): ReactElement {
  return (
    <Row align="baseline" data-pipeline-step={stepKey} gap="field">
      <Text voice="gloss">{index}</Text>
      <Text className="min-w-0 flex-1 truncate" voice="label">
        {label}
      </Text>
      <Text voice="datum">{state}</Text>
    </Row>
  );
}
