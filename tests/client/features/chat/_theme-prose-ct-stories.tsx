// #985's narrow rendered proof: the shipped Home masthead and resume island under a legal partial
// ThemeScope whose only authored theme token is its background. The outer four prose inks deliberately
// carry the opposite polarity, reproducing the cascade the clamp must close.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ComponentProps, CSSProperties, ReactElement } from "react";
import { Suspense } from "react";
import { HomeHearthRoom } from "../../../../packages/client/src/features/chat/components/home-hearth-room.tsx";
import { HomeMastheadBody } from "../../../../packages/client/src/features/chat/components/home-masthead-body.tsx";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { makeChatSummary } from "./fixtures.ts";

interface HomePartialThemeProseStoryProps {
  readonly background: string;
  readonly ambientBackground: string;
  readonly ambientInk: string;
}

export function HomePartialThemeProseStory({ background, ambientBackground, ambientInk }: HomePartialThemeProseStoryProps): ReactElement {
  // csstype does not admit custom properties; the intersection keeps every authored value checked.
  const outerStyle: CSSProperties & {
    "--color-speaker": string;
    "--color-dialogue": string;
    "--color-narration": string;
    "--color-prose-body": string;
  } = {
    "--color-speaker": ambientInk,
    "--color-dialogue": ambientInk,
    "--color-narration": ambientInk,
    "--color-prose-body": ambientInk,
  };
  const chat = {
    ...makeChatSummary({
      title: "The Lantern Room",
      participantNames: ["Wren"],
      lastMessagePreview: "The lanterns answer in amber.",
    }),
    id: castId<ChatId>("chat_theme_prose"),
    parentChatId: null,
    participantCharacterIds: [],
    participantPortraits: [],
  } satisfies ComponentProps<typeof HomeHearthRoom>["chat"];

  return (
    <div style={outerStyle}>
      <ThemeScope ambientBackground={ambientBackground} className="bg-background p-section" tokens={{ background }}>
        <CtDataProviders>
          <Suspense fallback={null}>
            <HomeMastheadBody />
          </Suspense>
          <HomeHearthRoom chat={chat} onResume={(): void => undefined} />
        </CtDataProviders>
      </ThemeScope>
    </div>
  );
}
