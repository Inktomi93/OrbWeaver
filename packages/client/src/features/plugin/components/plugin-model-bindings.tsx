// plugin-model-bindings — which of the installer's own connections a plugin's spend calls run on, one picker
// per task the plugin routes through its own grant (`pluginGrantTasks`). Reads `connection.list` and this
// plugin's `connection.listBindings`, writes `connection.setBinding` with the plugin's actor. Suspends.
//
// AN UNSET TASK READS "Not set", NEVER THE MODEL IT FALLS BACK TO. The plugin-grant readout resolves through
// the installer's own binding when the plugin has none, so `resolved` is non-null for an unset row; showing
// it would claim the plugin was given a model nobody picked for it.

import type { RoutableTask } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import type { PluginGrantTask } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { trpcErrorReason } from "#lib";
import {
  PLUGIN_GRANT_TASK_LABELS,
  PLUGIN_MODEL_DELETED,
  PLUGIN_MODEL_NONE_COMPATIBLE,
  PLUGIN_MODEL_NOT_YOURS,
  PLUGIN_MODEL_SAVE_FAILED,
  PLUGIN_MODEL_UNSET,
  pluginModelBackgroundRefused,
  pluginModelReadout,
} from "../lib/plugin-copy.ts";
import { useSetPluginGrantBinding } from "../lib/plugin-mutations.ts";

type ConnectionListItem = inferOutput<Trpc["connection"]["list"]>[number];
type BindingView = inferOutput<Trpc["connection"]["listBindings"]>[number];

const UNSET_VALUE = "";

/** What the persisted grant says, as one sentence — see the file header for why unset never names a model. */
function readoutOf(view: BindingView | undefined, connections: readonly ConnectionListItem[]): string {
  const connectionId = view?.binding?.connectionId;
  if (view?.binding === null || view?.binding === undefined) {
    return PLUGIN_MODEL_UNSET;
  }
  const connection = connections.find((candidate) => candidate.id === connectionId);
  if (connection === undefined) {
    return PLUGIN_MODEL_DELETED;
  }
  return pluginModelReadout(connection.label, view.resolved !== null);
}

/** The inline sentence for a refused save, keyed on the domain's refusal code. */
function pluginModelRefusal(error: unknown, attemptedLabel: string | null): string {
  const reason = trpcErrorReason(error);
  if (reason === CONNECTION_OP_CODES.actorForeign) {
    return PLUGIN_MODEL_NOT_YOURS;
  }
  if (reason === CONNECTION_OP_CODES.backgroundRefused && attemptedLabel !== null) {
    return pluginModelBackgroundRefused(attemptedLabel);
  }
  return PLUGIN_MODEL_SAVE_FAILED;
}

interface TaskRowProps {
  readonly pluginId: PluginId;
  readonly pluginName: string;
  readonly task: PluginGrantTask;
  readonly view: BindingView | undefined;
  readonly connections: readonly ConnectionListItem[];
}

function TaskRow({ pluginId, pluginName, task, view, connections }: TaskRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setBinding = useSetPluginGrantBinding({ trpc, invalidation });
  const [attempted, setAttempted] = useState<string | null>(null);

  const compatible = connections.filter((connection) => connection.tasks.includes(task satisfies RoutableTask));
  const items = [
    { label: PLUGIN_MODEL_UNSET, value: UNSET_VALUE },
    ...compatible.map((connection) => ({ label: connection.label, value: connection.id as string })),
  ];
  const persisted = view?.binding?.connectionId ?? UNSET_VALUE;
  const label = PLUGIN_GRANT_TASK_LABELS[task];

  return (
    <Stack gap="tight">
      <Text voice="label">{label}</Text>
      <Select
        aria-label={`${label} model for ${pluginName}`}
        disabled={setBinding.isPending}
        items={items}
        onValueChange={(value): void => {
          const picked = value === UNSET_VALUE ? null : (compatible.find((connection) => connection.id === value) ?? undefined);
          if (picked === undefined) {
            return;
          }
          setAttempted(picked?.label ?? null);
          setBinding.mutate({ task, connectionId: picked?.id ?? null, actor: { kind: "plugin-grant", pluginId } });
        }}
        placeholder={PLUGIN_MODEL_UNSET}
        value={persisted}
      />
      <Text prose={true} voice="gloss">
        {compatible.length === 0 && persisted === UNSET_VALUE ? PLUGIN_MODEL_NONE_COMPATIBLE : readoutOf(view, connections)}
      </Text>
      {setBinding.error === null ? null : (
        <Text className="text-destructive" prose={true} role="alert">
          {pluginModelRefusal(setBinding.error, attempted)}
        </Text>
      )}
    </Stack>
  );
}

export interface PluginModelBindingsProps {
  readonly pluginId: PluginId;
  readonly pluginName: string;
  readonly tasks: readonly PluginGrantTask[];
}

export function PluginModelBindings({ pluginId, pluginName, tasks }: PluginModelBindingsProps): ReactElement {
  const trpc = useTRPC();
  const { data: connections } = useSuspenseQuery(trpc.connection.list.queryOptions());
  const { data: bindings } = useSuspenseQuery(trpc.connection.listBindings.queryOptions({ actor: { kind: "plugin-grant", pluginId } }));
  return (
    <Stack gap="block">
      {tasks.map((task) => (
        <TaskRow
          connections={connections}
          key={task}
          pluginId={pluginId}
          pluginName={pluginName}
          task={task}
          view={bindings.find((view) => view.task === task)}
        />
      ))}
    </Stack>
  );
}
