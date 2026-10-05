import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** States the retained accounting's limits beside every dollar readout. */
export function AccountingCoverageNotice({ characterOnly = false }: { readonly characterOnly?: boolean }): ReactElement {
  return (
    <Stack gap="field" data-slot="accounting-coverage" role="note">
      <Text voice="label">Partial accounting — not your provider bill</Text>
      <Text voice="gloss">Prompt extraction and captioning costs are omitted. Background-work accounting is incomplete.</Text>
      <Collapsible>
        <CollapsibleTrigger>Accounting coverage</CollapsibleTrigger>
        <CollapsiblePanel>
          <Stack gap="field">
            <Text voice="gloss">
              {characterOnly
                ? "Character costs cover recorded message generations only; image generation and compaction are library-level activity."
                : "Figures use retained message generations, image-generation records and compaction spend. Image costs may lack counted samples."}{" "}
              Deleted images can lose their cost records on Recompute; backup and restore do not preserve image or compaction spend history.
            </Text>
            <Text voice="gloss">Generation averages do not cover every operation. Last active can include chat-setting changes, not just replies.</Text>
          </Stack>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}
