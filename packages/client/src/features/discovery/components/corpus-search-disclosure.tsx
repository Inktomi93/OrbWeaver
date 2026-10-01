import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";

type Search = inferOutput<Trpc["search"]["search"]>;
const TARGET_DISCLOSURE: Readonly<Record<Search["over"], string>> = {
  characters: "Semantic matches across indexed character cards. Saved facets can be absent.",
  discover: "Nearest indexed chat passages. Character groups use saved memory credit; other passages open their transcript. This is a top-results preview.",
  digests: "Nearest saved memory digests. These are generated summaries, not verbatim dialogue.",
  images: "Caption and image-likeness matches from indexed assets.",
  entities: "Nearest indexed entities.",
  segments: "Nearest indexed passages in this room.",
  corpus: "Nearest indexed passages and memory summaries.",
  documents: "Nearest indexed document chunks.",
};

export function CorpusSearchDisclosure({ result }: { readonly result: Search }): ReactElement {
  return (
    <Stack gap="tight">
      <Text voice="gloss">{TARGET_DISCLOSURE[result.over]}</Text>
      <Collapsible>
        <CollapsibleTrigger>How search works</CollapsibleTrigger>
        <CollapsiblePanel>
          <Text voice="gloss">
            Request limit: {result.coverage.requestLimit}. Candidate limit: {result.coverage.candidateLimit}.
            {result.coverage.evidencePerCharacter === null ? "" : ` Evidence per character: ${result.coverage.evidencePerCharacter}.`} Rerank:{" "}
            {result.coverage.reranked ? "requested" : "off"}.
          </Text>
        </CollapsiblePanel>
      </Collapsible>
    </Stack>
  );
}
