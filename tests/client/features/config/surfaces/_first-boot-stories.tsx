import type { ConfigGroupId } from "@orb/client/state";
import { openConfigTo, setMobileViewport, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

function ConfigContent(): ReactElement {
  const definition = useSectionRegistry().get("config");
  if (typeof definition.content !== "function") {
    throw new Error("The production settings section has no content renderer");
  }
  return <>{definition.content()}</>;
}

function FirstBootSubject({ group, phone, width }: { readonly group: ConfigGroupId; readonly phone: boolean; readonly width: number }): ReactElement {
  // The shell publishes its viewport regime before its subtree renders; this isolated mount stands in for it.
  useState(() => {
    setMobileViewport(phone);
    openConfigTo(group);
    return true;
  });
  return (
    <div style={{ height: 900, width, minHeight: 0, display: "flex" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ConfigContent />
      </div>
    </div>
  );
}

/** The production settings content for one group, isolated from route and shell mounting, on a clean first boot. */
export function FirstBootStory(props: { readonly group: ConfigGroupId; readonly phone: boolean; readonly width: number }): ReactElement {
  return (
    <CtClientProviders>
      <FirstBootSubject {...props} />
    </CtClientProviders>
  );
}
