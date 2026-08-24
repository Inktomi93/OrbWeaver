// The PLUGINS settings surface (Settings → Plugins) — the owner-facing face of the D46 sandbox: what is
// installed, what each one is allowed to do, and the install/grant flow.
//
// Two anchored sections in the pane grammar the sibling app-tier panes already use (`connections`, `backup`):
// INSTALLED (the live list, suspending on `plugin.list`) and INSTALL (the dropzone → grant → confirm card).
// Installed comes FIRST because after the first install this pane is a management screen, not an install
// screen — and the empty state carries the teaching copy instead, which retires itself once there is a list.
//
// ADMIN-GATED AT THE PANE, matching the server: every management verb runs `can(caller,"admin",{kind:"global"})`
// (`domain/plugin/verbs/install.ts:17` and each sibling), so a non-admin's `plugin.list` is not a shorter list,
// it is a refusal — the pane's `when` keeps them out of a screen whose every control would throw. The one
// plugin path a plain member reaches is the inline SNIPPET, and that lives in the chat, not here.

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
