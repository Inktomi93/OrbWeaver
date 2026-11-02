import { clearCorpusSelection, selectCorpusArtifact, selectCorpusCharacter, setCorpusMode, useSectionRegistry } from "@orb/client/state";
import type { CharacterId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

type Destination = Parameters<typeof selectCorpusArtifact>[0];

type CorpusDestinationStoryProps =
  | { readonly open: "character"; readonly characterId: CharacterId }
  | { readonly open: "artifact"; readonly destination: Destination };

function CorpusDestination(props: CorpusDestinationStoryProps): ReactElement {
  useLayoutEffect(() => {
    clearCorpusSelection();
    setCorpusMode("explore");
    if (props.open === "character") {
      selectCorpusCharacter(props.characterId);
    } else {
      selectCorpusArtifact(props.destination);
    }
  }, [props]);
  const content = useSectionRegistry().get("corpus").content;
  if (typeof content !== "function") {
    throw new Error("Corpus must expose its production content");
  }
  return <Container>{content()}</Container>;
}

/** The production Corpus CONTENT pane with one destination opened, the way the finder and the context tabs open it. */
export function CorpusDestinationStory(props: CorpusDestinationStoryProps): ReactElement {
  return (
    <CtClientProviders>
      <CorpusDestination {...props} />
    </CtClientProviders>
  );
}
