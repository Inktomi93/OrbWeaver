import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";
import { CorpusDuplicateChats } from "#client/features/discovery/components/corpus-duplicate-rows.tsx";

type Pairs = Parameters<typeof CorpusDuplicateChats>[0]["pairs"];

/** The production duplicate-chats section over `pairs`, with a control named `removeLabel` that deletes the pair at `unrelatedIndex`. */
export function DuplicateChatsStory({
  pairs,
  unrelatedIndex,
  removeLabel,
}: {
  readonly pairs: Pairs;
  readonly unrelatedIndex: number;
  readonly removeLabel: string;
}): ReactElement {
  const [shown, setShown] = useState(pairs);
  return (
    <CtClientProviders>
      <Button onClick={(): void => setShown(shown.filter((_pair, index) => index !== unrelatedIndex))} variant="outline">
        {removeLabel}
      </Button>
      <CorpusDuplicateChats pairs={shown} />
    </CtClientProviders>
  );
}
