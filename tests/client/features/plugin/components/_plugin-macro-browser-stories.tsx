import { MacroBrowser } from "@orb/client/components";
import { usePluginMacroPlanes } from "@orb/client/data";
import { macroCatalog } from "@orb/client/lib";
import { openConfigTo, useConfigTarget, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

/** The macro browser beside the real settings host, so a plugin lifecycle write and the macro rows share one client.
 *  `cold` mounts the host only once a link has asked for it, as the first visit does, so its reads start after the press. */
function BrowserBesideSettings({ cold }: { readonly cold: boolean }): ReactElement {
  const planes = usePluginMacroPlanes();
  const content = useSectionRegistry().get("config").content;
  const asked = useConfigTarget() !== null;
  useState(() => {
    if (!cold) {
      openConfigTo("plugins");
    }
    return true;
  });
  if (typeof content !== "function") {
    throw new Error("Settings has no content contribution");
  }
  return (
    <Stack>
      <div style={{ height: 240, width: 900, overflow: "auto" }}>
        <MacroBrowser catalog={macroCatalog({ source: { kind: "preset", id: null }, defs: [] }, planes)} />
      </div>
      <div style={{ height: 560, width: 900, minHeight: 0, display: "flex" }}>
        <Container style={{ flex: 1, minWidth: 0 }}>{cold && !asked ? null : content()}</Container>
      </div>
    </Stack>
  );
}

export function PluginMacroBrowserStory({ cold = false }: { readonly cold?: boolean }): ReactElement {
  return (
    <CtClientProviders>
      <BrowserBesideSettings cold={cold} />
    </CtClientProviders>
  );
}
