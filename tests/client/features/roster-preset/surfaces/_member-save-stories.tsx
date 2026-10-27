import { useInvalidation, useOrbSocket, useUserBus } from "@orb/client/data";
import { openConfigTo, selectCollectionMember, useSectionRegistry } from "@orb/client/state";
import type { RosterPresetId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

function MemberContent({ presetId }: { readonly presetId: RosterPresetId }): ReactElement {
  const invalidation = useInvalidation();
  useOrbSocket();
  useUserBus({ invalidateUser: invalidation.invalidateUser, invalidateAllUserRoots: invalidation.invalidateAllUserRoots });
  useState(() => {
    openConfigTo("rosterPreset");
    selectCollectionMember("rosterPreset", presetId);
    return true;
  });
  const content = useSectionRegistry().get("config").content;
  if (typeof content !== "function") {
    throw new Error("Configuration has no registered content");
  }
  return <>{content()}</>;
}

/** The registered configuration content isolates roster edit lifecycle from shell chrome, retaining real navigation and user-bus delivery. */
export function RosterMemberSaveStory({ presetId }: { readonly presetId: RosterPresetId }): ReactElement {
  return (
    <CtClientProviders>
      <Container className="block-dvh">
        <MemberContent presetId={presetId} />
      </Container>
    </CtClientProviders>
  );
}
