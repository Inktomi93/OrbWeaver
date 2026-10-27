import { goToLanding, selectChat, useModalRegistry } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

function SavedRosterBody({ chatId }: { readonly chatId: ChatId | null }): ReactNode {
  useState(() => {
    if (chatId === null) {
      goToLanding();
    } else {
      selectChat(chatId);
    }
  });
  const definition = useModalRegistry().get("savedRosters");
  if (typeof definition.body !== "function") {
    throw new Error("Saved rosters has no modal body");
  }
  return definition.body();
}

/** Isolate the actual modal contribution's body so its action row is measured against an explicit pane width. */
export function RosterActionGroupsStory({
  chatId,
  width,
  appearance,
}: {
  readonly chatId: ChatId | null;
  readonly width: number;
  readonly appearance: AppearanceSettings;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container role="group" aria-label="Saved roster action host" style={{ inlineSize: width }}>
          <SavedRosterBody chatId={chatId} />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
