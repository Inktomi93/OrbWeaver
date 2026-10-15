import { QueryBoundary } from "@orb/client/components";
import { SkeletonRows } from "@orb/client/data";
import { pluginPageKey, selectPluginPageFromList, useSectionRegistry } from "@orb/client/state";
import type { PluginId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import type { ReactElement } from "react";
import { useEffect } from "react";

function NativePluginPage({ pluginId }: { readonly pluginId: PluginId }): ReactElement {
  const sections = useSectionRegistry();
  useEffect(() => {
    selectPluginPageFromList(pluginPageKey(pluginId, "protocol"));
  }, [pluginId]);
  const content = sections.get("extensions").content;
  if (typeof content !== "function") {
    throw new Error("the Extensions contribution must provide its production content");
  }
  return <QueryBoundary fallback={<SkeletonRows count={2} shape="line" />}>{content()}</QueryBoundary>;
}

/** Mount only the production Extensions content contribution; its normal page path owns the real Worker. */
export function PluginProtocolStory({ pluginId }: { readonly pluginId: PluginId }): ReactElement {
  return (
    <CtClientProviders>
      <NativePluginPage pluginId={pluginId} />
    </CtClientProviders>
  );
}
