// plugin-surface-shell — the impersonation WALL (plugin-ui-plane #679 U1, §4.8). EVERY plugin surface renders
// inside this first-party chrome: the plugin's name + an identifying glyph, at every anchor, no opt-out. A
// plugin composes house components INSIDE a labelled container that names its author, so it can imitate nothing
// the label does not immediately contradict — the same trust story as a chat message. The surface body is a
// group region whose accessible name is the plugin's, so assistive tech announces the boundary too.

import { Blocks, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

/** The shell's two SCALES — one wall, two densities (plugin-ui-plane §4.8 + §5.4). `panel` is the boxed
 *  attribution card every room-level anchor uses. `inline` is the TRANSCRIPT scale: the same glyph + name +
 *  title, on one line, with no box — because a `message-footer` surface mounts once per COMMITTED ROW, and a
 *  bordered card under every message is chrome the transcript cannot carry. The attribution itself is NOT
 *  reduced: the glyph and the plugin's name are visible on both arms, and the group region is named on both.
 *  What `inline` drops is the BOX, which is decoration; what it keeps is the wall. */
const SHELL_DENSITIES = ["panel", "inline"] as const;
type PluginShellDensity = (typeof SHELL_DENSITIES)[number];

export interface PluginSurfaceShellProps {
  /** The owning plugin's display name — the attribution line, never plugin-supplied chrome. */
  readonly pluginName: string;
  /** The surface's own title (`host.ui.register`'s `title`) — the panel's label under the plugin name. */
  readonly title: string;
  /** The rendered surface body (the declarative tree). */
  readonly children: ReactNode;
  /** The chrome SCALE (see {@link SHELL_DENSITIES}). Default `panel`. */
  readonly density?: PluginShellDensity | undefined;
}

/** Wrap a rendered plugin surface in its first-party attribution chrome. */
export function PluginSurfaceShell({ pluginName, title, children, density = "panel" }: PluginSurfaceShellProps): ReactElement {
  if (density === "inline") {
    return (
      <Row align="center" className="flex-wrap" gap="field">
        <Icon icon={Blocks} size="sm" />
        <Text voice="label">{pluginName}</Text>
        <Row align="center" aria-label={`${pluginName} — ${title}`} className="flex-wrap" gap="tight" role="group">
          {children}
        </Row>
      </Row>
    );
  }
  return (
    <Stack className="rounded-base border border-border bg-card/40 p-block" gap="block">
      {/* The pinned attribution band — plugin glyph + name + the surface's own title. A person always knows
          WHICH plugin drew this and that it is a plugin, not the app's own screen. */}
      <Row align="center" gap="field">
        <Icon icon={Blocks} size="sm" />
        <Text voice="label">{pluginName}</Text>
        <Text voice="gloss">·</Text>
        <Text voice="gloss">{title}</Text>
      </Row>
      <Stack aria-label={`${pluginName} — ${title}`} gap="block" role="group">
        {children}
      </Stack>
    </Stack>
  );
}
