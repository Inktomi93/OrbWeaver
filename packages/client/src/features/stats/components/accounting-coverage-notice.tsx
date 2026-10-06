import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** States the retained accounting's limits beside every dollar readout. */
export function AccountingCoverageNotice({ characterOnly = false }: { readonly characterOnly?: boolean }): ReactElement {
  return (
    <Stack gap="field" data-slot="accounting-coverage" role="note">
      <Text voice="label">Partial accounting — not your provider bill</Text>
      <Text voice="quiet" className="max-w-(--reading-measure-prose)">
        Costs sum available compatible prices and omit missing prices. They may include provider-reported prices, configured-rate estimates or
        subscription-notional estimates, not invoice charges.
      </Text>
      <Text voice="quiet" className="max-w-(--reading-measure-prose)">
        Prompt extraction and captioning costs are omitted. Background-work accounting is incomplete.
      </Text>
      <Collapsible>
        <CollapsibleTrigger>Accounting coverage</CollapsibleTrigger>
        <CollapsiblePanel>
          <Stack gap="field">
            <Text voice="quiet" className="max-w-(--reading-measure-prose)">
              {characterOnly
                ? "Character costs cover recorded message generations only; image generation and compaction are library-level activity."
                : "Figures use retained message generations, image-generation records, observed embedding batches and compaction spend. Image costs may lack counted samples."}{" "}
              Deleted images can lose their cost records on Recompute. Image-generation history is included in backup and restore; embedding and compaction
              spend history are not.
            </Text>
            <Text voice="quiet" className="max-w-(--reading-measure-prose)">
              Generation averages do not cover every operation. Last active can include chat-setting changes, not just replies.
            </Text>
          </Stack>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}
