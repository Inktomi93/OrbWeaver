import { MacroBrowser } from "@orb/client/components";
import { usePluginMacroPlanes } from "@orb/client/data";
import { macroCatalog } from "@orb/client/lib";
import { openConfigTo, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

/** The macro browser beside the real settings host, so a plugin lifecycle write and the macro rows share one client. */
function BrowserBesideSettings(): ReactElement {
  const planes = usePluginMacroPlanes();
  const content = useSectionRegistry().get("config").content;
  useState(() => {
    openConfigTo("plugins");
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
        <Container style={{ flex: 1, minWidth: 0 }}>{content()}</Container>
      </div>
    </Stack>
  );
}

export function PluginMacroBrowserStory(): ReactElement {
  return (
    <CtClientProviders>
      <BrowserBesideSettings />
    </CtClientProviders>
  );
}
