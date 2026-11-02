import { pluginPageKey, selectPluginPageFromList, useSectionRegistry } from "@orb/client/state";
import type { PluginId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

function SelectedExtensionsPage({ pluginId, surfaceId }: { readonly pluginId: PluginId; readonly surfaceId: string }): ReactElement {
  useState(() => {
    selectPluginPageFromList(pluginPageKey(pluginId, surfaceId));
    return true;
  });
  const definition = useSectionRegistry().get("extensions");
  if (typeof definition.content !== "function") {
    throw new Error("The registered Extensions section omitted its content renderer");
  }
  return <>{definition.content()}</>;
}

/** The production Extensions CONTENT pane, resolved through the section registry, with one page picked. */
export function ExtensionsPageStory({ pluginId, surfaceId }: { readonly pluginId: PluginId; readonly surfaceId: string }): ReactElement {
  return (
    <CtClientProviders>
      <SelectedExtensionsPage pluginId={pluginId} surfaceId={surfaceId} />
    </CtClientProviders>
  );
}
