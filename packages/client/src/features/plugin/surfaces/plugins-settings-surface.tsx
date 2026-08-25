// The PLUGINS settings surface (Settings → Plugins) — the owner-facing face of the D46 sandbox: what is
// installed, what each one is allowed to do, and the install/grant flow.
//
// Two anchored sections in the pane grammar the sibling app-tier panes already use (`connections`, `backup`):
// INSTALLED (the live list, suspending on `plugin.list`) and INSTALL (the dropzone → grant → confirm card).
// Installed comes FIRST because after the first install this pane is a management screen, not an install
// screen — and the empty state carries the teaching copy instead, which retires itself once there is a list.
//
// PER-USER, matching the server (D147): plugins are user-scoped — anyone installs for themselves and the
// plugin runs under them — so `plugin.list` is the CALLER's own rows (`fetchOwned`), every control here acts
// on a row they own, and the pane carries no viewer gate. An EMPTY list therefore means "you have installed
// nothing", never "this deployment has no plugins": the empty state below is written for the person asking,
// not for an operator surveying a box.

import { Container, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { settingsAnchorId } from "#state";
import { PluginInstallCard } from "../components/plugin-install-card.tsx";
import { PluginRow } from "../components/plugin-row.tsx";
import { PLUGINS_SUBCATEGORY_IDS } from "../lib/plugins-nav.ts";

/** The live list. Suspends on `plugin.list` — the section owns its `QueryBoundary`. */
function InstalledPluginsList(): ReactElement {
  const trpc = useTRPC();
  const { data: plugins } = useSuspenseQuery(trpc.plugin.list.queryOptions());

  if (plugins.length === 0) {
    return (
      <Text voice="gloss">
        Nothing installed yet. A plugin is a small sandboxed script that can watch a room, offer chips, write lore or add tools — and only ever what you allow
        it. Add one below.
      </Text>
    );
  }
  return (
    <Stack gap="section">
      {plugins.map((plugin) => (
        <PluginRow key={plugin.id} plugin={plugin} />
      ))}
    </Stack>
  );
}

export function PluginsSettingsSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack className="outline-none" ref={surfaceRef} tabIndex={-1}>
      <Container>
        <Stack gap="section">
          <Section divider={true} heading="Installed" id={settingsAnchorId("plugins", PLUGINS_SUBCATEGORY_IDS.installed)}>
            <QueryBoundary
              fallback={<SkeletonRows count={2} shape="line" />}
              renderError={(_error, retry): ReactElement => <QueryErrorState label="your plugins" onRetry={retry} />}
            >
              <InstalledPluginsList />
            </QueryBoundary>
          </Section>
          <Section divider={true} heading="Add a plugin" id={settingsAnchorId("plugins", PLUGINS_SUBCATEGORY_IDS.install)}>
            <PluginInstallCard />
          </Section>
        </Stack>
      </Container>
    </Stack>
  );
}
