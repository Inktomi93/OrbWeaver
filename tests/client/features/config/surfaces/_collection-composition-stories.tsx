import type { ConfigGroupId } from "@orb/client/state";
import { openConfigTo, useSectionRegistry } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

function CollectionContent({ group }: { readonly group: ConfigGroupId }): ReactElement {
  useState(() => {
    openConfigTo(group);
    return true;
  });
  const definition = useSectionRegistry().get("config");
  if (typeof definition.content !== "function") {
    throw new Error("The production settings section has no content renderer");
  }
  return <>{definition.content()}</>;
}

/** Registered collection content in a bounded host, isolated from shell chrome but not contribution rendering. */
export function CollectionCompositionStory({
  group,
  width,
  height,
  appearance,
}: {
  readonly group: ConfigGroupId;
  readonly width: number;
  readonly height: number;
  readonly appearance: Partial<AppearanceSettings>;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container className="min-block-0" data-slot="collection-composition-host" style={{ inlineSize: width, blockSize: height }}>
          <CollectionContent group={group} />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
