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
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { openConfigTo, usePluginDialogSubject } from "#state";
import { PluginFrame } from "./plugin-frame.tsx";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

const GONE_TITLE = "That dialog is no longer available";
const GONE_BODY = "Its plugin was disabled or removed while it was open.";

export function PluginDialogBody(): ReactElement {
  const subject = usePluginDialogSubject();
  const trpc = useTRPC();
  // Not a suspense read: the modal is already open when this mounts, and suspending a modal body behind a
  // spinner is exactly the bare-spinner state the three-states law refuses. The cache is warm in every path
  // that can open this (an action on a surface, or a command whose menu already read the catalog).
  const { data: surfaces } = useQuery(trpc.plugin.listSurfaces.queryOptions());
  const { data: plugins } = useQuery(trpc.plugin.list.queryOptions());
  const surface = (surfaces ?? []).find(
    (candidate) => candidate.pluginId === subject?.pluginId && candidate.id === subject.surfaceId && candidate.anchor === "dialog",
  );
  const pluginName = (plugins ?? []).find((plugin) => plugin.id === subject?.pluginId)?.name;
  if (subject === undefined || surface === undefined || pluginName === undefined) {
    return (
      <Stack align="center" justify="center">
        <EmptyState
          // The next step is real and specific: the plugin can be turned back on in Plugins. A modal whose body
          // says only "gone" strands a person inside a dialog they have to guess their way out of.
          action={
            <Button intent="secondary" onClick={(): void => openConfigTo("plugins")} size="sm">
              Open Plugins
            </Button>
          }
          description={GONE_BODY}
          icon={<Icon icon={Blocks} size="md" />}
          title={GONE_TITLE}
        />
      </Stack>
    );
  }
  // U7 FRAME (#787) — a `dialog`-anchored frame draws the plugin's OWN document in the isolated iframe, inside
  // the house modal shell. `PluginFrame` draws its own (panel-scale) attribution band, so an un-minted frame
  // leaves no orphaned box in the modal — the flank-law posture, chrome included. A frame carries no `spec`.
  if (surface.tier === "frame") {
    return <PluginFrame pluginId={subject.pluginId} pluginName={pluginName} surfaceId={surface.id} title={surface.title} />;
  }
  return (
    <PluginSurfaceShell pluginName={pluginName} title={surface.title}>
      {surface.spec === undefined ? null : <PluginSurfaceRenderer anchor="dialog" pluginId={subject.pluginId} spec={surface.spec} surfaceId={surface.id} />}
    </PluginSurfaceShell>
  );
}
