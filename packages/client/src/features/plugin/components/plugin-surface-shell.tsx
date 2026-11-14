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
import { PLUGIN_SURFACE_KICKER, pluginSurfaceName } from "../lib/plugin-panel-copy.ts";

/** Host-selected chrome: boxed panels, unboxed settings blocks, or transcript-inline attribution. */
const SHELL_CHROMES = ["panel", "block", "inline"] as const;
type PluginShellChrome = (typeof SHELL_CHROMES)[number];
const SHELL_CONTAINERS = { panel: Card, block: Stack } satisfies Record<Exclude<PluginShellChrome, "inline">, typeof Card | typeof Stack>;

/** Page and inline attribution have no panel controls. Only a mounted disclosure can receive focus. */
export type PluginShellPresentation =
  | { readonly scale: "page"; readonly chrome?: never; readonly action?: never; readonly collapsible?: never; readonly disclosureRef?: never }
  | { readonly scale?: "panel" | undefined; readonly chrome: "inline"; readonly action?: never; readonly collapsible?: never; readonly disclosureRef?: never }
  | ({
      readonly scale?: "panel" | undefined;
      readonly chrome?: Exclude<PluginShellChrome, "inline"> | undefined;
      readonly action?: ReactNode;
    } & (
      | { readonly collapsible?: false; readonly disclosureRef?: never }
      | { readonly collapsible: true; readonly disclosureRef?: Ref<HTMLButtonElement> | undefined }
    ));

type PluginSurfaceShellProps = PluginShellPresentation & {
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  readonly anchor: PluginSurfaceAnchor;
  readonly pluginName: string;
  readonly title: string;
  readonly children: ReactNode;
};

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
  const regionName = pluginSurfaceName(pluginName, title);
  // PAGE scale (U5, §9): the biggest impersonation canvas in the design gets the pinned attribution BAND above a
  // scrolling body. Checked first — a `page` surface is never also `inline`.
  if (scale === "page") {
    return (
      <Stack minHeight="shrinks" height="fill" data-plugin-surface-scale="page" {...pluginSurfaceAuditAttributes(pluginId, surfaceId, anchor)}>
        {/* THE PINNED BAND (§9). `shrink-0` + the scrolling body below it means it survives every scroll
            position — a band that scrolled away would leave the page unlabelled exactly when a person has
            forgotten what they are looking at. */}
        <Row
          align="center"
          className="shrink-0"
          paddingBlock="field"
          paddingInline="block"
          data-testid={testId("pluginPageAttribution")}
          divider="bottom"
          gap="field"
          ground="faint"
        >
          <Icon icon={Blocks} size="sm" />
          <Text voice="label">{pluginName}</Text>
          {showTitle ? (
            <>
              <Text voice="gloss">·</Text>
              <Text ink="foreground" voice="gloss">
                {title}
              </Text>
            </>
          ) : null}
          {/* The KICKER names the CLASS, not the instance: "this is a plugin", which is the sentence a
              faked settings screen most needs contradicted. */}
          <Text push="inlineEnd" voice="kicker">
            {PLUGIN_SURFACE_KICKER}
          </Text>
        </Row>
        {/* `relative` is load-bearing, not decoration: a scroll container establishes no containing block on
            its own, so every `position:absolute` descendant a plugin's rendered tree carries — starting with
            the `sr-only` text house primitives ship — would escape to the nearest positioned ancestor and
            scroll away from the thing it names. */}
        <Stack aria-label={regionName} scroll="y" grow="fill" padding="block" gap="block" role="group">
          {children}
        </Stack>
      </Stack>
    );
  }
  // INLINE chrome (U6, §5.4): the per-row transcript shape — same wall (glyph + name + named region), no box.
  if (chrome === "inline") {
    return (
      <Row align="center" wrap={true} gap="field" {...pluginSurfaceAuditAttributes(pluginId, surfaceId, anchor)}>
        <Icon icon={Blocks} size="sm" />
        <Text voice="label">{pluginName}</Text>
        <Row align="center" aria-label={regionName} wrap={true} gap="tight" role="group">
          {children}
        </Row>
      </Row>
    );
  }
  const Shell = SHELL_CONTAINERS[chrome];
  if (collapsible) {
    return (
      <Shell aria-label={regionName} role="group" {...pluginSurfaceAuditAttributes(pluginId, surfaceId, anchor)}>
        <Collapsible defaultOpen={true}>
          <Row align="center" gap="field">
            <CollapsibleTrigger aria-label={regionName} grow={true} className="min-inline-0" ref={disclosureRef}>
              <Icon icon={Blocks} size="sm" />
              <Stack className="min-inline-0" textAlign="start" grow={true} gap="tight">
                {/* The name is the attribution wall: it wraps rather than clip behind the panel's controls. */}
                <Text voice="label" wrap="word">
                  {pluginName}
                </Text>
                {/* A text node between flex items paints nothing; it keeps name and title apart in the DOM text, which is how axe reads the visible label. */}
                {showTitle ? (
                  <>
                    {" "}
                    <Text voice="gloss" wrap="word">
                      {title}
                    </Text>
                  </>
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
    <Shell {...pluginSurfaceAuditAttributes(pluginId, surfaceId, anchor)}>
      <Stack gap="block">
        {/* The pinned attribution band — plugin glyph + name + the surface's own title. A person always knows
          WHICH plugin drew this and that it is a plugin, not the app's own screen. */}
        <Row align="center" gap="field">
          <Icon icon={Blocks} size="sm" />
          <Text voice="label">{pluginName}</Text>
          {showTitle ? (
            <>
              <Text voice="gloss">·</Text>
              <Text ink="foreground" voice="gloss">
                {title}
              </Text>
            </>
          ) : null}
          {action === undefined ? null : <Row push="inlineEnd">{action}</Row>}
        </Row>
        <Stack aria-label={regionName} gap="block" role="group">
          {children}
        </Stack>
      </Stack>
    </Shell>
  );
}
