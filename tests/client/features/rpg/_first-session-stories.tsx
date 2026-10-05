import { QueryBoundary } from "@orb/client/components";
import type { ReactElement } from "react";
import { RpgCharacterDetail } from "../../../../packages/client/src/features/rpg/components/rpg-character-detail.tsx";
import { RpgGameTab } from "../../../../packages/client/src/features/rpg/components/rpg-game-tab.tsx";
import { useRpgContextState } from "../../../../packages/client/src/features/rpg/hooks/use-rpg-context-state.ts";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CHAT_ID } from "../chat/fixtures.ts";

function FirstSessionBody({ character }: { readonly character: boolean }): ReactElement | null {
  const state = useRpgContextState(CHAT_ID);
  if (state === null) {
    return null;
  }
  const actor = state.tracker.actors[0];
  return character && actor !== undefined ? <RpgCharacterDetail state={state} actor={actor} onBack={(): void => undefined} /> : <RpgGameTab state={state} />;
}

export function RpgFirstSessionStory({ character = false }: { readonly character?: boolean }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 360 }}>
        <QueryBoundary fallback={<p>Loading game</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <FirstSessionBody character={character} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}
