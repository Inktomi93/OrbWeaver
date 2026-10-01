import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Heading } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { useFocusOnMount } from "#lib";
import { clearCorpusSelection } from "#state";

export function CorpusArtifactFrame({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactElement {
  const backRef = useRef<HTMLButtonElement>(null);
  useFocusOnMount(backRef);
  return (
    <Stack gap="block">
      <Button ref={backRef} className="self-start" intent="ghost" size="sm" onClick={clearCorpusSelection}>
        Back to Explore
      </Button>
      <Heading level={1}>{title}</Heading>
      {children}
    </Stack>
  );
}
