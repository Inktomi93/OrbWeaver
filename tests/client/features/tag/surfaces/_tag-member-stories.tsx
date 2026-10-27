import { labelsCorpusMode } from "@orb/client/features/tag";
import { clearLabelSelection, selectLabel } from "@orb/client/state";
import type { TagId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useEffect } from "react";

function SelectedMember({ tagId }: { readonly tagId: TagId }): ReactElement {
  useEffect(() => {
    selectLabel(tagId);
    return clearLabelSelection;
  }, [tagId]);
  return <>{labelsCorpusMode.content()}</>;
}

/** The actual Corpus Labels content host and its selected member, not a second editor assembly. */
export function TagMemberStory({ tagId }: { readonly tagId: TagId }): ReactElement {
  return (
    <CtClientProviders>
      <SelectedMember tagId={tagId} />
    </CtClientProviders>
  );
}
