import { usePluginFrameSrc } from "@orb/client/data";
import type { PluginId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";
import { UNMOUNT_FRAME_NAME } from "./_plugin-frame-src-names.ts";

function FrameSrc({ pluginId }: { readonly pluginId: PluginId }): ReactElement {
  const src = usePluginFrameSrc({ pluginId, surfaceId: "frame", themeTokens: {}, styleTokens: {} });
  return <output>{src ?? "pending"}</output>;
}

/** Mounts the production mint hook, with a button that unmounts it the way leaving a surface does. */
export function PluginFrameSrcStory({ pluginId }: { readonly pluginId: PluginId }): ReactElement {
  const [mounted, setMounted] = useState(true);
  const unmount = (): void => setMounted(false);
  return (
    <CtClientProviders>
      <button type="button" onClick={unmount}>
        {UNMOUNT_FRAME_NAME}
      </button>
      {mounted ? <FrameSrc pluginId={pluginId} /> : null}
    </CtClientProviders>
  );
}
