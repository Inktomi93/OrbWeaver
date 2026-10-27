import { openConfigTo, useSectionRegistry } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

function RegisteredConnections(): ReactElement {
  useState(() => {
    openConfigTo("connections");
    return true;
  });
  const definition = useSectionRegistry().get("config");
  if (typeof definition.content !== "function") {
    throw new Error("The registered configuration section omitted its content renderer");
  }
  return <>{definition.content()}</>;
}

/** The genuine group host retains its heading and anchor ownership during the Connections drill-in. */
export function ConnectionReadoutStory({
  width,
  height,
  appearance,
}: {
  readonly width: number;
  readonly height: number;
  readonly appearance: AppearanceSettings;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container className="min-block-0" data-slot="connection-readout-host" style={{ inlineSize: width, blockSize: height }}>
          <RegisteredConnections />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
