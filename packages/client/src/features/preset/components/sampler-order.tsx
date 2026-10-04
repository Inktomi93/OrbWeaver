// The sampler-order list (D295) — `params.samplerOrder`, shown only where the target server orders stages. It
// lists the order the server will run (`completeSamplerOrder`, the funnel's own call), so a dragged row is the
// order sent. A stage that picks the token runs last whatever the list says, so it is the list's fixed last
// row, with no grip. Unset, it shows the server's default order and sends nothing.

import type { SamplerStage } from "@orb/contracts/inference";
import { completeSamplerOrder, TERMINAL_SAMPLER_STAGES } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import { Button } from "@orb/ui/button";
import { Fieldset, FieldsetLegend } from "@orb/ui/fieldset";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Row } from "@orb/ui/layout";
import { SortableList } from "@orb/ui/sortable";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms/editor";
import { SAMPLER_STAGE_LABELS } from "../lib/capability-panel-model.ts";
import { SAMPLING_FLAG_LABELS } from "../lib/sampling-knob-catalog.ts";

const LEGEND = SAMPLING_FLAG_LABELS.samplerOrder;
const HINT = "The order the server applies its samplers in. Drag a row, or focus its grip and use Space and the arrow keys.";
const FIXED_LAST_GLOSS = "always runs last";

export function SamplerOrder({ form, stages }: { readonly form: AppFormInstance<PromptConfig>; readonly stages: readonly SamplerStage[] }): ReactElement {
  return (
    <form.AppField name="params.samplerOrder">
      {(field): ReactElement => {
        const stored = field.state.value as readonly SamplerStage[] | undefined;
        const order = completeSamplerOrder(stored, stages);
        const movable = order.filter((stage) => !TERMINAL_SAMPLER_STAGES.includes(stage));
        const fixed = order.filter((stage) => TERMINAL_SAMPLER_STAGES.includes(stage));
        return (
          <Fieldset>
            <Row align="center" gap="tight">
              <FieldsetLegend>{LEGEND}</FieldsetLegend>
              <HintTrigger className="shrink-0" hint={HINT} subject={LEGEND} />
              {stored === undefined ? null : (
                <Button intent="ghost" onClick={(): void => field.handleChange(undefined)} size="sm" type="button">
                  Use server order
                </Button>
              )}
            </Row>
            <SortableList
              aria-label={LEGEND}
              getItemKey={(stage: SamplerStage): string => stage}
              handle={true}
              itemLabel={(stage: SamplerStage): string => SAMPLER_STAGE_LABELS[stage]}
              items={movable}
              onReorder={(keys): void => field.handleChange(keys.flatMap((key) => movable.filter((stage) => stage === key)))}
              renderItem={(stage: SamplerStage): ReactElement => <Text voice="label">{SAMPLER_STAGE_LABELS[stage]}</Text>}
              fixedTail={fixed.map((stage) => ({
                key: stage,
                content: (
                  <Row align="baseline" data-fixed-stage={stage} gap="field">
                    <Text voice="label">{SAMPLER_STAGE_LABELS[stage]}</Text>
                    <Text voice="gloss">{FIXED_LAST_GLOSS}</Text>
                  </Row>
                ),
              }))}
            />
            {stored === undefined ? <Text voice="gloss">server default order</Text> : null}
          </Fieldset>
        );
      }}
    </form.AppField>
  );
}
