// plugin-surface-shell — the impersonation WALL (plugin-ui-plane #679 U1, §4.8). EVERY plugin surface renders
// inside this first-party chrome: the plugin's name + an identifying glyph, at every anchor, no opt-out. A
// plugin composes house components INSIDE a labelled container that names its author, so it can imitate nothing
// the label does not immediately contradict — the same trust story as a chat message. The surface body is a
// group region whose accessible name is the plugin's, so assistive tech announces the boundary too.

import { Blocks, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface PluginSurfaceShellProps {
  /** The owning plugin's display name — the attribution line, never plugin-supplied chrome. */
  readonly pluginName: string;
  /** The surface's own title (`host.ui.register`'s `title`) — the panel's label under the plugin name. */
  readonly title: string;
  /** The rendered surface body (the declarative tree). */
  readonly children: ReactNode;
}

/** Wrap a rendered plugin surface in its first-party attribution chrome. */
export function PluginSurfaceShell({ pluginName, title, children }: PluginSurfaceShellProps): ReactElement {
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
