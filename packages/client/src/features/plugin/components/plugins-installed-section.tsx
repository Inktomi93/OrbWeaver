// The INSTALLED plugins section (Settings → Plugins) — the owner-facing face of the D46 sandbox: what is
// installed and what each one is allowed to do. It comes FIRST in the group because after the first install
// this screen is a management screen, not an install screen — and the empty state carries the teaching copy
// instead, which retires itself once there is a list.
//
// PER-USER, matching the server (D147): plugins are user-scoped — anyone installs for themselves and the
// plugin runs under them — so `plugin.list` is the CALLER's own rows (`fetchOwned`), every control here acts
// on a row they own, and the section carries no viewer gate. An EMPTY list therefore means "you have installed
// nothing", never "this deployment has no plugins": the empty state below is written for the person asking,
// not for an operator surveying a box. Suspends on `plugin.list` — the section owns its `QueryBoundary`.

import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { PLUGINS_INSTALLED_SUBCATEGORY } from "../lib/plugins-nav.ts";
import { PluginRow } from "./plugin-row.tsx";

/** A row that is waiting on its OWNER — a pending re-consent (the system refused reach on their behalf) or
 *  a crash-stop. These sort FIRST (owner rework 2026-08-29: "consider order — rows needing attention
 *  first"): the one screen where burying the open question under a page of settled rows is a real cost.
 *  Deliberately NOT sorted by enabled/disabled — a status the owner toggles must never make the row jump
 *  mid-interaction; resolving an attention state is a settled act, and the row settling back into install
 *  order is legible. */
function needsAttention(plugin: { readonly reconsentPending: boolean; readonly status: string }): boolean {
  return plugin.reconsentPending || plugin.status === "errored";
}

/** The live list. */
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
  // Stable sort: attention rows first, server order preserved within each band.
  const ordered = [...plugins].sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)));
  return (
    <Stack gap="block">
      {ordered.map((plugin) => (
        <PluginRow key={plugin.id} plugin={plugin} />
      ))}
    </Stack>
  );
}

export function PluginsInstalledSection(): ReactElement {
  return (
    <Section divider={true} heading={PLUGINS_INSTALLED_SUBCATEGORY.label} id={configAnchorId("plugins", PLUGINS_INSTALLED_SUBCATEGORY.id)}>
      <QueryBoundary
        fallback={<SkeletonRows count={2} shape="line" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your plugins" onRetry={retry} />}
        reserveKey="config.plugins.installed"
      >
        <InstalledPluginsList />
      </QueryBoundary>
    </Section>
  );
}
