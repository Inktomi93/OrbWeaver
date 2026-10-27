import type { ResolvedContextTabs } from "@orb/client/lib";
import { selectChat, useSectionRegistry } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { Suspense, useState } from "react";

function ResolvedScene({ useResolved }: { readonly useResolved: () => ResolvedContextTabs | null }): ReactNode {
  return useResolved()?.tabs.find((tab) => tab.id === "rpg.scene")?.node ?? null;
}

function Scene({ chatId }: { readonly chatId: ChatId }): ReactNode {
  useState(() => selectChat(chatId));
  const { context } = useSectionRegistry().get("chats");
  return context.kind === "tabs" ? <ResolvedScene useResolved={context.useResolved} /> : null;
}

/** The actual contributed Scene tab, constrained independently of the desktop viewport. */
export function RpgActionGroupsStory({
  chatId,
  width,
  appearance,
}: {
  readonly chatId: ChatId;
  readonly width: number;
  readonly appearance: AppearanceSettings;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container role="group" aria-label="Scene action host" style={{ inlineSize: width }}>
          <Suspense>
            <Scene chatId={chatId} />
          </Suspense>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
