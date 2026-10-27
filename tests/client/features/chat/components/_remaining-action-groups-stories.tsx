import { useChatBusDeps } from "@orb/client/data";
import { CharacterGalleryAnchor, MessageListSurface } from "@orb/client/features/chat";
import type { ResolvedContextTabs } from "@orb/client/lib";
import { openCharacterGallery, selectChat, useSectionRegistry } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { Suspense, useState } from "react";

/** Open the real singleton anchor through its production state command. */
export function GalleryActionsStory({
  characterId,
  characterName,
  chatId,
  appearance,
}: {
  readonly characterId: CharacterId;
  readonly characterName: string;
  readonly chatId: ChatId;
  readonly appearance: AppearanceSettings;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Button onClick={(): void => openCharacterGallery(characterId, { characterName, chatId })}>Open character gallery</Button>
        <CharacterGalleryAnchor />
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

function RegisteredGameTab({ useResolved }: { readonly useResolved: () => ResolvedContextTabs | null }): ReactNode {
  return useResolved()?.tabs.find((tab) => tab.id === "rpg.game")?.node ?? null;
}

function GameBody({ chatId }: { readonly chatId: ChatId }): ReactNode {
  useState(() => selectChat(chatId));
  const { context } = useSectionRegistry().get("chats");
  return context.kind === "tabs" ? <RegisteredGameTab useResolved={context.useResolved} /> : null;
}

/** Resolve the host console through the actual Chats section and context-tab registry. */
export function GameTrackerActionsStory({
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
        <Container role="group" aria-label="Game action host" style={{ inlineSize: width }}>
          <Suspense>
            <GameBody chatId={chatId} />
          </Suspense>
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

function TranscriptBody({ chatId }: { readonly chatId: ChatId }): ReactElement {
  useState(() => selectChat(chatId));
  const busDeps = useChatBusDeps();
  return <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />;
}

/** Keep persisted tool records in the production transcript rather than mounting a copied row. */
export function ToolActionsStory({
  chatId,
  width,
  height,
  appearance,
}: {
  readonly chatId: ChatId;
  readonly width: number;
  readonly height: number;
  readonly appearance: AppearanceSettings;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container role="group" aria-label="Tool action host" style={{ inlineSize: width, blockSize: height }}>
          <TranscriptBody chatId={chatId} />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
