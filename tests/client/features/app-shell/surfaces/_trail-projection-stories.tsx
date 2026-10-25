// The production AppShell over a chrome registry the story assembles itself: the production sections and modals, and
// one trail widget ordered against the command trigger, so the topbar trail's contents and order come off the registry.
import { AppShell } from "@orb/client/features/app-shell";
import type { ChromeEntry } from "@orb/client/state";
import { assembleChrome, ChromeRegistryProvider, useModalRegistry, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders, isolationRegistry } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement, ReactNode } from "react";
import { STORY_TRAIL_WIDGET } from "./trail-projection.ts";

interface TrailProjection {
  /** Whether the command modal keeps its `topbar.trail` trigger in the registry. */
  readonly includeCommand: boolean;
  /** Whether the widget's order sorts ahead of the command trigger's. */
  readonly widgetFirst: boolean;
}

function TrailRegistry({ includeCommand, widgetFirst, children }: TrailProjection & { readonly children: ReactNode }): ReactElement {
  const sections = useSectionRegistry().list();
  const all = useModalRegistry().list();
  const modals = includeCommand ? all : all.filter((modal) => modal.trigger.placement !== "topbar.trail");
  // The command trigger's order as the production assembly resolves it, which falls back to its derivation index.
  const commandOrder =
    assembleChrome({ sections, modals: all, widgets: [] }).find((entry) => entry.zone === "topbar.trail" && entry.behavior.kind === "modal")?.order ?? 0;
  const widget: ChromeEntry = {
    id: "story-trail-widget",
    label: STORY_TRAIL_WIDGET,
    zone: "topbar.trail",
    order: widgetFirst ? commandOrder - 1 : commandOrder + 1,
    behavior: { kind: "widget", body: (): ReactNode => <Button aria-label={STORY_TRAIL_WIDGET} intent="ghost" size="icon" /> },
  };
  const chrome = isolationRegistry(
    "chrome",
    "isolates the topbar trail's projection: the production sections and modals plus one widget, without the production widgets",
    assembleChrome({ sections, modals, widgets: [widget] }),
  );
  return <ChromeRegistryProvider value={chrome}>{children}</ChromeRegistryProvider>;
}

/** The shell whose trail is projected from the story's chrome registry. */
export function AppShellTrailProjectionStory(projection: TrailProjection): ReactElement {
  return (
    <CtClientProviders>
      <TrailRegistry {...projection}>
        <AppShell />
      </TrailRegistry>
    </CtClientProviders>
  );
}
