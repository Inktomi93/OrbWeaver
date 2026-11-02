import { pluginPageKey, selectPluginPageFromList, useSectionRegistry } from "@orb/client/state";
import type { PluginId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";

function ExtensionsContent(): ReactElement {
  const definition = useSectionRegistry().get("extensions");
  if (typeof definition.content !== "function") {
    throw new Error("The registered Extensions section omitted its content renderer");
  }
  return <>{definition.content()}</>;
}

function SelectedExtensionsPage({ pluginId, surfaceId }: { readonly pluginId: PluginId; readonly surfaceId: string }): ReactElement {
  useState(() => {
    selectPluginPageFromList(pluginPageKey(pluginId, surfaceId));
    return true;
  });
  return <ExtensionsContent />;
}

/** The production Extensions CONTENT pane, resolved through the section registry, with one page picked. */
export function ExtensionsPageStory({ pluginId, surfaceId }: { readonly pluginId: PluginId; readonly surfaceId: string }): ReactElement {
  return (
    <CtClientProviders>
      <SelectedExtensionsPage pluginId={pluginId} surfaceId={surfaceId} />
    </CtClientProviders>
  );
}

/** The pane mounted by a pick from a focused control, as a drill-in pushes it, so the pane's mount focus has a control to move from. */
export function ExtensionsPagePickStory({ pluginId, surfaceId }: { readonly pluginId: PluginId; readonly surfaceId: string }): ReactElement {
  const [picked, setPicked] = useState(false);
  return (
    <CtClientProviders>
      <Button onClick={(): void => setPicked(true)} type="button">
        Open the page
      </Button>
      {picked ? <SelectedExtensionsPage pluginId={pluginId} surfaceId={surfaceId} /> : null}
    </CtClientProviders>
  );
}
