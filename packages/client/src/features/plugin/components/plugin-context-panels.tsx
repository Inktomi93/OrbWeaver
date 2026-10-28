import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import { Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { SkeletonRows, useSuspenseQueries, useTRPC } from "#data";
import { openConfigTo } from "#state";
import { takeMovedPanelFocus, usePluginChatPlacement, usePluginChatVisibility } from "../hooks/use-plugin-chat-visibility.ts";
import { useVisibleAnchoredSurfaces } from "../hooks/use-visible-anchored-surfaces.ts";
import { showInChatLabel } from "../lib/plugin-copy.ts";
import { CHAT_PLUGINS_EMPTY_DESCRIPTION, CHAT_PLUGINS_EMPTY_TITLE, CHAT_PLUGINS_MANAGE_LABEL, movePluginPanelLabel } from "../lib/plugin-panel-copy.ts";
import { PluginAnchoredSurfaceList } from "./plugin-anchored-surfaces.tsx";

/** Ordinary chat panels share Context; moved and hidden panels keep their return controls here. */
export function PluginContextPanels({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <QueryBoundary fallback={<SkeletonRows count={3} />} reserveKey="plugin.contextPanels">
      <ContextPanels chatId={chatId} />
    </QueryBoundary>
  );
}

function ContextPanels({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const [{ data: surfaces }, { data: plugins }] = useSuspenseQueries({ queries: [trpc.plugin.listSurfaces.queryOptions(), trpc.plugin.list.queryOptions()] });
  const visible = useVisibleAnchoredSurfaces("chat-flank", chatId);
  const placement = usePluginChatPlacement();
  const visibility = usePluginChatVisibility();
  const panels = surfaces.filter((surface) => surface.anchor === "chat-flank");
  const moved = panels.filter(
    (surface) => !visibility.isHidden(surface.pluginId) && placement.isSidecar({ pluginId: surface.pluginId, surfaceId: surface.id }),
  );
  const hidden = plugins.filter((plugin) => visibility.isHidden(plugin.id) && panels.some((surface) => surface.pluginId === plugin.id));
  return (
    <Stack gap="block">
      <PluginAnchoredSurfaceList anchor="chat-flank" chatId={chatId} surfaces={visible} />
      {moved.length === 0 ? null : (
        <Section kicker="In sidecar">
          {moved.map((surface) => {
            const plugin = plugins.find((row) => row.id === surface.pluginId);
            return plugin === undefined ? null : (
              <Button
                intent="ghost"
                key={`${surface.pluginId}:${surface.id}`}
                ref={(node): void => {
                  if (node !== null && takeMovedPanelFocus({ pluginId: surface.pluginId, surfaceId: surface.id }, true)) {
                    node.focus();
                  }
                }}
                onClick={(): void => placement.move({ pluginId: surface.pluginId, surfaceId: surface.id }, false)}
                size="sm"
              >
                {movePluginPanelLabel(plugin.name, surface.title, false)}
              </Button>
            );
          })}
        </Section>
      )}
      {hidden.length === 0 ? null : (
        <Section kicker="Hidden from chat">
          {hidden.map((plugin) => (
            <Button intent="ghost" key={plugin.id} onClick={(): void => visibility.setShown(plugin.id, true)} size="sm">
              {showInChatLabel(plugin.name)}
            </Button>
          ))}
        </Section>
      )}
      {visible.length === 0 && moved.length === 0 && hidden.length === 0 ? (
        <EmptyState
          title={CHAT_PLUGINS_EMPTY_TITLE}
          description={CHAT_PLUGINS_EMPTY_DESCRIPTION}
          action={
            <Button intent="secondary" onClick={(): void => openConfigTo("plugins")} size="sm">
              {CHAT_PLUGINS_MANAGE_LABEL}
            </Button>
          }
        />
      ) : null}
    </Stack>
  );
}
