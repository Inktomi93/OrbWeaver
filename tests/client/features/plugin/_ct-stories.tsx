import { QueryBoundary } from "@orb/client/components";
import { SkeletonRows } from "@orb/client/data";
import { pluginPageKey, selectPluginPageFromList, useSectionRegistry } from "@orb/client/state";
import type { PluginId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect } from "react";

function NativePluginPage({ pluginId, surfaceId }: { readonly pluginId: PluginId; readonly surfaceId: string }): ReactElement {
  const sections = useSectionRegistry();
  useEffect(() => {
    selectPluginPageFromList(pluginPageKey(pluginId, surfaceId));
  }, [pluginId, surfaceId]);
  const content = sections.get("extensions").content;
  if (typeof content !== "function") {
    throw new Error("the Extensions contribution must provide its production content");
  }
  return <QueryBoundary fallback={<SkeletonRows count={2} shape="line" />}>{content()}</QueryBoundary>;
}

/** Mount only the production Extensions content contribution; its normal page path owns the real Worker. */
export function PluginProtocolStory({
  pluginId,
  surfaceId = "protocol",
  runtimeEpoch = 0,
}: {
  readonly pluginId: PluginId;
  readonly surfaceId?: string;
  readonly runtimeEpoch?: number;
}): ReactElement {
  return (
    <CtClientProviders key={runtimeEpoch}>
      <NativePluginPage pluginId={pluginId} surfaceId={surfaceId} />
    </CtClientProviders>
  );
}

/** A constrained, overflow-visible host around the actual Extensions content contribution. */
export function PluginPresentationPageStory({
  pluginId,
  surfaceId,
  width,
}: {
  readonly pluginId: PluginId;
  readonly surfaceId: string;
  readonly width: number;
}): ReactElement {
  return (
    <CtClientProviders>
      <div style={{ width, height: 844, display: "flex", overflow: "visible" }}>
        <Stack className="flex-1 min-block-0 min-inline-0">
          <NativePluginPage pluginId={pluginId} surfaceId={surfaceId} />
        </Stack>
      </div>
    </CtClientProviders>
  );
}
