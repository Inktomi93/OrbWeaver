// CT harness for the greeting studio (audit §3) — not a spec (Playwright CT needs mounted components in
// their own module; biome forbids exporting a component from a `.ct.tsx`). Wraps `GreetingStudio` in the
// CT data-provider stack (Query + real tRPC over the routeTrpc network stub). The studio's only product
// output is `onAccept(text)`: the character editor turns it into a form edit that autosaves, so the harness
// lists what was accepted and does not invent a persistence path of its own.

import { GreetingStudio } from "@orb/client/components";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CtDataProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import type { ReactElement } from "react";
import { useState } from "react";

const CHARACTER_ID = castId<CharacterId>("character_ct");

function StudioHarness(): ReactElement {
  const [accepted, setAccepted] = useState<readonly { readonly order: number; readonly text: string }[]>([]);
  return (
    <>
      <GreetingStudio
        characterId={CHARACTER_ID}
        baseGreeting="Hello there, traveller."
        onAccept={(text): void => setAccepted((prior) => [...prior, { order: prior.length, text }])}
      />
      <ul aria-label="Accepted greetings">
        {accepted.map(({ order, text }) => (
          <li key={order}>{text}</li>
        ))}
      </ul>
    </>
  );
}

export function GreetingStudioStory(): ReactElement {
  return (
    <CtDataProviders>
      <StudioHarness />
    </CtDataProviders>
  );
}
