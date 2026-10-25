import { openConfigTo, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

function PluginSettings(): ReactElement {
  const content = useSectionRegistry().get("config").content;
  useState(() => {
    openConfigTo("plugins");
    return true;
  });
  if (typeof content !== "function") {
    throw new Error("Settings has no content contribution");
  }
  return <>{content()}</>;
}

export function PluginConsentLayoutStory({ width }: { readonly width: number }): ReactElement {
  return (
    <CtClientProviders>
      <div style={{ width, height: 844, minHeight: 0, display: "flex" }}>
        <Container style={{ flex: 1, minWidth: 0 }}>
          <PluginSettings />
        </Container>
      </div>
    </CtClientProviders>
  );
}
