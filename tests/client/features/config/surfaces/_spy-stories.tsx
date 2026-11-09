import { openConfigTo, resolveConfigSectionAnchor, useActiveConfigSub, useSectionRegistry } from "@orb/client/state";
import { CtClientProviders, configSections } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

function ConfigContent(): ReactElement {
  const definition = useSectionRegistry().get("config");
  if (typeof definition.content !== "function") {
    throw new Error("The production settings section has no content renderer");
  }
  return <>{definition.content()}</>;
}

function SpySubject({ height }: { readonly height: number }): ReactElement {
  useState(() => {
    openConfigTo("workloads");
    return true;
  });
  const schedules = configSections.get("workloads-schedules");
  const active = useActiveConfigSub();
  return (
    <Stack>
      <Button
        data-anchor={resolveConfigSectionAnchor(configSections, schedules.anchor, schedules.nav.id, { isAdmin: false, isOwner: true }) ?? undefined}
        onClick={(): void => openConfigTo(schedules.anchor, schedules.nav.id)}
      >
        Jump to schedules
      </Button>
      <output data-probe="active-sub" data-target={schedules.nav.id}>
        {active}
      </output>
      <div style={{ height, width: 900, minHeight: 0, display: "flex" }}>
        <Container style={{ flex: 1, minWidth: 0 }}>
          <ConfigContent />
        </Container>
      </div>
    </Stack>
  );
}

/** The production settings content with the LIST's active section exposed, at a height the caller sets. */
export function ConfigSpyStory({ height }: { readonly height: number }): ReactElement {
  return (
    <CtClientProviders>
      <SpySubject height={height} />
    </CtClientProviders>
  );
}
