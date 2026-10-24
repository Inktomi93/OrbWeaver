import { useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

function ConfigList(): ReactElement {
  const definition = useSectionRegistry().get("config");
  if (definition.list === undefined) {
    throw new Error("The production settings section has no list renderer");
  }
  return <>{definition.list()}</>;
}

/** The production settings LIST (search input included) is isolated from route and shell mounting. */
export function ConfigListStory(): ReactElement {
  return (
    <CtClientProviders>
      <div style={{ height: 560, width: 420, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ConfigList />
        </div>
      </div>
    </CtClientProviders>
  );
}
