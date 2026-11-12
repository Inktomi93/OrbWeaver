// Corpus Labels reads the canonical library cache and hosts the shared editor.
import type { TagId } from "@orb/kit/ids";
import { EmptyState } from "@orb/ui/empty-state";
import { Hash, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { DetailHeader, TagEditorBody } from "#components";
import { useSuspenseQuery, useTRPC } from "#data";
import type { DrillBack } from "#lib";
import { clearLabelSelection, useLabelNameFocus } from "#state";

// Arrival focus lives in another pane: TagEditorBody owns editor arrival focus via useFocusOnMount, which lands on the Name field for creation.
/** `back` is the host's, the same one its pending arm draws. */
export function TagMemberSurface({ tagId, back }: { readonly tagId: TagId; readonly back: DrillBack }): ReactElement {
  const trpc = useTRPC();
  const { data: tags } = useSuspenseQuery(trpc.tag.listTagsWithUsage.queryOptions());
  const creating = useLabelNameFocus() === tagId;
  const tag = tags.find((row) => row.id === tagId);
  if (tag === undefined) {
    // action={null}: Back in the preceding drill header exits this deleted member; ends if the surface loses that exit.
    return (
      <Stack gap="block">
        <DetailHeader back={back} />
        {creating ? (
          <Text role="status" voice="gloss">
            Loading your new tag…
          </Text>
        ) : (
          <EmptyState
            action={null}
            description="This tag was deleted. Pick another from the list."
            icon={<Icon icon={Hash} size="lg" />}
            title="Tag not found"
          />
        )}
      </Stack>
    );
  }
  return <TagEditorBody onMerged={clearLabelSelection} back={back} others={tags.filter((other) => other.id !== tag.id)} tag={tag} />;
}
