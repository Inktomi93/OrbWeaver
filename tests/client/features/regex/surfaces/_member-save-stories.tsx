import { openConfigTo, selectCollectionMember, useSectionRegistry } from "@orb/client/state";
import type { RegexScriptId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

function MemberContent({ scriptId }: { readonly scriptId: RegexScriptId }): ReactElement {
  useState(() => {
    openConfigTo("regex");
    selectCollectionMember("regex", scriptId);
    return true;
  });
  const content = useSectionRegistry().get("config").content;
  if (typeof content !== "function") {
    throw new Error("Configuration has no registered content");
  }
  return <>{content()}</>;
}

/** The registered configuration content opened on one regex library member, so its editor saves through the real verb. */
export function RegexMemberSaveStory({ scriptId }: { readonly scriptId: RegexScriptId }): ReactElement {
  return (
    <CtClientProviders>
      <Container className="block-dvh">
        <MemberContent scriptId={scriptId} />
      </Container>
    </CtClientProviders>
  );
}
