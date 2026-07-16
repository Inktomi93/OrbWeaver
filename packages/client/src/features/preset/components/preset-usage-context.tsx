// The Presets CONTEXT panel (UI-Arch §4.2 Presets row "CONTEXT: usage/bindings (default-collapsed)"). A
// containment CONSUMER (§2.1). Shows where the open preset is used. Preset↔chat binding lives on the
// CONSUMING side (no-config-bound-to-chats: a chat references a preset, never the reverse), and that
// per-chat binding surface is a later chat lane — so today this panel explains the model + points at the
// starter-default distinction, an honest "what this is" rather than a fabricated usage list.

import type { PresetId } from "@orb/kit/ids";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";

export interface PresetUsageContextProps {
  readonly presetId: PresetId;
}

/** The Presets CONTEXT usage panel for the open preset. */
export function PresetUsageContext({ presetId }: PresetUsageContextProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="usage" onRetry={retry} />}
    >
      <PresetUsageBody presetId={presetId} />
    </QueryBoundary>
  );
}

function PresetUsageBody({ presetId }: PresetUsageContextProps): ReactElement {
  const trpc = useTRPC();
  const { data: preset } = useSuspenseQuery(trpc.preset.get.queryOptions({ id: presetId }));

  return (
    <Stack gap="section">
      <Section heading="About this preset">
        <Text size="micro" tone="muted">
          {preset.isSystemDefault
            ? "This is the built-in default. Editing it creates your own editable copy — the original stays intact for a clean baseline."
            : "A generation preset — it shapes sampling, reasoning, output, and the prompt structure. It does not pick a model; that's set in Connections."}
        </Text>
      </Section>
      <Section heading="Where it's used">
        <Text size="micro" tone="muted">
          Chats choose a preset when you start or configure them. Per-chat bindings appear here once the chat configuration surface lands.
        </Text>
      </Section>
    </Stack>
  );
}
