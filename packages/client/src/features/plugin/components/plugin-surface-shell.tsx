// Mandatory host glyph/name attribution and a named content group prevent guest impersonation; neither can be omitted.
// Pages also keep a pinned attribution band and explicit Plugin kicker above scrolling content.
// Settings use an unboxed block inside the install's consent boundary; other panels retain their card.

import type { PluginSurfaceAnchor } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { Card } from "@orb/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Blocks, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode, Ref } from "react";
import { pluginSurfaceAuditAttributes, testId } from "#lib";

/** Host-selected chrome: boxed panels, unboxed settings blocks, or transcript-inline attribution. */
const SHELL_CHROMES = ["panel", "block", "inline"] as const;
type PluginShellChrome = (typeof SHELL_CHROMES)[number];
const SHELL_CONTAINERS = { panel: Card, block: Stack } satisfies Record<Exclude<PluginShellChrome, "inline">, typeof Card | typeof Stack>;

interface PluginSurfaceShellProps {
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  readonly anchor: PluginSurfaceAnchor;
  /** The owning plugin's display name — the attribution line, never plugin-supplied chrome. */
  readonly pluginName: string;
  /** The surface's own title (`host.ui.register`'s `title`) — the panel's label under the plugin name. */
  readonly title: string;
  /** How much of the screen this surface owns — a THREAT-MODEL axis, not a styling one (see the file header).
   *  @defaultValue "panel" */
  readonly scale?: "panel" | "page";
  /** The rendered surface body (the declarative tree). */
  readonly children: ReactNode;
  /** Which chrome the shell draws (see {@link SHELL_CHROMES}). Default `panel`. */
  readonly chrome?: PluginShellChrome | undefined;
  /** A host control drawn at the end of the attribution line. */
  readonly action?: ReactNode;
  /** Keep chat panels mounted while their independent disclosure is folded. */
  readonly collapsible?: boolean;
  /** The host restores focus to this panel's disclosure after a placement change. */
  readonly disclosureRef?: Ref<HTMLButtonElement> | undefined;
}

/** Wrap a rendered plugin surface in its first-party attribution chrome. */
export function PluginSurfaceShell({
  pluginId,
  surfaceId,
  anchor,
  pluginName,
  title,
  scale = "panel",
  children,
  chrome = "panel",
  action,
  collapsible = false,
  disclosureRef,
}: PluginSurfaceShellProps): ReactElement {
  // A SURFACE TITLED EXACTLY LIKE ITS PLUGIN SAYS THE NAME ONCE (side-eye 2026-08-29 P3-7: Card Atlas's
  // page rendered "Card Atlas · Card Atlas", which reads as a placeholder bug and wastes the title line).
  // The wall loses nothing — the band's whole job is the plugin's NAME, and that still renders on every
  // arm; only the redundant echo goes. Same rule for the group's accessible name, which would otherwise
  // read the doubled pair aloud.
  const showTitle = title !== pluginName;
  const regionName = showTitle ? `${pluginName} — ${title}` : pluginName;
  // PAGE scale (U5, §9): the biggest impersonation canvas in the design gets the pinned attribution BAND above a
  // scrolling body. Checked first — a `page` surface is never also `inline`.
  if (scale === "page") {
    return (
      <Stack className="block-full min-block-0" data-plugin-surface-scale="page" {...pluginSurfaceAuditAttributes(pluginId, surfaceId, anchor)}>
        {/* THE PINNED BAND (§9). `shrink-0` + the scrolling body below it means it survives every scroll
            position — a band that scrolled away would leave the page unlabelled exactly when a person has
            forgotten what they are looking at. */}
        <Row align="center" className="shrink-0 px-block py-field" data-testid={testId("pluginPageAttribution")} divider="bottom" gap="field" ground="faint">
          <Icon icon={Blocks} size="sm" />
          <Text voice="label">{pluginName}</Text>
          {showTitle ? (
            <>
              <Text voice="gloss">·</Text>
              <Text tone="foreground" voice="gloss">
                {title}
              </Text>
            </>
          ) : null}
          {/* The KICKER names the CLASS, not the instance: "this is a plugin", which is the sentence a
              faked settings screen most needs contradicted. */}
          <Text className="ms-auto" voice="kicker">
            Plugin
          </Text>
        </Row>
        {/* `relative` is load-bearing, not decoration: a scroll container establishes no containing block on
            its own, so every `position:absolute` descendant a plugin's rendered tree carries — starting with
            the `sr-only` text house primitives ship — would escape to the nearest positioned ancestor and
            scroll away from the thing it names. */}
        <Stack aria-label={regionName} className="relative grow overflow-y-auto overscroll-contain p-block min-block-0" gap="block" role="group">
          {children}
        </Stack>
      </Stack>
    );
  }
  // INLINE chrome (U6, §5.4): the per-row transcript shape — same wall (glyph + name + named region), no box.
  if (chrome === "inline") {
    return (
      <Row align="center" className="flex-wrap" gap="field" {...pluginSurfaceAuditAttributes(pluginId, surfaceId, anchor)}>
        <Icon icon={Blocks} size="sm" />
        <Text voice="label">{pluginName}</Text>
        <Row align="center" aria-label={regionName} className="flex-wrap" gap="tight" role="group">
          {children}
        </Row>
      </Row>
    );
  }
  const Shell = SHELL_CONTAINERS[chrome];
  if (collapsible) {
    return (
      <Shell aria-label={regionName} role="group">
        <Collapsible defaultOpen={true}>
          <Row align="center" gap="field">
            <CollapsibleTrigger aria-label={regionName} className="flex-1 min-inline-0" ref={disclosureRef}>
              <Icon icon={Blocks} size="sm" />
              <Stack className="flex-1 text-start min-inline-0" gap="tight">
                <Text className="truncate" voice="label">
                  {pluginName}
                </Text>
                {showTitle ? (
                  <Text className="truncate" voice="gloss">
                    {title}
                  </Text>
                ) : null}
              </Stack>
            </CollapsibleTrigger>
            {action}
          </Row>
          <CollapsiblePanel keepMounted={true} holds="controls">
            <Stack gap="block">{children}</Stack>
          </CollapsiblePanel>
        </Collapsible>
      </Shell>
    );
  }
  return (
    <Shell>
      <Stack gap="block">
        {/* The pinned attribution band — plugin glyph + name + the surface's own title. A person always knows
          WHICH plugin drew this and that it is a plugin, not the app's own screen. */}
        <Row align="center" gap="field">
          <Icon icon={Blocks} size="sm" />
          <Text voice="label">{pluginName}</Text>
          {showTitle ? (
            <>
              <Text voice="gloss">·</Text>
              <Text tone="foreground" voice="gloss">
                {title}
              </Text>
            </>
          ) : null}
          {action === undefined ? null : <Row className="ms-auto">{action}</Row>}
        </Row>
        <Stack aria-label={regionName} gap="block" role="group">
          {children}
        </Stack>
      </Stack>
    </Shell>
  );
}
