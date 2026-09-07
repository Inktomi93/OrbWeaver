// plugin-surface-shell — the impersonation WALL (plugin-ui-plane #679 U1, §4.8). EVERY plugin surface renders
// inside this first-party chrome: the plugin's name + an identifying glyph, at every anchor, no opt-out. A
// plugin composes house components INSIDE a labelled container that names its author, so it can imitate nothing
// the label does not immediately contradict — the same trust story as a chat message. The surface body is a
// group region whose accessible name is the plugin's, so assistive tech announces the boundary too.
//
// TWO SCALES SINCE U5, and the difference is a THREAT-MODEL difference, not a styling one (§9): a panel-scale
// surface sits inside chrome a person is already reading as "someone else's panel", while a PAGE fills the whole
// CONTENT region and is, in the design's own words, the biggest impersonation canvas here — a page can draw a
// convincing fake settings screen out of house primitives. So the page scale's attribution band is PINNED above
// the scrollable body (it cannot be scrolled away), carries an explicit "Extension" kicker naming the CLASS of
// thing this is, and has NO opt-out. The CT floor pins the band's presence on every page.

import { Blocks, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { testId } from "#lib";

/** The shell's two CHROME SCALES — one wall, two shapes (plugin-ui-plane §4.8 + §5.4). `panel` is the boxed
 *  attribution card every room-level anchor uses. `inline` is the TRANSCRIPT shape: the same glyph + name +
 *  title, on one line, with no box — because a `message-footer` surface mounts once per COMMITTED ROW, and a
 *  bordered card under every message is chrome the transcript cannot carry. The attribution itself is NOT
 *  reduced: the glyph and the plugin's name are visible on both arms, and the group region is named on both.
 *  What `inline` drops is the BOX, which is decoration; what it keeps is the wall.
 *
 *  It is NOT the `density` axis and must not be spelled as one: `data-density` is the app's global reading-
 *  comfort attribute (UI-Architecture §4b) and a component prop by that name is the layout-context anti-pattern
 *  the container model replaced. This names which CHROME the shell draws — a decision the anchor makes once. */
const SHELL_CHROMES = ["panel", "inline"] as const;
type PluginShellChrome = (typeof SHELL_CHROMES)[number];

interface PluginSurfaceShellProps {
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
}

/** Wrap a rendered plugin surface in its first-party attribution chrome. */
export function PluginSurfaceShell({ pluginName, title, scale = "panel", children, chrome = "panel" }: PluginSurfaceShellProps): ReactElement {
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
      <Stack className="h-full min-h-0" data-plugin-surface-scale="page">
        {/* THE PINNED BAND (§9). `shrink-0` + the scrolling body below it means it survives every scroll
            position — a band that scrolled away would leave the page unlabelled exactly when a person has
            forgotten what they are looking at. */}
        <Row align="center" className="shrink-0 border-border border-b bg-card/40 px-block py-field" data-testid={testId("pluginPageAttribution")} gap="field">
          <Icon icon={Blocks} size="sm" />
          <Text voice="label">{pluginName}</Text>
          {showTitle ? (
            <>
              <Text voice="gloss">·</Text>
              <Text voice="gloss">{title}</Text>
            </>
          ) : null}
          {/* The KICKER names the CLASS, not the instance: "this is an extension", which is the sentence a
              faked settings screen most needs contradicted. */}
          <Text className="ms-auto" voice="kicker">
            Extension
          </Text>
        </Row>
        {/* `relative` is load-bearing, not decoration: a scroll container establishes no containing block on
            its own, so every `position:absolute` descendant a plugin's rendered tree carries — starting with
            the `sr-only` text house primitives ship — would escape to the nearest positioned ancestor and
            scroll away from the thing it names. */}
        <Stack aria-label={regionName} className="relative min-h-0 grow overflow-y-auto overscroll-contain p-block" gap="block" role="group">
          {children}
        </Stack>
      </Stack>
    );
  }
  // INLINE chrome (U6, §5.4): the per-row transcript shape — same wall (glyph + name + named region), no box.
  if (chrome === "inline") {
    return (
      <Row align="center" className="flex-wrap" gap="field">
        <Icon icon={Blocks} size="sm" />
        <Text voice="label">{pluginName}</Text>
        <Row align="center" aria-label={regionName} className="flex-wrap" gap="tight" role="group">
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
        {showTitle ? (
          <>
            <Text voice="gloss">·</Text>
            <Text voice="gloss">{title}</Text>
          </>
        ) : null}
      </Row>
      <Stack aria-label={regionName} gap="block" role="group">
        {children}
      </Stack>
    </Stack>
  );
}
