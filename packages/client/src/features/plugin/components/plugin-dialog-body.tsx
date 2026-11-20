// The `pluginDialog` modal's BODY — the plugin-attributed house modal a
// `dialog`-anchored surface renders inside.
//
// THE SHELL IS THE HOUSE'S AND THE TITLE IS ATTRIBUTED. `ModalHost` draws the Dialog; this body draws the same
// `PluginSurfaceShell` band every other plugin surface wears, so the modal a person is looking at says whose it
// is before it says anything else. §4.8's rule that "consent/grant dialogs are HOST modals only" survives by
// construction: the vocabulary has no node that opens a modal, and the ONE opener (`applyPluginUiOutcome`) can
// only ever name a `dialog`-anchored surface the SERVER resolved off the plugin's own registrations.
//
// IT RESOLVES THE SPEC OFF THE SAME CACHE, never off a copy carried in the intent: a dialog whose plugin was
// disabled between the ask and the paint renders the honest "gone" line instead of a tree the client had
// snapshotted. The intent store holds the PAIR and nothing else, which is what makes that possible.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Blocks, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useSuspenseQuery, useTRPC } from "#data";
import { openConfigTo, usePluginDialogSubject } from "#state";
import { EXTENSIONS_OPEN_PLUGINS_ACTION } from "../lib/extensions-copy.ts";
import { PLUGIN_DIALOG_GONE_BODY, PLUGIN_DIALOG_GONE_TITLE, PLUGIN_DIALOG_LOADING_NAME, PLUGIN_DIALOG_READ_LABEL } from "../lib/plugin-panel-copy.ts";
import { PluginFrame } from "./plugin-frame.tsx";
import { PluginScriptedSurface } from "./plugin-scripted-surface.tsx";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

function GoneDialog(): ReactElement {
  return (
    <Stack align="center" justify="center">
      <EmptyState
        // The next step is real and specific: the plugin can be turned back on in Plugins. A modal whose body
        // says only "gone" strands a person inside a dialog they have to guess their way out of.
        action={
          <Button variant="outline" onClick={(): void => openConfigTo("plugins")} size="sm">
            {EXTENSIONS_OPEN_PLUGINS_ACTION}
          </Button>
        }
        description={PLUGIN_DIALOG_GONE_BODY}
        icon={<Icon icon={Blocks} size="md" />}
        title={PLUGIN_DIALOG_GONE_TITLE}
      />
    </Stack>
  );
}

export function PluginDialogBody(): ReactElement {
  const subject = usePluginDialogSubject();
  if (subject === undefined) {
    return <GoneDialog />;
  }
  return (
    <QueryBoundary
      resetKeys={[]}
      fallback={
        <Stack gap="block" role="status">
          <Text voice="label">{PLUGIN_DIALOG_LOADING_NAME}</Text>
          <SkeletonRows count={2} shape="line" />
        </Stack>
      }
      renderError={(_error, retry): ReactElement => <QueryErrorState label={PLUGIN_DIALOG_READ_LABEL} onRetry={retry} />}
    >
      <ResolvedPluginDialog subject={subject} />
    </QueryBoundary>
  );
}

// Resolves the spec off the same cache the opener read, so a plugin disabled between the ask and the paint is the gone line.
function ResolvedPluginDialog({ subject }: { readonly subject: NonNullable<ReturnType<typeof usePluginDialogSubject>> }): ReactElement {
  const trpc = useTRPC();
  const { data: surfaces } = useSuspenseQuery(trpc.plugin.listSurfaces.queryOptions());
  const { data: plugins } = useSuspenseQuery(trpc.plugin.list.queryOptions());
  const surface = surfaces.find((candidate) => candidate.pluginId === subject.pluginId && candidate.id === subject.surfaceId && candidate.anchor === "dialog");
  const plugin = plugins.find((candidate) => candidate.id === subject.pluginId);
  if (surface === undefined || plugin === undefined) {
    return <GoneDialog />;
  }
  // U7 FRAME (#787) — a `dialog`-anchored frame draws the plugin's OWN document in the isolated iframe, inside
  // the house modal shell. `PluginFrame` draws its own (panel-scale) attribution band, so an un-minted frame
  // leaves no orphaned box in the modal — the flank-law posture, chrome included. A frame carries no `spec`.
  if (surface.tier === "frame") {
    return <PluginFrame anchor="dialog" pluginId={subject.pluginId} pluginName={plugin.name} surfaceId={surface.id} title={surface.title} />;
  }
  const scriptedIds = surfaces.filter((candidate) => candidate.pluginId === subject.pluginId && candidate.tier === "scripted").map((candidate) => candidate.id);
  let body: ReactElement | null;
  if (surface.tier === "scripted") {
    body = (
      <PluginScriptedSurface anchor="dialog" grants={plugin.grantedCapabilities} pluginId={subject.pluginId} surfaceId={surface.id} surfaceIds={scriptedIds} />
    );
  } else if (surface.spec === undefined) {
    body = null;
  } else {
    body = <PluginSurfaceRenderer anchor="dialog" pluginId={subject.pluginId} spec={surface.spec} surfaceId={surface.id} />;
  }
  return (
    <PluginSurfaceShell anchor="dialog" pluginId={subject.pluginId} surfaceId={surface.id} pluginName={plugin.name} title={surface.title}>
      {body}
    </PluginSurfaceShell>
  );
}
