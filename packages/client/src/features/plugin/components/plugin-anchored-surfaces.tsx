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
import { ChevronDown, ChevronUp, EyeOff, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { cn } from "#lib";
import { usePluginChatVisibility } from "../hooks/use-plugin-chat-visibility.ts";
import { useVisibleAnchoredSurfaces } from "../hooks/use-visible-anchored-surfaces.ts";
import { CHAT_PANEL_HIDE_LABEL, flankDisclosureLabel } from "../lib/plugin-copy.ts";
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
  /** Drawn inside the phone's plugin-panels sheet: the sheet is the disclosure, so the flank draws neither its
   *  own toggle nor the folded-away stack. */
  readonly inSheet?: boolean;
}

/** Every surface the caller's enabled plugins registered at `anchor`, each in its attribution shell. `null`
 *  when there is nothing to show — see property 2 in the header: this component's `null` is what keeps a
 *  plugin-less room byte-identical. */
export function PluginAnchoredSurfaces({ anchor, chatId, inSheet = false }: PluginAnchoredSurfacesProps): ReactElement | null {
  const visible = useVisibleAnchoredSurfaces(anchor, chatId);
  const { hide } = usePluginChatVisibility();
  const panelId = useId();
  const [flankOpen, setFlankOpen] = useState(false);

  if (visible.length === 0) {
    return null;
  }
  const folded = anchor === "chat-flank" && !inSheet;
  const surfacesStack = (
    <Stack gap="block" id={panelId} className={cn(folded && !flankOpen && "@max-lg:hidden")}>
      {visible.map((surface) => {
        // One-tap Hide on the panel's own attribution line; the notice it raises carries the Undo.
        const hideAction = (
          <Button
            aria-label={`${CHAT_PANEL_HIDE_LABEL} ${surface.pluginName}`}
            intent="ghost"
            onClick={(): void => hide({ id: surface.pluginId, name: surface.pluginName })}
            size="sm"
          >
            <Icon icon={EyeOff} size="sm" />
            {CHAT_PANEL_HIDE_LABEL}
          </Button>
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
  if (!folded) {
    return surfacesStack;
  }
  // THE NARROW ROOM. Below the room's `lg` container step the flank stacks under the transcript, and a plugin
  // surface there is a third party's content competing with the conversation for one column: a game board
  // took the whole room on a phone and a clock board was pushed under the composer. So on a narrow room the
  // surfaces fold behind ONE closed disclosure and the transcript keeps the column; on a wide room the
  // toggle is hidden and the surfaces show as before. Both arms are container queries on the room's own
  // `Container`, so a docked panel narrowing a wide screen folds them too. A hidden surface stays mounted:
  // opening the disclosure shows it instantly instead of re-minting a frame. A touch device never gets here:
  // its flank lives in the header's sheet (`chat-anchors.tsx`).
  return (
    <Stack gap="row" data-slot="plugin-flank">
      <Button
        aria-controls={panelId}
        aria-expanded={flankOpen}
        className="justify-between @lg:hidden"
        intent="outline"
        onClick={(): void => setFlankOpen(!flankOpen)}
        size="sm"
      >
        {flankDisclosureLabel(visible)}
        <Icon icon={flankOpen ? ChevronUp : ChevronDown} size="sm" />
      </Button>
      {surfacesStack}
    </Stack>
  );
}
