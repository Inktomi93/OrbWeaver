// plugin-anchored-surfaces — the ONE fan-out behind every CHAT anchor: given
// one `PluginSurfaceAnchor`, it renders every surface the CALLER's own enabled plugins registered there, each
// inside the first-party labelled shell. The door grows by FIXED first-party contributions (`lib/chat-anchors.tsx`),
// never per-plugin (the one-assembly law G8) — the per-plugin fan happens HERE, off `plugin.listSurfaces` data.
//
// THREE PROPERTIES, each load-bearing and each the reason this is not three components:
//
//  1. NON-SUSPENDING. Both room anchors mount inside contribution seams with no Suspense boundary of their own
//     (`chat-room-surface.tsx`'s flank; the "This chat" host band), so a `useSuspenseQuery` here would suspend
//     the WHOLE room on a widget most people do not have. Every read is a plain `useQuery`; undefined data reads
//     as "nothing to show yet", the same arm as "no plugins".
//  2. SILENT-BY-DEFAULT — it returns `null`, never an empty wrapper. The flank column collapses on `:empty`
//     (`empty:hidden`), and `:empty` counts ELEMENT children regardless of paint: an empty `<Stack>` here would
//     keep the flank column in the room's flex layout and cost every plugin-less room a `gap="block"` step
//     beside the transcript — the #680 defect class, one level down. So "no surfaces / not loaded yet / a
//     bound surface with nothing published" all return literal `null` from THIS component.
//  3. LABELLED OR ABSENT. The shell's attribution line is the impersonation wall (§4.8), and its name comes
//     from the plugin row (`plugin.list`), a different read from the surface list. A surface whose plugin name
//     has not resolved is NOT rendered unlabelled — it waits.
//
// THE STATE GATE (§4.9's "a state-less surface renders NOTHING"): a spec that binds `{ $state }` renders its
// FALLBACKS until the plugin publishes — an empty meter and blank rows, i.e. a broken frame in the room. So a
// BOUND surface renders only once its state exists; a purely static spec (no bindings) renders on sight. The
// per-surface state reads are ONE `useQueries` (never a hook per row in a loop — the `useGreetingAlternates`
// precedent), and the renderer's own `getSurfaceState` read hits the same query key, so it costs no second call.

import type { PluginSurfaceAnchor } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { EyeOff, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { publishFlankHost } from "#lib";
import { usePluginChatVisibility, usePluginFlankCollapsed } from "../hooks/use-plugin-chat-visibility.ts";
import { useFlankInSheet, useVisibleAnchoredSurfaces } from "../hooks/use-visible-anchored-surfaces.ts";
import { CHAT_PANEL_HIDE_LABEL } from "../lib/plugin-copy.ts";
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
  /** Drawn inside the header's plugin-panels sheet, the flank's other host. */
  readonly inSheet?: boolean;
}

/** Every surface the caller's enabled plugins registered at `anchor`, each in its attribution shell. `null`
 *  when there is nothing to show — see property 2 in the header: this component's `null` is what keeps a
 *  plugin-less room byte-identical. */
export function PluginAnchoredSurfaces({ anchor, chatId, inSheet = false }: PluginAnchoredSurfacesProps): ReactElement | null {
  const visible = useVisibleAnchoredSurfaces(anchor, chatId);
  const { hide } = usePluginChatVisibility();
  // The inline flank stands down whenever its panels live in the header's sheet (`PluginFlankSheet`).
  const standsDown = useFlankInSheet() && anchor === "chat-flank" && !inSheet;
  const hostsFlank = anchor === "chat-flank" && !inSheet;
  const hasPanels = visible.length > 0;
  // The room's column and its edge control follow this answer: no panels, no control. The toggle is published
  // through a stable door onto the latest one, so a re-render never re-announces the host.
  const { ready, collapsed, toggle } = usePluginFlankCollapsed();
  const latestToggle = useRef(toggle);
  useEffect(() => {
    latestToggle.current = toggle;
  });
  const [stableToggle] = useState(() => (): void => latestToggle.current());
  const announce = hostsFlank && ready && hasPanels;
  useEffect(() => {
    if (!hostsFlank) {
      return;
    }
    publishFlankHost({ panels: announce, collapsed, toggle: stableToggle });
    return (): void => publishFlankHost(null);
  }, [hostsFlank, announce, collapsed, stableToggle]);
  // After a hide, focus lands on the next panel's Hide (or, with none left, the room itself), never on the document.
  const focusAfterHide = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const target = focusAfterHide.current;
    if (target === undefined) {
      return;
    }
    focusAfterHide.current = undefined;
    const next = target === null ? null : document.querySelector<HTMLElement>(`[data-hide-for="${target}"]`);
    (next ?? document.querySelector<HTMLElement>('[data-slot="chat-room-surface"]'))?.focus();
  });

  if (!hasPanels || standsDown) {
    return null;
  }
  const surfacesStack = (
    <Stack gap="block">
      {visible.map((surface) => {
        // One-tap Hide on the panel's own attribution line; the notice it raises carries the Undo.
        const hideLabel = `${CHAT_PANEL_HIDE_LABEL} ${surface.pluginName}`;
        const hideAction = (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={hideLabel}
                  data-hide-for={surface.pluginId}
                  intent="ghost"
                  onClick={(): void => {
                    focusAfterHide.current = visible.find((other) => other.pluginId !== surface.pluginId)?.pluginId ?? null;
                    hide({ id: surface.pluginId, name: surface.pluginName });
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
        );
        // The U7 FRAME arm draws its OWN shell (`plugin-frame.tsx`: an un-minted frame must render nothing at
        // all, chrome included, and the §4.8 label must have no opt-out). The `scripted` (U4) and `static` arms
        // render inside the shared attribution shell — the state gate above has already proven the static one
        // has something to draw.
        if (surface.tier === "frame") {
          return (
            <PluginFrame
              action={hideAction}
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
          <PluginSurfaceShell action={hideAction} key={`${surface.pluginId}:${surface.surfaceId}`} pluginName={surface.pluginName} title={surface.title}>
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
  return anchor === "chat-flank" && !inSheet ? <Stack data-slot="plugin-flank">{surfacesStack}</Stack> : surfacesStack;
}
