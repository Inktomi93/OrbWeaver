import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Heading } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { CORPUS_MODE_LABELS, sectionBackName, useFocusOnMount } from "#lib";
import { clearCorpusSelection } from "#state";

export function CorpusArtifactFrame({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactElement {
  const backRef = useRef<HTMLButtonElement>(null);
  useFocusOnMount(backRef);
  return (
    <Stack gap="block">
      <Button ref={backRef} self="start" variant="ghost" size="sm" onClick={clearCorpusSelection}>
        {sectionBackName(CORPUS_MODE_LABELS.explore)}
      </Button>
      <Heading level={2} voice="focal">
        {title}
      </Heading>
      {children}
    </Stack>
  );
}
