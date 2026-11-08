import { Button } from "@orb/ui/button";
import { Icon, Plus } from "@orb/ui/icons";
import type { ListPaneHeaderView } from "#lib";
import { CORPUS_MODE_LABELS, NEW_LABEL_NAME } from "#lib";
import { useCreateLabel, useTagCensus } from "./use-tag-library.ts";
export function useLabelsListHeader(active = true): ListPaneHeaderView {
  const count = useTagCensus(active);
  const create = useCreateLabel(active);
  const newLabel = { id: "label-new", label: NEW_LABEL_NAME, icon: Plus, onSelect: create.run, disabled: create.pending };
  return {
    actions: [
      {
        id: "label-new",
        inline: (
          <Button loading={create.pending} onClick={create.run} size="sm" type="button">
            <Icon icon={Plus} size="sm" />
            {NEW_LABEL_NAME}
          </Button>
        ),
        menu: [newLabel],
        compact: newLabel,
      },
    ],
    count: count ?? 0,
    title: CORPUS_MODE_LABELS.labels,
  };
}
