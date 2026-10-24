import { RpgSceneCards } from "@orb/client/features/rpg";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The Scene tab's card archive under the production providers, for a game with immersive cards on. */
export function RpgSceneCardsStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <RpgSceneCards chatId={chatId} enabled={true} />
    </CtClientProviders>
  );
}
