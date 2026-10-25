import type { ConfigGroupId } from "@orb/client/state";
import { openConfigTo, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

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
        <Container style={{ flex: 1, minWidth: 0 }}>
          <ConfigList />
        </Container>
      </div>
    </CtClientProviders>
  );
}

interface ConfigPanesProps {
  readonly showList: boolean;
  readonly initialGroup?: ConfigGroupId;
}

function ConfigPanes({ showList, initialGroup }: ConfigPanesProps): ReactElement {
  useLayoutEffect(() => {
    if (initialGroup !== undefined) {
      openConfigTo(initialGroup);
    }
  }, [initialGroup]);
  const definition = useSectionRegistry().get("config");
  if (typeof definition.content !== "function" || definition.list === undefined) {
    throw new Error("The production settings section must render its content and list");
  }
  return (
    <>
      <Button>Navigation origin</Button>
      <div style={{ height: 560, width: 1100, display: "flex" }}>
        <Container style={{ flex: 1, minWidth: 0 }}>{definition.content()}</Container>
        {showList ? <Container style={{ width: 420 }}>{definition.list()}</Container> : null}
      </div>
    </>
  );
}

export function ConfigPanesStory(props: ConfigPanesProps): ReactElement {
  return (
    <CtClientProviders>
      <ConfigPanes {...props} />
    </CtClientProviders>
  );
}
