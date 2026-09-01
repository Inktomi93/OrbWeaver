// #985's narrow rendered proof: the shipped Home masthead and resume island under a legal partial
// ThemeScope whose only authored theme token is its background. The outer four prose inks deliberately
// carry the opposite polarity, reproducing the cascade the clamp must close.

import { ThemeScope } from "@orb/ui/theme-scope";
import type { CSSProperties, ReactElement } from "react";
import { Suspense } from "react";
import { HomeHearthRoom } from "../../../../packages/client/src/features/chat/components/home-hearth-room.tsx";
import { HomeMastheadBody } from "../../../../packages/client/src/features/chat/components/home-masthead-body.tsx";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";
import { makeChatSummary } from "./fixtures.ts";

interface HomePartialThemeProseStoryProps {
  readonly background: string;
  readonly ambientBackground: string;
  readonly ambientInk: string;
}

export function HomePartialThemeProseStory({ background, ambientBackground, ambientInk }: HomePartialThemeProseStoryProps): ReactElement {
  const outerStyle = {
    "--color-speaker": ambientInk,
    "--color-dialogue": ambientInk,
    "--color-narration": ambientInk,
    "--color-prose-body": ambientInk,
  } as CSSProperties;
  const chat = makeChatSummary({
    id: "chat_theme_prose",
    title: "The Lantern Room",
    participantNames: ["Wren"],
    lastMessagePreview: "The lanterns answer in amber.",
  });

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
