import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { NpcCard } from "#client/features/rpg/components/tracker-blocks/npc-card-slots.tsx";

/** The production present-character card with an editable mood, as the scene panel seats it. */
export function NpcCardStory({ name, mood }: { readonly name: string; readonly mood: string }): ReactElement {
  return (
    <CtClientProviders>
      <NpcCard mood={mood} name={name} onEditMood={(): void => undefined} />
    </CtClientProviders>
  );
}
