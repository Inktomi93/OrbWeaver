// The TRANSFORMS view's CONTEXT readout (preset-surface-redesign.md §7): the PIPELINE, two lanes, in
// EXECUTION ORDER — prompt-side then reply-side.
//
// The ORDER is the datum. Today it lives only in engine file headers, which is why "why did the reply
// change / which stage do I edit?" is unanswerable from the editor: the Transforms view lists regex
// scripts, post-process switches and the inline-reasoning fallback as three unrelated groups, and nothing
// says the display-only scripts run LAST and never touch the wire.
//
// Counts come from the preset's ATTACHED scripts (D121-E: a preset's regex set is a reference list in
// `preset_regex_scripts`, so this is a RESOLVE — `regex.listForPreset` — not a projection of the config
// blob, which no longer carries scripts at all).

import type { PromptConfig } from "@orb/contracts/preset";
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

/** The prompt-side lane, in the order the assembler applies it. `SLASH_COMMAND` is GONE from the lane
 *  because it is gone from `REGEX_PLACEMENTS`: it had a chip, a label and this very step row, and ZERO
 *  execution legs — the readout was printing a stage the pipeline does not possess (D107 dead switch). */
const PROMPT_LANE: readonly RegexPlacement[] = ["USER_INPUT", "WORLD_INFO"];

export function TransformsReadout({ config, presetId }: { readonly config: PromptConfig; readonly presetId: PresetId }): ReactElement {
  const trpc = useTRPC();
  // The ATTACHED set, not a config projection (see the header). A pending/failed read shows every stage
  // "off" rather than a wrong count — the readout's whole job is to be trustworthy about the order.
  const attached = useQuery(trpc.regex.listForPreset.queryOptions({ presetId }));
  const scripts: readonly RegexScriptRow[] = attached.data ?? [];
  // ONE count for one pipeline stage: the ENABLED scripts that bite there. The tab's picker shows the same
  // rows' enabled state per script, so `2 on` here and two enabled rows there are the same fact.
  const scriptState = (placement: RegexPlacement): string => {
    const count = scripts.filter((script) => script.enabled && script.placement.includes(placement)).length;
    return count === 0 ? "off" : `${String(count)} on`;
  };
  const post = config.postProcess;
  const parse = config.reasoningParse;
  return (
    <Stack gap="section">
      <Section kicker="Prompt-side">
        <Stack gap="tight">
          {PROMPT_LANE.map((placement, at) => (
            <StepRow index={at + 1} key={placement} label={regexPlacementStep(placement)} state={scriptState(placement)} />
          ))}
        </Stack>
      </Section>

      <Section kicker="Reply-side">
        <Stack gap="tight">
          <StepRow index={1} label="Native reasoning channel" state="preferred" />
          {/* The center's own SwitchField label, not a paraphrase of it. */}
          <StepRow index={2} label="Parse inline reasoning tags" state={parse?.autoParse === true ? "on" : "off"} />
          {/* AI_OUTPUT before REASONING — the order `engine/pipeline.ts` actually runs (the reply-text pass at
              :281, the reasoning-channel pass at :296). The readout had them inverted, and the order IS the datum. */}
          <StepRow index={3} label={regexPlacementStep("AI_OUTPUT")} state={scriptState("AI_OUTPUT")} />
          <StepRow index={4} label={regexPlacementStep("REASONING")} state={scriptState("REASONING")} />
          <StepRow index={5} label="Collapse blank lines" state={post?.collapseNewlines === true ? "on" : "off"} />
          <StepRow index={6} label="Trim trailing whitespace" state={post?.trimTrailingWhitespace === true ? "on" : "off"} />
          <StepRow index={7} label="Drop a dangling sentence" state={post?.dropIncompleteSentence === true ? "on" : "off"} />
          <StepRow index={8} label="Single line" state={post?.singleLine === true ? "on" : "off"} />
          <StepRow index={9} label={regexPlacementStep("DISPLAY")} state={scriptState("DISPLAY")} />
        </Stack>
        <Text prose={true} voice="gloss">
          Execution order — display-only scripts change what you read and never touch the wire.
        </Text>
      </Section>
    </Stack>
  );
}

function StepRow({ index, label, state }: { readonly index: number; readonly label: string; readonly state: string }): ReactElement {
  return (
    <Row align="baseline" gap="field">
      <Text voice="gloss">{index}</Text>
      <Text className="min-w-0 flex-1 truncate" voice="label">
        {label}
      </Text>
      <Text voice="datum">{state}</Text>
    </Row>
  );
}
