// The Params readout's capability half with its CONNECTION SWITCHER (inference program §5.3a): the effective
// profile and the capability card describe one role or connection, named as role · provider · model. The pick is
// view state only; the panel still writes nothing (the readout's read-only pin).

import type { CapabilityTarget } from "@orb/contracts/inference";
import type { PresetId } from "@orb/kit/ids";
import { Section } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useTRPC } from "#data";
import { CONNECTION_ROLE_LABELS } from "#lib";
import { CHAT_ROLE_TARGET, effectiveTarget, SWITCHER_ROLES, targetFromValue, targetValue } from "../../lib/capability-target.ts";
import { chatCapabilityOf } from "../../lib/chat-capability.ts";
import { CapabilityCard, EffectiveProfile } from "./readout-parts.tsx";

type ConnectionRow = inferOutput<Trpc["connection"]["list"]>[number];
type EffectiveRead = inferOutput<Trpc["preset"]["resolveEffective"]>;

export interface CapabilityPanelProps {
  readonly presetId: PresetId;
  /** Rendered under the card with the same effective read (the open preset's quality mapping). */
  readonly footer?: ((effective: EffectiveRead | undefined) => ReactNode) | undefined;
}

export function CapabilityPanel({ presetId, footer }: CapabilityPanelProps): ReactElement {
  const trpc = useTRPC();
  const [picked, setPicked] = useState<CapabilityTarget>(CHAT_ROLE_TARGET);
  const connections = useQuery(trpc.connection.list.queryOptions());
  // Only a row that can chat has sampling and effort for this panel to describe.
  const chatRows = connections.data?.filter((row) => row.tasks.includes("chat"));
  const { target, removed } = effectiveTarget(
    picked,
    chatRows?.map((row) => row.id),
  );
  const capability = useQuery(trpc.connection.resolveChatCapability.queryOptions({ target }));
  const effective = useQuery(trpc.preset.resolveEffective.queryOptions({ id: presetId, target }));
  const inView = capability.data === undefined ? undefined : connections.data?.find((row) => row.id === capability.data.connectionId);

  return (
    <>
      <Section kicker="Connection in view">
        <Select
          aria-label="Connection to describe"
          items={[
            {
              label: "Roles",
              items: SWITCHER_ROLES.map((task) => ({ label: `${CONNECTION_ROLE_LABELS[task]} role`, value: targetValue({ kind: "role", task }) })),
            },
            {
              label: "Connections",
              items: (chatRows ?? []).map((row) => ({ label: row.label, value: targetValue({ kind: "connection", connectionId: row.id }) })),
            },
          ]}
          onValueChange={(value): void => {
            const next =
              value === null
                ? null
                : targetFromValue(
                    value,
                    (chatRows ?? []).map((row) => row.id),
                  );
            if (next !== null) {
              setPicked(next);
            }
          }}
          value={targetValue(target)}
        />
        {removed ? (
          <Text className="text-warning" data-slot="capability-target-removed" voice="gloss">
            The connection you were looking at was removed, so this shows your Chat role.
          </Text>
        ) : null}
        <InViewLine model={capability.data?.model} row={inView} target={target} />
      </Section>
      {/* The resolve's ERROR rides alongside its data (F-02): absent + no error is PENDING, absent + error is a
          settled failure, and the band discriminates on the structured code. */}
      <EffectiveProfile
        contextWindow={chatCapabilityOf(capability.data)?.context.window}
        effective={effective.data ?? undefined}
        error={effective.error}
        onRetry={(): void => {
          effective.refetch().catch(() => undefined); // The query's error state owns the retry failure.
        }}
        subject={subjectOf(target)}
      />
      <CapabilityCard capability={chatCapabilityOf(capability.data)} model={effective.data?.model} />
      {footer?.(effective.data ?? undefined)}
    </>
  );
}

/** The profile's signature subject: `chat role`, `utility model role`, or the row the Select names. */
function subjectOf(target: CapabilityTarget): string {
  return target.kind === "role" ? `${CONNECTION_ROLE_LABELS[target.task].toLowerCase()} role` : "the connection picked above";
}

/** `Chat role · OpenRouter · anthropic/claude-sonnet-5` — what a role resolves to. A picked connection is already
 *  named by the Select (an auto-named row's label IS provider · model), so its line is provider · model alone. */
function InViewLine({
  target,
  row,
  model,
}: {
  readonly target: CapabilityTarget;
  readonly row: ConnectionRow | undefined;
  readonly model: string | undefined;
}): ReactElement | null {
  if (row === undefined || model === undefined) {
    return null;
  }
  const resolvedTo = `${row.providerLabel} · ${model}`;
  const line = target.kind === "role" ? `${CONNECTION_ROLE_LABELS[target.task]} role · ${resolvedTo}` : resolvedTo;
  return (
    <Text data-slot="capability-in-view" voice="datum">
      {line}
    </Text>
  );
}
