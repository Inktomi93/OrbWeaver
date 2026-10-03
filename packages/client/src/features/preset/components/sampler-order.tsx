// The sampler-order list (D295) — `params.samplerOrder`, shown only where the target server orders stages. It
// lists the order the server will run (`completeSamplerOrder`, the funnel's own call), so a dragged row is the
// order sent. Unset, it shows the server's default order and sends nothing.

import type { SamplerStage } from "@orb/contracts/inference";
import { completeSamplerOrder } from "@orb/contracts/inference";
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

const LEGEND = "Sampler order";
const HINT = "The order the server applies its samplers in. Drag a row, or focus its grip and use Space and the arrow keys.";

export function SamplerOrder({ form, stages }: { readonly form: AppFormInstance<PromptConfig>; readonly stages: readonly SamplerStage[] }): ReactElement {
  return (
    <form.AppField name="params.samplerOrder">
      {(field): ReactElement => {
        const stored = field.state.value as readonly SamplerStage[] | undefined;
        const order = completeSamplerOrder(stored, stages);
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
              items={order}
              onReorder={(keys): void => field.handleChange(keys.flatMap((key) => order.filter((stage) => stage === key)))}
              renderItem={(stage: SamplerStage): ReactElement => <Text voice="label">{SAMPLER_STAGE_LABELS[stage]}</Text>}
            />
            {stored === undefined ? <Text voice="gloss">server default order</Text> : null}
          </Fieldset>
        );
      }}
    </form.AppField>
  );
}
