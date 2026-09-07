// CT harness for the greeting studio (audit §3) — not a spec (Playwright CT needs mounted components in
// their own module; biome forbids exporting a component from a `.ct.tsx`). Wraps `GreetingStudio` in the
// CT data-provider stack (Query + real tRPC over the routeTrpc network stub) and wires `onAccept` to a
// REAL `character.update` mutation — so the CT can assert the character-update mutation fired on accept
// (the DRAFT-mount persistence path), exactly as the chat draft greeting row wires it.

import { GreetingStudio } from "@orb/client/components";
import { createEntityMutation, useInvalidation, useTRPC } from "@orb/client/data";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { CtDataProviders } from "../../support/browser/ct-data-providers.tsx";

const CHARACTER_ID = castId<CharacterId>("character_ct");

/** The character.update input the accept path fires — the full greetings-array replace (the append shape). */
interface UpdateVars {
  readonly characterId: CharacterId;
  readonly input: { readonly greetings: { readonly text: string }[] };
}

const useUpdateCharacter = createEntityMutation<UpdateVars, unknown>({
  options: (trpc) => trpc.character.update.mutationOptions(),
  busDriven: true,
});

function StudioHarness(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });
  return (
    <GreetingStudio
      characterId={CHARACTER_ID}
      baseGreeting="Hello there, traveller."
      onAccept={(text): void => update.mutate({ characterId: CHARACTER_ID, input: { greetings: [{ text }] } })}
    />
  );
}

export function GreetingStudioStory(): ReactElement {
  return (
    <CtDataProviders>
      <StudioHarness />
    </CtDataProviders>
  );
}
