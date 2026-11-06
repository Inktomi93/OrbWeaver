// The user-macro readout of the Preview tab's Diagnostics drawer: which macros this turn had, from which home,
// and which lost a name and to whom. It is the one place an author sees a collision only the turn can decide.
// Host-only by inheritance: it renders the `AssembleTrace` the host-gated `previewAssembly` read returned.

import type { MacroSlice, MacroSliceEntry } from "@orb/contracts/chat";
import { Badge } from "@orb/ui/badge";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { usePluginMacroPlanes } from "#data";
import { macroSourceLabel } from "#lib";

/** The home a macro came from, in the browser's own words; a plugin is named by its display name. */
function useSourceLabel(): (entry: MacroSliceEntry) => string {
  const planes = usePluginMacroPlanes();
  return ({ source }) => {
    const name = source.kind === "plugin" ? planes.find((plane) => plane.source.kind === "plugin" && plane.source.id === source.id)?.name : undefined;
    return macroSourceLabel({ source, defs: [], ...(name === undefined ? {} : { name }) });
  };
}

/** `undefined` ⇒ no home offered a user macro this turn, and the section is omitted. */
export function MacroSliceDetail({ macros }: { readonly macros: MacroSlice | undefined }): ReactElement | null {
  const sourceLabel = useSourceLabel();
  if (macros === undefined) {
    return null;
  }
  return (
    <Section heading={<Text voice="kicker">{`Macros — ${macros.registered.length} registered, ${macros.rejected.length} rejected`}</Text>}>
      <Stack gap="field">
        {macros.rejected.map((entry) => (
          <Stack key={`${entry.source.kind}:${entry.source.id}:${entry.name}:${entry.reason}`} gap="row" data-slot="macro-rejected">
            <Row gap="block" justify="between" align="center">
              <Text voice="datum">{`{{${entry.name}}}`}</Text>
              <Badge tone="warning" variant="solid" size="sm">
                {sourceLabel(entry)}
              </Badge>
            </Row>
            <Text voice="gloss">{`Rejected: ${entry.reason}.`}</Text>
          </Stack>
        ))}
        {macros.registered.map((entry) => (
          <Row key={`${entry.source.kind}:${entry.source.id}:${entry.name}`} gap="block" justify="between" align="center" data-slot="macro-registered">
            <Text voice="datum">{`{{${entry.name}}}`}</Text>
            <Text voice="gloss">{sourceLabel(entry)}</Text>
          </Row>
        ))}
      </Stack>
    </Section>
  );
}
