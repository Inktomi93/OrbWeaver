// The TRANSFORMS view's CONTEXT readout (preset-surface-redesign.md §7): the PIPELINE, two lanes, in
// EXECUTION ORDER — prompt-side then reply-side.
//
// The ORDER is the datum. Today it lives only in engine file headers, which is why "why did the reply
// change / which stage do I edit?" is unanswerable from the editor: the Transforms view lists regex
// scripts, post-process switches and the inline-reasoning fallback as three unrelated groups, and nothing
// says the display-only scripts run LAST and never touch the wire.
//
// Counts come from the preset's OWN scripts (a pure projection of the saved config, no new read).

import type { PromptConfig } from "@orb/contracts/preset";
import type { RegexPlacement } from "@orb/kit/regex";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** The prompt-side lane, in the order the assembler applies it. */
const PROMPT_LANE: readonly { readonly placement: RegexPlacement; readonly label: string }[] = [
  { placement: "USER_INPUT", label: "Regex · your message" },
  { placement: "WORLD_INFO", label: "Regex · world info" },
  { placement: "SLASH_COMMAND", label: "Regex · slash commands" },
];

/** The reply-side regex placements, at their position in the reply pipeline. */
const REPLY_REGEX: readonly { readonly placement: RegexPlacement; readonly label: string }[] = [
  { placement: "REASONING", label: "Regex · reasoning channel" },
  { placement: "AI_OUTPUT", label: "Regex · model output" },
  { placement: "DISPLAY", label: "Regex · display only" },
];

export function TransformsReadout({ config }: { readonly config: PromptConfig }): ReactElement {
  const countOf = (placement: RegexPlacement): number => config.regexScripts.filter((s) => s.enabled && s.placement.includes(placement)).length;
  const post = config.postProcess;
  const parse = config.reasoningParse;
  return (
    <Stack gap="section">
      <Section kicker="Prompt-side">
        <Stack gap="tight">
          {PROMPT_LANE.map((entry, at) => (
            <StepRow
              index={at + 1}
              key={entry.placement}
              label={entry.label}
              state={countOf(entry.placement) === 0 ? "off" : `${countOf(entry.placement)} on`}
            />
          ))}
        </Stack>
      </Section>

      <Section kicker="Reply-side">
        <Stack gap="tight">
          <StepRow index={1} label="Native reasoning channel" state="preferred" />
          <StepRow index={2} label="Inline <think> parse (fallback)" state={parse?.autoParse === true ? "on" : "off"} />
          <StepRow index={3} label={REPLY_REGEX[0]?.label ?? ""} state={countOf("REASONING") === 0 ? "off" : `${countOf("REASONING")} on`} />
          <StepRow index={4} label={REPLY_REGEX[1]?.label ?? ""} state={countOf("AI_OUTPUT") === 0 ? "off" : `${countOf("AI_OUTPUT")} on`} />
          <StepRow index={5} label="Collapse blank lines" state={post?.collapseNewlines === true ? "on" : "off"} />
          <StepRow index={6} label="Trim trailing whitespace" state={post?.trimTrailingWhitespace === true ? "on" : "off"} />
          <StepRow index={7} label="Drop a dangling sentence" state={post?.dropIncompleteSentence === true ? "on" : "off"} />
          <StepRow index={8} label="Single line" state={post?.singleLine === true ? "on" : "off"} />
          <StepRow index={9} label={REPLY_REGEX[2]?.label ?? ""} state={countOf("DISPLAY") === 0 ? "off" : `${countOf("DISPLAY")} on`} />
        </Stack>
        <Text voice="gloss">Execution order — display-only scripts change what you read and never touch the wire.</Text>
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
