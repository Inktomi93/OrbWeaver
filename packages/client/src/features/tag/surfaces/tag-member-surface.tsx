// Corpus Labels reads the canonical library cache and hosts the shared editor.
import type { TagId } from "@orb/kit/ids";
import { EmptyState } from "@orb/ui/empty-state";
import { Hash, Icon } from "@orb/ui/icons";
import { Container, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { MemberDrillHeader, TagEditorBody } from "#components";
import { useTRPC } from "#data";
import { CORPUS_MODE_LABELS } from "#lib";
import { clearLabelSelection, useLabelNameFocus } from "#state";

// @orb-waive surface-a11y-focus(TagMemberSurface): TagEditorBody owns editor arrival focus via useFocusOnMount; tag-member-surface CT pins the Name-field arrival for creation.
export function TagMemberSurface({ tagId }: { readonly tagId: TagId }): ReactElement {
  const trpc = useTRPC();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const creating = useLabelNameFocus() === tagId;
  const tag = tags.find((row) => row.id === tagId);
  const back = { label: `Back to ${CORPUS_MODE_LABELS.labels}`, onClick: clearLabelSelection };
  if (tag === undefined) {
    // @orb-waive empty-state-has-action(EmptyState): Back in the preceding drill header exits this deleted member; ends if the surface loses that exit.
    return (
      <Container>
        <Stack gap="block">
          <MemberDrillHeader back={back} />
          {creating ? (
            <Text role="status" voice="gloss">
              Loading your new label…
            </Text>
          ) : (
            <EmptyState description="This label was deleted. Pick another from the list." icon={<Icon icon={Hash} size="lg" />} title="Label not found" />
          )}
        </Stack>
      </Container>
    );
  }
  return (
    <Container>
      <TagEditorBody onMerged={clearLabelSelection} back={back} others={tags.filter((other) => other.id !== tag.id)} tag={tag} />
    </Container>
  );
}
