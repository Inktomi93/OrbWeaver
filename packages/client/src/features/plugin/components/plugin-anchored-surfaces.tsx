// Room plugin registrations render inside their selected host's attribution shells.
// An empty host returns no layout; registrations and published-state gating stay in the visibility hook.

import type { PluginSurfaceAnchor } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EyeOff, Icon, PanelRightOpen } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { requestShellContentFocus } from "#state";
import { takeMovedPanelFocus, takeRestoredPanel, usePluginChatPlacement, usePluginChatVisibility } from "../hooks/use-plugin-chat-visibility.ts";
import type { RenderableSurface } from "../hooks/use-visible-anchored-surfaces.ts";
import { useVisibleAnchoredSurfaces } from "../hooks/use-visible-anchored-surfaces.ts";
import { CHAT_PANEL_HIDE_LABEL } from "../lib/plugin-copy.ts";
import { movePluginPanelLabel } from "../lib/plugin-panel-copy.ts";
import { PluginFrame } from "./plugin-frame.tsx";
import { PluginScriptedSurface } from "./plugin-scripted-surface.tsx";
import { PluginSurfaceRenderer } from "./plugin-surface-renderer.tsx";
import { PluginSurfaceShell } from "./plugin-surface-shell.tsx";

export interface PluginAnchoredSurfacesProps {
  /** Which anchor's registrations to render — the CHAT anchors at U2 (`chat-flank`, `chat-settings-section`). */
  readonly anchor: PluginSurfaceAnchor;
  /** The ROOM this anchor is mounted in (row 777). Absent = a draft room with no committed id: the fan-out
   *  then reads/writes the plugin-wide state row only, which is the honest answer (there is no room yet for a
   *  room-keyed publication to belong to). */
  readonly chatId?: ChatId;
  /** Drawn inside a touch device's plugin-panels sheet, the flank's other host. */
  readonly inSheet?: boolean;
  readonly sidecar?: boolean;
}

/** Render an anchor without suspending its enclosing room or reserving empty host space. */
export function PluginAnchoredSurfaces(props: PluginAnchoredSurfacesProps): ReactElement | null {
  const visible = useVisibleAnchoredSurfaces(props.anchor, props.chatId, props.sidecar);
  return <PluginAnchoredSurfaceList {...props} surfaces={visible} />;
}

export interface PluginAnchoredSurfaceListProps extends PluginAnchoredSurfacesProps {
  readonly surfaces: readonly RenderableSurface[];
}

/** Render a host's already-partitioned panels without adding another published-state observer. */
export function PluginAnchoredSurfaceList({
  anchor,
  chatId,
  inSheet = false,
  sidecar = false,
  surfaces: visible,
}: PluginAnchoredSurfaceListProps): ReactElement | null {
  const { hide } = usePluginChatVisibility();
  const placement = usePluginChatPlacement();
  const hasPanels = visible.length > 0;
  // After a hide, focus lands on the next panel's Hide (or, with none left, the room itself), never on the document;
  // after an Undo, on the restored panel's Hide once it is back on screen.
  const focusAfterHide = useRef<string | null | undefined>(undefined);
  const hideButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const restored = anchor === "chat-flank" ? takeRestoredPanel(visible.map((surface) => surface.pluginId)) : null;
    const target = restored ?? focusAfterHide.current;
    if (target === undefined) {
      return;
    }
    focusAfterHide.current = undefined;
    const next = target === null ? undefined : hideButtons.current.get(target);
    if (next === undefined) {
      requestShellContentFocus("chats");
    } else {
      next.focus();
    }
  });

  if (!hasPanels) {
    return null;
  }
  const surfacesStack = (
    <Stack gap="block">
      {visible.map((surface) => {
        const disclosureRef = (node: HTMLButtonElement | null): void => {
          if (node !== null && anchor === "chat-flank" && !sidecar && takeMovedPanelFocus(surface, false)) {
            node.focus();
          }
        };
        // One-tap Hide on the panel's own attribution line; the notice it raises carries the Undo.
        const hideLabel = `${CHAT_PANEL_HIDE_LABEL} ${surface.pluginName}`;
        const hideAction = (
          <Row gap="tight">
            {anchor === "chat-flank" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={movePluginPanelLabel(surface.pluginName, surface.title, !sidecar)}
                      intent="ghost"
                      size="icon-sm"
                      type="button"
                      onClick={(): void => placement.move(surface, !sidecar)}
                    >
                      <Icon icon={PanelRightOpen} size="sm" />
                    </Button>
                  }
                />
                <TooltipPopup side="bottom">{movePluginPanelLabel(surface.pluginName, surface.title, !sidecar)}</TooltipPopup>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={hideLabel}
                    intent="ghost"
                    onClick={(): void => {
                      focusAfterHide.current = visible.find((other) => other.pluginId !== surface.pluginId)?.pluginId ?? null;
                      hide({ id: surface.pluginId, name: surface.pluginName });
                    }}
                    ref={(node): void => {
                      if (node === null) {
                        hideButtons.current.delete(surface.pluginId);
                      } else {
                        hideButtons.current.set(surface.pluginId, node);
                      }
                    }}
                    size="icon-sm"
                    type="button"
                  >
                    <Icon icon={EyeOff} size="sm" />
                  </Button>
                }
              />
              <TooltipPopup side="bottom">{hideLabel}</TooltipPopup>
            </Tooltip>
          </Row>
        );
        // The U7 FRAME arm draws its OWN shell (`plugin-frame.tsx`: an un-minted frame must render nothing at
        // all, chrome included, and the §4.8 label must have no opt-out). The `scripted` (U4) and `static` arms
        // render inside the shared attribution shell — the state gate above has already proven the static one
        // has something to draw.
        if (surface.tier === "frame") {
          return (
            <PluginFrame
              action={hideAction}
              anchor={anchor}
              collapsible={anchor === "chat-flank"}
              disclosureRef={disclosureRef}
              key={`${surface.pluginId}:${surface.surfaceId}`}
              pluginId={surface.pluginId}
              pluginName={surface.pluginName}
              surfaceId={surface.surfaceId}
              title={surface.title}
              chatId={chatId}
            />
          );
        }
        return (
          <PluginSurfaceShell
            action={hideAction}
            anchor={anchor}
            pluginId={surface.pluginId}
            surfaceId={surface.surfaceId}
            collapsible={anchor === "chat-flank"}
            disclosureRef={disclosureRef}
            key={`${surface.pluginId}:${surface.surfaceId}`}
            pluginName={surface.pluginName}
            title={surface.title}
          >
            {surface.tier === "scripted" ? (
              <PluginScriptedSurface
                anchor={anchor}
                grants={surface.grants}
                pluginId={surface.pluginId}
                surfaceId={surface.surfaceId}
                surfaceIds={surface.scriptedIds}
                {...(chatId === undefined ? {} : { chatId })}
              />
            ) : (
              <PluginSurfaceRenderer
                anchor={anchor}
                pluginId={surface.pluginId}
                spec={surface.spec}
                surfaceId={surface.surfaceId}
                {...(chatId === undefined ? {} : { chatId })}
              />
            )}
          </PluginSurfaceShell>
        );
      })}
    </Stack>
  );
  // The slot marker is what the soft-keyboard rule keys on (`globals.css`): the inline flank folds away while the
  // keyboard is up unless a field inside it holds focus.
  return anchor === "chat-flank" && sidecar && !inSheet ? <Stack data-slot="plugin-flank">{surfacesStack}</Stack> : surfacesStack;
}
